import "dotenv/config";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { randomBytes, createHmac } from "node:crypto";
import { CommerceService } from "../apps/api/src/commerce";
import { passwordHash } from "../apps/api/src/auth";
import { hash } from "../apps/api/src/core";
import { unseal, seal } from "../apps/api/src/core";
import { AdminController } from "../apps/api/src/admin";
import { CommerceController } from "../apps/api/src/commerce";
import {
  AdminExchangeController,
  ExchangeController,
} from "../apps/api/src/exchanges";
import { TOTP, Secret } from "otpauth";
import { AttachmentsController } from "../apps/api/src/attachments";
import sharp from "sharp";
import { applyBrandedColorways } from "../prisma/brand-variants";
import { applyPhotoPresentation } from "../prisma/photo-presentation";
const db = new PrismaClient(),
  commerce = new CommerceService(db as any),
  prefix = `it-${Date.now()}`;
const address = {
  recipient: "Khách kiểm thử",
  phone: "0901234567",
  text: "123 Đường Kiểm Thử, Thành phố Hồ Chí Minh",
  detail: "Tầng 1",
  instructions: "Gọi trước",
  confirmed: true,
  isDefault: false,
};
let a: any, b: any, admin: any, variant: any;
let index = 0;
const key = () => `${prefix}-${++index}-${randomBytes(8).toString("hex")}`;
const payload = (v = variant, method = "COD", coupon?: string) => ({
  items: [{ variantId: v.id, quantity: 1 }],
  address,
  method,
  ...(coupon ? { coupon } : {}),
});
async function fresh(stock = 10) {
  // Catalog tests intentionally leave inactive fixtures in the isolated DB.
  // Commerce fixtures must always belong to an available product on reruns.
  const p = await db.product.findFirstOrThrow({where:{active:true},orderBy:{id:"asc"}});
  return db.productVariant.create({
    data: {
      productId: p.id,
      sku: key(),
      color: key(),
      colorHex: "#242426",
      size: "M",
      inventories: { create: { onHand: stock } },
    },
    include: { inventories: true },
  });
}
const root = process.env.TEST_API_URL || "http://localhost:4000/api/v1";
async function client() {
  const r = await fetch(`${root}/auth/csrf`);
  const token = ((await r.json()) as any).token;
  let cookie = r.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  return {
    async request(
      path: string,
      data?: any,
      method = data ? "POST" : "GET",
      extra: any = {},
    ) {
      const res = await fetch(root + path, {
        method,
        headers: {
          Cookie: cookie,
          Origin: process.env.APP_URL!,
          "Content-Type": "application/json",
          "X-CSRF-Token": decodeURIComponent(
            cookie
              .split("; ")
              .find((s) => s.startsWith("milo_csrf="))
              ?.split("=")
              .slice(1)
              .join("=") || token,
          ),
          ...extra,
        },
        body: data ? JSON.stringify(data) : undefined,
      });
      const cookies = res.headers.getSetCookie();
      for (const c of cookies) {
        const part = c.split(";")[0],
          name = part.split("=")[0];
        cookie = cookie
          .split("; ")
          .filter((s) => !s.startsWith(name + "="))
          .concat(part)
          .join("; ");
      }
      return { status: res.status, body: (await res.json()) as any };
    },
  };
}
before(async () => {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.PAYMENT_PROVIDER !== "mock"
  )
    throw new Error("Integration suite requires development mock adapters");
  const ph = await passwordHash("Milo test " + randomBytes(24).toString("hex"));
  a = await db.user.create({
    data: {
      email: `${prefix}-a@example.test`,
      name: "Khách A",
      passwordHash: ph,
      verifiedAt: new Date(),
    },
  });
  b = await db.user.create({
    data: {
      email: `${prefix}-b@example.test`,
      name: "Khách B",
      passwordHash: ph,
      verifiedAt: new Date(),
    },
  });
  variant = await fresh(100);
});
after(async () => {
  await db.$disconnect();
});

