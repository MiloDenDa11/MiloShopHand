import { test } from "node:test";
import assert from "node:assert/strict";
import { initialTryOnSelection, TRY_ON_MAX_BYTES, tryOnDimensionsError, tryOnDownload, tryOnDownloadName, tryOnHref, tryOnImageSignature, tryOnPhotoError, tryOnPrompt, tryOnReference, tryOnSupports, type TryOnProduct } from "../apps/web/lib/try-on";
import { productSelectionHref, selectedProductSize } from "../apps/web/lib/product-selection";
import sources from "../apps/web/content/prepared-media.json";
import polos from "../apps/web/content/polo-designs.json";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const product: TryOnProduct = {
  id: "tee", slug: "test-tee", name: "Test Tee", price: 250000,
  category: { name: "Áo phông", slug: "ao-phong" },
  variants: [
    { id: "black-m", color: "Đen", colorHex: "#151515", size: "M", price: 250000, available: 3 },
    { id: "black-l", color: "Đen", colorHex: "#151515", size: "L", price: 250000, available: 0 },
    { id: "white-m", color: "Trắng", colorHex: "#f8f7f2", size: "M", price: 260000, available: 2 },
  ],
  images: [{ url: "/black.png", color: "Đen" }, { url: "/generic.png" }],
};

test("dùng thử giữ đúng màu/size, bỏ size sai hoặc hết hàng", () => {
  assert.deepEqual(initialTryOnSelection(product, "Trắng", "M"), { color: "Trắng", size: "M" });
  assert.deepEqual(initialTryOnSelection(product, "không có", "L"), { color: "Đen", size: "" });
  assert.equal(selectedProductSize(product, "Đen", "L"), "");
  assert.equal(selectedProductSize(product, "Trắng", "XL"), "");
  const url = new URL(tryOnHref("test-tee", "Trắng", "M"), "http://milo.test");
  assert.equal(url.pathname, "/dung-thu/test-tee");
  assert.equal(url.searchParams.get("color"), "Trắng");
  assert.equal(url.searchParams.get("size"), "M");
  assert.equal(productSelectionHref("test-tee", "Đen"), "/san-pham/test-tee?color=%C4%90en");
  assert.match(productSelectionHref("test-tee", "Trắng", "M"), /&size=M$/);
});

test("không dùng ảnh màu khác hoặc URL không an toàn làm đầu vào", () => {
  assert.equal(tryOnReference(product, "Đen")?.url, "/black.png");
  assert.equal(tryOnReference(product, "Trắng"), undefined);
  assert.equal(tryOnReference({ ...product, variants: [product.variants[0]], images: [{ url: "/generic.png" }] }, "không có"), undefined);
  assert.equal(tryOnReference({ ...product, images: [{ url: "//untrusted.test/tee.png", color: "Trắng" }] }, "Trắng"), undefined);
  assert.equal(tryOnReference({ ...product, images: [{ url: "javascript:alert(1)", color: "Đen" }] }, "Đen"), undefined);
  assert.equal(tryOnReference({ ...product, variants: [product.variants[0]], images: [{ url: "/generic.png" }] }, "Đen")?.url, "/generic.png");
  assert.equal(tryOnSupports(product), true);
  assert.equal(tryOnSupports({ ...product, category: { name: "Kính", slug: "kinh" }, design: null }), false);
});

test("ảnh cá nhân chặn tệp trống, quá dung lượng và định dạng không hỗ trợ", () => {
  assert.equal(tryOnPhotoError({ type: "image/jpeg", size: TRY_ON_MAX_BYTES }), "");
  assert.match(tryOnPhotoError({ type: "image/jpeg", size: TRY_ON_MAX_BYTES + 1 }), /8 MB/);
  assert.match(tryOnPhotoError({ type: "image/png", size: 0 }), /trống/);
  for (const type of ["image/svg+xml", "image/gif", "image/heic", "text/html", ""]) assert.ok(tryOnPhotoError({ type, size: 1000 }));
});

test("kiểm tra chữ ký nội dung thay vì chỉ tin MIME/đuôi tệp", () => {
  assert.equal(tryOnImageSignature(Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]), "image/png"), true);
  assert.equal(tryOnImageSignature(Uint8Array.from([255, 216, 255, 224]), "image/jpeg"), true);
  assert.equal(tryOnImageSignature(new TextEncoder().encode("RIFF1234WEBP"), "image/webp"), true);
  assert.equal(tryOnImageSignature(new TextEncoder().encode("<svg>fake</svg>"), "image/png"), false);
  assert.equal(tryOnImageSignature(Uint8Array.from([255, 216, 255]), "image/png"), false);
  assert.equal(tryOnImageSignature(new Uint8Array(), "image/webp"), false);
});

