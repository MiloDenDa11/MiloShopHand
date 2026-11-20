import Redis from 'ioredis';
import { createHmac } from 'node:crypto';
import type { Response, NextFunction } from 'express';
import { HttpException } from '@nestjs/common';
import { Db, AppRequest, env, production, hash, safeEqual, fail } from './core';

type SecurityDetails = { code?: string; scope?: string; accountHash?: string; count?: number };
const logWindows = new Map<string, number>();
export const securityIdentity = (value: string) => createHmac('sha256', env.SESSION_SECRET!).update(value).digest('hex').slice(0, 32);
export async function securityEvent(db: Db, r: AppRequest | undefined, event: string, details: SecurityDetails = {}) {
  const sourceHash = securityIdentity(r?.ip || 'local');
  const scope = details.scope || 'auth';
  const key = `${event}:${sourceHash}:${r?.actor?.id || ''}:${details.accountHash || ''}:${scope}`;
  if (event !== 'LOGIN_SUCCESS') {
    if ((logWindows.get(key) || 0) > Date.now()) return;
    if (logWindows.size >= 2000) logWindows.delete(logWindows.keys().next().value!);
    logWindows.set(key, Date.now() + 30000);
  }
  // Explicit fields only: never spread request bodies, headers, errors or tokens.
  const data = { event, sourceHash, scope, code: details.code, accountHash: details.accountHash, count: details.count, requestId: r?.requestId };
  console.warn(JSON.stringify({ ...data, actorId: r?.actor?.id }));
  try {
    if (event === 'LOGIN_SUCCESS' && r?.actor) {
      const prior = await db.auditLog.findFirst({ where: { actorId: r.actor.id, action: 'SECURITY_LOGIN_SUCCESS', createdAt: { gte: new Date(Date.now() - 86400000) }, data: { path: ['sourceHash'], not: sourceHash } }, select: { id: true } });
      if (prior) await securityEvent(db, r, 'MULTI_SOURCE_LOGIN', { scope });
    }
    await db.auditLog.create({ data: { actorId: r?.actor?.id, action: `SECURITY_${event}`, entity: 'Security', entityId: details.accountHash || r?.actor?.id || sourceHash, data: JSON.parse(JSON.stringify(data)), requestId: r?.requestId } });
  } catch { console.warn(JSON.stringify({ event: 'security_audit_unavailable', requestId: r?.requestId })); }
}

