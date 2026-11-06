type VariantColor={color:string;colorHex:string};
type DesignPhoto={url:string;color?:string|null;view?:string|null};
const hex=/^#[a-f0-9]{6}$/i;

// A display-only colour recipe travels with the gallery/cart/order image URL.
// Exact photographs always take priority. No source file is overwritten.
export function designPhotoUrl(image:DesignPhoto|undefined,variant:VariantColor|undefined,design:any):string {
  if(!image)return "";
  if(!variant||image.color===variant.color||design?.mediaPresentation!=="photo"||!hex.test(design.photoReferenceColorHex||"")||!hex.test(variant.colorHex))return image.url;
  if(design.photoReferenceColorHex.toLowerCase()===variant.colorHex.toLowerCase()||!/^\/(?:collection-(?:ai|spin)\/|products\/)/.test(image.url))return image.url;
  const url=new URL(image.url,"https://milo.local");
  url.searchParams.set("miloColor",variant.colorHex.slice(1).toLowerCase());
  url.searchParams.set("baseColor",design.photoReferenceColorHex.slice(1).toLowerCase());
  return url.pathname+url.search;
}
