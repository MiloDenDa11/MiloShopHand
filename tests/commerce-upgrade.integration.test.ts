import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import sharp from 'sharp';
import jwt from 'jsonwebtoken';
import { Db, hash } from '../apps/api/src/core';
import { passwordHash } from '../apps/api/src/auth';
import { accessToken, verifyAccess } from '../apps/api/src/jwt';
import { AvatarService, type AvatarProvider } from '../apps/api/src/avatar';
import { CommerceService } from '../apps/api/src/commerce';
const url = new URL(process.env.DATABASE_URL!);
if (process.env.TRY_ON_TEST_DATABASE_URL !== process.env.DATABASE_URL || url.pathname !== '/milo_try_on_test' || url.hostname !== '127.0.0.1') throw Error('Only the fresh isolated test database is allowed');
const db = new Db(), commerce = new CommerceService(db);
process.env.PAYMENT_PROVIDER = 'mock'; process.env.SHIPPING_PROVIDER = 'mock';
const password = 'Synthetic test password only 2026!';
const address = { recipient: 'Khách giả lập', phone: '0901234567', text: '123 Đường Kiểm Thử, Thành phố Hồ Chí Minh', confirmed: true };
let base: string, api: ChildProcess, logs = '', ph: string, file: Buffer, product: any;
async function user(role: 'USER' | 'SELLER' | 'ADMIN' = 'USER') { return db.user.create({ data: { email: `${randomUUID()}@example.test`, name: 'Synthetic customer', passwordHash: ph, verifiedAt: new Date(), role } }); }
async function client(actor: any) {
  const cookies = new Map<string, string>();
  const call = async (path: string, body?: any, method = body === undefined ? 'GET' : 'POST', extra: Record<string, string> = {}) => {
    const response = await fetch(`${base}/api/v1${path}`, { method, headers: { Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join('; '), Origin: base, 'X-CSRF-Token': cookies.get('milo_csrf') || '', ...(body !== undefined && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...extra }, body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body) });
    for (const value of response.headers.getSetCookie()) { const [pair] = value.split(';'), split = pair.indexOf('='); cookies.set(pair.slice(0, split), pair.slice(split + 1)); }
    return { status: response.status, data: await response.json(), headers: response.headers };
  };
  await call('/auth/csrf');
  const login = await call('/auth/login', { email: actor.email, password });
  assert.equal(login.status, 201);
  return { call, cookies, login };
}
const payload = (method = 'COD') => ({ items: [{ variantId: product.variants[0].id, quantity: 1 }], address, method });
async function order(actor: any, method = 'COD') { return commerce.checkout(actor, payload(method), randomUUID()); }
before(async () => {
  await db.$connect(); ph = await passwordHash(password);
  file = await sharp({ create: { width: 800, height: 800, channels: 3, background: '#8a9371' } }).withMetadata().png().toBuffer();
  const category = await db.category.create({ data: { name: 'Synthetic category', slug: randomUUID() } });
  product = await db.product.create({ data: { name: 'Synthetic polo', slug: randomUUID(), description: 'Test only', searchText: 'test', material: 'Cotton', fit: 'Regular', care: 'Test only', price: 550000, cost: 225000, categoryId: category.id, variants: { create: { sku: randomUUID(), color: 'Xanh olive', colorHex: '#8a9371', size: 'M', inventories: { create: { onHand: 100 } } } } }, include: { variants: true } });
  const probe = createServer(); await new Promise<void>(resolve => probe.listen(0, '127.0.0.1', resolve)); const port = (probe.address() as { port: number }).port; await new Promise<void>(resolve => probe.close(() => resolve())); base = `http://127.0.0.1:${port}`;
  api = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', '--tsconfig', 'apps/api/tsconfig.json', 'apps/api/src/main.ts'], { cwd: process.cwd(), windowsHide: true, env: { ...process.env, API_PORT: String(port), API_HOST: '127.0.0.1', APP_URL: base, REDIS_URL: 'redis://127.0.0.1:1', PAYMENT_PROVIDER: 'mock', SHIPPING_PROVIDER: 'mock', EMAIL_PROVIDER: 'file', SKIP_BREACH_CHECK: 'true' }, stdio: ['ignore', 'pipe', 'pipe'] });
  for (const stream of [api.stdout!, api.stderr!]) stream.on('data', bytes => { logs = (logs + bytes).slice(-5000); });
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) { if (api.exitCode !== null) throw Error(`Fixture API exited: ${logs}`); try { if ((await fetch(`${base}/api/v1/config`)).ok) return; } catch {} await new Promise(resolve => setTimeout(resolve, 250)); }
  throw Error(`Fixture API startup timed out: ${logs}`);
});
after(async () => { if (api?.pid && api.exitCode === null) { if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(api.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); else api.kill(); } await db.$disconnect(); });
test('migration bổ sung bảo toàn tài khoản và thông báo có trước cập nhật', async () => {
  const existing = await db.user.findUniqueOrThrow({ where: { id: 'migration-fixture' } });
  assert.equal(existing.name, 'Preserve me'); assert.equal(existing.phone, '0901234567'); assert.deepEqual(existing.preferences, ['basic']); assert.equal(existing.role, 'USER'); assert.equal(existing.avatarUrl, null); assert.equal(existing.avatarPublicId, null);
  const note = await db.notification.findUniqueOrThrow({ where: { id: 'migration-note' } }); assert.equal(note.body, 'Preserve this'); assert.equal(note.href, null);
});
test('JWT HttpOnly, kiểm tra hạn dùng, refresh xoay vòng, chặn replay và thu hồi khi logout', async () => {
  const actor = await user(), session = await client(actor);
  assert.ok(session.login.headers.getSetCookie().some(value => value.startsWith('milo_access=') && /HttpOnly/i.test(value) && /SameSite=Lax/i.test(value)));
  const raw = session.cookies.get('milo_sid')!, token = session.cookies.get('milo_access')!;
  const claims = verifyAccess(token, process.env); assert.equal(claims.userId, actor.id); assert.equal(claims.sessionId, `jwt:${hash(raw)}`);
  assert.equal((jwt.decode(token) as any).email, undefined); assert.equal((jwt.decode(token) as any).role, undefined);
  session.cookies.set('milo_access', accessToken(actor.id, claims.sessionId, process.env, Date.now() - 16 * 60000));
  const expired = await session.call('/me'); assert.equal(expired.status, 401); assert.equal(expired.data.code, 'ACCESS_TOKEN_EXPIRED');
  const oldCookies = [...session.cookies].map(([key, value]) => `${key}=${value}`).join('; ');
  assert.equal((await session.call('/auth/refresh', {})).status, 201);
  assert.notEqual(session.cookies.get('milo_sid'), raw); assert.equal(await db.session.findUnique({ where: { id: claims.sessionId } }), null);
  assert.equal((await session.call('/me')).status, 200);
  const replay = await fetch(`${base}/api/v1/auth/refresh`, { method: 'POST', headers: { Cookie: oldCookies, Origin: base, 'Content-Type': 'application/json', 'X-CSRF-Token': session.cookies.get('milo_csrf')! }, body: '{}' }); assert.equal(replay.status, 401);
  const currentToken = session.cookies.get('milo_access')!; session.cookies.delete('milo_access'); assert.equal((await session.call('/me')).status, 401); session.cookies.set('milo_access', currentToken);
  const currentCookies = [...session.cookies].map(([key, value]) => `${key}=${value}`).join('; ');
  assert.equal((await session.call('/auth/logout', {})).status, 201);
  assert.equal((await fetch(`${base}/api/v1/me`, { headers: { Cookie: currentCookies } })).status, 401);
});
test('JWT giả mạo và CSRF sai bị từ chối; USER không thể tự nhận vai trò Người bán', async () => {
  const actor = await user(), session = await client(actor);
  assert.equal((await session.call('/me', undefined, 'GET', { Authorization: 'Bearer invalid.token.value' })).status, 401);
  assert.equal((await session.call('/auth/refresh', {}, 'POST', { 'X-CSRF-Token': 'invalid' })).status, 403);
  assert.equal((await session.call('/me', { name: 'Test', role: 'SELLER' }, 'PATCH')).status, 422);
  assert.equal((await session.call('/auth/register', { name: 'Test', email: `${randomUUID()}@example.test`, password, role: 'SELLER' })).status, 422);
  assert.equal((await session.call('/seller/orders')).status, 403);
});
test('cookie JWT cũ không khóa đăng nhập lại, khôi phục tài khoản hoặc xem catalog công khai', async () => {
  const actor = await user(), session = await client(actor);
  const claims = verifyAccess(session.cookies.get('milo_access')!, process.env);
  await db.session.delete({ where: { id: claims.sessionId } });
  session.cookies.set('milo_access', accessToken(actor.id, claims.sessionId, process.env, Date.now() - 16 * 60000));
  assert.equal((await session.call('/products')).status, 200);
  assert.equal((await session.call('/me')).data.code, 'ACCESS_TOKEN_EXPIRED');
  const login = await session.call('/auth/login', { email: actor.email, password });
  assert.equal(login.status, 201); assert.equal((await session.call('/me')).status, 200);
});
test('Cloudinary giả lập: ảnh chuẩn hóa, thay/xóa có cleanup, không sửa ảnh người khác', async () => {
  const actor = await user(), other = await user(); let calls = 0;
  const provider: AvatarProvider = { enabled: true, upload: async buffer => { calls++; const metadata = await sharp(buffer).metadata(); assert.equal(metadata.format, 'webp'); assert.equal(metadata.width, 512); assert.equal(metadata.exif, undefined); return { publicId: `miloshophand/avatars/${'a'.repeat(32)}/${randomUUID()}`, url: `https://res.cloudinary.com/fixture/image/upload/v1/${randomUUID()}.webp` }; }, remove: async () => {} };
  const avatars = new AvatarService(db, provider), upload = { buffer: file, mimetype: 'image/png' };
  const first = await avatars.upload(actor.id, upload); assert.match(first.avatarUrl, /^https:\/\/res.cloudinary.com/);
  const old = (await db.user.findUniqueOrThrow({ where: { id: actor.id } })).avatarPublicId!;
  await avatars.upload(actor.id, upload); assert.equal(await db.outboxEvent.count({ where: { key: `avatar-delete:${old}` } }), 1);
  await avatars.remove(actor.id); assert.equal((await db.user.findUniqueOrThrow({ where: { id: actor.id } })).avatarUrl, null);
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: other.id } })).avatarUrl, null); assert.equal(calls, 2);
  await assert.rejects(avatars.upload(actor.id, { buffer: Buffer.alloc(5 * 1024 * 1024 + 1), mimetype: 'image/png' }));
  await assert.rejects(avatars.upload(actor.id, { buffer: Buffer.from('<svg onload="alert(1)"></svg>'), mimetype: 'image/png' })); assert.equal(calls, 2);
});
test('HTTP upload bắt buộc session/CSRF, giới hạn 5 MB, MIME thực và cấu hình Cloudinary', async () => {
  const session = await client(await user());
  assert.equal((await session.call('/me/avatar/config')).data.enabled, false);
  const form = (bytes: Buffer, type = 'image/png') => { const data = new FormData(); data.set('file', new Blob([Uint8Array.from(bytes)], { type }), 'avatar.png'); return data; };
  assert.equal((await session.call('/me/avatar', form(Buffer.alloc(5 * 1024 * 1024 + 1)))).status, 413);
  assert.equal((await session.call('/me/avatar', form(Buffer.from('not an image')))).status, 422);
  assert.equal((await session.call('/me/avatar', form(file))).status, 503);
  assert.equal((await session.call('/me/avatar', form(file), 'POST', { 'X-CSRF-Token': 'bad' })).status, 403);
  assert.equal((await fetch(`${base}/api/v1/me/avatar/config`)).status, 401);
});
test('đặt hàng hiện ở bàn Người bán, có thông tin nhận và thông báo; không lộ giá vốn', async () => {
  const staff = await user('SELLER'), buyer = await user(), buyerClient = await client(buyer), sellerClient = await client(staff), idempotency = randomUUID();
  const placed = await buyerClient.call('/checkout', payload(), 'POST', { 'Idempotency-Key': idempotency }); assert.equal(placed.status, 201);
  assert.equal((await buyerClient.call('/checkout', payload(), 'POST', { 'Idempotency-Key': idempotency })).data.id, placed.data.id);
  const orders = await sellerClient.call('/seller/orders'); assert.equal(orders.status, 200); assert.ok(orders.data.items.some((item: any) => item.id === placed.data.id));
  const detail = await sellerClient.call(`/seller/orders/${placed.data.id}`); assert.equal(detail.data.buyer.email, buyer.email); assert.equal(detail.data.address.recipient, address.recipient);
  assert.doesNotMatch(JSON.stringify(detail.data), /"cost"|passwordHash|internalNote|requestHash|idempotencyKey/);
  assert.equal(await db.notification.count({ where: { userId: staff.id, key: `seller:${placed.data.id}:created:${staff.id}` } }), 1);
  assert.equal((await sellerClient.call('/admin/orders')).status, 403); assert.equal((await sellerClient.call('/admin/dashboard')).status, 403);
});
test('người mua chọn lý do và hủy trước duyệt; chống IDOR và không hoàn kho hai lần', async () => {
  const actor = await user(), buyer = await client(actor), stranger = await client(await user()), placed = await order(actor);
  assert.equal((await buyer.call(`/orders/${placed.id}/cancel`, {})).status, 422);
  assert.equal((await stranger.call(`/orders/${placed.id}/cancel`, { reasonCode: 'DUPLICATE' })).status, 404);
  assert.equal((await buyer.call(`/orders/${placed.id}/cancel`, { reasonCode: 'OTHER' })).status, 422);
  const result = await buyer.call(`/orders/${placed.id}/cancel`, { reasonCode: 'DUPLICATE' }); assert.equal(result.status, 201); assert.equal(result.data.status, 'CANCELLED');
  assert.equal((await buyer.call(`/orders/${placed.id}/cancel`, { reasonCode: 'DUPLICATE' })).status, 201);
  const reservation = await db.inventoryReservation.findFirstOrThrow({ where: { orderId: placed.id } });
  assert.equal(await db.stockMovement.count({ where: { reference: `CANCELLED:${reservation.id}` } }), 1);
  assert.match(result.data.history.at(-1).reason, /Đặt trùng đơn/);
  assert.equal((await db.auditLog.findFirstOrThrow({ where: { entityId: placed.id, action: 'ORDER_TRANSITION' } })).data && true, true);
});
test('luồng người bán kiểm soát từng bước; duyệt khóa hủy, xuất kho một lần, người mua xác nhận nhận', async () => {
  const actor = await user(), buyer = await client(actor), seller = await client(await user('SELLER')), placed = await order(actor);
  const move = (from: string, status: string) => seller.call(`/seller/orders/${placed.id}/status`, { from, status, reason: 'Synthetic handling step' }, 'PATCH');
  assert.equal((await move('PENDING_CONFIRMATION', 'SHIPPED')).status, 409);
  assert.equal((await move('PENDING_CONFIRMATION', 'CONFIRMED')).status, 200);
  assert.equal((await buyer.call(`/orders/${placed.id}/cancel`, { reasonCode: 'NO_LONGER_NEEDED' })).status, 409);
  assert.equal((await move('PENDING_CONFIRMATION', 'CONFIRMED')).status, 409);
  assert.equal((await move('CONFIRMED', 'PACKING')).status, 200);
  const lines = await db.orderItem.findMany({ where: { orderId: placed.id } }); let packingRevision = 0;
  for (const line of lines) for (let piece = 0; piece < line.quantity; piece++) assert.equal((await seller.call(`/seller/orders/${placed.id}/packing`, { action: 'SCAN', sku: line.sku, expectedRevision: packingRevision++, requestId: randomUUID() })).status, 201);
  assert.equal((await move('PACKING', 'READY_TO_SHIP')).status, 200);
  assert.equal((await move('READY_TO_SHIP', 'SHIPPED')).status, 409);
  assert.equal((await seller.call(`/seller/orders/${placed.id}/shipment`, {})).status, 201);
  await db.shipment.update({ where: { orderId: placed.id }, data: { trackingCode: `synthetic-${randomUUID()}`, status: 'CREATED' } });
  assert.equal((await move('READY_TO_SHIP', 'SHIPPED')).status, 200);
  assert.equal((await move('READY_TO_SHIP', 'SHIPPED')).status, 409);
  assert.equal((await buyer.call(`/orders/${placed.id}/complete`, {})).status, 409);
  await commerce.transition(placed.id, 'DELIVERED', 'system:test', 'Synthetic carrier delivered');
  assert.equal((await buyer.call(`/orders/${placed.id}/complete`, {})).data.status, 'COMPLETED');
  const reservations = await db.inventoryReservation.findMany({ where: { orderId: placed.id } }); assert.ok(reservations.every(item => item.state === 'CONSUMED'));
  assert.equal((await db.shipment.findUniqueOrThrow({ where: { orderId: placed.id } })).status, 'DELIVERED');
});
test('duyệt và hủy đồng thời chỉ một bên thắng, trạng thái và tồn kho nhất quán', async () => {
  const actor = await user(), buyer = await client(actor), seller = await client(await user('SELLER')), placed = await order(actor);
  const results = await Promise.all([buyer.call(`/orders/${placed.id}/cancel`, { reasonCode: 'DUPLICATE' }), seller.call(`/seller/orders/${placed.id}/status`, { from: 'PENDING_CONFIRMATION', status: 'CONFIRMED', reason: 'Synthetic approval' }, 'PATCH')]);
  assert.equal(results.filter(result => result.status < 300).length, 1);
  const saved = await db.order.findUniqueOrThrow({ where: { id: placed.id }, include: { reservations: true } });
  assert.ok(['CONFIRMED', 'CANCELLED'].includes(saved.status)); assert.ok(saved.reservations.every(item => item.state === (saved.status === 'CANCELLED' ? 'RELEASED' : 'ACTIVE')));
});
test('QR chưa thanh toán không duyệt; hủy đơn đã trả tiền tạo yêu cầu hoàn riêng', async () => {
  const actor = await user(), buyer = await client(actor), seller = await client(await user('SELLER')), placed = await order(actor, 'QR');
  assert.equal((await seller.call(`/seller/orders/${placed.id}/status`, { from: 'PENDING_PAYMENT', status: 'CONFIRMED', reason: 'Synthetic approval' }, 'PATCH')).status, 409);
  await db.payment.update({ where: { orderId: placed.id }, data: { status: 'PAID', received: placed.total } });
  await commerce.transition(placed.id, 'PENDING_CONFIRMATION', 'system:test', 'Synthetic payment fixture');
  assert.equal((await buyer.call(`/orders/${placed.id}/cancel`, { reasonCode: 'CHANGE_ADDRESS' })).status, 201);
  const refund = await db.refund.findUniqueOrThrow({ where: { key: `cancel:${placed.id}` } }); assert.equal(refund.status, 'REQUESTED'); assert.equal(refund.amount, placed.total);
  assert.equal((await db.payment.findUniqueOrThrow({ where: { orderId: placed.id } })).refunded, 0);
});
test('Admin cấp/thu hồi Người bán; thu hồi phiên cũ và bảo vệ vai trò Admin', async () => {
  const admin = await user('ADMIN'), staff = await user(), boss = await client(admin), previous = await client(staff);
  assert.equal((await boss.call(`/admin/users/${staff.id}/role`, { role: 'SELLER' }, 'PATCH')).status, 200);
  assert.equal((await previous.call('/seller/orders')).status, 401);
  const assigned = await client(staff); assert.equal((await assigned.call('/seller/orders')).status, 200);
  assert.equal((await boss.call(`/admin/users/${admin.id}/role`, { role: 'USER' }, 'PATCH')).status, 409);
  assert.equal((await boss.call(`/admin/users/${(await user('ADMIN')).id}/role`, { role: 'USER' }, 'PATCH')).status, 403);
  assert.equal((await boss.call(`/admin/users/${staff.id}/role`, { role: 'USER' }, 'PATCH')).status, 200);
  assert.equal((await assigned.call('/seller/orders')).status, 401);
});
