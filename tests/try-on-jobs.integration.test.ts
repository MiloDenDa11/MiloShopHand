import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { createServer } from 'node:net';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { Db, csrfToken, hash, unseal } from '../apps/api/src/core';
import { TryOnService } from '../apps/api/src/try-on-service';
import { TryOnError, TRY_ON_KIND, type TryOnPayload } from '../apps/api/src/try-on-policy';
import { TryOnStorage } from '../apps/api/src/try-on-storage';
import type { ImageEditProvider } from '../apps/api/src/try-on-provider';
import designs from '../apps/web/content/polo-designs.json';

const url = new URL(process.env.DATABASE_URL!);
if (process.env.TRY_ON_TEST_DATABASE_URL !== process.env.DATABASE_URL || url.pathname !== '/milo_try_on_test' || url.hostname !== '127.0.0.1') throw Error('Only the isolated try-on test database is allowed.');
const db = new Db();
const storage = new TryOnStorage(process.env.TRY_ON_PRIVATE_DIR!);
const config = { TRY_ON_ENABLED: 'true', OPENAI_API_KEY: 'fixture-only-not-a-secret', TRY_ON_SHOP_DAILY_IMAGES: '1000' };
const input = { productSlug: designs[0].slug, color: designs[0].colors[0].name, mode: 'upper-body' as const, consent: 'true' as const };
let file: { buffer: Buffer; mimetype: string }, productId: string, api: ChildProcess, base: string, log = '';
const fakeProvider: ImageEditProvider = async () => ({ images: [file.buffer, file.buffer] });
function service(options: { now?: () => Date; provider?: ImageEditProvider; config?: Record<string, string> } = {}) {
  return new TryOnService(db, { storage, config: { ...config, ...options.config }, now: options.now, provider: options.provider || fakeProvider });
}
async function actor(verified = true) {
  return db.user.create({ data: { email: `fixture-${randomUUID()}@example.test`, name: 'Try-on fixture', passwordHash: 'fixture-no-login-password', verifiedAt: verified ? new Date() : null } });
}
before(async () => {
  await db.$connect();
  file = { buffer: await sharp({ create: { width: 640, height: 960, channels: 3, background: '#9b9b9b' } }).webp().toBuffer(), mimetype: 'image/webp' };
  const category = await db.category.create({ data: { name: 'Fixture polo', slug: `fixture-${randomUUID()}` } });
  const product = await db.product.create({ data: { slug: input.productSlug, name: designs[0].name, description: 'Test only', searchText: 'test', material: designs[0].material, fit: designs[0].fit, care: 'Test', price: 550000, cost: 200000, categoryId: category.id, design: { kind: 'polo' }, variants: { create: [{ sku: randomUUID(), color: input.color, colorHex: '#f2ede2', size: 'M' }, { sku: randomUUID(), color: designs[0].colors[1].name, colorHex: '#27384c', size: 'M' }] }, images: { create: designs[0].colors.slice(0, 2).map((color, position) => ({ url: `${color.image}?view=front`, color: color.name, alt: 'Fixture artwork', position })) } } });
  productId = product.id;
  const portProbe = createServer(); await new Promise<void>(resolve => portProbe.listen(0, '127.0.0.1', resolve));
  const port = (portProbe.address() as { port: number }).port; await new Promise<void>(resolve => portProbe.close(() => resolve()));
  base = `http://127.0.0.1:${port}`;
  api = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', '--tsconfig', 'apps/api/tsconfig.json', 'apps/api/src/main.ts'], { cwd: process.cwd(), env: { ...process.env, ...config, API_PORT: String(port), API_HOST: '127.0.0.1', APP_URL: base, REDIS_URL: 'redis://127.0.0.1:1', PAYMENT_PROVIDER: 'mock', SHIPPING_PROVIDER: 'mock', EMAIL_PROVIDER: 'file', NODE_ENV: 'development' }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  for (const stream of [api.stdout!, api.stderr!]) stream.on('data', bytes => { log = (log + bytes).slice(-6000); });
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (api.exitCode !== null) throw Error(`Fixture API exited: ${log}`);
    try { if ((await fetch(`${base}/api/v1/try-on/config`)).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw Error(`Fixture API did not start: ${log}`);
});
after(async () => {
  if (api?.pid && api.exitCode === null) {
    if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(api.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); else api.kill('SIGTERM');
  }
  await db.$disconnect();
});
test('chưa có key/opt-in: không tạo job, không giữ quota, không gọi provider', async () => {
  const user = await actor(); let calls = 0;
  const jobs = service({ config: { OPENAI_API_KEY: '' }, provider: async () => { calls++; return { images: [] }; } });
  await assert.rejects(jobs.submit(user.id, randomUUID(), input, file), error => error instanceof TryOnError && error.code === 'TRY_ON_UNAVAILABLE');
  assert.equal(calls, 0); assert.equal((await service().quota(user.id)).remaining, 2);
});
test('hai request đồng thời chỉ giữ được một lượt 2 ảnh; replay và restart không tính thêm', async () => {
  const user = await actor(); const key = randomUUID(); const jobs = service();
  const results = await Promise.allSettled([jobs.submit(user.id, key, input, file), jobs.submit(user.id, randomUUID(), input, file)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal((await jobs.quota(user.id)).remaining, 0);
  const created = (results.find(result => result.status === 'fulfilled') as PromiseFulfilledResult<Awaited<ReturnType<TryOnService['submit']>>>).value;
  const row = await db.outboxEvent.findUniqueOrThrow({ where: { id: created.id } });
  const originalKey = row.key === `try-on:${createHash('sha256').update(`${user.id}:${key}`).digest('hex')}` ? key : null;
  if (originalKey) assert.equal((await service().submit(user.id, originalKey, input, file)).id, created.id);
  await assert.rejects(service().submit(user.id, randomUUID(), input, file), error => error instanceof TryOnError && error.code === 'TRY_ON_QUOTA');
  assert.equal((await service().quota(user.id)).used, 2);
});
test('cùng idempotency key chỉ tạo một job; cùng key đổi màu bị chặn', async () => {
  const user = await actor(), jobs = service(), key = randomUUID();
  const first = await jobs.submit(user.id, key, input, file);
  assert.equal((await jobs.submit(user.id, key, input, file)).id, first.id);
  await assert.rejects(jobs.submit(user.id, key, { ...input, color: designs[0].colors[1].name }, file), error => error instanceof TryOnError && error.code === 'TRY_ON_CONFLICT');
});
test('worker trùng và gọi lại không gửi API lần hai; ảnh riêng tư và xóa không hoàn quota đã gửi', async () => {
  const user = await actor(), other = await actor(); let calls = 0;
  const jobs = service({ provider: async request => { calls++; assert.equal(request.job.productId, productId); assert.equal(request.job.color, input.color); return fakeProvider(request); } });
  const job = await jobs.submit(user.id, randomUUID(), input, file);
  await Promise.all([jobs.execute(job.id), jobs.execute(job.id)]); await jobs.execute(job.id);
  assert.equal(calls, 1);
  const result = await jobs.get(user.id, job.id); assert.equal(result.status, 'succeeded'); assert.equal(result.images.length, 2);
  assert.deepEqual(await jobs.image(user.id, job.id, 0), file.buffer);
  await assert.rejects(jobs.image(other.id, job.id, 0));
  await assert.rejects(jobs.get(other.id, job.id)); await assert.rejects(jobs.remove(other.id, job.id));
  const row = await db.outboxEvent.findUniqueOrThrow({ where: { id: job.id } }), data = row.payload as unknown as TryOnPayload;
  await assert.rejects(storage.read(data.personFile)); await assert.rejects(storage.read(data.referenceFile));
  await jobs.remove(user.id, job.id); await assert.rejects(jobs.image(user.id, job.id, 0));
  assert.equal((await service().quota(user.id)).remaining, 0);
  assert.equal(await db.outboxEvent.count({ where: { id: job.id } }), 1);
});
test('lỗi không rõ kết quả vẫn giữ quota và không được tự retry', async () => {
  const user = await actor(); let calls = 0;
  const jobs = service({ provider: async () => { calls++; throw new Error('fixture private upstream detail'); } });
  const job = await jobs.submit(user.id, randomUUID(), input, file);
  await jobs.execute(job.id); await jobs.execute(job.id);
  assert.equal(calls, 1); assert.equal((await jobs.get(user.id, job.id)).errorCode, 'TRY_ON_PROVIDER_UNCERTAIN');
  const row = await db.outboxEvent.findUniqueOrThrow({ where: { id: job.id } }); assert.doesNotMatch(JSON.stringify(row), /private upstream/);
  assert.equal((await jobs.quota(user.id)).remaining, 0);
});
test('hủy trước khi gửi hoàn quota; có thể bật lại xác minh email; màu không tồn tại bị chặn', async () => {
  const user = await actor(), jobs = service();
  const job = await jobs.submit(user.id, randomUUID(), input, file); await jobs.remove(user.id, job.id); await jobs.execute(job.id);
  assert.equal((await jobs.quota(user.id)).remaining, 2);
  const unverified = await actor(false);
  await assert.rejects(service({ config: { TRY_ON_REQUIRE_VERIFIED_EMAIL: 'true' } }).submit(unverified.id, randomUUID(), input, file), error => error instanceof TryOnError && error.code === 'TRY_ON_VERIFICATION');
  await assert.rejects(jobs.submit(user.id, randomUUID(), { ...input, color: 'Không có' }, file), error => error instanceof TryOnError && error.code === 'TRY_ON_REFERENCE');
});
test('chưa xác minh email vẫn tạo đủ hai ảnh khi tạm bỏ yêu cầu; quota vẫn áp dụng', async () => {
  const user = await actor(false); let calls = 0;
  const jobs = service({ provider: async request => { calls++; return fakeProvider(request); } });
  assert.equal(jobs.config().requireVerifiedEmail, false);
  const job = await jobs.submit(user.id, randomUUID(), input, file);
  await jobs.execute(job.id);
  assert.equal(calls, 1);
  const result = await jobs.get(user.id, job.id);
  assert.equal(result.status, 'succeeded'); assert.equal(result.images.length, 2);
  assert.equal((await jobs.quota(user.id)).remaining, 0);
  await assert.rejects(jobs.submit(user.id, randomUUID(), input, file), error => error instanceof TryOnError && error.code === 'TRY_ON_QUOTA');
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: user.id } })).verifiedAt, null);
});