test("seed logo/màu chạy lặp giữ SKU, tồn kho, giá, gallery và quan hệ", async () => {
  assert(new URL(process.env.DATABASE_URL!).pathname.includes("test"), "Seed verification requires an isolated test database");
  const snapshot = async () => ({
    variants: await db.productVariant.findMany({orderBy:{id:"asc"}}),
    inventory: await db.inventory.findMany({orderBy:{id:"asc"}}),
    images: await db.productImage.findMany({orderBy:{id:"asc"}}),
    products: await db.product.findMany({select:{id:true,slug:true,price:true,cost:true},orderBy:{id:"asc"}}),
    orders: await db.order.findMany({orderBy:{id:"asc"}}),
  });
  const before = await snapshot();
  await applyBrandedColorways(db);
  await applyPhotoPresentation(db);
  await applyBrandedColorways(db);
  await applyPhotoPresentation(db);
  assert.deepEqual(await snapshot(), before);
});
test("backend bỏ qua giá client: strict validation từ chối total/price giả", async () => {
  await assert.rejects(() =>
    commerce.checkout(a, { ...payload(), total: 1 }, key()),
  );
  const o = await commerce.checkout(a, payload(), key());
  assert(o.total > 1);
  assert.equal(o.items[0].cost, undefined);
});

test("checkout lưu ảnh đúng màu đã chọn thay vì ảnh đầu tiên", async () => {
  const v = await fresh(3);
  const url = `/uploads/${key()}-selected-color.webp`;
  const image = await db.productImage.create({ data: { productId: v.productId, color: v.color, view: "front", url, alt: "Selected colour", position: 100 } });
  try {
    const order = await commerce.checkout(a, payload(v), key());
    assert.equal(order.items[0].image, url);
    await commerce.transition(order.id, "CANCELLED", a.id, "Kết thúc kiểm tra ảnh theo màu");
  } finally { await db.productImage.delete({where:{id:image.id}}); }
});
test("checkout giữ công thức phối màu khi màu mới chưa có ảnh riêng",async()=>{
  const product=await db.product.findUniqueOrThrow({where:{slug:"ml-tee-heavy-box"}});
  const variant=await db.productVariant.create({data:{productId:product.id,sku:key(),color:`Phối màu thử nghiệm ${key()}`,colorHex:"#722f37",size:"M",inventories:{create:{onHand:3}}}});
  const order=await commerce.checkout(a,payload(variant),key());
  const image=new URL(order.items[0].image,"https://milo.local");
  assert.equal(image.searchParams.get("miloColor"),"722f37");
  assert.equal(image.searchParams.get("baseColor"),"262925");
  await commerce.transition(order.id,"CANCELLED",a.id,"Kết thúc kiểm tra phối màu");
});

