type PreviewProduct = {
  design?: { commercialStatus?: string } | null;
  variants?: { size?: string; active?: boolean }[];
};

// Placeholder sizes are display colourways, never selectable sale sizes.
// Once the merchant replaces/disables them, normal stock handling resumes.
export function isUnreleasedDesign(product: PreviewProduct): boolean {
  const variants = product.variants?.filter(variant => variant.active !== false);
  return product.design?.commercialStatus === "preview" &&
    (!variants?.length || variants.some(variant => variant.size === "Chưa chốt"));
}
