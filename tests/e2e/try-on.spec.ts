import { test, expect, type Page } from "@playwright/test";
import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { polos } from "../fixtures/try-on-catalog.mjs";
import sources from "../../apps/web/content/prepared-media.json";

test.skip(!process.env.TRY_ON_FIXTURES, "Run npm run test:try-on with the isolated read-only catalog.");

const slug = polos[0].slug;
const stage = (page: Page) => page.locator(".try-on-main:visible");
const runtimeErrors = new WeakMap<Page, string[]>();
const externalRequests = new WeakMap<Page, string[]>();
const mutations = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page, context, baseURL }) => {
  const errors: string[] = [];
  runtimeErrors.set(page, errors);
  const external: string[] = [], writes: string[] = [];
  externalRequests.set(page, external); mutations.set(page, writes);
  await context.route("**/*", route => {
    const url = new URL(route.request().url());
    if (["http:", "https:"].includes(url.protocol) && url.origin !== new URL(baseURL!).origin) {
      external.push(url.toString());
      return route.abort();
    }
    return route.continue();
  });
  page.on("request", request => { if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method())) writes.push(request.url()); });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (/hydration|cannot be a descendant|cannot contain|TypeError|ReferenceError|Unhandled/i.test(message.text())) errors.push(message.text()); });
});
test.afterEach(async ({ page }) => {
  expect(runtimeErrors.get(page)).toEqual([]);
  expect(externalRequests.get(page), "No unsolicited external traffic").toEqual([]);
  expect(mutations.get(page), "No photo upload, AI call, or catalog write").toEqual([]);
});
async function fixturePhoto(width = 640, height = 960) {
  return { name: "test-photo.png", mimeType: "image/png", buffer: await sharp({ create: { width, height, channels: 3, background: "#c7c2b5" } }).png().toBuffer() };
}
async function upload(page: Page) {
  await stage(page).getByLabel("Chọn ảnh của bạn", { exact: true }).setInputFiles(await fixturePhoto());
  await expect(page.getByAltText("Ảnh bạn đã chọn để dùng thử", { exact: true })).toBeVisible();
}
async function handoff(page: Page) {
  await stage(page).getByRole("button", { name: "Tiếp tục", exact: true }).click();
  await page.getByRole("checkbox").check();
  await stage(page).getByRole("button", { name: "Chuẩn bị ảnh & prompt", exact: true }).click();
  await expect(page.getByLabel("Prompt thử áo", { exact: true })).toBeVisible();
}
async function snapshot(page: Page, name: string) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  });
  mkdirSync(".local/try-on-manual", { recursive: true });
  await page.screenshot({ path: `.local/try-on-manual/${name}.png`, fullPage: true, caret: "initial" });
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

test("chuẩn bị ảnh và prompt thủ công; không gửi ảnh hoặc lưu dữ liệu cá nhân", async ({ page }) => {
  await page.goto(`/dung-thu/${slug}`);
  await expect(page.getByText("Thao tác thủ công · AI chưa kết nối", { exact: true })).toBeVisible();
  await snapshot(page, "desktop-upload");
  await upload(page);
  await stage(page).getByRole("button", { name: "Tiếp tục", exact: true }).click();
  const confirm = stage(page).getByRole("button", { name: "Chuẩn bị ảnh & prompt", exact: true });
  await expect(confirm).toBeDisabled();
  await page.getByRole("checkbox").check();
  await confirm.click();
  await expect(page.getByLabel("Prompt thử áo", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Tạo ảnh dùng thử/ })).toHaveCount(0);
  await expect(page.getByText(/AI trên website chưa kết nối/)).toBeVisible();
  await snapshot(page, "desktop-handoff");
  expect(await page.evaluate(() => Object.keys(localStorage).filter((key) => /try.?on|photo|dung.?thu/i.test(key)))).toEqual([]);
  await page.reload();
  await expect(page.getByAltText("Ảnh bạn đã chọn để dùng thử", { exact: true })).toHaveCount(0);
  await expect(stage(page).getByRole("button", { name: "Tiếp tục", exact: true })).toBeEnabled();
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
  await page.goto("/dung-thu/fixture-missing-color?color=Tr%E1%BA%AFng");
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
  await snapshot(page, "mobile-confirm");
  await page.getByRole("checkbox").check();
  await stage(page).getByRole("button", { name: "Chuẩn bị ảnh & prompt", exact: true }).click();
  await expect(stage(page).getByRole("heading", { name: "Mang thiết kế vào ChatGPT.", exact: true })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await snapshot(page, "mobile-handoff");
});

