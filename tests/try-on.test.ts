import { test } from "node:test";
import assert from "node:assert/strict";
import { initialTryOnSelection, TRY_ON_MAX_BYTES, tryOnDimensionsError, tryOnHref, tryOnImageSignature, tryOnPhotoError, tryOnReference, tryOnSupports, type TryOnProduct } from "../apps/web/lib/try-on";
import { productSelectionHref, selectedProductSize } from "../apps/web/lib/product-selection";

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
