import { test } from 'node:test';
import assert from 'node:assert/strict';
import { packingFingerprint, packingProgress, packingAction } from '../apps/api/src/packing';
import { realtimeAudience } from '../apps/api/src/realtime';
const lines = [{ id: 'a', sku: 'POLO-OLIVE-M', name: 'Polo', color: 'Olive', size: 'M', quantity: 2 }, { id: 'b', sku: 'POLO-IVORY-L', name: 'Polo', color: 'Ivory', size: 'L', quantity: 1 }];
const state = (checked: unknown) => ({ fingerprint: packingFingerprint(lines), checked, revision: 2 });
test('packing fingerprint binds immutable line, SKU, colour, size and quantity regardless of row order', () => {
  assert.equal(packingFingerprint(lines), packingFingerprint([...lines].reverse()));
  for (const patch of [{ sku: 'WRONG' }, { color: 'Navy' }, { size: 'XL' }, { quantity: 3 }, { id: 'another-line' }]) assert.notEqual(packingFingerprint(lines), packingFingerprint([{ ...lines[0], ...patch }, lines[1]]));
});
test('packing cannot be complete without persisted evidence, missing pieces or correct line quantities', () => {
  assert.equal(packingProgress(lines, null).complete, false);
  assert.equal(packingProgress(lines, state({ a: 1, b: 1 })).complete, false);
  assert.equal(packingProgress(lines, state({ a: 2, b: 1 })).complete, true);
  for (const checked of [{ a: 3, b: 1 }, { a: 2, b: 1, foreign: 1 }, { a: -1 }, { a: 1.5 }, ['a']]) { const progress = packingProgress(lines, state(checked)); assert.equal(progress.complete, false); assert.equal(progress.needsReset, true); }
});
test('changing an order invalidates prior evidence rather than marking new contents checked', () => {
  const progress = packingProgress([{ ...lines[0], quantity: 3 }], state({ a: 2, b: 1 }));
  assert.equal(progress.needsReset, true); assert.equal(progress.complete, false); assert.equal(progress.checkedTotal, 0);
});
test('scan payload disallows client counts, quantities, role escalation and malformed replay identifiers', () => {
  const input = { action: 'SCAN', sku: 'POLO-OLIVE-M', expectedRevision: 0, requestId: '11111111-2222-4333-8444-555555555555' };
  assert.equal(packingAction.safeParse(input).success, true);
  for (const patch of [{ checked: 20 }, { quantity: 20 }, { role: 'ADMIN' }, { requestId: 'short' }, { expectedRevision: -1 }, { action: 'UNDO' }]) assert.equal(packingAction.safeParse({ ...input, ...patch }).success, false);
});
test('SSE audience strips routing data and keeps customer, employee and notification scopes separated', () => {
  assert.equal(realtimeAudience({ kind: 'notifications', userId: 'other' }, 'me', 'ADMIN'), null);
  assert.deepEqual(realtimeAudience({ kind: 'notifications', userId: 'me' }, 'me', 'USER'), { kind: 'notifications' });
  assert.equal(realtimeAudience({ kind: 'orders', userId: 'other', orderId: 'order' }, 'me', 'USER'), null);
  assert.equal(realtimeAudience({ kind: 'seller', orderId: 'order' }, 'me', 'USER'), null);
  assert.deepEqual(realtimeAudience({ kind: 'orders', userId: 'me', orderId: 'order' }, 'me', 'USER'), { kind: 'orders', orderId: 'order' });
  assert.deepEqual(realtimeAudience({ kind: 'orders', userId: 'me', orderId: 'order' }, 'me', 'ADMIN'), { kind: 'orders', orderId: 'order' });
  assert.deepEqual(realtimeAudience({ kind: 'orders', userId: 'other', orderId: 'order' }, 'me', 'SELLER'), { kind: 'seller', orderId: 'order' });
});
