import { test } from "node:test";
import assert from "node:assert/strict";
import {
  amounts,
  allocateDiscount,
  assertTransition,
  fold,
  refundableLine,
  checkoutSchema,
} from "../packages/shared/src";
test("VND tổng theo công thức, không float và không nhận tiền âm", () => {
  assert.deepEqual(
    amounts([{ price: 249000, quantity: 2 }], 49800, 30000, 0, 0),
    {
      subtotal: 498000,
      discount: 49800,
      shippingFee: 30000,
      shippingDiscount: 0,
      tax: 0,
      total: 478200,
    },
  );
  assert.throws(() => amounts([{ price: 10.5, quantity: 1 }]));
  assert.throws(() => amounts([{ price: 10, quantity: 1 }], 11));
});
test("phân bổ giảm giá bảo toàn tổng, xử lý phần dư xác định", () => {
  assert.deepEqual(allocateDiscount([100, 100, 100], 100), [34, 33, 33]);
  for (let n = 1; n < 500; n++) {
    const values = [249000, 299000, 499000];
    const parts = allocateDiscount(values, n);
    assert.equal(
      parts.reduce((a, b) => a + b, 0),
      n,
    );
    assert(parts.every((v, i) => v <= values[i]));
  }
});
test("hoàn một phần từ snapshot dòng, không giá hiện tại", () => {
  assert.equal(refundableLine(249000, 3, 100000, 1), 215666);
  assert.throws(() => refundableLine(249000, 3, 100000, 4));
});
test("state machine chặn nhảy cóc, QR chưa trả không xuất kho, duplicate no-op", () => {
  assert.throws(() =>
    assertTransition("PENDING_PAYMENT", "SHIPPED", "QR", "PENDING"),
  );
  assert.throws(() =>
    assertTransition("READY_TO_SHIP", "SHIPPED", "QR", "UNPAID"),
  );
  assert.equal(
    assertTransition("READY_TO_SHIP", "SHIPPED", "QR", "PAID"),
    true,
  );
  assert.equal(
    assertTransition("READY_TO_SHIP", "SHIPPED", "COD", "UNPAID"),
    true,
  );
  assert.equal(assertTransition("SHIPPED", "SHIPPED", "COD", "UNPAID"), false);
  assert.throws(() => assertTransition("SHIPPED", "CANCELLED", "COD", "PAID"));
});
test("tìm tiếng Việt không dấu, request schema chặn mass assignment và số lượng sai", () => {
  assert.equal(fold("ÁO PHÔNG ĐẸP"), "ao phong dep");
  assert.equal(
    checkoutSchema.safeParse({ role: "ADMIN", total: 1 }).success,
    false,
  );
});
