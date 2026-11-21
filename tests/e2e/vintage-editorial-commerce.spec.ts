import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route(/\/api\/v1\/me(?:[/?]|$)/, route => route.fulfill({ status: 401, contentType: "application/json", body: '{"code":"UNAUTHORIZED"}' }));
});

test("guest shopping retains the real SKU, colour, price and cart after the editorial upgrade", async ({ page, request }) => {
  const product = await (await request.get("/api/v1/products/airy-cotton-tee")).json();
  const variant = product.variants.find((v: any) => v.available > 0 && v.size === "M");
  expect(variant).toBeTruthy();
  const writes: string[] = [], errors: string[] = [];
  page.on("request", r => { if (r.url().includes("/api/v1/") && !["GET", "HEAD"].includes(r.method())) writes.push(r.method() + " " + new URL(r.url()).pathname); });
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`/san-pham/airy-cotton-tee?color=${encodeURIComponent(variant.color)}`);
  await page.locator(".size-choices").getByRole("button", { name: "M", exact: true }).click();
  await page.getByRole("button", { name: "Thêm vào giỏ hàng", exact: true }).click();
  await expect(page.getByRole("dialog").locator(".cart-line")).toHaveCount(1);
  const cart = await page.evaluate(() => JSON.parse(localStorage.getItem("milo-cart") || "[]"));
  expect(cart[0]).toMatchObject({ variantId: variant.id, color: variant.color, size: "M", price: variant.price, quantity: 1 });
  await page.getByRole("button", { name: "Đóng giỏ hàng", exact: true }).click();
  await page.goto("/gio-hang");
  await expect(page.locator(".cart-line.large")).toContainText("Airy Cotton Tee");
  await page.reload();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("milo-cart") || "[]")[0].variantId)).toBe(variant.id);
  for (const width of [360, 768, 1440]) { await page.setViewportSize({ width, height: 900 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); }
  expect(writes).toEqual([]); expect(errors).toEqual([]);
});

test("login, checkout and admin entry render without browser errors or layout overflow", async ({ page }) => {
  const errors: string[] = [], consoleErrors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error" && !/401|Unauthorized/.test(message.text())) consoleErrors.push(message.text()); });
  for (const path of ["/dang-nhap", "/thanh-toan", "/admin"]) {
    await page.goto(path);
    await expect(page.locator("#main")).toBeVisible();
    for (const width of [360, 1440]) { await page.setViewportSize({ width, height: 900 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); }
  }
  expect(errors).toEqual([]); expect(consoleErrors).toEqual([]);
});
