import "dotenv/config";
import { PackingService } from '../apps/api/src/packing';
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { passwordHash } from "../apps/api/src/auth";
import { CommerceService } from "../apps/api/src/commerce";
import { csrfToken, hash } from "../apps/api/src/core";
import { fold } from "../packages/shared/src";

const db = new PrismaClient();
const root = process.env.TEST_API_URL!;
const key = () => `inventory-${randomBytes(16).toString("hex")}`;
let admin: any, buyer: any, cookies = "", csrf = "";
async function request(path: string, body?: unknown, auth = true) {
  const r = await fetch(root + path, { method: body ? "POST" : "GET", headers: {
    "Content-Type": "application/json", Origin: process.env.APP_URL!,
    Cookie: auth ? cookies : "", "X-CSRF-Token": auth ? csrf : "",
  }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: r.status, body: await r.json() as any };
}
before(async () => {
  assert(new URL(process.env.DATABASE_URL!).pathname.endsWith("_test"));
  const password = "Inventory admin " + randomBytes(24).toString("hex");
  admin = await db.user.create({ data: { email: `${key()}@example.test`, name: "Quản trị kho kiểm thử", role: "ADMIN", verifiedAt: new Date(), passwordHash: await passwordHash(password) } });
  buyer = await db.user.create({ data: { email: `${key()}@example.test`, name: "Khách kho kiểm thử", verifiedAt: new Date(), passwordHash: "not-for-login" } });
  const start = await fetch(root + "/auth/csrf");
  csrf = ((await start.json()) as any).token;
  cookies = start.headers.getSetCookie().map(c => c.split(";")[0]).join("; ");
  const login = await fetch(root + "/auth/login", { method: "POST", headers: { "Content-Type": "application/json", Origin: process.env.APP_URL!, Cookie: cookies, "X-CSRF-Token": csrf }, body: JSON.stringify({ email: admin.email, password }) });
  assert.equal(login.status, 201);
  const all = new Map(cookies.split("; ").map(c => [c.split("=")[0], c]));
  login.headers.getSetCookie().forEach(c => { const item = c.split(";")[0]; all.set(item.split("=")[0], item); });
  cookies = [...all.values()].join("; ");
  csrf = decodeURIComponent(all.get("milo_csrf")!.slice("milo_csrf=".length));
});
after(async () => db.$disconnect());

async function fixture() {
  const category = await db.category.findFirstOrThrow();
  const name = `Áo kiểm kho ${key()}`;
  return db.product.create({ data: {
    name, slug: key(), searchText: fold(name), categoryId: category.id,
    description: "Sản phẩm kiểm thử trên database riêng", material: "Cotton", fit: "Regular", care: "Giặt nhẹ", price: 250000, cost: 100000,
    variants: { create: [
      { sku: key(), color: "Đen", colorHex: "#111111", size: "S", inventories: { create: { onHand: 15 } } },
      { sku: key(), color: "Đen", colorHex: "#111111", size: "M", inventories: { create: { onHand: 5, reserved: 4 } } },
      { sku: key(), color: "Đen", colorHex: "#111111", size: "L", inventories: { create: { onHand: 0 } } },
      { sku: key(), color: "Trắng", colorHex: "#ffffff", size: "M", inventories: { create: { onHand: 2 } } },
    ] },
  }, include: { variants: { include: { inventories: true } } } });
}

test("kho: phân trang toàn bộ SKU, lọc kết hợp, thống kê chính xác và chỉ Admin truy cập", async () => {
  const p = await fixture(), v = p.variants.find(v => v.color === "Đen" && v.size === "M")!;
  const overview = await request(`/admin/inventory/overview?q=${v.sku}&size=M&status=LOW`);
  assert.equal(overview.status, 200);
  assert.equal(overview.body.total, 1);
  assert.equal(overview.body.items[0].id, p.id);
  assert.equal(overview.body.items[0].variants.length, 4, "matching products expose every size, without the old 500-SKU truncation");
  assert.equal(overview.body.items[0].variants.reduce((n: number, i: any) => n + i.onHand, 0), 22);
  const all = await db.inventory.findMany({ where: { warehouse: "MAIN" }, include: { variant: { select: { productId: true } } } });
  const products = new Map<string, typeof all>();
  for (const i of all) products.set(i.variant.productId, [...(products.get(i.variant.productId) || []), i]);
  assert.deepEqual(overview.body.summary, {
    totalProducts: products.size, totalStock: all.reduce((n, i) => n + i.onHand, 0),
    lowProducts: [...products.values()].filter(rows => rows.some(i => i.onHand - i.reserved > 0 && i.onHand - i.reserved <= i.lowThreshold)).length,
    outProducts: [...products.values()].filter(rows => rows.every(i => i.onHand === i.reserved)).length,
    totalVariants: all.length, total: 1,
  });
  assert.equal((await request(`/admin/inventory/overview?q=${v.sku}&size=L`)).body.total, 0);
  assert.equal((await request(`/admin/inventory/overview?q=${encodeURIComponent(fold(p.name))}`)).body.total, 1);
  const ascending = await request("/admin/inventory/overview?sort=stock-asc&pageSize=50");
  const stocks = ascending.body.items.map((item: any) => item.variants.reduce((n: number, v: any) => n + v.onHand, 0));
  assert.deepEqual(stocks, [...stocks].sort((a, b) => a - b));
  const second = await request("/admin/inventory/overview?page=2&pageSize=10");
  const first = await request("/admin/inventory/overview?page=1&pageSize=10");
  assert(second.body.items.every((p: any) => !first.body.items.some((f: any) => f.id === p.id)));
  assert.equal((await request("/admin/inventory/overview?pageSize=500")).status, 422);
  assert.equal((await request("/admin/inventory/history?kind=FAKE")).status, 422);
  assert((await request("/admin/inventory/options")).body.some((item: any) => item.id === p.id));
  assert.equal((await request("/admin/inventory/overview", undefined, false)).status, 401);
  const token = randomBytes(32).toString("hex"), userCsrf = csrfToken();
  await db.session.create({ data: { id: hash(token), userId: buyer.id, csrf: userCsrf, expiresAt: new Date(Date.now() + 3600000), agent: "Inventory access regression" } });
  const headers = { Cookie: `milo_sid=${token}; milo_csrf=${encodeURIComponent(userCsrf)}`, Origin: process.env.APP_URL!, "X-CSRF-Token": userCsrf, "Content-Type": "application/json" };
  for (const path of ["overview", "history", "options"]) assert.equal((await fetch(`${root}/admin/inventory/${path}`, { headers })).status, 403);
  assert.equal((await fetch(`${root}/admin/inventory/${v.inventories[0].id}/movements`, { method: "POST", headers, body: JSON.stringify({ operation: "RECEIPT", quantity: 1, expectedOnHand: 5, reason: "Không đủ quyền", key: key() }) })).status, 403);
  assert.equal((await fetch(`${root}/admin/inventory/${v.inventories[0].id}/movements`, { method: "POST", headers: { Cookie: cookies, Origin: process.env.APP_URL!, "Content-Type": "application/json" }, body: "{}" })).status, 403);
});

test("kho: nhập/xuất/kiểm kê thật, chống lưu trùng, tồn cũ và cạnh tranh; nhật ký trước/sau đầy đủ", async () => {
  const p = await fixture(), v = p.variants.find(v => v.color === "Đen" && v.size === "M")!, inv = v.inventories[0];
  const path = `/admin/inventory/${inv.id}/movements`;
  const base = { operation: "RECEIPT", quantity: 3, expectedOnHand: 5, reason: "Nhập hàng bổ sung kiểm thử", key: key() };
  const duplicate = await Promise.all([request(path, base), request(path, base)]);
  assert(duplicate.every(r => r.status === 201));
  assert.equal(duplicate[0].body.id, duplicate[1].body.id);
  assert.deepEqual([duplicate[0].body.onHandBefore, duplicate[0].body.onHandAfter], [5, 8]);
  assert.equal(await db.stockMovement.count({ where: { reference: base.key } }), 1);
  assert.equal((await request(path, { ...base, reason: "Khác nội dung cùng mã" })).body.code, "IDEMPOTENCY_CONFLICT");
  assert.equal((await request(path, { ...base, expectedOnHand: 5, key: key() })).body.code, "STOCK_CHANGED");
  for (const quantity of [-1, 1.5, 100001]) assert.equal((await request(path, { ...base, quantity, expectedOnHand: 8, key: key() })).status, 422);
  assert.equal((await request(path, { ...base, operation: "ISSUE", quantity: 5, expectedOnHand: 8, key: key() })).body.code, "INVALID_STOCK");
  assert.equal((await request(path, { ...base, operation: "ADJUSTMENT", quantity: 3, expectedOnHand: 8, key: key() })).body.code, "INVALID_STOCK");
  assert.equal((await request(path, { ...base, operation: "ISSUE", quantity: 0, expectedOnHand: 8, key: key() })).status, 422);
  const issue = await request(path, { ...base, operation: "ISSUE", quantity: 2, expectedOnHand: 8, key: key() });
  assert.equal(issue.status, 201);
  assert.deepEqual([issue.body.delta, issue.body.onHandBefore, issue.body.onHandAfter], [-2, 8, 6]);
  const adjust = await request(path, { ...base, operation: "ADJUSTMENT", quantity: 7, expectedOnHand: 6, key: key() });
  assert.equal(adjust.status, 201);
  assert.deepEqual([adjust.body.delta, adjust.body.onHandBefore, adjust.body.onHandAfter], [1, 6, 7]);
  const legacy = { delta: 2, reason: "Điều chỉnh API cũ tương thích", key: key() };
  const oldApi = await request(`/admin/inventory/${inv.id}/adjust`, legacy);
  assert.equal(oldApi.status, 201);
  assert.equal(oldApi.body.onHandAfter, 9);
  assert.equal((await request(`/admin/inventory/${inv.id}/adjust`, legacy)).body.id, oldApi.body.id);
  assert.equal((await db.inventory.findUniqueOrThrow({ where: { id: inv.id } })).reserved, 4);
  const history = await request(`/admin/inventory/history?productId=${p.id}&kind=RECEIPT&pageSize=1`);
  assert.equal(history.body.total, 1);
  assert.equal(history.body.items[0].actorName, admin.name);
  assert.deepEqual([history.body.items[0].onHandBefore, history.body.items[0].onHandAfter], [5, 8]);
  assert(!("requestHash" in history.body.items[0]));
  assert.equal((await request(`/admin/inventory/history?productId=${p.id}&kind=RETURN`)).body.total, 0);
  const publicProduct = await request(`/products/${p.slug}`);
  assert.equal(publicProduct.body.variants.find((i: any) => i.id === v.id).available, 5);
  const s = p.variants.find(v => v.size === "S")!.inventories[0];
  const concurrent = await Promise.all([1, 2].map(() => request(`/admin/inventory/${s.id}/movements`, { ...base, operation: "ISSUE", quantity: 10, expectedOnHand: 15, key: key() })));
  assert.deepEqual(concurrent.map(r => r.status).sort(), [201, 409]);
  assert.equal((await db.inventory.findUniqueOrThrow({ where: { id: s.id } })).onHand, 5);
});

test("kho: giữ hàng khi tạo đơn, xuất một lần khi giao vận và số đã bán khớp nhật ký", async () => {
  const p = await fixture(), v = p.variants.find(v => v.size === "S")!, inv = v.inventories[0];
  const commerce = new CommerceService(db as any);
  const order = await commerce.checkout(buyer, { items: [{ variantId: v.id, quantity: 1 }], method: "COD", address: { recipient: "Khách kho", phone: "0901234567", text: "123 Đường Kiểm Thử, Thành phố Hồ Chí Minh", detail: "Tầng 1", instructions: "Gọi trước", confirmed: true, isDefault: false } }, key());
  let actual = await db.inventory.findUniqueOrThrow({ where: { id: inv.id } });
  assert.deepEqual([actual.onHand, actual.reserved], [15, 1]);
  for (const state of ["CONFIRMED", "PACKING", "READY_TO_SHIP"]) {
    if (state === 'READY_TO_SHIP') { let revision = 0; const lines = await db.orderItem.findMany({ where: { orderId: order.id } }); for (const line of lines) for (let piece = 0; piece < line.quantity; piece++) await new PackingService(db as any).change(order.id, admin.id, { action: 'SCAN', sku: line.sku, expectedRevision: revision++, requestId: crypto.randomUUID() }); }
    await commerce.transition(order.id, state, admin.id, "Quy trình kho kiểm thử");
  }
  actual = await db.inventory.findUniqueOrThrow({ where: { id: inv.id } });
  assert.equal(actual.onHand, 15, "confirmation must retain the existing reservation workflow");
  await db.shipment.update({ where: { orderId: order.id }, data: { trackingCode: key(), status: "CREATED" } });
  await commerce.transition(order.id, "SHIPPED", admin.id, "Xuất kho kiểm thử");
  await commerce.transition(order.id, "SHIPPED", admin.id, "Sự kiện giao vận lặp");
  actual = await db.inventory.findUniqueOrThrow({ where: { id: inv.id } });
  assert.deepEqual([actual.onHand, actual.reserved], [14, 0]);
  const sales = await db.stockMovement.findMany({ where: { inventoryId: inv.id, kind: "SALE" } });
  assert.equal(sales.length, 1);
  assert.deepEqual([sales[0].delta, sales[0].onHandBefore, sales[0].onHandAfter], [-1, 15, 14]);
  const overview = await request(`/admin/inventory/overview?productId=${p.id}`);
  assert.equal(overview.body.items[0].variants.find((i: any) => i.id === inv.id).sold, 1);
  const reserve = await db.stockMovement.findFirstOrThrow({ where: { inventoryId: inv.id, kind: "RESERVE" } });
  assert.deepEqual([reserve.onHandBefore, reserve.onHandAfter], [15, 15]);
});