test('worker kiểm tra chính sách email và tài khoản bị khóa trước khi gọi provider', async () => {
  let calls = 0;
  const jobs = service({ provider: async request => { calls++; return fakeProvider(request); } });
  const unverified = await actor(false), disabled = await actor(false);
  const emailJob = await jobs.submit(unverified.id, randomUUID(), input, file);
  const accountJob = await jobs.submit(disabled.id, randomUUID(), input, file);
  await db.user.update({ where: { id: disabled.id }, data: { disabled: true } });
  await service({ config: { TRY_ON_REQUIRE_VERIFIED_EMAIL: 'true' }, provider: async request => { calls++; return fakeProvider(request); } }).execute(emailJob.id);
  await jobs.execute(accountJob.id);
  assert.equal(calls, 0);
  assert.equal((await jobs.get(unverified.id, emailJob.id)).errorCode, 'TRY_ON_VERIFICATION');
  assert.equal((await jobs.get(disabled.id, accountJob.id)).errorCode, 'TRY_ON_ACCOUNT');
  assert.equal((await jobs.quota(unverified.id)).remaining, 2);
  await assert.rejects(jobs.submit(disabled.id, randomUUID(), input, file), error => error instanceof TryOnError && error.code === 'TRY_ON_ACCOUNT');
  await assert.rejects(jobs.submit(randomUUID(), randomUUID(), input, file), error => error instanceof TryOnError && error.code === 'TRY_ON_ACCOUNT');
});

