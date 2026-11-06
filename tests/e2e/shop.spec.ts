import "dotenv/config";
import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { createHmac, randomBytes, createHash } from "node:crypto";
import argon2 from "argon2";
const db = new PrismaClient();
test.afterAll(async () => db.$disconnect());
async function fixture() {
  if (!new URL(process.env.DATABASE_URL || "").pathname.endsWith("_test"))
    throw new Error("E2E có tạo đơn chỉ chạy trên database _test. Dùng scripts/redesign-preview.mjs.");
  // Repeated QA runs must not exhaust the shared seed SKU. This is a test fixture
  // in an isolated database, never a stock adjustment against the real store.
  const stocks = await db.inventory.findMany({
    where: { variant: { product: { slug: "milo-signature-tee" }, size: "M" } },
  });
  for (const stock of stocks) {
    if (stock.onHand - stock.reserved < 4)
      await db.inventory.update({ where: { id: stock.id }, data: { onHand: { increment: 4 } } });
  }
  const password = "E2E " + randomBytes(24).toString("hex");
  const u = await db.user.create({
    data: {
      email: `e2e-${Date.now()}-${randomBytes(4).toString("hex")}@example.test`,
      name: "Khách E2E",
      passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
      verifiedAt: new Date(),
    },
  });
  return { ...u, password };
}
async function login(page: any, u: any) {
  await page.goto("/dang-nhap");
  await page.getByLabel("Email", { exact: true }).fill(u.email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(u.password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Xin chào, E2E." }),
  ).toBeVisible();
}
test("360px, reduced motion và WebGL tắt vẫn chọn áo/thêm giỏ được", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      kind: any,
      ...args: any[]
    ) {
      if (String(kind).startsWith("webgl")) return null;
      return get.call(this, kind, ...(args as any));
    } as any;
  });
  await page.goto("/");
  await expect(page).toHaveTitle(/MILOSHOPHAND/);
  await expect(
    page.getByRole("heading", { name: /Wear your own story/i }),
  ).toBeVisible();
  await expect(page.locator(".product-card")).toHaveCount(8);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: ".local/qa-mobile.png", fullPage: true });
  await page.goto("/san-pham/everyday-essential-tee");
  await page.getByRole("button", { name: "M", exact: true }).click();
  await page.getByRole("button", { name: /Thêm vào giỏ/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("button", { name: "Đóng giỏ hàng", exact: true })
    .click();
  await page.reload();
  await page.getByRole("button", { name: /Giỏ hàng,/ }).click();
  await expect(
    page.getByRole("dialog").getByText("Everyday Essential Tee"),
  ).toBeVisible();
});
for (const method of ["COD", "QR"])
  test(`Mua ${method} xuyên suốt và xử lý đơn Admin`, async ({
    page,
    request,
  }) => {
    const u = await fixture();
    await login(page, u);
    await page.goto("/san-pham/milo-signature-tee");
    await page.getByRole("button", { name: "M", exact: true }).click();
    await page.getByRole("button", { name: /Thêm vào giỏ/ }).click();
    await page
      .getByRole("dialog")
      .getByRole("link", { name: "Thanh toán", exact: true })
      .click();
    await expect(page).toHaveURL(/thanh-toan/);
    await page.getByLabel("Họ tên người nhận").fill("Khách E2E");
    await page.getByLabel("Số điện thoại", { exact: true }).fill("0901234567");
    await page.getByRole("button", { name: "Dùng vị trí hiện tại" }).click();
    await page
      .getByLabel("Địa chỉ giao hàng đầy đủ")
      .fill("123 Đường Nguyễn Trãi, Phường Bến Thành, TP Hồ Chí Minh");
    await page.getByLabel("Tầng, căn hộ, tòa nhà").fill("Căn 102");
    await page
      .getByLabel("Tôi đã kiểm tra và xác nhận địa chỉ giao hàng cuối cùng.")
      .check();
    await page.locator('input[type="radio"][value="' + method + '"]').check();
    await page.getByRole("button", { name: /Kiểm tra giá/ }).click();
    await expect(
      page.getByText("Tổng thanh toán", { exact: true }),
    ).toBeVisible();
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.screenshot({ path: `docs/ui-redesign/previews/checkout-${method}.png`, fullPage: true });
    await page.setViewportSize({ width: 360, height: 800 });
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `docs/ui-redesign/previews/checkout-${method}-mobile.png`, fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole("button", { name: /Xác nhận đặt hàng/ }).click();
    await expect(page).toHaveURL(/don-hang/);
    const id = page.url().split("/").pop()!;
    let o = await db.order.findUniqueOrThrow({
      where: { id },
      include: { payment: true, items: true },
    });
    expect(o.total).toBeGreaterThan(1);
    if (method === "QR") {
      await expect(page.getByText(/QR PHÁT TRIỂN/)).toBeVisible();
      const d = {
        orderCode: Number(o.payment!.providerCode),
        reference: `e2e-${randomBytes(10).toString("hex")}`,
        amount: o.total,
        currency: "VND",
        code: "00",
      };
      const signature = createHmac("sha256", process.env.DEV_WEBHOOK_SECRET!)
        .update(JSON.stringify(d))
        .digest("hex");
      const res = await request.post(
        `${process.env.TEST_API_URL || "http://localhost:4000/api/v1"}/webhooks/payos`,
        { data: { data: d, signature } },
      );
      expect(res.ok()).toBe(true);
      await page.getByRole("button", { name: /Cập nhật trạng thái/ }).click();
      await expect(
        page
          .locator(".payment-panel")
          .getByText("Đã thanh toán", { exact: true }),
      ).toBeVisible();
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      await page.screenshot({ path: "docs/ui-redesign/previews/order-QR.png", fullPage: true });
    }
    // Test-only authenticated admin session; production bootstrap uses TOTP CLI.
    const admin = await db.user.create({
      data: {
        email: `e2e-admin-${randomBytes(8).toString("hex")}@example.test`,
        name: "Admin E2E",
        passwordHash: "not-a-login-hash",
        role: "ADMIN",
        verifiedAt: new Date(),
      },
    });
    const raw = randomBytes(32).toString("hex");
    const nonce = randomBytes(32).toString("hex"),
      csrf = `${nonce}.${createHmac("sha256", process.env.SESSION_SECRET!).update(nonce).digest("hex")}`;
    await db.session.create({
      data: {
        id: createHash("sha256").update(raw).digest("hex"),
        userId: admin.id,
        csrf,
        expiresAt: new Date(Date.now() + 3600000),
        agent: "Playwright controlled fixture",
      },
    });
    await page.context().clearCookies();
    await page.context().addCookies([
      {
        name: "milo_sid",
        value: raw,
        domain: "localhost",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
      {
        name: "milo_csrf",
        value: csrf,
        domain: "localhost",
        path: "/",
        sameSite: "Lax",
      },
    ]);
    await page.goto("/admin");
    await page.getByRole("button", { name: "Đơn hàng", exact: true }).click();
    await page.getByRole("textbox", { name: "Tìm đơn hàng" }).fill(o.code);
    await page.getByRole("button", { name: "Tìm", exact: true }).click();
    const orderRow=page.getByRole("row").filter({hasText:o.code});
    await expect(orderRow).toHaveCount(1);
    await orderRow.getByRole("button", { name: "Xử lý ↗", exact:true }).click();
    await page
      .getByLabel("Lý do thao tác / chứng cứ giao hàng")
      .fill("Kiểm thử xác nhận đơn từ giao diện quản trị");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Đã xác nhận", exact: true })
      .click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    expect((await db.order.findUniqueOrThrow({ where: { id } })).status).toBe(
      "CONFIRMED",
    );
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.screenshot({
      path: `docs/ui-redesign/previews/admin-${method}.png`,
      fullPage: true,
    });
    await page.setViewportSize({ width: 360, height: 800 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `docs/ui-redesign/previews/admin-${method}-mobile.png`, fullPage: true });
  });
test("bộ lọc tiếng Việt không dấu được lưu trong URL và tải lại", async ({
  page,
}) => {
  await page.goto("/san-pham?q=ao%20phong&size=M&stock=true");
  await expect(page.locator(".product-card").first()).toBeVisible();
  await expect(page.locator('#main input[name="q"]')).toHaveValue("ao phong");
  await page.reload();
  await expect(page.locator('#main select[name="size"]')).toHaveValue("M");
  await expect(page.locator(".product-card").first()).toBeVisible();
});
