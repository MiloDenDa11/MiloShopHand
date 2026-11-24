import { Controller, Get, Patch, Body, Req, Res, UseGuards, Inject, Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import type { Response } from 'express';
import { Client } from 'pg';
import { z } from 'zod';
import { Db, AppRequest, AuthGuard, env, fail, parse } from './core';
const channel = 'milo_realtime_v1';
const signalSchema = z.object({ kind: z.enum(['notifications','orders','seller']), userId: z.string().min(1).max(100).nullable().optional(), orderId: z.string().min(1).max(100).optional() }).strict();
type Signal = z.infer<typeof signalSchema>;
export function realtimeAudience(signal: Signal, userId: string, role: string) {
  if (signal.kind === 'notifications') return signal.userId === userId ? { kind: 'notifications' } : null;
  if (signal.kind === 'orders' && signal.userId === userId) return { kind: 'orders', orderId: signal.orderId };
  if (['ADMIN','SELLER'].includes(role)) return { kind: 'seller', orderId: signal.orderId };
  return null;
}
type Subscriber = { userId: string; receive: (signal: Signal) => void; disconnect: () => void };
@Injectable()
export class RealtimeHub implements OnModuleInit, OnModuleDestroy {
  ready = false;
  private client?: Client;
  private retry?: ReturnType<typeof setTimeout>;
  private stopped = false;
  private subscribers = new Set<Subscriber>();
  onModuleInit() { void this.connect(); }
  private async connect() {
    if (this.stopped) return;
    const client = new Client({ connectionString: env.DATABASE_URL, application_name: 'milo-realtime', connectionTimeoutMillis: 5000, keepAlive: true, query_timeout: 5000 });
    this.client = client;
    const unavailable = () => {
      if (this.client !== client || this.stopped) return;
      this.ready = false; this.client = undefined;
      for (const subscriber of [...this.subscribers]) subscriber.disconnect();
      void client.end().catch(() => {});
      console.warn(JSON.stringify({ event: 'realtime_connection_unavailable' }));
      if (!this.retry) this.retry = setTimeout(() => { this.retry = undefined; void this.connect(); }, 5000);
    };
    client.on('error', unavailable); client.on('end', unavailable);
    client.on('notification', message => {
      if (message.channel !== channel || !message.payload || message.payload.length > 1000) return;
      try { const result = signalSchema.safeParse(JSON.parse(message.payload)); if (result.success) for (const subscriber of this.subscribers) subscriber.receive(result.data); } catch { /* Invalid messages never enter the browser stream. */ }
    });
    try {
      await client.connect();
      const schema = await client.query("SELECT 1 FROM pg_trigger WHERE tgname='milo_order_changed' AND NOT tgisinternal");
      if (!schema.rowCount) throw Error('Realtime migration pending');
      await client.query(`LISTEN ${channel}`); if (!this.stopped && this.client === client) this.ready = true;
    } catch { unavailable(); }
  }
  subscribe(subscriber: Subscriber) {
    if (!this.ready) fail('REALTIME_UNAVAILABLE', 'Thông báo tức thời đang kết nối lại.', 503);
    if (this.subscribers.size >= 1000 || [...this.subscribers].filter(item => item.userId === subscriber.userId).length >= 3) fail('REALTIME_LIMIT', 'Tài khoản đang mở nhiều kết nối. Thông báo sẽ được cập nhật định kỳ.', 429);
    this.subscribers.add(subscriber); return () => this.subscribers.delete(subscriber);
  }
  async onModuleDestroy() {
    this.stopped = true; this.ready = false; clearTimeout(this.retry);
    for (const subscriber of [...this.subscribers]) subscriber.disconnect();
    await this.client?.end().catch(() => {});
  }
}
@UseGuards(AuthGuard)
@Controller('me')
export class RealtimeController {
  constructor(@Inject(Db) private db: Db, @Inject(RealtimeHub) private hub: RealtimeHub) {}
  @Get('realtime') config(@Req() r: AppRequest) { return { enabled: this.hub.ready, role: r.actor!.role }; }
  @Get('events') events(@Req() r: AppRequest, @Res() res: Response) {
    if (r.headers.origin && r.headers.origin !== new URL(env.APP_URL!).origin || r.headers['sec-fetch-site'] === 'cross-site') fail('STREAM_ORIGIN', 'Nguồn kết nối không hợp lệ.', 403);
    const userId = r.actor!.id, role = r.actor!.role, sessionId = r.session.id;
    let ended = false, flushing = false;
    const pending = new Map<string, unknown>();
    let flushTimer: ReturnType<typeof setTimeout> | undefined, heartbeat: ReturnType<typeof setInterval> | undefined, lifetime: ReturnType<typeof setTimeout> | undefined, unsubscribe: (() => void) | undefined;
    const close = (event?: string) => { if (ended) return; ended = true; clearTimeout(flushTimer); clearInterval(heartbeat); clearTimeout(lifetime); unsubscribe?.(); if (event && !res.destroyed) res.write(`event: ${event}\ndata: {}\n\n`); res.end(); };
    const valid = async () => {
      if (ended) return false;
      if (r.accessUntil && r.accessUntil <= Date.now()) { close('reconnect'); return false; }
      const session = await this.db.session.findUnique({ where: { id: sessionId }, include: { user: { select: { role: true, disabled: true } } } });
      if (!session || session.userId !== userId || session.user.disabled || session.user.role !== role || session.expiresAt <= new Date() || session.lastSeenAt.getTime() <= Date.now() - 30 * 60000) { close('authentication'); return false; }
      return true;
    };
    const flush = async () => {
      flushTimer = undefined;
      if (ended || flushing) return; flushing = true;
      try { if (await valid()) { const changes = [...pending.values()]; pending.clear(); for (const change of changes) { if (ended) break; if (!res.write(`event: change\ndata: ${JSON.stringify(change)}\n\n`)) { close('reconnect'); break; } } } }
      catch { close('reconnect'); } finally { flushing = false; if (!ended && pending.size && !flushTimer) flushTimer = setTimeout(() => void flush(), 150); }
    };
    unsubscribe = this.hub.subscribe({ userId, disconnect: () => close('reconnect'), receive: signal => {
      const change = realtimeAudience(signal, userId, role); if (!change || ended) return;
      if (pending.size >= 25) { pending.clear(); pending.set('resync', { kind: 'resync' }); }
      else pending.set(`${change.kind}:${'orderId' in change ? change.orderId || '' : ''}`, change);
      if (!flushTimer && !flushing) flushTimer = setTimeout(() => void flush(), 150);
    } });
    res.status(200).set({ 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'private, no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no', 'Referrer-Policy': 'no-referrer' });
    res.flushHeaders(); res.write('retry: 10000\nevent: ready\ndata: {}\n\n');
    heartbeat = setInterval(() => { void valid().then(ok => { if (ok && !res.write(': heartbeat\n\n')) close('reconnect'); }).catch(() => close('reconnect')); }, 10000);
    lifetime = setTimeout(() => close('reconnect'), Math.max(1, Math.min(5 * 60000, (r.accessUntil || Infinity) - Date.now())));
    res.on('close', () => close());
  }
  @Get('notifications/summary') async summary(@Req() r: AppRequest) { return { unread: await this.db.notification.count({ where: { userId: r.actor!.id, readAt: null } }) }; }
  @Patch('notifications/read') async read(@Req() r: AppRequest, @Body() body: unknown) {
    const input = parse(z.union([z.object({ ids: z.array(z.string().min(1).max(100)).min(1).max(100) }).strict(), z.object({ all: z.literal(true) }).strict()]), body);
    await this.db.notification.updateMany({ where: { userId: r.actor!.id, readAt: null, ...('ids' in input ? { id: { in: input.ids } } : {}) }, data: { readAt: new Date() } });
    return this.summary(r);
  }
}
