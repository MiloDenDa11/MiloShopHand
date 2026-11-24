import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { Db, hash, csrfToken, seal, unseal } from '../apps/api/src/core';
import { passwordHash } from '../apps/api/src/auth';
import { SellerOperations, sellerPolicyKey } from '../apps/api/src/seller-operations';
import { authenticator } from '../apps/api/src/two-factor';
const url = new URL(process.env.DATABASE_URL!);
if (process.env.TRY_ON_TEST_DATABASE_URL !== process.env.DATABASE_URL || url.hostname !== '127.0.0.1' || url.pathname !== '/milo_try_on_test') throw Error('Only fresh isolated test DB');
const db = new Db(), operations = new SellerOperations(db);
const password = 'Synthetic password for optional 2FA only!';
let base: string, api: ChildProcess, logs = '', ph: string;
async function user(role: 'USER' | 'ADMIN' | 'SELLER' = 'SELLER') { return db.user.create({ data: { name: 'Synthetic staff', email: `${randomUUID()}@example.test`, passwordHash: ph, role, verifiedAt: new Date() } }); }
async function client(actor?: any) {
  const cookies = new Map<string, string>(); let sid = '';
  if (actor) { const raw = randomBytes(32).toString('hex'), csrf = csrfToken(); sid = hash(raw); await db.session.create({ data: { id: sid, userId: actor.id, csrf, agent: 'Synthetic seller ops fixture', expiresAt: new Date(Date.now() + 3600000) } }); cookies.set('milo_sid', raw); cookies.set('milo_csrf', csrf); }
  const call = async (path: string, body?: any, method = body === undefined ? 'GET' : 'POST') => {
    const response = await fetch(`${base}/api/v1${path}`, { method, headers: { Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join('; '), Origin: base, 'X-CSRF-Token': cookies.get('milo_csrf') || '', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) });
    for (const value of response.headers.getSetCookie()) { const pair = value.split(';')[0], index = pair.indexOf('='); cookies.set(pair.slice(0, index), pair.slice(index + 1)); }
    return { status: response.status, data: await response.json() };
  };
  if (!actor) await call('/auth/csrf');
  return { call, sid };
}
async function order(status: 'PENDING_CONFIRMATION' | 'CONFIRMED' | 'PACKING' = 'PENDING_CONFIRMATION', minutesAgo = 0) {
  const buyer = await user('USER'), createdAt = new Date(Date.now() - minutesAgo * 60000);
  return db.order.create({ data: { code: randomUUID(), userId: buyer.id, idempotencyKey: randomUUID(), requestHash: 'fixture', status, method: 'COD', address: { recipient: 'Synthetic buyer' }, subtotal: 100000, discount: 0, shippingFee: 0, total: 100000, expiresAt: new Date(Date.now() + 86400000), createdAt, payment: { create: { provider: 'mock', status: 'UNPAID', amount: 100000, expiresAt: new Date(Date.now() + 86400000) } }, history: { create: [{ to: status === 'PACKING' ? 'CONFIRMED' : status, actor: buyer.id, reason: 'Synthetic history', createdAt }] } } });
}
before(async () => {
  await db.$connect(); ph = await passwordHash(password);
  const probe = createServer(); await new Promise<void>(resolve => probe.listen(0, '127.0.0.1', resolve)); const port = (probe.address() as { port: number }).port; await new Promise<void>(resolve => probe.close(() => resolve())); base = `http://127.0.0.1:${port}`;
  api = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', '--tsconfig', 'apps/api/tsconfig.json', 'apps/api/src/main.ts'], { windowsHide: true, env: { ...process.env, APP_URL: base, API_PORT: String(port), API_HOST: '127.0.0.1', REDIS_URL: 'redis://127.0.0.1:1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  for (const stream of [api.stdout!, api.stderr!]) stream.on('data', data => { logs = (logs + data).slice(-5000); });
  const deadline = Date.now() + 90000; while (Date.now() < deadline) { if (api.exitCode !== null) throw Error(logs); try { if ((await fetch(`${base}/api/v1/config`)).ok) return; } catch {} await new Promise(resolve => setTimeout(resolve, 200)); } throw Error('Fixture API startup timed out');
});
after(async () => { if (api?.pid && api.exitCode === null) { if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(api.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); else api.kill(); } await db.$disconnect(); });
test('hai nhân viên nhận cùng đơn chỉ một bên thắng; không giành hoặc xử lý đơn của người khác', async () => {
  const first = await user(), second = await user(), a = await client(first), b = await client(second), item = await order();
  const results = await Promise.all([a.call(`/seller/orders/${item.id}/assignment`, { assigneeId: first.id, expectedRevision: 0, reason: 'Synthetic claim' }, 'PATCH'), b.call(`/seller/orders/${item.id}/assignment`, { assigneeId: second.id, expectedRevision: 0, reason: 'Synthetic claim' }, 'PATCH')]);
  assert.equal(results.filter(value => value.status === 200).length, 1);
  const current = await db.orderAssignment.findUniqueOrThrow({ where: { orderId: item.id } }); const other = current.assigneeId === first.id ? b : a;
  const steal = await other.call(`/seller/orders/${item.id}/assignment`, { assigneeId: current.assigneeId === first.id ? second.id : first.id, expectedRevision: 1, reason: 'Synthetic steal' }, 'PATCH'); assert.equal(steal.status, 403);
  assert.equal((await other.call(`/seller/orders/${item.id}/status`, { from: 'PENDING_CONFIRMATION', status: 'CONFIRMED', reason: 'Synthetic transition' }, 'PATCH')).status, 403);
});
test('Admin giao lại đơn; kiểm tra người nhận, revision và lịch sử, chống ABA sau bỏ phụ trách', async () => {
  const staff = await user(), replacement = await user(), admin = await user('ADMIN'), boss = await client(admin), a = await client(staff), item = await order();
  await operations.assign(item.id, staff.id, { assigneeId: staff.id, expectedRevision: 0, reason: 'Synthetic self claim' });
  assert.equal((await boss.call(`/seller/orders/${item.id}/assignment`, { assigneeId: (await user('USER')).id, expectedRevision: 1, reason: 'Synthetic invalid target' }, 'PATCH')).status, 422);
  const reassigned = await boss.call(`/seller/orders/${item.id}/assignment`, { assigneeId: replacement.id, expectedRevision: 1, reason: 'Synthetic reassignment' }, 'PATCH'); assert.equal(reassigned.status, 200); assert.equal(reassigned.data.assignment.assigneeId, replacement.id);
  assert.equal((await a.call(`/seller/orders/${item.id}/status`, { from: 'PENDING_CONFIRMATION', status: 'CONFIRMED', reason: 'Synthetic stale actor' }, 'PATCH')).status, 403);
  await operations.assign(item.id, replacement.id, { assigneeId: null, expectedRevision: 2, reason: 'Synthetic release' });
  await assert.rejects(operations.assign(item.id, staff.id, { assigneeId: staff.id, expectedRevision: 0, reason: 'Synthetic stale claim' }));
  assert.equal(await db.auditLog.count({ where: { entityId: item.id, action: 'ORDER_ASSIGNMENT' } }), 3);
  await db.order.update({ where: { id: item.id }, data: { status: 'SHIPPED' } }); await assert.rejects(operations.assign(item.id, admin.id, { assigneeId: staff.id, expectedRevision: 3, reason: 'Synthetic closed assignment' }));
});
test('lọc đơn của tôi/chưa phân công và quyền settings chỉ dành Admin', async () => {
  const actor = await user(), staff = await client(actor), boss = await client(await user('ADMIN')), item = await order();
  await operations.assign(item.id, actor.id, { assigneeId: actor.id, expectedRevision: 0, reason: 'Synthetic filter owner' });
  const mine = await staff.call('/seller/orders?assignee=mine'); assert.ok(mine.data.items.some((row: any) => row.id === item.id));
  const unassigned = await staff.call('/seller/orders?assignee=unassigned'); assert.ok(unassigned.data.items.every((row: any) => !row.assignment.assigneeId));
  const policy = { enabled: true, pendingMinutes: 30, packingMinutes: 240 };
  assert.equal((await staff.call('/seller/settings', policy, 'PATCH')).status, 403); assert.equal((await boss.call('/seller/settings', policy, 'PATCH')).status, 200);
  assert.ok((await staff.call('/seller/staff')).data.every((row: any) => row.id === actor.id));
});
test('nhắc quá mốc đúng người phụ trách/Admin, không lặp hoặc gửi email, dừng ở trạng thái kết thúc', async () => {
  await db.storeSetting.upsert({ where: { key: sellerPolicyKey }, create: { key: sellerPolicyKey, value: { enabled: true, pendingMinutes: 30, packingMinutes: 240 } }, update: { value: { enabled: true, pendingMinutes: 30, packingMinutes: 240 } } });
  const owner = await user(), other = await user(), admin = await user('ADMIN'), item = await order('PENDING_CONFIRMATION', 31);
  await operations.assign(item.id, owner.id, { assigneeId: owner.id, expectedRevision: 0, reason: 'Synthetic reminder owner' });
  const emails = await db.outboxEvent.count({ where: { kind: 'EMAIL' } }); await operations.reminders(); await operations.reminders();
  const notices = await db.notification.findMany({ where: { key: { startsWith: `seller-reminder:${item.id}:` } } });
  assert.equal(notices.filter(row => row.userId === owner.id).length, 1); assert.equal(notices.filter(row => row.userId === admin.id).length, 1); assert.equal(notices.filter(row => row.userId === other.id).length, 0);
  assert.equal(await db.outboxEvent.count({ where: { kind: 'EMAIL' } }), emails);
  const closed = await order('PENDING_CONFIRMATION', 99); await db.order.update({ where: { id: closed.id }, data: { status: 'CANCELLED' } }); await operations.reminders();
  assert.equal(await db.notification.count({ where: { key: { startsWith: `seller-reminder:${closed.id}:` } } }), 0);
});
test('mốc đóng gói không bị đặt lại khi PACKING mới; tắt nhắc ngăn tạo thông báo', async () => {
  const item = await order('PACKING', 241); await db.orderStatusHistory.create({ data: { orderId: item.id, from: 'CONFIRMED', to: 'PACKING', actor: 'system:test', reason: 'Synthetic recent packing' } });
  await operations.reminders(); assert.ok(await db.notification.count({ where: { key: { startsWith: `seller-reminder:${item.id}:packing:` } } }));
  await db.storeSetting.update({ where: { key: sellerPolicyKey }, data: { value: { enabled: false, pendingMinutes: 30, packingMinutes: 240 } } });
  const disabled = await order('PENDING_CONFIRMATION', 99); await operations.reminders(); assert.equal(await db.notification.count({ where: { key: { startsWith: `seller-reminder:${disabled.id}:` } } }), 0);
});
test('bật 2FA cần xác thực lại và mã đúng; secret mã hóa, mã khôi phục băm, thu hồi phiên khác', async () => {
  const actor = await user(), active = await client(actor), other = await client(actor);
  await db.session.update({ where: { id: active.sid }, data: { reauthenticatedAt: new Date(Date.now() - 11 * 60000) } });
  assert.equal((await active.call('/auth/mfa/setup', {})).status, 403);
  assert.equal((await active.call('/auth/reauth', { password })).status, 201);
  const setup = await active.call('/auth/mfa/setup', {}); assert.equal(setup.status, 201);
  const otp = authenticator(setup.data.secret).generate();
  const enabled = await active.call('/auth/mfa/enable', { setupId: setup.data.setupId, otp }); assert.equal(enabled.status, 201); assert.equal(enabled.data.recoveryCodes.length, 10);
  const saved = await db.mFA.findUniqueOrThrow({ where: { userId: actor.id } }); assert.ok(saved.enabledAt); assert.notEqual(saved.encryptedSecret, setup.data.secret); assert.equal(unseal(saved.encryptedSecret), setup.data.secret); assert.ok(!saved.recoveryHashes.includes(enabled.data.recoveryCodes[0]));
  assert.equal((await other.call('/me')).status, 401); assert.equal((await active.call('/auth/mfa/status')).data.enabled, true);
  const missing = await (await client()).call('/auth/login', { email: actor.email, password }); assert.equal(missing.status, 401); assert.equal(missing.data.code, 'MFA_REQUIRED');
  const recovered = await (await client()).call('/auth/login', { email: actor.email, password, otp: enabled.data.recoveryCodes[0] }); assert.equal(recovered.status, 201);
  assert.equal((await (await client()).call('/auth/login', { email: actor.email, password, otp: enabled.data.recoveryCodes[0] })).status, 401);
  assert.equal((await active.call('/auth/mfa', { otp: enabled.data.recoveryCodes[1] }, 'DELETE')).status, 200);
  assert.equal((await (await client()).call('/auth/login', { email: actor.email, password })).status, 201);
  const audits = JSON.stringify(await db.auditLog.findMany({ where: { actorId: actor.id } })); assert.ok(!audits.includes(setup.data.secret)); assert.ok(!audits.includes(enabled.data.recoveryCodes[0]));
});
test('TOTP login đồng thời chỉ một request dùng được mã; mã cũ không tái sử dụng', async () => {
  const actor = await user(), secret = 'JBSWY3DPEHPK3PXP', future = Date.now() + 30000;
  await db.mFA.create({ data: { userId: actor.id, enabledAt: new Date(), encryptedSecret: seal(secret), lastCounter: Math.floor(Date.now() / 30000), recoveryHashes: [] } });
  const otp = authenticator(secret).generate({ timestamp: future }), a = await client(), b = await client();
  const results = await Promise.all([a.call('/auth/login', { email: actor.email, password, otp }), b.call('/auth/login', { email: actor.email, password, otp })]); assert.equal(results.filter(row => row.status === 201).length, 1); assert.equal(results.filter(row => row.data.code === 'MFA_INVALID').length, 1);
});
test('2FA cũ chưa opt-in vẫn đăng nhập bằng mật khẩu; USER không tự bật và setup hết hạn bị chặn', async () => {
  const legacy = await user('ADMIN'); await db.mFA.create({ data: { userId: legacy.id, encryptedSecret: seal('JBSWY3DPEHPK3PXP'), recoveryHashes: [] } });
  assert.equal((await (await client()).call('/auth/login', { email: legacy.email, password })).status, 201);
  assert.equal((await (await client(await user('USER'))).call('/auth/mfa/setup', {})).status, 403);
  const actor = await user(), session = await client(actor), setup = await session.call('/auth/mfa/setup', {});
  const key = `mfa-setup:${actor.id}`, row = await db.storeSetting.findUniqueOrThrow({ where: { key } }); await db.storeSetting.update({ where: { key }, data: { value: { ...(row.value as object), expiresAt: Date.now() - 1 } } });
  assert.equal((await session.call('/auth/mfa/enable', { setupId: setup.data.setupId, otp: authenticator(setup.data.secret).generate() })).status, 409);
});
test('giới hạn đoán mã 2FA theo tài khoản kể cả khi mật khẩu đúng', async () => {
  const actor = await user(), secret = 'JBSWY3DPEHPK3PXP';
  await db.mFA.create({ data: { userId: actor.id, enabledAt: new Date(), encryptedSecret: seal(secret), lastCounter: 0, recoveryHashes: [] } });
  const wrong = 'invalid-recovery-or-totp';
  const session = await client(); for (let attempt = 0; attempt < 5; attempt++) assert.equal((await session.call('/auth/login', { email: actor.email, password, otp: wrong })).data.code, 'MFA_INVALID');
  assert.equal((await session.call('/auth/login', { email: actor.email, password, otp: wrong })).status, 429);
});
