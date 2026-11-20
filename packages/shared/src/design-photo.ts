type VariantColor={color:string;colorHex:string};
type DesignPhoto={url:string;color?:string|null;view?:string|null};

// Keep native image identity in cart/order snapshots. No browser tint recipes.
export function designPhotoUrl(image:DesignPhoto|undefined,_variant?:VariantColor,_design?:unknown):string {
  return image?.url ?? "";
}
