import 'dotenv/config';
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { csrfToken, hash } from '../apps/api/src/core';
import { AuthController, passwordHash } from '../apps/api/src/auth';
import Redis from 'ioredis';
import { securityIdentity, securityEvent } from '../apps/api/src/request-security';
import { createConnection } from 'node:net';
import sharp from 'sharp';
import { AttachmentsController } from '../apps/api/src/attachments';

const db = new PrismaClient();
const root = process.env.TEST_API_URL!;
const suffix = randomBytes(10).toString('hex');
let buyer: any, other: any, product: any, variant: any, order: any;
const request = async (path: string, client?: { cookie: string; csrf: string }, body?: unknown, method = body ? 'POST' : 'GET', extra: Record<string, string> = {}) => {
  const response = await fetch(root + path, { method, headers: { Origin: process.env.APP_URL!, 'Content-Type': 'application/json', ...(client ? { Cookie: client.cookie, 'X-CSRF-Token': client.csrf } : {}), ...extra }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const text = await response.text();
  let data: any; try { data = JSON.parse(text); } catch { data = text; }
  return { status: response.status, data, headers: response.headers };
};
async function session(userId: string, extra: any = {}) {
  const raw = randomBytes(32).toString('hex'), csrf = csrfToken();
  await db.session.create({ data: { id: hash(raw), userId, csrf, agent: 'Security regression fixture', expiresAt: new Date(Date.now() + 3600000), ...extra } });
  return { cookie: `milo_sid=${raw}; milo_csrf=${csrf}`, csrf, raw };
}
let owner: Awaited<ReturnType<typeof session>>, stranger: Awaited<ReturnType<typeof session>>;
before(async () => {
  assert(new URL(process.env.DATABASE_URL!).pathname.endsWith('_test'), 'Security fixtures require an isolated test database');
  const ph = await passwordHash('Security test ' + randomBytes(24).toString('hex'));
  buyer = await db.user.create({ data: { email: `security-${suffix}@example.test`, name: 'Security Buyer', verifiedAt: new Date(), passwordHash: ph } });
  other = await db.user.create({ data: { email: `security-other-${suffix}@example.test`, name: 'Security Other', verifiedAt: new Date(), passwordHash: ph } });
  owner = await session(buyer.id); stranger = await session(other.id);
  const category = await db.category.findFirstOrThrow();
  product = await db.product.create({ data: { name: 'Security Fixture', slug: `security-${suffix}`, description: 'Security fixture isolated from store', searchText: 'security fixture', categoryId: category.id, material: 'Cotton', fit: 'Regular', care: 'Wash gently', price: 180000, cost: 81234, variants: { create: { sku: `SEC-${suffix}`, color: 'Đen', colorHex: '#151515', size: 'M', inventories: { create: { onHand: 15, reserved: 2 } } } } }, include: { variants: { include: { inventories: true } } } });
  variant = product.variants[0];
  await db.wishlist.create({ data: { userId: buyer.id, productId: product.id } });
  await db.cart.create({ data: { userId: buyer.id, items: { create: { variantId: variant.id, quantity: 1 } } } });
  order = await db.order.create({ data: { userId: buyer.id, code: `SEC-${suffix}`, status: 'DELIVERED', method: 'COD', address: { recipient: 'Security Buyer' }, idempotencyKey: suffix, requestHash: suffix, subtotal: 180000, discount: 0, shippingFee: 0, total: 180000, expiresAt: new Date(), internalNote: 'INTERNAL-ONLY', items: { create: { productId: product.id, variantId: variant.id, name: product.name, sku: variant.sku, color: variant.color, size: 'M', image: '', price: 180000, cost: 81234, quantity: 1, discount: 0 } } }, include: { items: true } });
  const ret = await db.returnRequest.create({ data: { orderId: order.id, reason: 'Security return fixture', items: { create: { orderItemId: order.items[0].id, quantity: 1 } } }, include: { items: true } });
  await db.exchange.create({ data: { returnItemId: ret.items[0].id, inventoryId: variant.inventories[0].id, quantity: 1, snapshot: { name: product.name, color: 'Đen', size: 'L', sku: variant.sku, price: 180000, cost: 81234 }, priceDifference: 0, shippingFee: 0, due: 0, refundDue: 0, expiresAt: new Date(Date.now() + 3600000) } });
});
after(async () => db.$disconnect());

test('SEC-01: wishlist never exposes purchase cost or internal product data', async () => {
  const r = await request('/me/wishlist', owner);
  assert.equal(r.status, 200);
  assert(r.data.some((row: any) => row.productId === product.id));
  assert(!JSON.stringify(r.data).includes('"cost"'), 'purchase cost must not be sent to customers');
  assert(!JSON.stringify(r.data).includes('"searchText"'));
});
test('SEC-02: customer exchange snapshot never exposes purchase cost or stock identifiers', async () => {
  const r = await request('/exchanges', owner);
  assert.equal(r.status, 200);
  assert(r.data.length > 0);
  assert(!JSON.stringify(r.data).includes('"cost"'), 'exchange snapshot contains internal cost');
  assert(!JSON.stringify(r.data).includes('"inventoryId"'));
});
test('SEC-03: customer cart exposes available quantity without internal stock ledger fields', async () => {
  const r = await request('/cart', owner);
  assert.equal(r.status, 200);
  assert.equal(r.data.items[0].variant.product.name, product.name);
  for (const key of ['cost', 'onHand', 'reserved', 'warehouse', 'lowThreshold']) assert(!JSON.stringify(r.data).includes(`"${key}"`), key);
});
test('SEC-04: authenticated responses forbid shared/browser caching', async () => {
  const r = await request('/me', owner);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('cache-control') || '', /no-store/);
  assert.match((await request('/auth/csrf')).headers.get('cache-control') || '', /no-store/);
});
test('SEC-05: anonymous and USER roles cannot read or mutate any Admin family', async () => {
  for (const path of ['/admin/dashboard', '/admin/orders', '/admin/products', '/admin/inventory', '/admin/inventory/overview', '/admin/inventory/history', '/admin/inventory/options', '/admin/exchanges', '/admin/data/users', '/admin/data/payments', '/admin/export.csv']) {
    assert.equal((await request(path)).status, 401, path);
    assert.equal((await request(path, owner)).status, 403, path);
  }
  assert.equal((await request(`/admin/inventory/${variant.inventories[0].id}/movements`, owner, { operation: 'RECEIPT', quantity: 50, expectedOnHand: 15, reason: 'Unauthorized increase', key: suffix })).status, 403);
  assert.equal((await db.inventory.findUniqueOrThrow({ where: { id: variant.inventories[0].id } })).onHand, 15);
});
test('SEC-06: IDOR and mass assignment cannot read other orders, revoke sessions or grant Admin', async () => {
  assert.equal((await request(`/orders/${order.id}`, stranger)).status, 404);
  assert.equal((await request(`/orders/${order.id}/cancel`, stranger, {})).status, 404);
  assert.equal((await request('/me', owner, { name: 'Buyer', role: 'ADMIN' }, 'PATCH')).status, 422);
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: buyer.id } })).role, 'USER');
  await request(`/me/sessions/${hash(owner.raw)}`, stranger, undefined, 'DELETE');
  assert(await db.session.findUnique({ where: { id: hash(owner.raw) } }));
  assert.equal((await request('/orders', owner)).data[0].internalNote, undefined);
  assert.equal((await request('/orders', owner)).data[0].items[0].cost, undefined);
});
test('SEC-07: foreign origins, missing/invalid CSRF and parameter tampering fail safely', async () => {
  assert.equal((await request('/cart', owner, { items: [] }, 'PATCH', { Origin: 'https://attacker.invalid' })).status, 403);
  assert.equal((await request('/cart', owner, { items: [] }, 'PATCH', { 'X-CSRF-Token': 'invalid' })).status, 403);
  assert.equal((await request('/checkout/quote', owner, { items: [{ variantId: variant.id, quantity: 1 }], total: 1 })).status, 422);
  for (const query of ["q=' OR 1=1 --", 'q=%3Cscript%3Ealert(1)%3C/script%3E', 'sort=price;DROP TABLE Product']) {
    const result = await request('/products?' + query);
    assert([200, 422].includes(result.status));
    assert(!JSON.stringify(result.data).includes('passwordHash'));
  }
});
test('SEC-08: expired, idle and revoked sessions cannot be reused', async () => {
  for (const extra of [{ expiresAt: new Date(Date.now() - 1000) }, { lastSeenAt: new Date(Date.now() - 31 * 60000) }]) {
    assert.equal((await request('/me', await session(buyer.id, extra))).status, 401);
  }
  const fresh = await session(buyer.id);
  assert.equal((await request('/auth/logout', fresh, {})).status, 201);
  assert.equal((await request('/me', fresh)).status, 401);
});
test('SEC-09: concurrent wrong passwords are counted atomically per account', async () => {
  const auth = new AuthController(db as any);
  const outcomes = await Promise.allSettled(Array.from({ length: 5 }, () => auth.credentials({ email: buyer.email, password: 'wrong security test password' })));
  assert(outcomes.every(result => result.status === 'rejected' && result.reason.getStatus?.() === 401));
  const lock = await db.storeSetting.findUniqueOrThrow({ where: { key: `login:${hash(buyer.email)}` } });
  assert.equal((lock.value as any).count, 5);
  await securityEvent(db as any, { actor: buyer, ip: '203.0.113.10', requestId: 'security-source-a' } as any, 'LOGIN_SUCCESS');
  await securityEvent(db as any, { actor: buyer, ip: '198.51.100.10', requestId: 'security-source-b' } as any, 'LOGIN_SUCCESS');
  const event = await db.auditLog.findFirstOrThrow({ where: { actorId: buyer.id, action: 'SECURITY_MULTI_SOURCE_LOGIN' } });
  assert(!JSON.stringify(event.data).includes('198.51.100.10'));
});
test('SEC-10: API sends defensive headers and does not reveal framework headers', async () => {
  const r = await request('/config');
  assert.equal(r.headers.get('x-powered-by'), null);
  assert.match(r.headers.get('content-security-policy') || '', /default-src 'none'/);
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
  assert(r.headers.get('permissions-policy'));
});
test('SEC-13: concurrent private uploads cannot exceed the daily database quota', async () => {
  const uploadUser = await db.user.create({ data: { email: `upload-${suffix}@example.test`, name: 'Upload quota fixture', passwordHash: 'not-for-login' } });
  await db.userUpload.createMany({ data: Array.from({ length: 19 }, () => ({ userId: uploadUser.id, fileName: 'quota-fixture-' + randomBytes(16).toString('hex') + '.webp' })) });
  const image = await sharp({ create: { width: 16, height: 16, channels: 3, background: '#abcdef' } }).png().toBuffer();
  const controller = new AttachmentsController(db as any);
  const outcomes = await Promise.allSettled([1, 2].map(() => controller.upload({ buffer: image, mimetype: 'image/png' }, { actor: uploadUser } as any)));
  assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(await db.userUpload.count({ where: { userId: uploadUser.id } }), 20);
  assert(outcomes.some(result => result.status === 'rejected' && result.reason.getStatus?.() === 429));
});
test('SEC-11: HTTP parser rejects conflicting Content-Length and Transfer-Encoding safely', async () => {
  const url = new URL(root);
  const response = await new Promise<string>((resolve, reject) => {
    let response = '';
    const socket = createConnection({ host: '127.0.0.1', port: Number(url.port) }, () => socket.write('GET /api/v1/config HTTP/1.1\r\nHost: localhost\r\nContent-Length: 1\r\nTransfer-Encoding: chunked\r\n\r\n0\r\n\r\n'));
    socket.setTimeout(3000, () => { socket.destroy(); reject(Error('Parser did not reject malformed framing')); });
    socket.on('data', bytes => { response += bytes.toString(); }); socket.on('error', reject); socket.on('end', () => resolve(response));
  });
  assert.match(response, /^HTTP\/1\.1 400/);
  assert.equal((await request('/config')).status, 200);
});
test('SEC-12: mixed-case auth routes and forged forwarding headers cannot evade rate limits', async () => {
  assert.equal(new URL(process.env.REDIS_URL!).pathname, '/1', 'Rate-limit fixtures require the isolated Redis DB');
  const redis = new Redis(process.env.REDIS_URL!);
  const rateKey = `milo:security:v1:${securityIdentity('127.0.0.1')}:auth`;
  try {
    await redis.del(rateKey);
    let last: Awaited<ReturnType<typeof request>> | undefined;
    for (let i = 0; i < 31; i++) last = await request('/AUTH/LOGIN', owner, { email: `rate-${suffix}-${i}@example.test`, password: 'wrong security test' }, 'POST', { 'X-Forwarded-For': `203.0.113.${i + 1}` });
    assert.equal(last?.status, 429);
    assert(Number(last?.headers.get('retry-after')) > 0);
    assert(!JSON.stringify(last?.data).includes('stack'));
  } finally { await redis.del(rateKey); redis.disconnect(); }
});