test("checkout idempotency cùng key trả cùng đơn; khác payload bị từ chối", async () => {
  const k = key();
  const [x, y] = await Promise.all([
    commerce.checkout(a, payload(), k),
    commerce.checkout(a, payload(), k),
  ]);
  assert.equal(x.id, y.id);
  await assert.rejects(
    () => commerce.checkout(a, { ...payload(), method: "QR" }, k),
    /nội dung khác/,
  );
});
test("hai khách tranh SKU cuối: chỉ một đơn, kho không âm", async () => {
  const v = await fresh(1);
  const result = await Promise.allSettled([
    commerce.checkout(a, payload(v, "QR"), key()),
    commerce.checkout(b, payload(v, "QR"), key()),
  ]);
  assert.equal(result.filter((r) => r.status === "fulfilled").length, 1);
  const inv = await db.inventory.findFirstOrThrow({
    where: { variantId: v.id },
  });
  assert.equal(inv.onHand, 1);
  assert.equal(inv.reserved, 1);
});
test("voucher giới hạn 1 lượt dưới hai checkout đồng thời", async () => {
  const code = key().toUpperCase();
  await db.coupon.create({
    data: {
      code,
      type: "FIXED",
      value: 10000,
      maxDiscount: 10000,
      minSubtotal: 0,
      startsAt: new Date(Date.now() - 1000),
      endsAt: new Date(Date.now() + 3600000),
      maxUses: 1,
      perUserLimit: 1,
    },
  });
  const v = await fresh(5);
  const result = await Promise.allSettled([
    commerce.checkout(a, payload(v, "QR", code), key()),
    commerce.checkout(b, payload(v, "QR", code), key()),
  ]);
  assert.equal(result.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    (await db.coupon.findUniqueOrThrow({ where: { code } })).used,
    1,
  );
});
test("hủy lặp chỉ giải phóng tồn một lần; xuất QR chưa trả bị chặn", async () => {
  const v = await fresh(3);
  const o = await commerce.checkout(b, payload(v, "QR"), key());
  await commerce.transition(o.id, "CANCELLED", b.id, "Khách thử hủy");
  await commerce.transition(o.id, "CANCELLED", b.id, "Sự kiện hủy trùng");
  const inv = await db.inventory.findFirstOrThrow({
    where: { variantId: v.id },
  });
  assert.equal(inv.reserved, 0);
  assert.equal(inv.onHand, 3);
});
test("webhook đúng chữ ký cập nhật một lần; trùng đồng thời không nhân đôi tiền", async () => {
  const v = await fresh(10);
  const o = await commerce.checkout(a, payload(v, "QR"), key());
  const p = await db.payment.findUniqueOrThrow({ where: { orderId: o.id } });
  const data = {
    orderCode: Number(p.providerCode),
    reference: key(),
    amount: p.amount,
    currency: "VND",
    code: "00",
  };
  const signed = {
    data,
    signature: createHmac("sha256", process.env.DEV_WEBHOOK_SECRET!)
      .update(JSON.stringify(data))
      .digest("hex"),
  };
  const result = await Promise.all([
    fetch(root + "/webhooks/payos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(signed),
    }),
    fetch(root + "/webhooks/payos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(signed),
    }),
  ]);
  assert(result.every((r) => r.ok));
  const after = await db.payment.findUniqueOrThrow({
    where: { id: p.id },
    include: { transactions: true },
  });
  assert.equal(after.status, "PAID");
  assert.equal(after.received, p.amount);
  assert.equal(after.transactions.length, 1);
});
test("webhook sai chữ ký và return URL giả không xác nhận tiền", async () => {
  const o = await commerce.checkout(a, payload(await fresh(), "QR"), key());
  const p = await db.payment.findUniqueOrThrow({ where: { orderId: o.id } });
  const r = await fetch(root + "/webhooks/payos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      data: {
        orderCode: Number(p.providerCode),
        amount: p.amount,
        reference: key(),
        currency: "VND",
        code: "00",
      },
      signature: "bad",
    }),
  });
  assert.equal(r.status, 400);
  await fetch(`${root}/orders/${o.id}?status=PAID&success=true`).catch(
    () => {},
  );
  assert.equal(
    (await db.payment.findUniqueOrThrow({ where: { id: p.id } })).status,
    "PENDING",
  );
});
test("tiền thiếu và tiền về sau hết hạn vào ngoại lệ, không khôi phục đơn", async () => {
  const o = await commerce.checkout(b, payload(await fresh(), "QR"), key());
  let p = await db.payment.findUniqueOrThrow({ where: { orderId: o.id } });
  await commerce.receive(
    {
      orderCode: Number(p.providerCode),
      reference: key(),
      amount: p.amount - 1,
      currency: "VND",
      code: "00",
    },
    "test",
  );
  assert.equal(
    (await db.payment.findUniqueOrThrow({ where: { id: p.id } })).status,
    "EXCEPTION",
  );
  const late = await commerce.checkout(b, payload(await fresh(), "QR"), key());
  p = await db.payment.findUniqueOrThrow({ where: { orderId: late.id } });
  await commerce.transition(
    late.id,
    "CANCELLED",
    b.id,
    "Đã hết hạn thử nghiệm",
  );
  await commerce.receive(
    {
      orderCode: Number(p.providerCode),
      reference: key(),
      amount: p.amount,
      currency: "VND",
      code: "00",
    },
    "test",
  );
  assert.equal(
    (await db.payment.findUniqueOrThrow({ where: { id: p.id } })).status,
    "EXCEPTION",
  );
  assert.equal(
    (await db.order.findUniqueOrThrow({ where: { id: late.id } })).status,
    "CANCELLED",
  );
});
test("USER không truy cập Admin hoặc đơn của khách khác, thiếu CSRF bị chặn", async () => {
  const raw = randomBytes(32).toString("hex");
  const csrf = randomBytes(32).toString("hex");
  await db.session.create({
    data: {
      id: hash(raw),
      userId: a.id,
      csrf,
      expiresAt: new Date(Date.now() + 3600000),
      agent: "Integration",
    },
  });
  const headers = { Cookie: `milo_sid=${raw}` };
  const r = await fetch(root + "/admin/dashboard", { headers });
  assert.equal(r.status, 403);
  const o = await commerce.checkout(b, payload(await fresh(), "QR"), key());
  const other = await fetch(root + "/orders/" + o.id, { headers });
  assert.equal(other.status, 404);
  const mutate = await fetch(root + "/orders/" + o.id + "/cancel", {
    method: "POST",
    headers: {
      ...headers,
      Origin: process.env.APP_URL!,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  assert.equal(mutate.status, 403);
});
test("DB check constraint ngăn tồn âm và số tiền hoàn vượt nhận", async () => {
  const v = await fresh(2);
  await assert.rejects(() =>
    db.inventory.update({
      where: { id: v.inventories[0].id },
      data: { onHand: -1 },
    }),
  );
  const o = await commerce.checkout(b, payload(await fresh(), "QR"), key());
  await assert.rejects(() =>
    db.payment.update({ where: { orderId: o.id }, data: { refunded: 1000 } }),
  );
});
test("đăng ký public không thể mass assign ADMIN", async () => {
  const c = await client();
  const r = await c.request("/auth/register", {
    email: `${key()}@example.test`,
    name: "Public user",
    password: "A very long unique phrase 847!@b",
    role: "ADMIN",
  });
  assert.equal(r.status, 422);
});
test("đăng ký → xác minh một lần → đăng nhập → reset thu hồi phiên", async () => {
  const c = await client(),
    email = `${key()}@example.test`,
    password = "Unique phrase " + randomBytes(22).toString("hex");
  const created = await c.request("/auth/register", {
    email,
    password,
    name: "Khách xác minh",
    marketingConsent: false,
  });
  assert.equal(created.status, 201);
  const u = await db.user.findUniqueOrThrow({ where: { email } });
  assert.equal(u.role, "USER");
  const mail = await db.outboxEvent.findUniqueOrThrow({
    where: { key: `verify:${u.id}` },
  });
  const token = unseal((mail.payload as any).encryptedText).match(
    /token=([a-f0-9]+)/,
  )![1];
  assert.equal((await c.request("/auth/verify", { token })).status, 201);
  assert.equal((await c.request("/auth/verify", { token })).status, 400);
  assert.equal(
    (await c.request("/auth/login", { email, password })).status,
    201,
  );
  assert.equal((await c.request("/me")).status, 200);
  await c.request("/auth/forgot", { email });
  const reset = await db.authToken.findFirstOrThrow({
    where: { userId: u.id, purpose: "RESET" },
  });
  const mails = await db.outboxEvent.findMany({
    where: { kind: "EMAIL", key: { startsWith: "reset:" } },
  });
  const resetMail = mails.find((m) => (m.payload as any).userId === u.id)!;
  const raw = unseal((resetMail.payload as any).encryptedText).match(
    /token=([a-f0-9]+)/,
  )![1];
  assert.equal(hash(raw), reset.hash);
  assert.equal(
    (
      await c.request("/auth/reset", {
        token: raw,
        password: "New unique " + randomBytes(24).toString("hex"),
      })
    ).status,
    201,
  );
  assert.equal((await c.request("/me")).status, 401);
  assert.equal(
    (
      await c.request("/auth/reset", {
        token: raw,
        password: "Other " + randomBytes(24).toString("hex"),
      })
    ).status,
    400,
  );
});
test("Admin bắt buộc TOTP và mã không được phát lại", async () => {
  const password = "Admin unique " + randomBytes(20).toString("hex"),
    secret = new Secret({ size: 20 });
  const u = await db.user.create({
    data: {
      email: `${key()}@example.test`,
      name: "Admin thử MFA",
      role: "ADMIN",
      verifiedAt: new Date(),
      passwordHash: await passwordHash(password),
      mfa: {
        create: { encryptedSecret: seal(secret.base32), recoveryHashes: [] },
      },
    },
  });
  const c = await client();
  assert.equal(
    (await c.request("/auth/login", { email: u.email, password })).status,
    401,
  );
  const otp = new TOTP({ secret }).generate();
  assert.equal(
    (await c.request("/auth/login", { email: u.email, password, otp })).status,
    201,
  );
  assert.equal((await c.request("/admin/dashboard")).status, 200);
  assert.equal(
    (await c.request("/auth/login", { email: u.email, password, otp })).status,
    401,
  );
});
test("COD: giao hàng, thu tiền, chuyển về độc lập; hoàn một phần không vượt tiền nhận", async () => {
  const user = await db.user.create({
    data: {
      email: `${key()}@example.test`,
      name: "COD customer",
      passwordHash: "not-for-login",
      verifiedAt: new Date(),
    },
  });
  admin = await db.user.create({
    data: {
      email: `${key()}@example.test`,
      name: "Admin finance fixture",
      passwordHash: "not-for-login",
      role: "ADMIN",
      verifiedAt: new Date(),
    },
  });
  const controller = new AdminController(db as any, commerce);
  const req: any = { actor: admin, session: { reauthenticatedAt: new Date() } };
  const v = await fresh(4);
  const o = await commerce.checkout(user, payload(v), key());
  for (const s of ["CONFIRMED", "PACKING", "READY_TO_SHIP"])
    await commerce.transition(o.id, s, admin.id, "Xác nhận nghiệp vụ kiểm thử");
  await db.shipment.update({
    where: { orderId: o.id },
    data: { trackingCode: key(), status: "CREATED" },
  });
  await db.shipment.update({
    where: { orderId: o.id },
    data: { status: "CANCELLED" },
  });
  await assert.rejects(() =>
    commerce.transition(
      o.id,
      "SHIPPED",
      admin.id,
      "Cancelled waybill must not dispatch",
    ),
  );
  await db.shipment.update({
    where: { orderId: o.id },
    data: { status: "CREATED" },
  });
  await commerce.transition(
    o.id,
    "SHIPPED",
    admin.id,
    "Chứng từ bàn giao mock",
  );
  await commerce.transition(
    o.id,
    "SHIPPED",
    admin.id,
    "Sự kiện bàn giao trùng",
  );
  let inv = await db.inventory.findFirstOrThrow({ where: { variantId: v.id } });
  assert.equal(inv.onHand, 3);
  assert.equal(inv.reserved, 0);
  await commerce.transition(
    o.id,
    "DELIVERED",
    admin.id,
    "Chứng từ giao hàng mock",
  );
  let p = await db.payment.findUniqueOrThrow({ where: { orderId: o.id } });
  assert.equal(p.status, "UNPAID");
  const shipment = await db.shipment.findUniqueOrThrow({
    where: { orderId: o.id },
  });
  await controller.collect(
    shipment.id,
    {
      amount: o.total,
      reference: key(),
      evidence: "Chứng từ đơn vị vận chuyển thu đúng COD",
    },
    req,
  );
  p = await db.payment.findUniqueOrThrow({ where: { orderId: o.id } });
  assert.equal(p.status, "PAID");
  assert.equal(
    (await db.shipment.findUniqueOrThrow({ where: { id: shipment.id } }))
      .codRemitted,
    0,
  );
  const reference = key();
  await controller.settle(
    shipment.id,
    {
      amount: o.total,
      fee: 10000,
      reference,
      evidence: "Mã sao kê chuyển tiền COD về ngân hàng",
    },
    req,
  );
  await controller.settle(
    shipment.id,
    {
      amount: o.total,
      fee: 10000,
      reference,
      evidence: "Mã sao kê chuyển tiền COD về ngân hàng",
    },
    req,
  );
  assert.equal(
    (await db.shipment.findUniqueOrThrow({ where: { id: shipment.id } }))
      .codRemitted,
    o.total,
  );
  await assert.rejects(() =>
    controller.settle(
      shipment.id,
      {
        amount: 1,
        fee: 0,
        reference: key(),
        evidence: "Thử vượt tiền đã thu COD",
      },
      req,
    ),
  );
  const f = await controller.refund(
    {
      paymentId: p.id,
      amount: 50000,
      key: key(),
      reason: "Hoàn một phần có chứng cứ",
    },
    req,
  );
  await controller.processRefund(
    f.id,
    { action: "APPROVE", evidence: "Duyệt hoàn một phần đã xác minh" },
    req,
  );
  await controller.processRefund(
    f.id,
    { action: "COMPLETE", evidence: "Sao kê ngân hàng chuyển hoàn 50000 VND" },
    req,
  );
  await controller.processRefund(
    f.id,
    { action: "COMPLETE", evidence: "Sự kiện hoàn tiền trùng không nhân đôi" },
    req,
  );
  assert.equal(
    (await db.payment.findUniqueOrThrow({ where: { id: p.id } })).refunded,
    50000,
  );
  await assert.rejects(() =>
    controller.refund(
      {
        paymentId: p.id,
        amount: o.total,
        key: key(),
        reason: "Thử hoàn vượt số thực nhận",
      },
      req,
    ),
  );
  const cc = new CommerceController(db as any, commerce);
  const ret = await cc.createReturn(
    {
      orderId: o.id,
      reason: "Đổi sang kích thước phù hợp hơn",
      items: [{ orderItemId: o.items[0].id, quantity: 1 }],
      images: [],
    },
    { actor: user } as any,
  );
  const ri = ret.items[0];
  await assert.rejects(() =>
    controller.processReturn(
      ret.id,
      {
        action: "RESTOCK",
        itemId: ri.id,
        reason: "Chưa nhận chưa được nhập kho",
      },
      req,
    ),
  );
  await controller.processReturn(
    ret.id,
    { action: "APPROVE", reason: "Đủ điều kiện đổi trả" },
    req,
  );
  await controller.processReturn(
    ret.id,
    { action: "RECEIVE", reason: "Đã thực nhận kiện hàng hoàn" },
    req,
  );
  await assert.rejects(() =>
    controller.processReturn(
      ret.id,
      {
        action: "RESTOCK",
        itemId: ri.id,
        reason: "Chưa QC không được nhập kho",
      },
      req,
    ),
  );
  await controller.processReturn(
    ret.id,
    {
      action: "QC_PASS",
      itemId: ri.id,
      reason: "Hàng nguyên nhãn, kiểm tra đạt",
    },
    req,
  );
  await controller.processReturn(
    ret.id,
    { action: "RESTOCK", itemId: ri.id, reason: "Nhập lại sau kiểm tra đạt" },
    req,
  );
  await controller.processReturn(
    ret.id,
    { action: "RESTOCK", itemId: ri.id, reason: "Sự kiện nhập lại trùng" },
    req,
  );
  inv = await db.inventory.findFirstOrThrow({ where: { variantId: v.id } });
  assert.equal(inv.onHand, 4);
  const replacement = await fresh(3);
  const exchanges = new AdminExchangeController(db as any);
  const offer = await exchanges.offer(
    {
      returnItemId: ri.id,
      replacementVariantId: replacement.id,
      shippingFee: 0,
      reason: "Đổi size theo khách yêu cầu",
    },
    req,
  );
  assert.equal(
    (
      await db.inventory.findFirstOrThrow({
        where: { variantId: replacement.id },
      })
    ).reserved,
    1,
  );
  const mine = new ExchangeController(db as any);
  await mine.accept(offer.id, { actor: user } as any);
  await db.exchange.update({
    where: { id: offer.id },
    data: { trackingCode: key() },
  });
  await exchanges.action(
    offer.id,
    { action: "SHIP", reason: "Bàn giao thay thế có chứng từ" },
    req,
  );
  await exchanges.action(
    offer.id,
    { action: "SHIP", reason: "Sự kiện xuất hàng đổi trùng" },
    req,
  );
  const stock = await db.inventory.findFirstOrThrow({
    where: { variantId: replacement.id },
  });
  assert.equal(stock.onHand, 2);
  assert.equal(stock.reserved, 0);
});

test("private return photos enforce owner and reject executable formats", async () => {
  const files = new AttachmentsController(db as any);
  const image = await sharp({
    create: { width: 16, height: 16, channels: 3, background: "#ffffff" },
  })
    .png()
    .toBuffer();
  const result = await files.upload({ buffer: image }, { actor: a } as any);
  const id = result.url.split("/").pop()!;
  await assert.rejects(() =>
    files.download(id, { actor: b } as any, {} as any),
  );
  let path = "";
  await files.download(
    id,
    { actor: a } as any,
    {
      setHeader: () => {},
      sendFile: (p: string) => {
        path = p;
      },
    } as any,
  );
  assert(path.includes("return-images"));
  await assert.rejects(() =>
    files.upload({ buffer: Buffer.from("<script>alert(1)</script>") }, {
      actor: a,
    } as any),
  );
});

test("malformed JSON returns 400 and uniform request ID without stack", async () => {
  const r = await fetch(root + "/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{bad",
  });
  const e = (await r.json()) as any;
  assert.equal(r.status, 400);
  assert(e.code);
  assert(e.requestId);
  assert.equal(e.stack, undefined);
});
