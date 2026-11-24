import { Controller, Get, Post, Delete, Body, Query, Req, Res, Inject } from '@nestjs/common';
import { OAuth2Client, CodeChallengeMethod } from 'google-auth-library';
import type { Response } from 'express';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { Db, AppRequest, env, fail, parse, hash, secret, seal, unseal, transaction, reauth, audit, cookieOptions, csrfToken, setCsrf, safeEqual } from './core';
import { passwordHash, email, createLoginSession } from './auth';
import { safeLocalRedirect } from '../../../packages/shared/src/security';
import { securityEvent } from './request-security';

const cookiePath = '/api/v1/auth/google';
const stateCookie = 'milo_google_state', pendingCookie = 'milo_google_login';
export function googleConfig(settings: Record<string, string | undefined>) {
  const clientId = settings.GOOGLE_CLIENT_ID || '', clientSecret = settings.GOOGLE_CLIENT_SECRET || '';
  const origin = new URL(settings.APP_URL || 'http://localhost:3000');
  const validOrigin = !origin.username && !origin.password && origin.pathname === '/' && !origin.search && !origin.hash && (origin.protocol === 'https:' || settings.NODE_ENV !== 'production' && origin.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(origin.hostname));
  return { enabled: validOrigin && /^[a-z0-9_-]+\.apps\.googleusercontent\.com$/i.test(clientId) && !!clientSecret.trim(), clientId, clientSecret, callback: `${origin.origin}${cookiePath}/callback` };
}
export type GoogleProfile = { subject: string; email: string; name: string; authoritative: boolean };
export function verifiedGoogleClaims(payload: any, nonceHash: string, clientId: string, now = Date.now()): GoogleProfile {
  if (!payload || !['accounts.google.com', 'https://accounts.google.com'].includes(payload.iss) || payload.aud !== clientId || payload.azp && payload.azp !== clientId || !Number.isInteger(payload.exp) || payload.exp <= now / 1000 || typeof payload.nonce !== 'string' || !safeEqual(hash(payload.nonce), nonceHash) || payload.email_verified !== true || typeof payload.sub !== 'string' || !/^[a-z0-9_-]{1,255}$/i.test(payload.sub)) fail('GOOGLE_IDENTITY_INVALID', 'Chưa xác minh được tài khoản Google.', 401);
  const address = parse(email, payload.email);
  return { subject: payload.sub, email: address, name: typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim().slice(0, 100) : address.split('@')[0], authoritative: address.endsWith('@gmail.com') || typeof payload.hd === 'string' && !!payload.hd };
}
export interface GoogleProvider {
  enabled: boolean;
  authorization(input: { state: string; nonce: string; challenge: string }): string;
  profile(input: { code: string; verifier: string; nonceHash: string }): Promise<GoogleProfile>;
}
export function googleProvider(settings: Record<string, string | undefined> = env): GoogleProvider {
  const config = googleConfig(settings);
  const client = new OAuth2Client({ clientId: config.clientId, clientSecret: config.clientSecret, redirectUri: config.callback });
  client.transporter.defaults = { ...client.transporter.defaults, timeout: 15000, retry: false };
  return { enabled: config.enabled,
    authorization: input => client.generateAuthUrl({ scope: ['openid', 'email', 'profile'], access_type: 'online', prompt: 'select_account', state: input.state, nonce: input.nonce, code_challenge: input.challenge, code_challenge_method: CodeChallengeMethod.S256 }),
    async profile(input) {
      const result = await client.getToken({ code: input.code, codeVerifier: input.verifier, redirect_uri: config.callback });
      if (!result.tokens.id_token) fail('GOOGLE_IDENTITY_INVALID', 'Chưa nhận được xác nhận từ Google.', 401);
      const ticket = await client.verifyIdToken({ idToken: result.tokens.id_token, audience: config.clientId });
      return verifiedGoogleClaims(ticket.getPayload(), input.nonceHash, config.clientId);
    },
  };
}
const stateSchema = z.object({ mode: z.enum(['login', 'link']), browserHash: z.string().length(64), nonceHash: z.string().length(64), encryptedVerifier: z.string(), next: z.string(), expiresAt: z.number(), userId: z.string().nullable(), sessionId: z.string().nullable() }).strict();
export class GoogleAuthService {
  constructor(private db: Db, readonly provider: GoogleProvider = googleProvider()) {}
  async start(input: { mode: 'login' | 'link'; next?: string }, r: AppRequest) {
    if (!this.provider.enabled) fail('GOOGLE_UNAVAILABLE', 'Đăng nhập Google chưa được cấu hình.', 503);
    if (input.mode === 'link') { if (!r.actor || r.actor.disabled) fail(r.accessError || 'UNAUTHENTICATED', 'Vui lòng đăng nhập trước.', 401); reauth(r); }
    const state = secret(), browser = secret(), nonce = secret(), verifier = secret();
    const value = { mode: input.mode, browserHash: hash(browser), nonceHash: hash(nonce), encryptedVerifier: seal(verifier), next: safeLocalRedirect(input.next), expiresAt: Date.now() + 10 * 60000, userId: input.mode === 'link' ? r.actor!.id : null, sessionId: input.mode === 'link' ? r.session.id : null };
    await this.db.storeSetting.create({ data: { key: `google-state:${hash(state)}`, value } });
    const url = this.provider.authorization({ state, nonce, challenge: createHash('sha256').update(verifier).digest('base64url') });
    const target = new URL(url); if (target.protocol !== 'https:' || target.hostname !== 'accounts.google.com') fail('GOOGLE_UNAVAILABLE', 'Cấu hình Google không hợp lệ.', 503);
    return { browser, url };
  }
  async callback(input: { state: string; code?: string; error?: string }, browser: string, r: AppRequest) {
    if (!this.provider.enabled) fail('GOOGLE_UNAVAILABLE', 'Đăng nhập Google chưa được cấu hình.', 503);
    const key = `google-state:${hash(input.state)}`;
    const state = await transaction(this.db, async tx => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${key},0))`;
      const stored = await tx.storeSetting.findUnique({ where: { key } }), parsed = stateSchema.safeParse(stored?.value);
      if (!parsed.success || parsed.data.expiresAt <= Date.now() || !safeEqual(parsed.data.browserHash, hash(browser))) fail('GOOGLE_STATE_INVALID', 'Lượt đăng nhập Google đã hết hạn. Vui lòng thử lại.', 400);
      await tx.storeSetting.delete({ where: { key } }); return parsed.data;
    });
    if (state.mode === 'link') { if (!r.actor || r.actor.id !== state.userId || r.session?.id !== state.sessionId) fail('GOOGLE_SESSION_CHANGED', 'Phiên liên kết đã thay đổi. Vui lòng đăng nhập lại.', 401); reauth(r); }
    if (input.error || !input.code) fail('GOOGLE_CANCELLED', 'Bạn chưa hoàn tất đăng nhập Google.', 400);
    const profile = await this.provider.profile({ code: input.code, verifier: unseal(state.encryptedVerifier), nonceHash: state.nonceHash });
    if (state.mode === 'link') {
      await transaction(this.db, async tx => {
        await tx.$queryRaw`SELECT id FROM "User" WHERE id=${state.userId!} FOR UPDATE`;
        const user = await tx.user.findUniqueOrThrow({ where: { id: state.userId! } });
        if (user.disabled || user.email !== profile.email) fail('GOOGLE_EMAIL_MISMATCH', 'Hãy chọn Google có cùng email với tài khoản Milo.', 409);
        if (await tx.externalIdentity.findFirst({ where: { OR: [{ provider: 'GOOGLE', subject: profile.subject }, { provider: 'GOOGLE', userId: user.id }] } })) fail('GOOGLE_ALREADY_LINKED', 'Tài khoản Google hoặc Milo đã có liên kết.', 409);
        await tx.externalIdentity.create({ data: { provider: 'GOOGLE', subject: profile.subject, userId: user.id, email: profile.email, passwordEnabled: true } });
        if (profile.authoritative && !user.verifiedAt) await tx.user.update({ where: { id: user.id }, data: { verifiedAt: new Date() } });
        await audit(tx, user.id, 'GOOGLE_LINKED', 'User', user.id, { provider: 'GOOGLE' });
      });
      return { mode: 'link' as const, next: '/tai-khoan?google_linked=1' };
    }
    const randomPasswordHash = await passwordHash(secret());
    const user = await transaction(this.db, async tx => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`google-sub:${profile.subject}`},0))`;
      const linked = await tx.externalIdentity.findUnique({ where: { provider_subject: { provider: 'GOOGLE', subject: profile.subject } }, include: { user: true } });
      if (linked) { if (linked.user.disabled) fail('GOOGLE_IDENTITY_INVALID', 'Chưa thể đăng nhập tài khoản này.', 401); return linked.user; }
      if (await tx.user.findUnique({ where: { email: profile.email } })) fail('GOOGLE_LINK_REQUIRED', 'Email đã có tài khoản Milo. Đăng nhập bằng mật khẩu rồi liên kết Google tại Bảo mật.', 409);
      if (!profile.authoritative) fail('GOOGLE_EMAIL_UNTRUSTED', 'Hãy đăng ký và xác minh email tại Milo trước, sau đó liên kết Google trong Bảo mật.', 409);
      const created = await tx.user.create({ data: { name: profile.name || 'Khách Milo', email: profile.email, passwordHash: randomPasswordHash, role: 'USER', verifiedAt: new Date() } });
      await tx.externalIdentity.create({ data: { provider: 'GOOGLE', subject: profile.subject, userId: created.id, email: profile.email, passwordEnabled: false } });
      await audit(tx, created.id, 'GOOGLE_ACCOUNT_CREATED', 'User', created.id);
      return created;
    });
    const pending = secret(); await this.db.authToken.create({ data: { userId: user.id, purpose: 'GOOGLE_LOGIN', hash: hash(pending), expiresAt: new Date(Date.now() + 5 * 60000) } });
    return { mode: 'login' as const, pending, next: safeLocalRedirect(state.next) };
  }
  async complete(pending: string, otp: string | undefined, r: AppRequest, res: Response) {
    const ticket = await this.db.authToken.findUnique({ where: { hash: hash(pending) } });
    if (!ticket || ticket.purpose !== 'GOOGLE_LOGIN' || ticket.usedAt || ticket.expiresAt <= new Date()) fail('GOOGLE_LOGIN_EXPIRED', 'Lượt đăng nhập đã hết hạn. Hãy chọn Google để đăng nhập lại.', 401);
    return createLoginSession(this.db, ticket.userId, r, res, { otp, authorize: async (tx, user) => {
      const current = await tx.authToken.findUnique({ where: { id: ticket.id } });
      if (!current || current.userId !== user.id || current.purpose !== 'GOOGLE_LOGIN' || current.usedAt || current.expiresAt <= new Date() || !await tx.externalIdentity.findUnique({ where: { userId_provider: { userId: user.id, provider: 'GOOGLE' } } })) fail('GOOGLE_LOGIN_EXPIRED', 'Lượt đăng nhập đã hết hạn. Hãy chọn Google để đăng nhập lại.', 401);
      await tx.authToken.update({ where: { id: current.id }, data: { usedAt: new Date() } });
    } });
  }
}
@Controller('auth/google')
export class GoogleAuthController {
  private google: GoogleAuthService;
  constructor(@Inject(Db) private db: Db) { this.google = new GoogleAuthService(db); }
  @Get('config') config() { return { enabled: this.google.provider.enabled }; }
  @Post('start') async start(@Body() body: unknown, @Req() r: AppRequest, @Res({ passthrough: true }) res: Response) {
    const input = parse(z.object({ mode: z.enum(['login', 'link']).default('login'), next: z.string().max(1000).optional() }).strict(), body);
    const result = await this.google.start(input, r); res.cookie(stateCookie, result.browser, { ...cookieOptions, path: cookiePath, maxAge: 10 * 60000 }); return { url: result.url };
  }
  @Get('callback') async callback(@Query() query: unknown, @Req() r: AppRequest, @Res() res: Response) {
    res.setHeader('Referrer-Policy', 'no-referrer');
    try {
      const input = parse(z.object({ state: z.string().regex(/^[a-f0-9]{64}$/), code: z.string().min(1).max(4096).optional(), error: z.string().max(100).optional() }).passthrough(), query);
      const browser = r.cookies?.[stateCookie]; if (typeof browser !== 'string' || !/^[a-f0-9]{64}$/.test(browser)) fail('GOOGLE_STATE_INVALID', 'Lượt đăng nhập đã hết hạn.', 400);
      const result = await this.google.callback(input, browser, r);
      res.clearCookie(stateCookie, { ...cookieOptions, path: cookiePath });
      if (result.mode === 'link') return res.redirect(303, result.next);
      res.cookie(pendingCookie, result.pending, { ...cookieOptions, path: cookiePath, maxAge: 5 * 60000 }); setCsrf(res, r.session?.csrf || csrfToken());
      return res.redirect(303, `/dang-nhap?${new URLSearchParams({ google_step: 'verify', next: result.next })}`);
    } catch (error: any) {
      const known = ['GOOGLE_CANCELLED', 'GOOGLE_LINK_REQUIRED', 'GOOGLE_EMAIL_UNTRUSTED', 'GOOGLE_EMAIL_MISMATCH', 'GOOGLE_ALREADY_LINKED', 'GOOGLE_SESSION_CHANGED', 'GOOGLE_STATE_INVALID'];
      const code = error?.getResponse?.()?.code; const message = known.includes(code) ? code : 'GOOGLE_FAILED';
      await securityEvent(this.db, r, 'GOOGLE_AUTH_FAILED', { scope: 'auth', code: message });
      res.clearCookie(stateCookie, { ...cookieOptions, path: cookiePath }); return res.redirect(303, `/dang-nhap?${new URLSearchParams({ google_error: message })}`);
    }
  }
  @Post('complete') async complete(@Body() body: unknown, @Req() r: AppRequest, @Res({ passthrough: true }) res: Response) {
    const input = parse(z.object({ otp: z.string().trim().max(100).optional() }).strict(), body), pending = r.cookies?.[pendingCookie];
    if (typeof pending !== 'string' || !/^[a-f0-9]{64}$/.test(pending)) fail('GOOGLE_LOGIN_EXPIRED', 'Lượt đăng nhập đã hết hạn. Hãy chọn Google để đăng nhập lại.', 401);
    const result = await this.google.complete(pending, input.otp, r, res); res.clearCookie(pendingCookie, { ...cookieOptions, path: cookiePath }); return result;
  }
  @Get('status') async status(@Req() r: AppRequest) {
    if (!r.actor || r.actor.disabled) fail(r.accessError || 'UNAUTHENTICATED', 'Vui lòng đăng nhập.', 401);
    const identity = await this.db.externalIdentity.findUnique({ where: { userId_provider: { userId: r.actor.id, provider: 'GOOGLE' } } });
    return { available: this.google.provider.enabled, linked: !!identity, email: identity?.email || null, passwordEnabled: identity?.passwordEnabled !== false };
  }
  @Delete('link') async unlink(@Body() body: unknown, @Req() r: AppRequest) {
    if (!r.actor || r.actor.disabled) fail(r.accessError || 'UNAUTHENTICATED', 'Vui lòng đăng nhập.', 401); reauth(r); parse(z.object({}).strict(), body);
    await transaction(this.db, async tx => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${r.actor!.id} FOR UPDATE`;
      const identity = await tx.externalIdentity.findUnique({ where: { userId_provider: { userId: r.actor!.id, provider: 'GOOGLE' } } });
      if (identity?.passwordEnabled === false) fail('LOCAL_PASSWORD_REQUIRED', 'Hãy tạo mật khẩu bằng mã gửi email trước khi bỏ liên kết Google.', 409);
      await tx.externalIdentity.deleteMany({ where: { userId: r.actor!.id, provider: 'GOOGLE' } });
      await tx.authToken.updateMany({ where: { userId: r.actor!.id, purpose: 'GOOGLE_LOGIN', usedAt: null }, data: { usedAt: new Date() } });
      await tx.session.deleteMany({ where: { userId: r.actor!.id, id: { not: r.session.id } } });
      await audit(tx, r.actor!.id, 'GOOGLE_UNLINKED', 'User', r.actor!.id);
    });
    return { message: 'Đã bỏ liên kết Google và thu hồi các phiên khác.' };
  }
}
