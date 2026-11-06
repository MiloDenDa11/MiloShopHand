import { z } from "zod";
export const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
export const money = (n: number) =>
  new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(
    n,
  );
export const itemSchema = z
  .object({
    variantId: z.string().min(1),
    quantity: z.number().int().min(1).max(20),
  })
  .strict();
export const cartSchema = z
  .object({ items: z.array(itemSchema).max(50) })
  .strict();
export const addressSchema = z
  .object({
    recipient: z.string().trim().min(2).max(100),
    phone: z.string().min(9).max(20),
    text: z.string().trim().min(10).max(500),
    detail: z.string().max(200).default(""),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
    accuracy: z.number().nonnegative().optional(),
    districtId: z.number().int().positive().optional(),
    wardCode: z.string().max(30).optional(),
    instructions: z.string().max(500).default(""),
    confirmed: z.literal(true),
    isDefault: z.boolean().default(false),
  })
  .strict();
export const checkoutSchema = z
  .object({
    items: z.array(itemSchema).min(1).max(50),
    address: addressSchema,
    method: z.enum(["QR", "COD"]),
    coupon: z.string().max(40).optional(),
  })
  .strict();
export const transitions: Record<string, string[]> = {
  PENDING_PAYMENT: ["PENDING_CONFIRMATION", "CANCELLED"],
  PENDING_CONFIRMATION: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PACKING", "CANCELLED"],
  PACKING: ["READY_TO_SHIP", "CANCELLED"],
  READY_TO_SHIP: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["DELIVERED"],
  DELIVERED: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
};
export function assertTransition(
  from: string,
  to: string,
  method: string,
  payment: string,
) {
  if (from === to) return false;
  if (!transitions[from]?.includes(to))
    throw new Error("Chuyển trạng thái đơn không hợp lệ.");
  if (to === "SHIPPED" && method === "QR" && payment !== "PAID")
    throw new Error("Đơn QR phải được thanh toán trước khi xuất kho.");
  return true;
}
export function amounts(
  prices: { price: number; quantity: number }[],
  discount = 0,
  shippingFee = 30000,
  shippingDiscount = 0,
  tax = 0,
) {
  const subtotal = prices.reduce((s, i) => s + i.price * i.quantity, 0);
  for (const n of [subtotal, discount, shippingFee, shippingDiscount, tax])
    if (!Number.isSafeInteger(n) || n < 0)
      throw new Error("Số tiền không hợp lệ.");
  if (discount > subtotal || shippingDiscount > shippingFee)
    throw new Error("Giảm giá vượt giá trị.");
  return {
    subtotal,
    discount,
    shippingFee,
    shippingDiscount,
    tax,
    total: subtotal - discount + shippingFee - shippingDiscount + tax,
  };
}
// Largest remainder method, deterministic ties by line position. Full sum remains exact.
export function allocateDiscount(values: number[], discount: number) {
  const total = values.reduce((a, b) => a + b, 0);
  if (discount < 0 || discount > total || !Number.isSafeInteger(discount))
    throw new Error("Giảm giá không hợp lệ");
  if (!total) return values.map(() => 0);
  const parts = values.map((v, i) => ({
    i,
    base: Math.floor((v * discount) / total),
    rem: (v * discount) % total,
  }));
  let left = discount - parts.reduce((s, p) => s + p.base, 0);
  for (const p of [...parts].sort((a, b) => b.rem - a.rem || a.i - b.i)) {
    if (left-- > 0) p.base++;
  }
  return parts.map((p) => p.base);
}
export function refundableLine(
  price: number,
  quantity: number,
  discount: number,
  returnQty: number,
) {
  if (returnQty < 1 || returnQty > quantity)
    throw new Error("Số lượng hoàn không hợp lệ");
  return Math.floor(((price * quantity - discount) * returnQty) / quantity);
}
export const orderLabels: Record<string, string> = {
  PENDING_PAYMENT: "Chờ thanh toán",
  PENDING_CONFIRMATION: "Chờ xác nhận",
  CONFIRMED: "Đã xác nhận",
  PACKING: "Đang đóng gói",
  READY_TO_SHIP: "Sẵn sàng giao",
  SHIPPED: "Đang giao",
  DELIVERED: "Đã giao",
  COMPLETED: "Hoàn tất",
  CANCELLED: "Đã hủy",
};
