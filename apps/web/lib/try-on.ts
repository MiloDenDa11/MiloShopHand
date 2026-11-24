import { selectedProductColor } from "./product-selection";
import { preparedPhoto } from "./prepared-media";
import { productPhotoSource } from "./product-photo-source";

export const TRY_ON_MAX_BYTES = 8 * 1024 * 1024;
export const TRY_ON_MIN_EDGE = 512;
export const TRY_ON_MAX_PIXELS = 32_000_000;
export const TRY_ON_ACCEPT = "image/jpeg,image/png,image/webp";
export type TryOnPhotoMode = "upper-body" | "portrait";

export type TryOnVariant = {
  id: string;
  color: string;
  colorHex: string;
  size: string;
  price: number;
  available: number;
};
export type TryOnProduct = {
  id: string;
  slug: string;
  name: string;
  price: number;
  material?: string;
  fit?: string;
  category?: { name: string; slug: string };
  design?: { kind?: string } | null;
  variants: TryOnVariant[];
  images: { url: string; alt?: string; color?: string | null }[];
};

export function tryOnHref(slug: string, color?: string, size?: string) {
  const query = new URLSearchParams();
  if (color) query.set("color", color);
  if (size) query.set("size", size);
  return `/dung-thu/${encodeURIComponent(slug)}${query.size ? `?${query}` : ""}`;
}

export function tryOnSupports(product: TryOnProduct) {
  return ["tee", "polo", "hoodie", "jacket", "bomber"].includes(product.design?.kind || "") ||
    ["ao-phong", "ao-polo", "ao-hoodie", "ao-khoac", "ao-bomber"].includes(product.category?.slug || "");
}

// Only download static local artwork. Never export a full multi-view plate or
// atlas when its prepared crop is unavailable, and never fetch an external URL.
export function tryOnDownload(product: TryOnProduct, color: string) {
  if (!tryOnSupports(product)) return;
  const reference = tryOnReference(product, color);
  if (!reference || !/^\/(?:collection-ai|collection-spin|product-media|products|uploads)\/[a-z0-9/_-]+\.(?:png|jpe?g|webp)(?:\?[^#]*)?$/i.test(reference.url)) return;
  const media = productPhotoSource(reference.url);
  const crop = preparedPhoto(media);
  if (media.src.startsWith("/collection-ai/") || media.src.startsWith("/collection-spin/")) return crop?.src;
  return media.src;
}

export function tryOnPrompt(product: TryOnProduct, color: string, mode: TryOnPhotoMode) {
  if (!tryOnDownload(product, color)) return "";
  return [
    "Hãy tạo một ảnh thử trang phục từ hai ảnh tôi đính kèm: ảnh 1 là người cần thử áo, ảnh 2 là ảnh sản phẩm tham chiếu.",
    `Sản phẩm: ${product.name}. Thương hiệu: MiloShopHand. Màu đã chọn: ${color}.`,
    ...(product.material ? [`Chất liệu theo thông tin sản phẩm: ${product.material}.`] : []),
    ...(product.fit ? [`Phom áo theo thông tin sản phẩm: ${product.fit}.`] : []),
    "Cho người trong ảnh 1 mặc đúng thiết kế ở ảnh 2. Bám sát màu, cổ áo, tay áo, đường may, chất vải và vị trí logo trong ảnh sản phẩm. Không tự thêm chữ, logo, họa tiết hoặc phụ kiện.",
    "Giữ khuôn mặt, màu da và các đặc điểm nhận diện của người trong ảnh 1. Không làm đẹp hay thay đổi cơ thể ngoài phần trang phục cần thay. Giữ ánh sáng và bối cảnh tự nhiên.",
    mode === "portrait"
      ? "Ảnh 1 là chân dung: phần cơ thể không có trong ảnh chỉ có thể là mô phỏng. Không khẳng định đó là vóc dáng thật của tôi."
      : "Giữ tư thế và tỷ lệ cơ thể có thể nhìn thấy trong ảnh 1; thể hiện áo với nếp vải và độ rủ tự nhiên.",
    "Đây là ảnh minh họa phong cách, không phải phép đo cơ thể hay cam kết áo sẽ vừa size.",
    "Chỉ thực hiện nếu tài khoản của tôi còn hạn mức tạo ảnh có sẵn trong gói. Nếu hết hạn mức hoặc tính năng không được hỗ trợ, hãy dừng và thông báo; không đề xuất dùng API, mua credit hoặc dịch vụ trả thêm.",
  ].join("\n\n");
}

export function tryOnDownloadName(product: TryOnProduct, color: string, source: string) {
  const part = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
  const extension = source.match(/\.(png|jpe?g|webp)(?:\?|$)/i)?.[1].toLowerCase() || "webp";
  return `miloshophand-${part(product.slug) || "san-pham"}-${part(color) || "mau"}.${extension}`;
}

// Never substitute another colour's reference when preparing a try-on.
export function tryOnReference(product: TryOnProduct, color: string) {
  if (!product.variants.some((variant) => variant.color === color)) return;
  const images = (product.images || []).filter((image) => /^(\/(?!\/)|https:\/\/)/.test(image.url));
  const exact = images.find((image) => image.color === color);
  const colors = new Set(product.variants.map((variant) => variant.color));
  return exact || (colors.size === 1 ? images.find((image) => !image.color) : undefined);
}

export function initialTryOnSelection(product: TryOnProduct, color?: string, size?: string) {
  const chosen = selectedProductColor(product, color);
  const variant = product.variants.find((item) => item.color === chosen && item.size === size && item.available > 0);
  return { color: chosen, size: variant?.size || "" };
}

export function tryOnPhotoError(file: { type: string; size: number }) {
  if (!TRY_ON_ACCEPT.split(",").includes(file.type)) return "Chọn ảnh JPG, PNG hoặc WebP. Nếu ảnh là HEIC, hãy xuất sang JPG trước.";
  if (!file.size) return "Tệp ảnh trống. Hãy chọn ảnh khác.";
  if (file.size > TRY_ON_MAX_BYTES) return "Ảnh vượt quá 8 MB. Hãy chọn ảnh nhẹ hơn.";
  return "";
}

export function tryOnDimensionsError(width: number, height: number) {
  if (Math.min(width, height) < TRY_ON_MIN_EDGE) return "Ảnh quá nhỏ. Hãy chọn ảnh có chiều rộng và chiều cao từ 512 px.";
  if (width * height > TRY_ON_MAX_PIXELS) return "Ảnh có độ phân giải quá lớn. Hãy chọn ảnh dưới 32 megapixel.";
  return "";
}

export function tryOnImageSignature(bytes: Uint8Array, type: string) {
  if (type === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/png") return [137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => bytes[i] === byte);
  if (type === "image/webp") return [82, 73, 70, 70].every((byte, i) => bytes[i] === byte) && [87, 69, 66, 80].every((byte, i) => bytes[i + 8] === byte);
  return false;
}