test("ảnh cần đủ chi tiết, giới hạn độ phân giải trước bước xác nhận", () => {
  assert.equal(tryOnDimensionsError(512, 512), "");
  assert.equal(tryOnDimensionsError(4000, 8000), "");
  assert.match(tryOnDimensionsError(511, 960), /512/);
  assert.match(tryOnDimensionsError(8000, 8000), /32 megapixel/);
});

test("tải ảnh chặn URL bên ngoài, file chủ động, đường dẫn API và ảnh ghép chưa chuẩn bị", () => {
  for (const url of ["https://external.test/tee.png", "//external.test/tee.png", "blob:photo", "data:image/png,fake", "/api/v1/export.png", "/products/tee.svg", "/products/../secret.png", "/products/%2e%2e/secret.png", "/collection-ai/unprepared.png?view=front", "/collection-spin/unprepared/part-0.png?cols=3&rows=2&frame=0&ar=.8"]) {
    const value = { ...product, images: [{ url, color: "Đen" }] };
    assert.equal(tryOnDownload(value, "Đen"), undefined, url);
    assert.equal(tryOnPrompt(value, "Đen", "upper-body"), "");
  }
  assert.equal(tryOnDownload(product, "Trắng"), undefined, "không dùng ảnh chung thay ảnh màu Trắng");
  assert.equal(tryOnDownload({ ...product, images: [{ url: "/products/tee.png?v=1", color: "Đen" }] }, "Đen"), "/products/tee.png?v=1");
});

test("40 màu polo dùng ảnh cắt đúng nguồn đã duyệt, không tải nguyên tấm hai mặt", () => {
  const downloads = new Set<string>();
  for (const design of polos) {
    const item: TryOnProduct = { ...product, slug: design.slug, name: design.name, design: { kind: "polo" }, category: { name: "Áo polo", slug: "ao-polo" }, variants: design.colors.map((color) => ({ ...product.variants[0], color: color.name, colorHex: color.hex })), images: design.colors.map((color) => ({ url: `${color.image}?view=front`, color: color.name })) };
    assert.equal(tryOnSupports(item), true);
    for (const color of design.colors) {
      const entry = sources[color.image as keyof typeof sources];
      const download = tryOnDownload(item, color.name)!;
      assert.equal(download, `/product-media/${entry[0]}-v1-front-768.webp`);
      assert.ok(existsSync(resolve("apps/web/public", download.slice(1))), download);
      assert.equal(tryOnDownload({ ...item, images: [{ url: `${color.image}?view=front&v=unknown`, color: color.name }] }, color.name), undefined);
      downloads.add(download);
    }
  }
  assert.equal(downloads.size, 40);
});

test("ảnh xoay chỉ tải một góc đã chuẩn bị, không trả về atlas nguyên tấm", () => {
  const [source, entry] = Object.entries(sources).find(([path, value]) => value[3] === "a" && path.endsWith("/part-0.png"))!;
  const item = { ...product, images: [{ url: `${source}?cols=3&rows=2&frame=0&ar=.8`, color: "Đen" }] };
  assert.equal(tryOnDownload(item, "Đen"), `/product-media/${entry[0]}-v1-cell-512.webp`);
  assert.equal(tryOnDownload({ ...item, images: [{ url: source, color: "Đen" }] }, "Đen"), undefined);
});

test("prompt theo đúng sản phẩm và chế độ; tên tải có màu và phần mở rộng phù hợp", () => {
  const item = { ...product, material: "Cotton piqué", fit: "Regular fit", images: [{ url: "/products/tee.png", color: "Đen" }] };
  const prompt = tryOnPrompt(item, "Đen", "upper-body");
  assert.match(prompt, /Test Tee/); assert.match(prompt, /Màu đã chọn: Đen/);
  assert.match(prompt, /Cotton piqué/); assert.match(prompt, /Regular fit/);
  assert.match(prompt, /vị trí logo/); assert.match(prompt, /không phải phép đo/);
  assert.match(prompt, /Nếu hết hạn mức/); assert.doesNotMatch(prompt, /Trắng/);
  assert.match(tryOnPrompt(item, "Đen", "portrait"), /Ảnh 1 là chân dung/);
  assert.doesNotMatch(prompt, /Ảnh 1 là chân dung/);
  assert.equal(tryOnDownloadName(item, "Đỏ mận / nâu", "/product-media/abc.webp"), "miloshophand-test-tee-do-man-nau.webp");
  assert.equal(tryOnDownloadName(item, "Đen", "/products/tee.png?v=1"), "miloshophand-test-tee-den.png");
});
