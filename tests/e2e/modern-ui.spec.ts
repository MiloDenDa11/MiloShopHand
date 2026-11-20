import "dotenv/config";
import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
const db = new PrismaClient();
test.afterAll(async () => db.$disconnect());
const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const messages: string[] = []; errors.set(page, messages);
  page.on("pageerror", error => messages.push(error.message));
  page.on("console", message => { if (message.type() === "error" && !/status of 401|401 \(Unauthorized\)/i.test(message.text()) || /hydration|cannot be a descendant|cannot contain/i.test(message.text())) messages.push(message.text()); });
});
test.afterEach(async ({ page }) => expect(errors.get(page)).toEqual([]));

async function adminSession(page: Page) {
  if (!new URL(process.env.DATABASE_URL || "").pathname.endsWith("_test")) throw new Error("Admin fixture chỉ chạy trên database _test.");
  const user = await db.user.create({ data: { email: `e2e-modern-${randomBytes(8).toString("hex")}@example.test`, name: "Admin UI QA", role: "ADMIN", passwordHash: "not-a-login-hash", verifiedAt: new Date() } });
  const raw = randomBytes(32).toString("hex"), nonce = randomBytes(32).toString("hex");
  const csrf = `${nonce}.${createHmac("sha256", process.env.SESSION_SECRET!).update(nonce).digest("hex")}`;
  await db.session.create({ data: { id: createHash("sha256").update(raw).digest("hex"), userId: user.id, csrf, expiresAt: new Date(Date.now() + 3600000), agent: "Playwright modern UI isolated fixture" } });
  await page.context().addCookies([{ name: "milo_sid", value: raw, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }, { name: "milo_csrf", value: csrf, domain: "localhost", path: "/", sameSite: "Lax" }]);
  await page.goto("/admin");
  await expect(page.locator(".admin-main h1")).toHaveText("Tổng quan");
}
async function screenshot(page: Page, file: string) {
  mkdirSync(".local/modern-ui/screenshots", { recursive: true });
  await page.evaluate(async () => { await document.fonts.ready; (document.activeElement as HTMLElement)?.blur(); scrollTo({ top: 0, behavior: "instant" }); });
  await page.screenshot({ path: `.local/modern-ui/screenshots/${file}.png`, fullPage: true, animations: "disabled" });
}

test("dropdown dùng bàn phím, chọn giá thật, Escape và resize không lỗi", async ({ page }) => {
  await page.goto("/san-pham");
  const combo = page.getByRole("combobox", { name: "Sắp xếp sản phẩm", exact: true });
  await combo.focus(); await page.keyboard.press("ArrowDown");
  await expect(combo).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/sort=price-asc/);
  await expect(combo).toBeFocused();
  await expect(page.locator(".catalog-layout > section")).toHaveAttribute("aria-busy", "false");
  const prices = (await page.locator(".catalog-grid .prices b").allTextContents()).map(value => Number(value.replace(/\D/g, "")));
  expect(prices).toEqual([...prices].sort((a, b) => a - b));
  await combo.click(); await page.keyboard.press("Escape");
  await expect(combo).toHaveAttribute("aria-expanded", "false");
  await expect(combo).toBeFocused();
  await combo.click(); await page.setViewportSize({ width: 768, height: 900 });
  await expect(combo).toHaveAttribute("aria-expanded", "false");
});

test("dropdown dài tìm tiếng Việt không dấu và đổi đúng SKU trong giỏ", async ({ page, request }) => {
  const product = await (await request.get("/api/v1/products/ml-tee-heavy-box")).json();
  const variant = product.variants.find((item: any) => item.color === "Trắng" && item.available > 0);
  await page.goto("/san-pham/ml-tee-heavy-box");
  await page.getByRole("button", { name: "M", exact: true }).click();
  await page.getByRole("button", { name: "Thêm vào giỏ hàng", exact: true }).click();
  await page.getByRole("button", { name: "Đóng giỏ hàng", exact: true }).click();
  await page.goto("/gio-hang");
  await page.locator(".variant-switcher summary").click();
  await page.getByRole("combobox", { name: "Biến thể mới", exact: true }).click();
  await page.getByRole("searchbox", { name: "Tìm trong Biến thể mới", exact: true }).fill("trang");
  const option = page.getByRole("option").filter({ hasText: `${variant.color} / ${variant.size} —` });
  await option.click();
  await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem("milo-cart") || "[]")[0]?.variantId)).toBe(variant.id);
  await expect(page.locator(".cart-line.large")).toContainText(`${variant.color} / ${variant.size}`);
});

