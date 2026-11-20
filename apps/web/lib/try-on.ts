import { selectedProductColor } from "./product-selection";

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
  return ["tee", "hoodie", "jacket", "bomber"].includes(product.design?.kind || "") ||
    ["ao-phong", "ao-hoodie", "ao-khoac", "ao-bomber"].includes(product.category?.slug || "");
}

// Never substitute another colour's reference when preparing a try-on.
export function tryOnReference(product: TryOnProduct, color: string) {
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