export async function requestSecurity(db: Db) {
  const redis = new Redis(env.REDIS_URL || 'redis://localhost:6379', { lazyConnect: true, maxRetriesPerRequest: 1, retryStrategy: () => null });
  redis.on('error', () => {});
  try { await redis.connect(); } catch { if (production) throw Error('Redis is required in production'); }
  const memory = new Map<string, { count: number; until: number }>();
  async function limit(key: string, max: number, milliseconds: number, res: Response) {
    let count: number, ttl: number;
    if (redis.status === 'ready') {
      [count, ttl] = await redis.eval("local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('PEXPIRE',KEYS[1],ARGV[1]) end; return {n,redis.call('PTTL',KEYS[1])}", 1, `milo:security:v1:${key}`, milliseconds) as [number, number];
    } else {
      if (production) fail('SERVICE_UNAVAILABLE', 'Dịch vụ tạm thời chưa sẵn sàng.', 503);
      const now = Date.now();
      if (memory.size >= 10000) {
        for (const [k, entry] of memory) if (entry.until <= now) memory.delete(k);
        if (memory.size >= 10000 && !memory.has(key)) fail('RATE_LIMITED', 'Vui lòng thử lại sau.', 429);
      }
      let entry = memory.get(key);
      if (!entry || entry.until <= now) { entry = { count: 0, until: now + milliseconds }; memory.set(key, entry); }
      count = ++entry.count; ttl = entry.until - now;
    }
    if (count > max) { res.setHeader('Retry-After', String(Math.max(1, Math.ceil(ttl / 1000)))); fail('RATE_LIMITED', 'Thao tác quá nhanh. Vui lòng thử lại sau.', 429); }
  }
  return async (r: AppRequest, res: Response, next: NextFunction) => {
    const pathname = r.path.toLowerCase().replace(/\/+$/, '');
    const scope = /^\/api\/v1\/(admin|auth|me|orders|returns|exchanges|addresses)(?:\/|$)/.exec(pathname)?.[1] || 'api';
    if (scope !== 'api') { res.setHeader('Cache-Control', 'private, no-store'); res.setHeader('Pragma', 'no-cache'); }
    r.securityLog = (event, details) => securityEvent(db, r, event, details);
    res.once('finish', () => {
      if ([401, 403, 404, 429].includes(res.statusCode)) void securityEvent(db, r, res.statusCode === 429 ? 'RATE_LIMITED' : 'ACCESS_DENIED', { scope, code: String(res.statusCode) });
    });
    try {
      const isAuth = /^\/api\/v1\/auth\/(login|register|forgot|reset|verify|reauth|password)$/.test(pathname);
      await limit(`${securityIdentity(r.ip || 'unknown')}:${isAuth ? 'auth' : 'api'}`, isAuth ? 30 : 300, 60000, res);
      const raw = r.cookies?.milo_sid;
      if (typeof raw === 'string' && /^[a-f0-9]{64}$/.test(raw)) {
        const session = await db.session.findUnique({ where: { id: hash(raw) }, include: { user: { select: { id: true, email: true, name: true, role: true, verifiedAt: true, disabled: true } } } });
        if (session && session.expiresAt.getTime() > Date.now() && session.lastSeenAt.getTime() > Date.now() - 30 * 60000 && !session.user.disabled) {
          r.actor = session.user; r.session = session;
          res.setHeader('Cache-Control', 'private, no-store'); res.setHeader('Pragma', 'no-cache');
          if (session.lastSeenAt.getTime() < Date.now() - 60000) await db.session.updateMany({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
        }
      }
      if (isAuth) {
        const suppliedEmail = typeof r.body?.email === 'string' ? r.body.email.trim().toLowerCase().slice(0, 254) : undefined;
        const identity = /\/(login|forgot|register)$/.test(pathname) ? suppliedEmail : r.actor?.id || suppliedEmail;
        if (identity) await limit(`account:${securityIdentity(identity)}:${pathname.endsWith('/forgot') ? 'recovery' : 'credentials'}`, pathname.endsWith('/forgot') ? 3 : 10, pathname.endsWith('/forgot') ? 900000 : 60000, res);
        res.setHeader('Cache-Control', 'no-store');
      }
      if (r.actor && r.method === 'POST' && /^\/api\/v1\/(returns\/attachments|admin\/uploads)$/.test(pathname))
        await limit(`uploads:${r.actor.id}`, 20, 900000, res);
      const webhook = /^\/api\/v1\/webhooks\/(payos|ghn)$/.test(pathname);
      if (!['GET', 'HEAD', 'OPTIONS'].includes(r.method) && !webhook) {
        if (r.headers.origin !== new URL(env.APP_URL!).origin) fail('CSRF_ORIGIN', 'Nguồn yêu cầu không hợp lệ.', 403);
        const token = r.headers['x-csrf-token'];
        const expected = r.session?.csrf || r.cookies?.milo_csrf || '';
        if (typeof token !== 'string' || !/^[a-f0-9]{64}\.[a-f0-9]{64}$/.test(token)) fail('CSRF_INVALID', 'Phiên biểu mẫu đã hết hạn. Vui lòng tải lại.', 403);
        const [nonce, signature] = token.split('.');
        if (!safeEqual(signature, createHmac('sha256', env.SESSION_SECRET!).update(nonce).digest('hex')) || typeof expected !== 'string' || !safeEqual(token, expected)) fail('CSRF_INVALID', 'Phiên biểu mẫu đã hết hạn. Vui lòng tải lại.', 403);
      }
      next();
    } catch (error: any) {
      const body = error instanceof HttpException ? error.getResponse() as any : { code: 'SERVICE_UNAVAILABLE', message: 'Dịch vụ tạm thời chưa sẵn sàng.' };
      res.status(error instanceof HttpException ? error.getStatus() : 503).json({ ...body, requestId: r.requestId });
    }
  };
}
