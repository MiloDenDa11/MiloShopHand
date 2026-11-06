"use client";
import { useState, useEffect } from "react";
import Image from "next/image";
import dynamic from "next/dynamic";
import { miloDesignText } from "../lib/milo-design";
import { designPhotoUrl } from "../../../packages/shared/src/design-photo";
const ColorPhoto=dynamic(()=>import("./color-photo"),{ssr:false});

export function isRealPhoto(
  image:
    | { url?: string; src?: string; alt?: string }
    | string
    | undefined
    | null,
): boolean {
  if (!image) return false;
  const url = typeof image === "string" ? image : image.url || image.src || "";
  // Illustrations and AI mockups are valid product media as well. Provenance is
  // displayed separately; filtering these here used to hide every seed image.
  return (
    !!url &&
    /^(\/(?!\/)|https:\/\/)/.test(url)
  );
}
export const realProductImages = (p: any) =>
  (p?.images || []).filter((i: any) => isRealPhoto(i)).map((i:any)=>typeof i.alt==="string"?{...i,alt:miloDesignText(i.alt)}:i);
export function productImagesForColor(product: any, color: string, variantOverride?:any) {
  const images = realProductImages(product), exact = images.filter((i:any)=>i.color === color), generic = images.filter((i:any)=>!i.color);
  if(exact.length)return exact;
  const fallback=generic.length?generic:images.filter((i:any)=>i.color===images[0]?.color);
  const variant=variantOverride||product.variants?.find((v:any)=>v.color===color);
  return fallback.map((image:any)=>{
    const url=designPhotoUrl(image,variant,product.design);
    if(url===image.url)return image;
    const alt=image.alt?(image.color?image.alt.split(image.color).join(color):`${image.alt} — ${color}`):`${product.name} — ${color} — Milo Design`;
    return {...image,url,color,alt};
  });
}
export type ProductPhotoSource={src:string;view:string|null;atlas?:{columns:number;rows:number;frame:number;aspect:number};colorPreview?:{targetHex:string;sourceHex:string}};
export function productPhotoSource(source: string):ProductPhotoSource {
  const url = new URL(source, "https://milo.local");
  const selected=url.searchParams.get("miloColor"),base=url.searchParams.get("baseColor");
  const preview=selected&&base&&/^[a-f0-9]{6}$/i.test(selected)&&/^[a-f0-9]{6}$/i.test(base)&&/^\/(?:collection-(?:ai|spin)\/|products\/)/.test(url.pathname)?{colorPreview:{targetHex:`#${selected}`,sourceHex:`#${base}`}}:{};
  if(preview.colorPreview){url.searchParams.delete("miloColor");url.searchParams.delete("baseColor");}
  if(url.pathname.startsWith("/collection-spin/")){
    const columns=Number(url.searchParams.get("cols")),rows=Number(url.searchParams.get("rows")),frame=Number(url.searchParams.get("frame")),aspect=Number(url.searchParams.get("ar"));
    if(Number.isInteger(columns)&&Number.isInteger(rows)&&Number.isInteger(frame)&&columns>0&&columns<=24&&rows>0&&rows<=24&&frame>=0&&frame<columns*rows&&Number.isFinite(aspect)&&aspect>.2&&aspect<4){
      for(const key of ["cols","rows","frame","ar"])url.searchParams.delete(key);
      return {src:url.pathname+url.search,view:null,atlas:{columns,rows,frame,aspect},...preview};
    }
  }
  const requested = url.searchParams.get("view");
  const plate = url.pathname.startsWith("/collection-ai/");
  const view = plate && (!requested || ["front", "back"].includes(requested)) ? requested || "front" : null;
  if (view) url.searchParams.delete("view");
  return { src: source.startsWith("/") ? url.pathname + url.search : url.toString(), view,...preview };
}
export function ProductPhoto({
  src,
  alt: originalAlt,
  className = "",
  loading = "lazy",
  onClick,
  sizes = "(max-width: 760px) 50vw, (max-width: 1100px) 33vw, 25vw",
}: {
  src?: string;
  alt: string;
  className?: string;
  loading?: "lazy" | "eager";
  onClick?: () => void;
  sizes?: string;
}) {
  const [failed, setFailed] = useState(false);
  const alt=miloDesignText(originalAlt);
  useEffect(() => setFailed(false), [src]);
  if (!src || !isRealPhoto(src)) return null;
  const media = productPhotoSource(src);
  // A two-panel plate must supply twice the displayed panel width. Both views
  // still request the same optimized source URL, sharing the browser cache.
  const multiplier=media.view?2:media.atlas?.columns||1;
  const sourceSizes = multiplier>1 ? sizes.replace(/([\d.]+)(vw|px)(?=\s*(?:,|$))/g, (_, value, unit) => `${Number(value) * multiplier}${unit}`) : sizes;
  if (failed)
    return (
      <span className={`product-photo-frame photo-error ${className}`} role="status">
        Ảnh chưa tải được.
        <button type="button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); setFailed(false); }}>
          Thử lại
        </button>
      </span>
    );
  return (
    <span className={`product-photo-frame ${className}`} data-product-view={media.view || "full"} onClick={onClick}>
    {media.atlas ? <span className="product-atlas-viewport" style={{position:"absolute",width:"100%",aspectRatio:String(media.atlas.aspect),top:"50%",transform:"translateY(-50%)",overflow:"hidden"}}>
      <Image src={media.src} alt={alt} width={media.atlas.columns*512} height={Math.round(media.atlas.rows*512/media.atlas.aspect)} sizes={sourceSizes} loading={loading} decoding="async" onError={()=>setFailed(true)} style={{position:"absolute",width:`${media.atlas.columns*100}%`,height:`${media.atlas.rows*100}%`,left:`-${media.atlas.frame%media.atlas.columns*100}%`,top:`-${Math.floor(media.atlas.frame/media.atlas.columns)*100}%`,maxWidth:"none",maxHeight:"none"}}/>
    </span> :
    <Image
      className="product-photo-image"
      src={media.src}
      alt={alt}
      width={media.view ? 1774 : 768}
      height={media.view ? 887 : 1024}
      sizes={sourceSizes}
      loading={loading}
      fetchPriority={loading === "eager" ? "high" : "auto"}
      decoding="async"
      unoptimized={/\.svg(?:[?#]|$)/i.test(media.src) || !media.src.startsWith("/")}
      onError={() => setFailed(true)}
      style={media.view ? { position: "absolute", left: media.view === "back" ? "-100%" : 0, top: "50%", transform: "translateY(-50%)", width: "200%", height: "auto", aspectRatio: "2 / 1", maxWidth: "none", maxHeight: "none", objectFit: "contain" } : { width: "100%", height: "100%", objectFit: "contain" }}
    />}
    {media.colorPreview&&<ColorPhoto media={media} preview={media.colorPreview} name={alt}/>}
    </span>
  );
}
