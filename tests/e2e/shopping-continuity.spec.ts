import "dotenv/config";
import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";
import argon2 from "argon2";

const db = new PrismaClient();
test.afterAll(async () => db.$disconnect());
const slug = "ml-tee-heavy-box";

async function userFixture() {
  if (!new URL(process.env.DATABASE_URL || "").pathname.endsWith("_test"))
    throw new Error("Fixture chỉ dùng database _test.");
  const password = `E2E ${randomBytes(24).toString("hex")}`;
  const user = await db.user.create({ data: {
    email: `e2e-wishlist-${randomBytes(10).toString("hex")}@example.test`,
    name: "Khách yêu thích", verifiedAt: new Date(),
    passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
  } });
  return { ...user, password };
}

async function login(page: Page, user: Awaited<ReturnType<typeof userFixture>>) {
  await page.goto("/dang-nhap");
  const form = page.locator('#main .auth-form:visible');
  await form.getByLabel("Email", { exact: true }).fill(user.email);
  await form.getByLabel("Mật khẩu", { exact: true }).fill(user.password);
  await form.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL(/\/tai-khoan$/);
}

test("màu chọn trên thẻ được giữ qua chi tiết, reload và thêm vào giỏ", async ({ page, request }) => {
  const product = await (await request.get(`/api/v1/products/${slug}`)).json();
  const variant = product.variants.find((v: any) => v.color !== product.variants[0].color && v.available > 0);
  expect(variant).toBeTruthy();
  await page.goto(`/san-pham?q=${encodeURIComponent(product.name)}`);
  const card = page.locator("#main .product-card").filter({ has: page.locator(`a.product-name[href*="/${slug}"]`) }).first();
  await card.getByRole("button", { name: `Xem màu ${variant.color}`, exact: true }).click();
  await card.locator(".product-details-link").click();
  await expect(page).toHaveURL(new RegExp(`color=${encodeURIComponent(variant.color)}`));
  const colour = page.locator(".color-choices").getByRole("button", { name: variant.color, exact: true });
  await expect(colour).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(colour).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: variant.size, exact: true }).click();
  await page.getByRole("button", { name: "Thêm vào giỏ hàng", exact: true }).click();
  await expect(page.getByRole("dialog").locator(".cart-line").first()).toContainText(variant.color);
  const cart = await page.evaluate(() => JSON.parse(localStorage.getItem("milo-cart") || "[]"));
  expect(cart[0]).toMatchObject({ variantId: variant.id, color: variant.color, size: variant.size });
});

test("màu URL không tồn tại trở về biến thể hợp lệ", async ({ page, request }) => {
  const product = await (await request.get(`/api/v1/products/${slug}`)).json();
  await page.goto(`/san-pham/${slug}?color=khong-co-mau-nay`);
  await expect(page.locator(".color-choices").getByRole("button", { name: product.variants[0].color, exact: true }))
    .toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Thêm vào giỏ hàng", exact: true })).toBeEnabled();
});

test("yêu thích đọc từ database, giữ sau reload và tách hai tài khoản", async ({ page, request }) => {
  const product = await (await request.get(`/api/v1/products/${slug}`)).json();
  const first = await userFixture(), second = await userFixture();
  await db.wishlist.create({ data: { userId: first.id, productId: product.id } });
  let reads = 0;
  page.on("request", (r) => { if (r.method() === "GET" && new URL(r.url()).pathname === "/api/v1/me/wishlist") reads++; });
  const catalog = `/san-pham?q=${encodeURIComponent(product.name)}`;
  const heart = page.locator("#main .product-card .wish").first();
  await login(page, first);
  reads = 0;
  await page.goto(catalog);
  await expect(heart).toHaveAttribute("aria-pressed", "true");
  expect(reads).toBe(1);
  await heart.click();
  await expect(heart).toHaveAttribute("aria-pressed", "false");
  expect(await db.wishlist.count({ where: { userId: first.id, productId: product.id } })).toBe(0);
  await heart.click();
  await expect(heart).toHaveAttribute("aria-pressed", "true");
  reads = 0;
  await page.reload();
  await expect(heart).toHaveAttribute("aria-pressed", "true");
  expect(reads).toBe(1);
  await page.goto("/tai-khoan");
  await page.getByRole("button", { name: "Đăng xuất", exact: true }).click();
  await expect(page.getByRole("button", { name: "Đăng xuất", exact: true })).not.toBeVisible();
  await page.goto(catalog);
  await expect(heart).toHaveAttribute("aria-pressed", "false");
  await login(page, second);
  await page.goto(catalog);
  await expect(heart).toHaveAttribute("aria-pressed", "false");
  await heart.click();
  await expect(heart).toHaveAttribute("aria-pressed", "true");
  expect(await db.wishlist.count({ where: { productId: product.id, userId: { in: [first.id, second.id] } } })).toBe(2);
});

test("ảnh lỗi không lồng nút; ảnh phóng to thử lại được sau khi mạng phục hồi", async ({ page }) => {
  const warnings: string[] = [];
  page.on("console", (m) => { if (/hydration|cannot be a descendant|cannot contain/i.test(m.text())) warnings.push(m.text()); });
  const imageRoute = /\/product-media\/|\/_next\/image\?/;
  await page.route(imageRoute, (route) => route.abort());
  await page.goto(`/san-pham/${slug}`);
  await expect(page.locator("#main .detail-main .photo-error")).toBeVisible();
  await expect(page.locator("#main button button, #main a button")).toHaveCount(0);
  const enlarge = page.locator(".product-photo-enlarge");
  if (await enlarge.isVisible()) await enlarge.click();
  else await page.locator(".detail-image-zoom").click();
  const dialog = page.getByRole("dialog", { name: /Ảnh phóng to:/ });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Thử lại", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");
  await page.unroute(imageRoute);
  await dialog.getByRole("button", { name: "Thử lại", exact: true }).click();
  await expect.poll(() => dialog.locator(".zoom-image img").evaluateAll((images) => images.length > 0 && images.every((i) => (i as HTMLImageElement).naturalWidth > 0))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
  expect(warnings).toEqual([]);
});
