import { test, expect, type Page } from "@playwright/test";
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const slug = "ml-tee-heavy-box";
const stage = (page: Page) => page.locator(".try-on-main:visible");
const runtimeErrors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  runtimeErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (/hydration|cannot be a descendant|cannot contain/i.test(message.text())) errors.push(message.text()); });
});
test.afterEach(async ({ page }) => expect(runtimeErrors.get(page)).toEqual([]));
async function fixturePhoto(width = 640, height = 960) {
  return { name: "test-photo.png", mimeType: "image/png", buffer: await sharp({ create: { width, height, channels: 3, background: "#c7c2b5" } }).png().toBuffer() };
}
async function upload(page: Page) {
  await stage(page).getByLabel("Chọn ảnh của bạn", { exact: true }).setInputFiles(await fixturePhoto());
  await expect(page.getByAltText("Ảnh bạn đã chọn để dùng thử", { exact: true })).toBeVisible();
}

test("nút dùng thử trên thẻ và chi tiết giữ đúng sản phẩm, màu và size", async ({ page, request }) => {
  const product = await (await request.get(`/api/v1/products/${slug}`)).json();
  const variant = product.variants.find((v: any) => v.color !== product.variants[0].color && v.available > 0);
  await page.goto(`/san-pham?q=${encodeURIComponent(product.name)}`);
  const card = page.locator("#main .product-card").filter({ has: page.locator(`a.product-name[href*="/${slug}"]`) }).first();
  await card.getByRole("button", { name: `Xem màu ${variant.color}`, exact: true }).click();
  await card.getByRole("link", { name: `Dùng thử ${product.name}`, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/dung-thu/${slug}\\?`));
  await expect(page.getByRole("button", { name: `Dùng thử màu ${variant.color}`, exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("link", { name: "Về sản phẩm", exact: true }).click();
  await page.getByRole("button", { name: variant.size, exact: true }).click();
  await page.getByRole("link", { name: "Dùng thử cùng ảnh của bạn", exact: true }).click();
  await expect(page.getByRole("button", { name: `Size ${variant.size}`, exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("link", { name: "Về sản phẩm", exact: true }).click();
  await expect(page.getByRole("button", { name: variant.size, exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("chọn ảnh, đồng ý và xem kết quả chờ AI; không gửi ảnh hoặc lưu dữ liệu cá nhân", async ({ page }) => {
  const mutations: string[] = [];
  page.on("request", (request) => { if (["POST", "PUT", "PATCH"].includes(request.method())) mutations.push(request.url()); });
  await page.goto(`/dung-thu/${slug}`);
  await expect(stage(page).getByRole("button", { name: "Tiếp tục", exact: true })).toBeDisabled();
  mkdirSync(".local/try-on", { recursive: true });
  await page.screenshot({ path: ".local/try-on/desktop-upload.png", fullPage: true });
  await upload(page);
  await stage(page).getByRole("button", { name: "Tiếp tục", exact: true }).click();
  const confirm = stage(page).getByRole("button", { name: "Xác nhận & xem bước kết quả", exact: true });
  await expect(confirm).toBeDisabled();
  await page.getByRole("checkbox").check();
  await confirm.click();
  await expect(page.getByText("CHƯA CÓ ẢNH KẾT QUẢ", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Tạo ảnh dùng thử/ })).toBeDisabled();
  await expect(page.getByText(/Hiện chưa tạo ảnh bạn mặc sản phẩm/)).toBeVisible();
  await page.screenshot({ path: ".local/try-on/desktop-result.png", fullPage: true });
  expect(mutations).toEqual([]);
  expect(await page.evaluate(() => Object.keys(localStorage).filter((key) => /try.?on|photo|dung.?thu/i.test(key)))).toEqual([]);
  await page.reload();
  await expect(page.getByAltText("Ảnh bạn đã chọn để dùng thử", { exact: true })).toHaveCount(0);
  await expect(stage(page).getByRole("button", { name: "Tiếp tục", exact: true })).toBeDisabled();
});

test("tệp giả dạng ảnh, ảnh hỏng, quá nhỏ và quá dung lượng có phản hồi", async ({ page }) => {
  await page.goto(`/dung-thu/${slug}`);
  const input = stage(page).getByLabel("Chọn ảnh của bạn", { exact: true });
  await input.setInputFiles({ name: "fake.png", mimeType: "image/png", buffer: Buffer.from("<svg>not a PNG</svg>") });
  await expect(stage(page).getByRole("alert")).toContainText("Nội dung tệp không khớp");
  await input.setInputFiles({ name: "broken.png", mimeType: "image/png", buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]) });
  await expect(stage(page).getByRole("alert")).toContainText("Không đọc được ảnh");
  await input.setInputFiles(await fixturePhoto(128, 128));
  await expect(stage(page).getByRole("alert")).toContainText("Ảnh quá nhỏ");
  await input.setInputFiles({ name: "large.png", mimeType: "image/png", buffer: Buffer.alloc(8 * 1024 * 1024 + 1) });
  await expect(stage(page).getByRole("alert")).toContainText("8 MB");
  await upload(page);
  await expect(stage(page).getByRole("alert")).toHaveCount(0);
});

test("đổi màu hủy xác nhận trước đó, thiếu ảnh riêng chặn bước tiếp theo", async ({ page, request }) => {
  const product = await (await request.get(`/api/v1/products/${slug}`)).json();
  const alternative = product.variants.find((v: any) => v.color !== product.variants[0].color);
  await page.goto(`/dung-thu/${slug}`);
  await upload(page);
  await stage(page).getByRole("button", { name: "Tiếp tục", exact: true }).click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: `Dùng thử màu ${alternative.color}`, exact: true }).click();
  await expect(stage(page).getByRole("heading", { name: "Bắt đầu từ ảnh của bạn.", exact: true })).toBeVisible();
  await stage(page).getByRole("button", { name: "Tiếp tục", exact: true }).click();
  await expect(page.getByRole("checkbox")).not.toBeChecked();
  await page.goto("/dung-thu/ml-hoodie-minimal-no-pocket?color=Tr%E1%BA%AFng");
  await upload(page);
  await expect(page.locator(".try-on-product-panel:visible .try-on-missing-image")).toContainText("Trắng");
  await expect(stage(page).getByRole("button", { name: "Tiếp tục", exact: true })).toBeDisabled();
});

test("xóa, thay ảnh và rời phòng thử giải phóng URL ảnh tạm", async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).tryOnUrls = { created: [], revoked: [] };
    const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (blob) => { const url = create(blob); (window as any).tryOnUrls.created.push(url); return url; };
    URL.revokeObjectURL = (url) => { (window as any).tryOnUrls.revoked.push(url); revoke(url); };
  });
  await page.goto(`/dung-thu/${slug}`);
  await upload(page);
  const first = await page.getByAltText("Ảnh bạn đã chọn để dùng thử", { exact: true }).getAttribute("src");
  await upload(page);
  await expect.poll(() => page.evaluate((url) => (window as any).tryOnUrls.revoked.includes(url), first)).toBe(true);
  await page.getByRole("button", { name: "Xóa ảnh", exact: true }).click();
  await expect(page.getByAltText("Ảnh bạn đã chọn để dùng thử", { exact: true })).toHaveCount(0);
  await upload(page);
  await page.getByRole("link", { name: "Về sản phẩm", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).tryOnUrls.created.every((url: string) => (window as any).tryOnUrls.revoked.includes(url)))).toBe(true);
});

test("chế độ chân dung giải thích vóc dáng mô phỏng; giỏ giữ đúng biến thể", async ({ page, request }) => {
  const product = await (await request.get(`/api/v1/products/${slug}`)).json();
  const variant = product.variants.find((v: any) => v.color !== product.variants[0].color && v.available > 0);
  const query = new URLSearchParams({ color: variant.color, size: variant.size });
  await page.goto(`/dung-thu/${slug}?${query}`);
  await page.getByRole("button", { name: /Chỉ có ảnh chân dung/ }).click();
  await expect(page.getByText(/Với ảnh chân dung, vóc dáng/)).toBeVisible();
  await page.getByRole("button", { name: "Thêm sản phẩm vào giỏ", exact: true }).click();
  await expect(page.getByRole("dialog").locator(".cart-line").first()).toContainText(variant.color);
  const cart = await page.evaluate(() => JSON.parse(localStorage.getItem("milo-cart") || "[]"));
  expect(cart[0]).toMatchObject({ variantId: variant.id, color: variant.color, size: variant.size });
});

test("phòng thử 360 px không tràn ngang, thao tác bàn phím và ảnh thử", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto(`/dung-thu/${slug}`);
  await upload(page);
  const next = stage(page).getByRole("button", { name: "Tiếp tục", exact: true });
  await next.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Đúng bạn. Đúng thiết kế.", exact: true })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  mkdirSync(".local/try-on", { recursive: true });
  await page.screenshot({ path: ".local/try-on/mobile-confirm.png", fullPage: true });
});

test("sản phẩm không tồn tại có đường quay về danh mục", async ({ page }) => {
  await page.goto("/dung-thu/san-pham-khong-ton-tai");
  await expect(page.getByRole("heading", { name: "Chưa mở được phòng thử.", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /Chọn sản phẩm khác/ })).toHaveAttribute("href", "/san-pham");
});
