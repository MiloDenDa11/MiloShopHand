export function selectedProductColor(product: any, requested?: string): string {
  const variants: { color: string }[] = product?.variants || [];
  return variants.some((variant) => variant.color === requested)
    ? requested!
    : variants[0]?.color || "";
}

export function selectedProductSize(product: any, color: string, requested?: string): string {
  return product?.variants?.some((variant: any) => variant.color === color && variant.size === requested && variant.available > 0)
    ? requested! : "";
}

export function productSelectionHref(slug: string, color?: string, size?: string): string {
  // Keep the established colour URL format for existing catalog links.
  return `/san-pham/${encodeURIComponent(slug)}${color ? `?color=${encodeURIComponent(color)}${size ? `&size=${encodeURIComponent(size)}` : ""}` : size ? `?size=${encodeURIComponent(size)}` : ""}`;
}