test("không cần chọn ảnh cá nhân trên website để lấy ảnh sản phẩm và prompt", async ({ page }) => {
  await page.goto(`/dung-thu/${slug}`);
  await handoff(page);
  await expect(page.getByRole("link", { name: "Tải ảnh sản phẩm", exact: true })).toBeVisible();
  await expect(page.getByLabel("Prompt thử áo", { exact: true })).toHaveValue(/MiloShopHand/);
  await expect(page.getByText(/Milo không kiểm tra hoặc kiểm soát hạn mức/)).toBeVisible();
  await page.getByRole("button", { name: "Xóa ảnh của tôi", exact: true }).click();
  await expect(stage(page).getByRole("heading", { name: "Bắt đầu từ ảnh của bạn.", exact: true })).toBeVisible();
});

test("sao chép prompt và chọn văn bản thủ công khi clipboard bị từ chối", async ({ page }) => {
  await page.goto(`/dung-thu/${slug}`);
  await handoff(page);
  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (value: string) => { (window as any).copiedTryOnPrompt = value; } } }));
  await page.getByRole("button", { name: "Sao chép prompt", exact: true }).click();
  const value = await page.getByLabel("Prompt thử áo", { exact: true }).inputValue();
  expect(await page.evaluate(() => (window as any).copiedTryOnPrompt)).toBe(value);
  await expect(page.getByRole("status").filter({ hasText: "Đã sao chép prompt" })).toBeVisible();
  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("Permission denied fixture"); } } }));
  await page.getByRole("button", { name: "Sao chép prompt", exact: true }).click();
  const textarea = page.getByLabel("Prompt thử áo", { exact: true });
  await expect(textarea).toBeFocused();
  expect(await textarea.evaluate((element: HTMLTextAreaElement) => element.selectionEnd - element.selectionStart)).toBe(value.length);
  await expect(page.getByText(/Không thể sao chép tự động/)).toBeVisible();
});

test("link ChatGPT chỉ mở sau khi bấm, không kèm prompt, ảnh, tài khoản hay referrer", async ({ page, context }) => {
  await page.goto(`/dung-thu/${slug}`);
  await upload(page);
  await handoff(page);
  const link = page.getByRole("link", { name: "Mở ChatGPT", exact: true });
  await expect(link).toHaveAttribute("href", "https://chatgpt.com/");
  await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  const requests: { method: string; body: string | null; referer?: string }[] = [];
  await context.route("https://chatgpt.com/**", async route => {
    const request = route.request();
    requests.push({ method: request.method(), body: request.postData(), referer: request.headers().referer });
    await route.fulfill({ contentType: "text/html", body: "<html><body>Local navigation fixture</body></html>" });
  });
  const popupPromise = page.waitForEvent("popup");
  await link.click();
  const popup = await popupPromise;
  await popup.waitForLoadState("domcontentloaded");
  expect(popup.url()).toBe("https://chatgpt.com/");
  expect(await popup.evaluate(() => window.opener === null)).toBe(true);
  expect(requests).toEqual([{ method: "GET", body: null, referer: undefined }]);
  await popup.close();
});

for (const product of polos) test(`polo ${product.slug}: tải đúng ảnh và prompt của đủ 4 màu`, async ({ page, request }) => {
  await page.goto(`/dung-thu/${product.slug}`);
  for (const image of product.images) {
    await page.getByRole("button", { name: `Dùng thử màu ${image.color}`, exact: true }).click();
    await handoff(page);
    const source = image.url.split("?")[0];
    const hash = sources[source as keyof typeof sources][0];
    const expected = `/product-media/${hash}-v1-front-768.webp`;
    const link = page.getByRole("link", { name: "Tải ảnh sản phẩm", exact: true });
    await expect(link).toHaveAttribute("href", expected);
    const response = await request.get(expected);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("image/webp");
    const bytes = await response.body();
    expect(bytes.equals(await readFile(resolve("apps/web/public", expected.slice(1))))).toBe(true);
    const metadata = await sharp(bytes).metadata();
    expect([metadata.width, metadata.height]).toEqual([768, 1024]);
    const prompt = await page.getByLabel("Prompt thử áo", { exact: true }).inputValue();
    expect(prompt).toContain(product.name); expect(prompt).toContain(`Màu đã chọn: ${image.color}.`);
    if (image === product.images[0]) {
      const downloadPromise = page.waitForEvent("download");
      await link.click();
      const download = await downloadPromise;
      expect(await download.failure()).toBeNull();
      expect(download.suggestedFilename()).toContain(product.slug);
      expect((await readFile((await download.path())!)).equals(bytes)).toBe(true);
    }
  }
});

test("sản phẩm không tồn tại có đường quay về danh mục", async ({ page }) => {
  await page.goto("/dung-thu/san-pham-khong-ton-tai");
  await expect(page.getByRole("heading", { name: "Chưa mở được phòng thử.", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /Chọn sản phẩm khác/ })).toHaveAttribute("href", "/san-pham");
});
