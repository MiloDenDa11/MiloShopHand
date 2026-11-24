import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sellerDeadline, sellerPolicySchema } from '../apps/api/src/seller-operations';
import { authenticator, totpCounter, recoveryHash } from '../apps/api/src/two-factor';
const policy = { enabled: true, pendingMinutes: 30, packingMinutes: 240 };
const now = new Date('2026-11-23T05:00:00Z');
test('nhắc duyệt tính từ khi QR thanh toán xong, không từ ngày tạo đơn', () => {
  const order = { status: 'PENDING_CONFIRMATION', createdAt: '2026-11-21T00:00:00Z', history: [{ to: 'PENDING_CONFIRMATION', createdAt: '2026-11-23T04:45:00Z' }] };
  const clock = sellerDeadline(order, policy, now)!; assert.equal(clock.overdue, false); assert.equal(clock.dueAt, '2026-11-23T05:15:00.000Z');
});
test('bắt đầu đóng gói không đặt lại mốc 4 giờ từ lúc duyệt', () => {
  const order = { status: 'PACKING', createdAt: '2026-11-22T00:00:00Z', history: [{ to: 'CONFIRMED', createdAt: '2026-11-23T00:00:00Z' }, { to: 'PACKING', createdAt: '2026-11-23T04:59:00Z' }] };
  assert.equal(sellerDeadline(order, policy, now)!.minutesOverdue, 60);
  assert.equal(sellerDeadline({ ...order, status: 'READY_TO_SHIP' }, policy, now), null);
});
test('đúng mốc nhắc được đánh dấu; tắt cấu hình và đơn kết thúc không báo quá hạn', () => {
  const order = { status: 'PENDING_CONFIRMATION', createdAt: '2026-11-23T04:30:00Z', history: [] };
  assert.equal(sellerDeadline(order, policy, now)!.overdue, true);
  assert.equal(sellerDeadline(order, { ...policy, enabled: false }, now), null);
  for (const status of ['PENDING_PAYMENT', 'SHIPPED', 'DELIVERED', 'COMPLETED', 'CANCELLED']) assert.equal(sellerDeadline({ ...order, status }, policy, now), null);
  assert.equal(sellerPolicySchema.safeParse({ ...policy, pendingMinutes: 0 }).success, false);
});
test('TOTP chặn mã dùng lại, sai định dạng và ngoài khoảng thời gian', () => {
  const secret = 'JBSWY3DPEHPK3PXP', timestamp = now.getTime(), code = authenticator(secret).generate({ timestamp });
  const counter = totpCounter(secret, code, 0, timestamp)!; assert.equal(counter, Math.floor(timestamp / 30000));
  assert.equal(totpCounter(secret, code, counter, timestamp), null);
  assert.equal(totpCounter(secret, code, 0, timestamp + 90000), null);
  assert.equal(totpCounter(secret, '<script>', 0, timestamp), null);
});
test('mã khôi phục được băm và chuẩn hóa cách viết, không giữ bản gốc', () => {
  const code = 'ABCDEF12-34567890-ABCDEF12-34567890';
  assert.equal(recoveryHash(code), recoveryHash('abcdef1234567890abcdef1234567890'));
  assert.match(recoveryHash(code), /^[a-f0-9]{64}$/); assert.notEqual(recoveryHash(code), code);
});