test("mọi tab quản trị dùng theme chung; sidebar thu gọn và 360px không tràn", async ({ page }) => {
  test.setTimeout(240000);
  await adminSession(page);
  await page.getByRole("button", { name: "Thu gọn thanh quản trị", exact: true }).click();
  await expect(page.locator(".admin-layout")).toHaveClass(/is-collapsed/);
  await page.getByRole("button", { name: "Mở rộng thanh quản trị", exact: true }).click();
  const tabs = ["Tổng quan", "Đơn hàng", "Sản phẩm", "Tồn kho", "Danh mục", "Bộ sưu tập", "Tag phong cách", "Mã ưu đãi", "Thanh toán & COD", "Hoàn tiền", "Đổi trả", "Exchange / Size", "Khách hàng", "Đánh giá", "Nội dung & cấu hình", "Nhật ký quản trị", "Tác vụ nền", "Xác thực lại"];
  const keys = ["dashboard", "orders", "products", "inventory", "categories", "collections", "styles", "coupons", "payments", "refunds", "returns", "exchanges", "users", "reviews", "settings", "audit", "jobs", "security"];
  for (const name of tabs) {
    const button = page.locator(".admin-sidebar").getByRole("button", { name, exact: true });
    const key = keys[tabs.indexOf(name)];
    const endpoint = key === "inventory" ? "/api/v1/admin/inventory/overview" : ["dashboard", "orders", "products", "exchanges"].includes(key) ? `/api/v1/admin/${key}` : `/api/v1/admin/data/${key}`;
    const response = key === "security" || await button.getAttribute("aria-pressed") === "true" ? null : page.waitForResponse(result => new URL(result.url()).pathname === endpoint && result.request().method() === "GET");
    await button.click();
    if (response) expect((await response).ok(), `API for ${name}`).toBe(true);
    await expect(page.locator(".admin-main h1")).toHaveText(name);
    await expect(page.getByText("Đang tải dữ liệu…", { exact: true })).toBeHidden();
    await expect(page.locator(".admin-main > .error-box")).toHaveCount(0);
    if (["Tổng quan", "Sản phẩm", "Nội dung & cấu hình"].includes(name)) await screenshot(page, `admin-${tabs.indexOf(name)}-1440`);
    await page.setViewportSize({ width: 360, height: 900 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), { message: `Overflow admin ${name} at 360px` }).toBe(true);
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  await page.locator(".admin-sidebar").getByRole("button", { name: "Sản phẩm", exact: true }).click();
  await expect(page.locator(".admin-main .data-table tbody tr").first()).toBeVisible();
  await page.setViewportSize({ width: 360, height: 900 });
  await screenshot(page, "admin-products-360");
});

test("bảng quản trị tìm kiếm và phân trang không làm mất dữ liệu", async ({ page }) => {
  await adminSession(page);
  await page.locator(".admin-sidebar").getByRole("button", { name: "Sản phẩm", exact: true }).click();
  const rows = page.locator(".admin-main .data-table tbody tr");
  await expect(rows).toHaveCount(10);
  const first = await rows.first().innerText();
  await page.getByRole("button", { name: "Trang sau của bảng", exact: true }).click();
  await expect(rows.first()).not.toHaveText(first);
  await page.getByRole("combobox", { name: "Số dòng mỗi trang", exact: true }).click();
  await page.getByRole("option", { name: "20", exact: true }).click();
  await expect(rows).toHaveCount(20);
  await page.getByRole("searchbox", { name: "Tìm trong bảng", exact: true }).fill("heavy box");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("ML Heavy Box Basic Tee");
  await page.getByRole("button", { name: "Xóa tìm kiếm trong bảng", exact: true }).click();
  await expect(rows).toHaveCount(20);
});

test("CRUD danh mục qua modal giữ FormData; select trong modal và focus hoạt động", async ({ page }) => {
  await adminSession(page);
  await page.locator(".admin-sidebar").getByRole("button", { name: "Danh mục", exact: true }).click();
  await page.getByRole("button", { name: "Thêm mới", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "Thêm cấu hình", exact: true });
  const slug = `e2e-modern-${randomBytes(6).toString("hex")}`;
  await dialog.getByLabel("Tên", { exact: true }).fill("Danh mục kiểm thử giao diện");
  await dialog.getByLabel("Slug", { exact: true }).fill(slug);
  await dialog.getByRole("button", { name: "Lưu cấu hình", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  let row = page.getByRole("row").filter({ hasText: slug });
  await row.getByRole("button", { name: "Sửa", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Cập nhật cấu hình", exact: true });
  await dialog.getByLabel("Tên", { exact: true }).fill("Danh mục đã sửa giao diện");
  await dialog.getByRole("button", { name: "Lưu cấu hình", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect((await db.category.findUniqueOrThrow({ where: { slug } })).name).toBe("Danh mục đã sửa giao diện");
  await row.getByRole("button", { name: "Sửa", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Xóa mục chưa dùng", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  expect(await db.category.findUnique({ where: { slug } })).toBeNull();
  await page.locator(".admin-sidebar").getByRole("button", { name: "Mã ưu đãi", exact: true }).click();
  await page.getByRole("button", { name: "Thêm mới", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Thêm cấu hình", exact: true });
  await dialog.getByRole("combobox", { name: "Kiểu giảm", exact: true }).click();
  await page.getByRole("option", { name: "Số tiền VND", exact: true }).click();
  expect(await dialog.locator("form").evaluate(form => new FormData(form as HTMLFormElement).get("type"))).toBe("FIXED");
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
});

test("độ tương phản footer, control states và reduced-motion", async ({ page }) => {
  await page.goto("/dang-ky");
  const email = page.locator('.auth-form:visible').getByLabel("Email", { exact: true });
  await email.fill("dia-chi-sai"); await email.blur();
  const style = await email.evaluate(element => ({ radius: getComputedStyle(element).borderRadius, height: element.getBoundingClientRect().height }));
  expect(style.radius).toBe("12px"); expect(style.height).toBeGreaterThanOrEqual(44);
  const contrast = await page.locator(".edition-footer").evaluate(footer => {
    const rgb = (value: string) => value.match(/[\d.]+/g)!.slice(0,3).map(Number).map(x => { x /= 255; return x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4; });
    const lum = (value: string) => rgb(value).reduce((sum,x,i) => sum+x*[.2126,.7152,.0722][i],0);
    const bg = lum(getComputedStyle(footer).backgroundColor), fg = lum(getComputedStyle(footer.querySelector("p")!).color);
    return (Math.max(bg,fg)+.05)/(Math.min(bg,fg)+.05);
  });
  expect(contrast).toBeGreaterThanOrEqual(4.5);
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await page.locator(".auth-form .button").first().evaluate(element => parseFloat(getComputedStyle(element).transitionDuration))).toBeLessThan(.01);
});
