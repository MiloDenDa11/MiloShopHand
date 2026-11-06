import { test, expect } from "@playwright/test";

test("menu mobile hỗ trợ bàn phím, Escape và điều hướng", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "Mở menu", exact: true });
  await trigger.click();
  const menu = page.getByRole("dialog", { name: "Menu điều hướng", exact: true });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("link")).toHaveCount(6);
  await page.screenshot({ path: "docs/ui-redesign/previews/mobile-menu.png" });
  await page.keyboard.press("Escape");
  await expect(menu).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await trigger.press("Enter");
  await menu.getByRole("link", { name: /Cửa hàng/ }).click();
  await expect(page).toHaveURL(/\/san-pham$/);
  await expect(menu).not.toBeVisible();
  await expect(page.locator(".product-card").first()).toBeVisible();
});

test("tìm kiếm gợi ý lấy từ API và lưu từ khóa trong URL", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Tìm kiếm", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Tìm kiếm sản phẩm", exact: true });
  const search = dialog.getByRole("searchbox");
  await expect(search).toBeFocused();
  await search.fill("Everyday Essential");
  await expect(dialog.locator(".search-results")).toContainText("Everyday Essential Tee");
  await page.screenshot({ path: "docs/ui-redesign/previews/search-desktop.png" });
  await search.press("Enter");
  await expect(page).toHaveURL(/q=Everyday%20Essential/);
  await expect(dialog).not.toBeVisible();
  await expect(page.locator(".product-card")).toHaveCount(1);
  await page.reload();
  await expect(page.locator('#main input[name="q"]')).toHaveValue("Everyday Essential");
});

test("bộ lọc mobile mở được, áp dụng và giữ sau tải lại", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/san-pham");
  const details = page.locator("#main .filters details");
  await expect(details).toHaveCount(1);
  await expect(details).not.toHaveAttribute("open");
  await details.locator("summary").click();
  await expect(details).toHaveAttribute("open", "");
  await details.locator('select[name="category"]').selectOption("ao-phong");
  await details.locator('select[name="size"]').selectOption("M");
  await page.getByRole("button", { name: /Áp dụng bộ lọc/ }).click();
  await expect(page).toHaveURL(/category=ao-phong/);
  await expect(page.locator(".product-card").first()).toContainText("Áo phông");
  await page.reload();
  await details.locator("summary").click();
  await expect(details.locator('select[name="category"]')).toHaveValue("ao-phong");
  await expect(details.locator('select[name="size"]')).toHaveValue("M");
});

test("Mua ngay yêu cầu size và giữ số lượng của giỏ khách", async ({ page }) => {
  await page.goto("/san-pham/everyday-essential-tee");
  const buy = page.getByRole("button", { name: "Mua ngay", exact: true });
  await buy.click();
  await expect(page.getByText("Vui lòng chọn kích thước.", { exact: true })).toBeVisible();
  await expect(page.locator("#size-options")).toBeFocused();
  await page.getByRole("button", { name: "M", exact: true }).click();
  await page.getByRole("button", { name: "Tăng số lượng", exact: true }).click();
  await buy.click();
  await expect(page).toHaveURL(/thanh-toan/);
  await expect(page.getByRole("dialog")).not.toBeVisible();
  const cart = await page.evaluate(() => JSON.parse(localStorage.getItem("milo-cart") || "[]"));
  expect(cart).toHaveLength(1);
  expect(cart[0]).toMatchObject({ slug: "everyday-essential-tee", size: "M", quantity: 2 });
  await page.goto("/gio-hang");
  await expect(page.getByRole("heading", { name: "Everyday Essential Tee", exact: true })).toBeVisible();
  await page.screenshot({ path: "docs/ui-redesign/previews/cart-desktop.png" });
  await page.reload();
  await expect(page.locator("main .quantity span")).toHaveText("2");
});

const responsiveRoutes = ["/", "/san-pham", "/san-pham/everyday-essential-tee", "/bo-suu-tap", "/phong-cach", "/dang-nhap", "/dang-ky", "/gio-hang", "/thanh-toan", "/admin"];
const responsiveShots: Record<string, string> = {"/":"home", "/san-pham":"catalog", "/san-pham/everyday-essential-tee":"product", "/bo-suu-tap":"collections", "/phong-cach":"journal", "/dang-nhap":"login", "/dang-ky":"register"};

for (const path of responsiveRoutes) test(`responsive media/fonts: ${path}`, async ({ page }) => {
  const errors: string[] = [], resources: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", message => {
    const text = message.text();
    const imageLcpAdvisory = message.type() === "warning" && /Image with src/.test(text) && /was detected as the Largest Contentful Paint \(LCP\)/.test(text) && /Please add/.test(text);
    if (["error", "warning"].includes(message.type()) && !/Failed to load resource:.*401/.test(text) && !imageLcpAdvisory)
      errors.push(`console ${message.type()}: ${text}`);
  });
  page.on("response", r => {
    const url = new URL(r.url());
    resources.push(url.pathname);
    if (r.status() >= 400 && !(r.status() === 401 && url.pathname.endsWith("/me")))
      errors.push(`${r.status()} ${url.pathname}`);
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(path);
    await page.locator(".header").waitFor();
    if (path === "/") await expect(page.locator(".product-card")).toHaveCount(8);
    if (path === "/san-pham") await expect(page.locator(".product-card").first()).toBeVisible();
    if (path.includes("everyday-essential")) await expect(page.locator(".size-choices")).toBeVisible();
    for (const width of [360, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), {message:`overflow ${path} at ${width}px`}).toBe(true);
      if (responsiveShots[path] && (width === 360 || width === 1440)) {
        await page.screenshot({ path: `docs/ui-redesign/previews/${responsiveShots[path]}-${width}.png`, animations: "disabled" });
      }
    }
  expect(errors).toEqual([]);
  expect(resources.filter(p => /baket-fashion/i.test(p))).toEqual([]);
  await expect(page.locator("canvas")).toHaveCount(0);
});
