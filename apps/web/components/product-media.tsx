"use client";
import { useState, useEffect, useRef, type SyntheticEvent } from "react";
import Image from "next/image";
import { miloDesignText } from "../lib/milo-design";
import { preparedPhoto } from "../lib/prepared-media";
import { productPhotoSource } from "../lib/product-photo-source";
export { productPhotoSource, type ProductPhotoSource } from "../lib/product-photo-source";

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
export function productImagesForColor(product: any, color: string, _variantOverride?:any) {
  const images = realProductImages(product), exact = images.filter((i:any)=>i.color === color), generic = images.filter((i:any)=>!i.color);
  if(exact.length)return exact;
  const fallback=generic.length?generic:images.filter((i:any)=>i.color===images[0]?.color);
  return fallback;
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
  const [canRetry, setCanRetry] = useState(true);
  const frame = useRef<HTMLSpanElement>(null);
  function markImageFailed(image: HTMLImageElement) {
    setCanRetry(!image.closest("a,button"));
    setFailed(true);
  }
  function imageFailed(event: SyntheticEvent<HTMLImageElement>) {
    // A retry button inside an image link/gallery button is invalid HTML and
    // can trigger hydration errors. Nested controls retain a passive fallback.
    markImageFailed(event.currentTarget);
  }
  const alt=miloDesignText(originalAlt);
  useEffect(() => {
    setFailed(false);
    // A server-rendered image may fail before React attaches onError.
    const image = frame.current?.querySelector("img");
    if (image?.complete && image.naturalWidth === 0) markImageFailed(image);
  }, [src]);
  if (!src || !isRealPhoto(src)) return null;
  const media = productPhotoSource(src);
  const prepared = preparedPhoto(media);
  // A two-panel plate must supply twice the displayed panel width. Both views
  // still request the same optimized source URL, sharing the browser cache.
  const multiplier=media.view?2:media.atlas?.columns||1;
  const sourceSizes = multiplier>1 ? sizes.replace(/([\d.]+)(vw|px)(?=\s*(?:,|$))/g, (_, value, unit) => `${Number(value) * multiplier}${unit}`) : sizes;
  if (failed)
    return (
      <span ref={frame} className={`product-photo-frame photo-error ${className}`} role="status">
        Ảnh chưa tải được.
        {canRetry ? <button type="button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); setFailed(false); }}>
          Thử lại
        </button> : <small>Tải lại trang hoặc mở lại ảnh để thử lại.</small>}
      </span>
    );
  return (
    <span ref={frame} className={`product-photo-frame ${className}`} data-product-view={media.view || "full"} onClick={onClick}>
    {prepared ? <img className="product-photo-image" src={prepared.src} srcSet={prepared.srcSet} sizes={sizes} width={prepared.width} height={prepared.height} alt={alt} loading={loading} fetchPriority={loading === "eager" ? "high" : "auto"} decoding="async" onError={imageFailed} style={{width:"100%",height:"100%",objectFit:"contain"}}/> : media.atlas ? <span className="product-atlas-viewport" style={{position:"absolute",width:"100%",aspectRatio:String(media.atlas.aspect),top:"50%",transform:"translateY(-50%)",overflow:"hidden"}}>
      <Image src={media.src} alt={alt} width={media.atlas.columns*512} height={Math.round(media.atlas.rows*512/media.atlas.aspect)} sizes={sourceSizes} loading={loading} decoding="async" onError={imageFailed} style={{position:"absolute",width:`${media.atlas.columns*100}%`,height:`${media.atlas.rows*100}%`,left:`-${media.atlas.frame%media.atlas.columns*100}%`,top:`-${Math.floor(media.atlas.frame/media.atlas.columns)*100}%`,maxWidth:"none",maxHeight:"none"}}/>
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
      onError={imageFailed}
      style={media.view ? { position: "absolute", left: media.view === "back" ? "-100%" : 0, top: "50%", transform: "translateY(-50%)", width: "200%", height: "auto", aspectRatio: "2 / 1", maxWidth: "none", maxHeight: "none", objectFit: "contain" } : { width: "100%", height: "100%", objectFit: "contain" }}
    />}
    </span>
  );
}