test('giới hạn chung của shop được giữ nguyên tử giữa hai tài khoản', async () => {
  const first = await actor(), second = await actor();
  const jobs = service({ now: () => new Date('2035-01-01T05:00:00Z'), config: { TRY_ON_SHOP_DAILY_IMAGES: '2' } });
  const results = await Promise.allSettled([jobs.submit(first.id, randomUUID(), input, file), jobs.submit(second.id, randomUUID(), input, file)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const rejected = results.find(result => result.status === 'rejected') as PromiseRejectedResult;
  assert.equal(rejected.reason.code, 'TRY_ON_SHOP_LIMIT');
});
test('worker chết sau đánh dấu gửi không bị requeue; kết quả đến muộn bị bỏ', async () => {
  const user = await actor(); const time = { value: new Date() }; let finish!: (result: { images: Buffer[] }) => void;
  let entered!: () => void; const started = new Promise<void>(resolve => { entered = resolve; }); let calls = 0;
  const jobs = service({ now: () => time.value, provider: async () => { calls++; entered(); return new Promise(resolve => { finish = resolve; }); } });
  const job = await jobs.submit(user.id, randomUUID(), input, file);
  const execution = jobs.execute(job.id); await started;
  time.value = new Date(time.value.getTime() + 250000); await jobs.maintenance();
  finish({ images: [file.buffer, file.buffer] }); await execution; await jobs.execute(job.id);
  assert.equal(calls, 1); assert.equal((await jobs.get(user.id, job.id)).status, 'failed');
  assert.equal((await jobs.quota(user.id)).remaining, 0);
});
test('hết hạn: chặn đọc, xóa file nhưng giữ ledger; ngày mới có 2 ảnh', async () => {
  const user = await actor(); const time = { value: new Date() }; const jobs = service({ now: () => time.value });
  const job = await jobs.submit(user.id, randomUUID(), input, file); await jobs.execute(job.id);
  const data = (await db.outboxEvent.findUniqueOrThrow({ where: { id: job.id } })).payload as unknown as TryOnPayload;
  time.value = new Date(time.value.getTime() + 25 * 3600000);
  await assert.rejects(jobs.image(user.id, job.id, 0)); await jobs.maintenance();
  await assert.rejects(storage.read(data.resultFiles[0])); assert.equal((await jobs.quota(user.id)).remaining, 2);
  assert.equal(await db.outboxEvent.count({ where: { id: job.id, kind: TRY_ON_KIND } }), 1);
});
test('gửi lại xác minh: chỉ tài khoản đăng nhập, chống gửi trùng, token kín và dùng một lần', async () => {
  const user = await actor(false), raw = randomBytes(32).toString('hex'), csrf = csrfToken();
  await db.session.create({ data: { id: hash(raw), userId: user.id, csrf, expiresAt: new Date(Date.now() + 3600000), agent: 'resend fixture' } });
  const headers = { Cookie: `milo_sid=${raw}; milo_csrf=${csrf}`, 'X-CSRF-Token': csrf, Origin: base, 'Content-Type': 'application/json' };
  const oldToken = randomBytes(32).toString('hex');
  await db.authToken.create({ data: { userId: user.id, purpose: 'VERIFY', hash: hash(oldToken), expiresAt: new Date(Date.now() + 3600000) } });
  const endpoint = `${base}/api/v1/auth/verify/resend`;
  assert.equal((await fetch(endpoint, { method: 'POST', headers: { ...headers, Cookie: `milo_csrf=${csrf}` }, body: '{}' })).status, 401);
  assert.equal((await fetch(endpoint, { method: 'POST', headers: { ...headers, 'X-CSRF-Token': 'invalid' }, body: '{}' })).status, 403);
  const results = await Promise.all([fetch(endpoint, { method: 'POST', headers, body: '{}' }), fetch(endpoint, { method: 'POST', headers, body: '{}' })]);
  assert.deepEqual(results.map(result => result.status).sort(), [201, 429]);
  const accepted = await results.find(result => result.status === 201)!.json();
  assert.equal(accepted.delivery, 'local'); assert.doesNotMatch(JSON.stringify(accepted), /token=|encryptedText/);
  const rows = await db.outboxEvent.findMany({ where: { kind: 'EMAIL', key: { startsWith: `verify-resend:${user.id}:` } } });
  assert.equal(rows.length, 1);
  const data = rows[0].payload as { text?: string; encryptedText: string; to: string };
  assert.equal(data.text, undefined); assert.equal(data.to, user.email);
  const token = /[?&]token=([a-f0-9]+)/.exec(unseal(data.encryptedText))![1];
  const verify = (value: string) => fetch(`${base}/api/v1/auth/verify`, { method: 'POST', headers, body: JSON.stringify({ token: value }) });
  assert.equal((await verify(oldToken)).status, 400);
  assert.equal((await verify(token)).status, 201);
  assert.equal((await verify(token)).status, 400);
  const current = await (await fetch(`${base}/api/v1/me`, { headers })).json();
  assert.ok(current.verifiedAt);
  assert.equal((await service().quota(user.id)).remaining, 2);
  const other = await actor(false), otherRaw = randomBytes(32).toString('hex'), otherCsrf = csrfToken();
  await db.session.create({ data: { id: hash(otherRaw), userId: other.id, csrf: otherCsrf, expiresAt: new Date(Date.now() + 3600000), agent: 'resend mass-assignment fixture' } });
  assert.equal((await fetch(endpoint, { method: 'POST', headers: { ...headers, Cookie: `milo_sid=${otherRaw}; milo_csrf=${otherCsrf}`, 'X-CSRF-Token': otherCsrf }, body: JSON.stringify({ email: 'other@example.test' }) })).status, 422);
  assert.equal(await db.outboxEvent.count({ where: { kind: 'EMAIL', key: { startsWith: `verify-resend:${user.id}:` } } }), 1);
});
test('API thật: cần session + CSRF, không nhận n/prompt/url và ảnh chỉ chủ sở hữu đọc được', async () => {
  const user = await actor(), other = await actor();
  const makeHeaders = async (id: string) => {
    const raw = randomBytes(32).toString('hex'), csrf = csrfToken();
    await db.session.create({ data: { id: createHash('sha256').update(raw).digest('hex'), userId: id, csrf, expiresAt: new Date(Date.now() + 3600000), agent: 'test fixture' } });
    return { Cookie: `milo_sid=${raw}; milo_csrf=${csrf}`, 'X-CSRF-Token': csrf, Origin: base, 'Idempotency-Key': randomUUID() };
  };
  const headers = await makeHeaders(user.id), otherHeaders = await makeHeaders(other.id);
  const form = (extra?: string) => { const body = new FormData(); body.set('photo', new Blob([Uint8Array.from(file.buffer)], { type: file.mimetype }), 'fixture.webp'); for (const [key, value] of Object.entries(input)) body.set(key, value); if (extra) body.set(extra, 'untrusted'); return body; };
  assert.equal((await fetch(`${base}/api/v1/try-on/quota`)).status, 401);
  assert.equal((await fetch(`${base}/api/v1/try-on/jobs`, { method: 'POST', headers: { ...headers, 'X-CSRF-Token': 'invalid' }, body: form() })).status, 403);
  for (const field of ['n', 'prompt', 'imageUrl']) assert.ok([400, 422].includes((await fetch(`${base}/api/v1/try-on/jobs`, { method: 'POST', headers: field === 'n' ? headers : otherHeaders, body: form(field) })).status));
  const response = await fetch(`${base}/api/v1/try-on/jobs`, { method: 'POST', headers, body: form() });
  assert.equal(response.status, 201); const job = await response.json();
  await service().execute(job.id);
  const result = await fetch(`${base}/api/v1/try-on/jobs/${job.id}/images/0`, { headers });
  assert.equal(result.status, 200); assert.equal(result.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(Buffer.from(await result.arrayBuffer()), file.buffer);
  assert.equal((await fetch(`${base}/api/v1/try-on/jobs/${job.id}/images/0`, { headers: otherHeaders })).status, 404);
  const serialized = JSON.stringify(await (await fetch(`${base}/api/v1/try-on/jobs/${job.id}`, { headers })).json());
  assert.doesNotMatch(serialized, /personFile|referenceFile|fingerprint|apiKey|fixture-only/);
  const admin = await actor(); await db.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } });
  const adminHeaders = await makeHeaders(admin.id);
  assert.equal((await fetch(`${base}/api/v1/admin/jobs/${job.id}/retry`, { method: 'POST', headers: { ...adminHeaders, 'Content-Type': 'application/json' }, body: '{}' })).status, 409);
  assert.equal((await db.outboxEvent.findUniqueOrThrow({ where: { id: job.id } })).status, 'DONE');
});
