import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { Client } from 'pg';
import { Db, hash, csrfToken } from '../apps/api/src/core';
import { passwordHash } from '../apps/api/src/auth';
import { PackingService } from '../apps/api/src/packing';
import { CommerceService } from '../apps/api/src/commerce';
import { SellerOperations } from '../apps/api/src/seller-operations';
import { accessToken } from '../apps/api/src/jwt';
const url = new URL(process.env.DATABASE_URL!);
if (process.env.TRY_ON_TEST_DATABASE_URL !== process.env.DATABASE_URL || url.hostname !== '127.0.0.1' || url.pathname !== '/milo_try_on_test') throw Error('Fresh isolated test database required');
const db = new Db(), packing = new PackingService(db), commerce = new CommerceService(db), operations = new SellerOperations(db);
let api: ChildProcess, base: string, logs = '', ph: string, product: any;
const code = (expected: string) => (error: any) => error?.getResponse?.()?.code === expected;
async function user(role: 'USER' | 'ADMIN' | 'SELLER' = 'SELLER') { return db.user.create({ data: { email: `${randomUUID()}@example.test`, name: 'Synthetic fulfillment', role, passwordHash: ph, verifiedAt: new Date() } }); }
async function order(status = 'PACKING', buyer?: any, quantity = 2) {
  const owner = buyer || await user('USER');
  return db.order.create({ data: { code: `TEST-${randomUUID()}`, userId: owner.id, status: status as any, method: 'COD', idempotencyKey: randomUUID(), requestHash: 'fixture', address: { recipient: 'Synthetic Recipient', phone: '0901234567', text: '123 Synthetic Road', instructions: '<script>synthetic-only</script>' }, subtotal: 550000 * quantity, discount: 0, shippingFee: 0, total: 550000 * quantity, expiresAt: new Date(Date.now() + 3600000), items: { create: { productId: product.id, variantId: product.variants[0].id, name: 'Synthetic Polo', sku: product.variants[0].sku, color: 'Olive', size: 'M', image: '/hero-shirt.svg', quantity, price: 550000, cost: 225000, discount: 0 } }, payment: { create: { provider: 'mock', status: 'UNPAID', amount: 550000 * quantity, expiresAt: new Date(Date.now() + 3600000) } } }, include: { items: true } });
}
async function browser(actor?: any, jwtAge?: number) {
  const cookies = new Map<string, string>(); let sessionId = '';
  if (actor) { const raw = randomBytes(32).toString('hex'), csrf = csrfToken(); sessionId = jwtAge === undefined ? hash(raw) : `jwt:${hash(raw)}`; await db.session.create({ data: { id: sessionId, userId: actor.id, csrf, expiresAt: new Date(Date.now() + 3600000), agent: 'Synthetic browser' } }); cookies.set('milo_sid', raw); cookies.set('milo_csrf', csrf); if (jwtAge !== undefined) cookies.set('milo_access', accessToken(actor.id, sessionId, process.env, Date.now() - jwtAge)); }
  const headers = () => ({ Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join('; '), Origin: base, 'X-CSRF-Token': cookies.get('milo_csrf') || '' });
  async function call(path: string, body?: any, method = body === undefined ? 'GET' : 'POST', origin = base) { const response = await fetch(`${base}/api/v1${path}`, { method, headers: { ...headers(), Origin: origin, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: response.status, data: await response.json(), headers: response.headers }; }
  async function stream() {
    const abort = new AbortController(), response = await fetch(`${base}/api/v1/me/events`, { headers: headers(), signal: abort.signal });
    if (!response.ok) { abort.abort(); return { status: response.status, frames: [] as any[], close: () => {}, wait: async (_: any) => { throw Error('No stream'); }, headers: response.headers }; }
    const frames: { event: string; data: any }[] = [], reader = response.body!.getReader(); let buffer = '';
    const decoder = new TextDecoder();
    void (async () => { try { for (;;) { const part = await reader.read(); if (part.done) break; buffer += decoder.decode(part.value, { stream: true }); let end: number; while ((end = buffer.indexOf('\n\n')) >= 0) { const raw = buffer.slice(0, end); buffer = buffer.slice(end + 2); const event = /^event: (.+)$/m.exec(raw)?.[1], data = /^data: (.+)$/m.exec(raw)?.[1]; if (event) frames.push({ event, data: data ? JSON.parse(data) : null }); } } } catch {} })();
    const wait = async (predicate: (frame: any) => boolean) => { const deadline = Date.now() + 15000; while (Date.now() < deadline) { const frame = frames.find(predicate); if (frame) return frame; await new Promise(resolve => setTimeout(resolve, 50)); } throw Error('Timed out waiting for synthetic SSE event'); };
    await wait(frame => frame.event === 'ready');
    return { status: response.status, frames, close: () => abort.abort(), wait, headers: response.headers };
  }
  return { call, stream, sessionId };
}
const scan = (sku: string, revision = 0, requestId = randomUUID()) => ({ action: 'SCAN' as const, sku, expectedRevision: revision, requestId });
before(async () => {
  await db.$connect(); ph = await passwordHash('Synthetic fulfillment password only!');
  const category = await db.category.create({ data: { name: 'Synthetic category', slug: randomUUID() } });
  product = await db.product.create({ data: { name: 'Synthetic Polo', slug: randomUUID(), description: 'Fixture', searchText: 'fixture', material: 'Cotton', fit: 'Regular', care: 'Fixture', price: 550000, cost: 225000, categoryId: category.id, variants: { create: { sku: `POLO-${randomUUID()}`, color: 'Olive', colorHex: '#778064', size: 'M', inventories: { create: { onHand: 100 } } } } }, include: { variants: true } });
  const probe = createServer(); await new Promise<void>(resolve => probe.listen(0, '127.0.0.1', resolve)); const port = (probe.address() as any).port; await new Promise<void>(resolve => probe.close(() => resolve())); base = `http://127.0.0.1:${port}`;
  api = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', '--tsconfig', 'apps/api/tsconfig.json', 'apps/api/src/main.ts'], { windowsHide: true, env: { ...process.env, API_PORT: String(port), API_HOST: '127.0.0.1', APP_URL: base, REDIS_URL: 'redis://127.0.0.1:1' }, stdio: ['ignore','pipe','pipe'] });
  for (const stream of [api.stdout!, api.stderr!]) stream.on('data', data => { logs = (logs + data).slice(-6000); });
  const deadline = Date.now() + 150000; while (Date.now() < deadline) { if (api.exitCode !== null) throw Error(logs); try { if ((await fetch(`${base}/api/v1/config`)).ok) return; } catch {} await new Promise(resolve => setTimeout(resolve, 200)); } throw Error('Synthetic API did not start');
});
after(async () => { if (api?.pid && api.exitCode === null) { if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(api.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); else api.kill(); } await db.$disconnect(); });
test('wrong SKU, excess count and negative undo rejected; idempotent scan retries cannot double-count', async () => {
  const actor = await user(), item = await order('PACKING', undefined, 1), sku = item.items[0].sku;
  await assert.rejects(packing.change(item.id, actor.id, scan('wrong-colour-size')), code('PACKING_WRONG_SKU'));
  await assert.rejects(packing.change(item.id, actor.id, { action: 'UNDO', sku, expectedRevision: 0, requestId: randomUUID(), reason: 'Synthetic undo' }), code('PACKING_NOT_CHECKED'));
  const request = scan(sku), first = await packing.change(item.id, actor.id, request), replay = await packing.change(item.id, actor.id, request); assert.equal(first.revision, 1); assert.equal(replay.checkedTotal, 1);
  await assert.rejects(packing.change(item.id, actor.id, { ...request, sku: 'changed' }), code('IDEMPOTENCY_CONFLICT'));
  await assert.rejects(packing.change(item.id, actor.id, scan(sku, 1)), code('PACKING_EXCESS'));
  assert.equal(await db.packingScan.count({ where: { orderId: item.id } }), 1);
});
test('two employees scanning same revision have one winner; assigned colleague and customer cannot modify packing', async () => {
  const first = await user(), second = await user(), buyer = await user('USER'), item = await order();
  const results = await Promise.allSettled([packing.change(item.id, first.id, scan(item.items[0].sku)), packing.change(item.id, second.id, scan(item.items[0].sku))]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1); assert.equal((await packing.get(item.id)).checkedTotal, 1);
  await operations.assign(item.id, first.id, { assigneeId: first.id, expectedRevision: 0, reason: 'Synthetic ownership' });
  await assert.rejects(packing.change(item.id, second.id, scan(item.items[0].sku, 1)), code('ORDER_ASSIGNED'));
  await assert.rejects(packing.change(item.id, buyer.id, scan(item.items[0].sku, 1)), code('FORBIDDEN'));
});
test('server blocks ready-to-ship through both seller endpoint and common Admin transition until every piece checked', async () => {
  const staff = await user(), admin = await user('ADMIN'), item = await order(), client = await browser(staff), before = await db.inventory.findMany();
  assert.equal((await client.call(`/seller/orders/${item.id}/status`, { from: 'PACKING', status: 'READY_TO_SHIP', reason: 'Synthetic bypass' }, 'PATCH')).data.code, 'PACKING_INCOMPLETE');
  await assert.rejects(commerce.transition(item.id, 'READY_TO_SHIP', admin.id, 'Synthetic admin bypass'), code('PACKING_INCOMPLETE'));
  await packing.change(item.id, staff.id, scan(item.items[0].sku));
  await assert.rejects(commerce.transition(item.id, 'READY_TO_SHIP', admin.id, 'Synthetic missing piece'), code('PACKING_INCOMPLETE'));
  await packing.change(item.id, staff.id, scan(item.items[0].sku, 1));
  assert.equal((await client.call(`/seller/orders/${item.id}/status`, { from: 'PACKING', status: 'READY_TO_SHIP', reason: 'Synthetic checked package' }, 'PATCH')).status, 200);
  assert.deepEqual(await db.inventory.findMany(), before);
  await assert.rejects(packing.change(item.id, staff.id, scan(item.items[0].sku, 2)), code('PACKING_STATE'));
});
test('undo and reset are audited; changed snapshot invalidates checks; closed and unstarted orders reject scans', async () => {
  const actor = await user(), item = await order(); await packing.change(item.id, actor.id, scan(item.items[0].sku));
  const undone = await packing.change(item.id, actor.id, { action: 'UNDO', sku: item.items[0].sku, expectedRevision: 1, requestId: randomUUID(), reason: 'Synthetic removed piece' }); assert.equal(undone.checkedTotal, 0);
  await db.orderItem.update({ where: { id: item.items[0].id }, data: { size: 'XL' } }); assert.equal((await packing.get(item.id)).needsReset, true);
  await assert.rejects(packing.change(item.id, actor.id, scan(item.items[0].sku, 2)), code('PACKING_CONTENT_CHANGED'));
  const reset = await packing.change(item.id, actor.id, { action: 'RESET', requestId: randomUUID(), expectedRevision: 2, reason: 'Synthetic rescan changed order' }); assert.equal(reset.needsReset, false); assert.equal(reset.revision, 3);
  assert.equal(await db.auditLog.count({ where: { entityId: item.id, action: { startsWith: 'PACKING_' } } }), 3);
  for (const status of ['CONFIRMED','CANCELLED','SHIPPED']) { const closed = await order(status); await assert.rejects(packing.change(closed.id, actor.id, scan(closed.items[0].sku)), code('PACKING_STATE')); }
});
test('packing slip uses order snapshot, excludes prices/cost/tokens and is role/CSRF protected', async () => {
  const actor = await user(), item = await order(), staff = await browser(actor), customer = await browser(await user('USER'));
  const response = await staff.call(`/seller/orders/${item.id}/packing-slip`, {}); assert.equal(response.status, 201);
  assert.equal(response.data.items[0].sku, item.items[0].sku); assert.equal(response.data.items[0].size, 'M'); assert.equal(response.data.totalQuantity, 2);
  for (const forbidden of ['price','cost','password','token','subtotal','total','payment','buyer']) assert.equal(Object.hasOwn(response.data, forbidden), false);
  assert.deepEqual(Object.keys(response.data.items[0]).sort(), ['color','name','quantity','size','sku']);
  assert.equal((await customer.call(`/seller/orders/${item.id}/packing-slip`, {})).status, 403);
  assert.equal((await staff.call(`/seller/orders/${item.id}/packing-slip`, {}, 'POST', 'https://evil.test')).status, 403);
  assert.equal((await staff.call(`/seller/orders/${item.id}/packing`, { ...scan(item.items[0].sku), quantity: 10 })).status, 422);
  assert.equal((await packing.get((await order('READY_TO_SHIP')).id)).complete, false); // Legacy ready orders are not backfilled as checked.
});
test('notification read state is scoped to current user; foreign IDs, malformed batches and CSRF fail safely', async () => {
  const first = await user('USER'), second = await user('USER'), client = await browser(first);
  const mine = await db.notification.create({ data: { userId: first.id, key: randomUUID(), title: 'Synthetic mine', body: 'Fixture' } }), other = await db.notification.create({ data: { userId: second.id, key: randomUUID(), title: 'Synthetic other', body: 'Fixture' } });
  assert.equal((await client.call('/me/notifications/read', { ids: [mine.id,other.id] }, 'PATCH')).data.unread, 0);
  assert.ok((await db.notification.findUniqueOrThrow({ where: { id: mine.id } })).readAt); assert.equal((await db.notification.findUniqueOrThrow({ where: { id: other.id } })).readAt, null);
  assert.equal((await client.call('/me/notifications/read', { all: true, userId: second.id }, 'PATCH')).status, 422);
  assert.equal((await client.call('/me/notifications/read', { all: true }, 'PATCH', 'https://evil.test')).status, 403);
});
test('SSE is private/no-store; committed order updates reach owner and staff with no customer data; rollback emits nothing', async () => {
  const owner = await user('USER'), stranger = await user('USER'), item = await order('PACKING', owner), staff = await user();
  const a = await (await browser(owner)).stream(), b = await (await browser(stranger)).stream(), s = await (await browser(staff)).stream();
  try {
    assert.equal(a.status, 200); assert.match(a.headers.get('content-type')!, /text\/event-stream/); assert.match(a.headers.get('cache-control')!, /no-store/); assert.equal(a.headers.get('x-accel-buffering'), 'no');
    await db.order.update({ where: { id: item.id }, data: { internalNote: 'PRIVATE-SYNTHETIC-CANARY' } });
    await a.wait(frame => frame.data?.kind === 'orders' && frame.data.orderId === item.id); await s.wait(frame => frame.data?.kind === 'seller' && frame.data.orderId === item.id);
    assert.equal(b.frames.some(frame => frame.data?.orderId === item.id), false);
    assert.equal(JSON.stringify(a.frames).includes('PRIVATE-SYNTHETIC-CANARY'), false); assert.equal(JSON.stringify(a.frames).includes('0901234567'), false);
    const previous = a.frames.length;
    await assert.rejects(db.$transaction(async tx => { await tx.order.update({ where: { id: item.id }, data: { internalNote: 'ROLLED-BACK' } }); throw Error('Synthetic rollback'); }));
    await new Promise(resolve => setTimeout(resolve, 500)); assert.equal(a.frames.length, previous);
  } finally { a.close(); b.close(); s.close(); }
});
test('LISTEN/NOTIFY sends cross-process changes; user receives only own notification invalidation', async () => {
  const actor = await user('USER'), other = await user('USER'), stream = await (await browser(actor)).stream(), driver = new Client({ connectionString: process.env.DATABASE_URL });
  try { await driver.connect(); await driver.query('INSERT INTO "Notification" (id,"userId",key,title,body) VALUES ($1,$2,$3,$4,$5)', [randomUUID(),other.id,randomUUID(),'Foreign','PRIVATE-OTHER']); await new Promise(resolve => setTimeout(resolve, 350)); assert.equal(stream.frames.some(frame => frame.data?.kind === 'notifications'), false);
    await driver.query('INSERT INTO "Notification" (id,"userId",key,title,body) VALUES ($1,$2,$3,$4,$5)', [randomUUID(),actor.id,randomUUID(),'Mine','PRIVATE-OWN']); const event = await stream.wait(frame => frame.data?.kind === 'notifications'); assert.deepEqual(event.data, { kind: 'notifications' });
  } finally { stream.close(); await driver.end(); }
});
test('asynchronous carrier and payment updates invalidate the order even when Order row is unchanged', async () => {
  const owner = await user('USER'), item = await order('READY_TO_SHIP', owner), client = await browser(owner), stream = await client.stream();
  try {
    const original = await db.order.findUniqueOrThrow({ where: { id: item.id } });
    await db.shipment.create({ data: { orderId: item.id, provider: 'mock', fee: 0, codExpected: item.total } });
    await stream.wait(frame => frame.data?.kind === 'orders' && frame.data.orderId === item.id);
    stream.frames.length = 0;
    await db.shipment.update({ where: { orderId: item.id }, data: { trackingCode: `SYNTHETIC-${randomUUID()}`, status: 'CREATED' } });
    await stream.wait(frame => frame.data?.kind === 'orders' && frame.data.orderId === item.id);
    stream.frames.length = 0;
    await db.payment.update({ where: { orderId: item.id }, data: { received: 1000 } });
    const changed = await stream.wait(frame => frame.data?.kind === 'orders' && frame.data.orderId === item.id);
    assert.deepEqual(changed.data, { kind: 'orders', orderId: item.id });
    assert.deepEqual(await db.order.findUniqueOrThrow({ where: { id: item.id } }), original);
  } finally { stream.close(); }
});
test('revoked and demoted sessions stop streams before the next scoped event; expired JWT requires reconnect', async () => {
  const actor = await user(), client = await browser(actor), stream = await client.stream();
  try { await db.user.update({ where: { id: actor.id }, data: { role: 'USER' } }); await db.notification.create({ data: { userId: actor.id, key: randomUUID(), title: 'Fixture', body: 'Private' } }); await stream.wait(frame => frame.event === 'authentication'); assert.equal(stream.frames.some(frame => frame.event === 'change'), false); } finally { stream.close(); }
  const buyer = await user('USER'), expired = await (await browser(buyer, 895000)).stream(); try { await expired.wait(frame => frame.event === 'reconnect'); } finally { expired.close(); }
});
test('guest and cross-origin stream rejected; per-account connection cap releases aborted connections', async () => {
  assert.equal((await (await browser()).stream()).status, 401);
  const actor = await user('USER'), client = await browser(actor), streams = [];
  assert.equal((await client.call('/me/events', undefined, 'GET', 'https://evil.test')).status, 403);
  try { for (let index = 0; index < 3; index++) streams.push(await client.stream()); assert.equal((await client.stream()).status, 429); }
  finally { streams.forEach(stream => stream.close()); }
  await new Promise(resolve => setTimeout(resolve, 200)); const reopened = await client.stream(); assert.equal(reopened.status, 200); reopened.close();
});
