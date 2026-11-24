import { createHash, randomUUID } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Prisma } from '@prisma/client';
import { Db, env, json, projectRoot } from './core';
import { tryOnDownload } from '../../web/lib/try-on';
import { TRY_ON_KIND, TRY_ON_CONSENT, TryOnError, tryOnConfig, tryOnDay, type TryOnPayload } from './try-on-policy';
import { TryOnStorage, tryOnPerson } from './try-on-storage';
import { openAIImageEditor, type ImageEditProvider } from './try-on-provider';

type Event = { id: string; status: string; createdAt: Date; payload: unknown; nextAttemptAt: Date };
type Input = { productSlug: string; color: string; mode: 'upper-body' | 'portrait'; consent: 'true' };
type Options = { config?: Record<string, string | undefined>; now?: () => Date; provider?: ImageEditProvider; storage?: TryOnStorage };
const payload = (event: Event) => event.payload as TryOnPayload;
const names = (job: TryOnPayload) => [job.personFile, job.referenceFile, ...job.resultFiles];
const ownerFilter = (userId: string) => ({ payload: { path: ['userId'], equals: userId } });

// The existing durable outbox is also the quota ledger. Never delete these rows
// to remove photos: keep charged attempts so restarts/deletion cannot reset quota.
export class TryOnService {
  readonly storage: TryOnStorage;
  private readonly settings: Record<string, string | undefined>;
  private readonly now: () => Date;
  private readonly provider: ImageEditProvider;
  constructor(private db: Db, options: Options = {}) {
    this.settings = options.config || env;
    this.now = options.now || (() => new Date());
    this.provider = options.provider || openAIImageEditor();
    this.storage = options.storage || new TryOnStorage(this.settings.TRY_ON_PRIVATE_DIR, this.settings.UPLOAD_DIR);
  }
  config() {
    const config = tryOnConfig(this.settings);
    return { enabled: config.enabled, requireVerifiedEmail: config.requireVerifiedEmail, imagesPerRequest: 2, dailyImages: 2, timezone: 'Asia/Ho_Chi_Minh', retentionHours: config.retentionHours || 24, consentVersion: TRY_ON_CONSENT };
  }
  private async locked<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) {
    return this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended('miloshophand:try-on:v1', 0))`;
      return fn(tx);
    }, { isolationLevel: 'ReadCommitted', timeout: 15000 });
  }
  private async charged(tx: Pick<Db, 'outboxEvent'> | Prisma.TransactionClient, start: Date, userId?: string) {
    return 2 * await tx.outboxEvent.count({ where: { kind: TRY_ON_KIND, createdAt: { gte: start, lt: new Date(start.getTime() + 86400000) }, AND: [{ payload: { path: ['quotaCharged'], equals: true } }, ...(userId ? [ownerFilter(userId)] : [])] } });
  }
  publicJob(event: Event) {
    const job = payload(event);
    const expired = new Date(job.expiresAt) <= this.now();
    const status = job.deletedAt ? 'deleted' : expired ? 'expired' : ({ PENDING: 'queued', QUEUED: 'queued', RUNNING: 'processing', DONE: 'succeeded', FAILED: 'failed' } as Record<string, string>)[event.status] || 'failed';
    return { id: event.id, status, productSlug: job.productSlug, productName: job.productName, color: job.color, createdAt: event.createdAt.toISOString(), expiresAt: job.expiresAt, imagesRequested: 2, quotaCharged: job.quotaCharged, errorCode: job.errorCode, images: status === 'succeeded' ? job.resultFiles.slice(0, 2).map((_, index) => `/api/v1/try-on/jobs/${event.id}/images/${index}`) : [] };
  }
  async quota(userId: string) {
    return this.locked(async tx => {
      const day = tryOnDay(this.now());
      const used = await this.charged(tx, day.start, userId);
      const latest = await tx.outboxEvent.findFirst({ where: { kind: TRY_ON_KIND, AND: [ownerFilter(userId)], createdAt: { gte: new Date(this.now().getTime() - 72 * 3600000) } }, orderBy: { createdAt: 'desc' } });
      return { limit: 2, used, remaining: Math.max(0, 2 - used), resetsAt: day.end.toISOString(), latestJob: latest ? this.publicJob(latest) : null };
    });
  }
  async submit(userId: string, key: string, input: Input, file: { buffer: Buffer; mimetype: string }) {
    const config = tryOnConfig(this.settings);
    if (!config.enabled) throw new TryOnError('TRY_ON_UNAVAILABLE');
    const actor = await this.db.user.findUnique({ where: { id: userId }, select: { disabled: true, verifiedAt: true } });
    if (!actor || actor.disabled) throw new TryOnError('TRY_ON_ACCOUNT', 403);
    if (config.requireVerifiedEmail && !actor.verifiedAt) throw new TryOnError('TRY_ON_VERIFICATION', 403);
    const product = await this.db.product.findFirst({ where: { slug: input.productSlug, active: true }, include: { category: true, variants: { where: { active: true } }, images: { orderBy: { position: 'asc' } } } });
    if (!product || !product.variants.some(variant => variant.color === input.color)) throw new TryOnError('TRY_ON_REFERENCE', 422);
    const reference = tryOnDownload({ ...product, design: product.design as { kind?: string } | null, variants: product.variants.map(variant => ({ ...variant, price: variant.price ?? product.price, available: 0 })) }, input.color);
    if (!reference) throw new TryOnError('TRY_ON_REFERENCE', 422);
    const path = reference.startsWith('/uploads/') ? resolve(projectRoot, this.settings.UPLOAD_DIR || 'uploads', reference.slice('/uploads/'.length).split('?')[0]) : resolve(projectRoot, 'apps/web/public', reference.slice(1).split('?')[0]);
    let garment: Buffer;
    try {
      if ((await stat(path)).size > 8 * 1024 * 1024) throw Error();
      garment = await tryOnPerson({ buffer: await readFile(path), mimetype: /\.png(?:\?|$)/i.test(reference) ? 'image/png' : /\.jpe?g(?:\?|$)/i.test(reference) ? 'image/jpeg' : 'image/webp' });
    }
    catch { throw new TryOnError('TRY_ON_REFERENCE', 422); }
    const person = await tryOnPerson(file);
    const fingerprint = createHash('sha256').update(JSON.stringify(input)).update(person).update(garment).digest('hex');
    const requestKey = `try-on:${createHash('sha256').update(`${userId}:${key}`).digest('hex')}`;
    const personFile = `${randomUUID()}.webp`, referenceFile = `${randomUUID()}.webp`;
    try {
      const event = await this.locked(async tx => {
        const previous = await tx.outboxEvent.findUnique({ where: { key: requestKey } });
        if (previous) {
          if (previous.kind !== TRY_ON_KIND || payload(previous).userId !== userId || payload(previous).fingerprint !== fingerprint) throw new TryOnError('TRY_ON_CONFLICT', 409);
          return previous;
        }
        const now = this.now(), day = tryOnDay(now);
        if (await this.charged(tx, day.start, userId) + 2 > 2) throw new TryOnError('TRY_ON_QUOTA', 429);
        if (await this.charged(tx, day.start) + 2 > config.shopLimit) throw new TryOnError('TRY_ON_SHOP_LIMIT', 429);
        const job: TryOnPayload = { version: 1, userId, productId: product.id, productSlug: product.slug, productName: product.name, color: input.color, mode: input.mode, material: product.material, fit: product.fit, model: config.model, fingerprint, consentVersion: TRY_ON_CONSENT, consentAt: now.toISOString(), personFile, referenceFile, resultFiles: [`${randomUUID()}.webp`, `${randomUUID()}.webp`], expiresAt: new Date(now.getTime() + config.retentionHours * 3600000).toISOString(), quotaCharged: true, filesPurgedAt: '' };
        await this.storage.put(personFile, person);
        await this.storage.put(referenceFile, garment);
        return tx.outboxEvent.create({ data: { kind: TRY_ON_KIND, key: requestKey, payload: json(job), createdAt: now, nextAttemptAt: now } });
      });
      return this.publicJob(event);
    } catch (error) { await this.storage.remove([personFile, referenceFile]).catch(() => {}); throw error; }
  }
  async get(userId: string, id: string) {
    const event = await this.db.outboxEvent.findFirst({ where: { id, kind: TRY_ON_KIND, AND: [ownerFilter(userId)] } });
    if (!event) throw new TryOnError('TRY_ON_NOT_FOUND', 404);
    return this.publicJob(event);
  }
  async image(userId: string, id: string, index: number) {
    const event = await this.db.outboxEvent.findFirst({ where: { id, kind: TRY_ON_KIND, AND: [ownerFilter(userId)] } });
    if (!event || this.publicJob(event).status !== 'succeeded' || ![0, 1].includes(index)) throw new TryOnError('TRY_ON_NOT_FOUND', 404);
    try { return await this.storage.read(payload(event).resultFiles[index]); }
    catch { throw new TryOnError('TRY_ON_NOT_FOUND', 404); }
  }
  async remove(userId: string, id: string) {
    const job = await this.locked(async tx => {
      const event = await tx.outboxEvent.findFirst({ where: { id, kind: TRY_ON_KIND, AND: [ownerFilter(userId)] } });
      if (!event) throw new TryOnError('TRY_ON_NOT_FOUND', 404);
      const data = payload(event);
      await tx.outboxEvent.update({ where: { id }, data: { status: 'FAILED', payload: json({ ...data, deletedAt: this.now().toISOString(), quotaCharged: !!data.providerAttemptedAt }) } });
      return data;
    });
    await this.storage.remove(names(job));
    return { deleted: true };
  }
  async execute(id: string) {
    const config = tryOnConfig(this.settings);
    if (!config.enabled) return;
    const claimed = await this.locked(async tx => {
      const event = await tx.outboxEvent.findUnique({ where: { id } });
      if (!event || event.kind !== TRY_ON_KIND || !['PENDING', 'QUEUED'].includes(event.status) || event.nextAttemptAt > this.now()) return;
      const job = payload(event);
      if (job.deletedAt || job.providerAttemptedAt || new Date(job.expiresAt) <= this.now()) return;
      if (await tx.outboxEvent.count({ where: { kind: TRY_ON_KIND, status: 'RUNNING' } })) return;
      await tx.outboxEvent.update({ where: { id }, data: { status: 'RUNNING', attempts: { increment: 1 }, nextAttemptAt: new Date(this.now().getTime() + config.timeoutMs + 60000) } });
      return job;
    });
    if (!claimed) return;
    let attempted = false, complete = false;
    try {
      const actor = await this.db.user.findUnique({ where: { id: claimed.userId }, select: { disabled: true, verifiedAt: true } });
      const available = await this.db.productVariant.count({ where: { productId: claimed.productId, color: claimed.color, active: true, product: { active: true } } });
      if (!actor || actor.disabled) throw new TryOnError('TRY_ON_ACCOUNT', 403);
      if (config.requireVerifiedEmail && !actor.verifiedAt) throw new TryOnError('TRY_ON_VERIFICATION', 403);
      if (!available) throw new TryOnError('TRY_ON_REFERENCE', 422);
      const [person, garment] = await Promise.all([this.storage.read(claimed.personFile), this.storage.read(claimed.referenceFile)]);
      const started = await this.locked(async tx => {
        const event = await tx.outboxEvent.findUniqueOrThrow({ where: { id } });
        const job = payload(event);
        if (event.status !== 'RUNNING' || job.deletedAt || job.providerAttemptedAt) return false;
        claimed.providerAttemptedAt = this.now().toISOString();
        await tx.outboxEvent.update({ where: { id }, data: { payload: json({ ...job, providerAttemptedAt: claimed.providerAttemptedAt }) } });
        return true;
      });
      if (!started) return;
      attempted = true;
      const result = await this.provider({ job: claimed, person, garment, apiKey: this.settings.OPENAI_API_KEY!, timeoutMs: config.timeoutMs });
      if (result.images.length !== 2) throw new TryOnError('TRY_ON_PROVIDER_RESPONSE');
      for (let index = 0; index < 2; index++) await this.storage.put(claimed.resultFiles[index], result.images[index]);
      complete = await this.locked(async tx => {
        const event = await tx.outboxEvent.findUniqueOrThrow({ where: { id } }), job = payload(event);
        if (event.status !== 'RUNNING' || job.deletedAt) return false;
        await tx.outboxEvent.update({ where: { id }, data: { status: 'DONE', lastError: null, payload: json({ ...job, usage: result.usage }) } });
        return true;
      });
    } catch (error) {
      const errorCode = error instanceof TryOnError ? error.code : attempted ? 'TRY_ON_PROVIDER_UNCERTAIN' : 'TRY_ON_FAILED';
      await this.locked(async tx => {
        const event = await tx.outboxEvent.findUniqueOrThrow({ where: { id } }), job = payload(event);
        if (job.deletedAt || event.status !== 'RUNNING') return;
        await tx.outboxEvent.update({ where: { id }, data: { status: 'FAILED', lastError: errorCode, payload: json({ ...job, errorCode, quotaCharged: attempted || !!job.providerAttemptedAt }) } });
      });
    } finally {
      await this.storage.remove([claimed.personFile, claimed.referenceFile, ...(!complete ? claimed.resultFiles : [])]).catch(() => {});
    }
  }
  async maintenance() {
    const now = this.now();
    const rows = await this.db.outboxEvent.findMany({ where: { kind: TRY_ON_KIND, AND: [{ payload: { path: ['filesPurgedAt'], equals: '' } }, { OR: [{ status: 'RUNNING', nextAttemptAt: { lt: now } }, { payload: { path: ['expiresAt'], lte: now.toISOString() } }] }] }, take: 200, orderBy: { createdAt: 'asc' } });
    for (const event of rows) {
      const original = payload(event);
      if (new Date(original.expiresAt) > now && !(event.status === 'RUNNING' && event.nextAttemptAt < now)) continue;
      const job = await this.locked(async tx => {
        const current = await tx.outboxEvent.findUniqueOrThrow({ where: { id: event.id } });
        if (current.status === 'RUNNING' && current.nextAttemptAt >= this.now()) return;
        const data = payload(current);
        const code = current.status === 'RUNNING' && data.providerAttemptedAt ? 'TRY_ON_PROVIDER_UNCERTAIN' : 'TRY_ON_EXPIRED';
        await tx.outboxEvent.update({ where: { id: event.id }, data: { status: current.status === 'DONE' ? 'DONE' : 'FAILED', payload: json({ ...data, errorCode: code, quotaCharged: !!data.providerAttemptedAt }) } });
        return data;
      });
      if (job) {
        try {
          await this.storage.remove(names(job));
          await this.locked(async tx => {
            const current = await tx.outboxEvent.findUniqueOrThrow({ where: { id: event.id } });
            await tx.outboxEvent.update({ where: { id: event.id }, data: { payload: json({ ...payload(current), filesPurgedAt: now.toISOString() }) } });
          });
        } catch { /* Leave the purge marker unset so the next pass retries deletion. */ }
      }
    }
    const active = await this.db.outboxEvent.findMany({ where: { kind: TRY_ON_KIND, createdAt: { gte: new Date(now.getTime() - 72 * 3600000) } } });
    await this.storage.sweepOrphans(new Set(active.filter(event => new Date(payload(event).expiresAt) > now && !payload(event).deletedAt).flatMap(event => names(payload(event)))), now);
  }
}
