"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Heart, ArrowUpRight, Sparkles } from "lucide-react";
import { useShop, money } from "./client";
import { productSelectionHref } from "../lib/product-selection";
import { tryOnHref, tryOnSupports } from "../lib/try-on";
import { isUnreleasedDesign } from "../lib/product-preview";
import { ProductPhoto, realProductImages, productImagesForColor } from "./product-media";
import { ProductCardPreview } from "./product-card-preview";
import { displaySpinFor } from "../lib/display-spin";
export function ProductCard({
  product: p,
  index = 0,
  badge,
}: {
  product: any;
  index?: number;
  badge?: string;
}) {
  const { user, notify, wishlistIds, wishlistPending, toggleWishlist } = useShop();
  const [interactive,setInteractive]=useState(false);
  useEffect(()=>setInteractive(true),[]);
  const [color, setColor] = useState(p.variants?.[0]?.color || "");
  const saved = wishlistIds.includes(p.id), saving = wishlistPending.includes(p.id);
  const detailHref = productSelectionHref(p.slug, color);
  const availablePhotos = realProductImages(p),
    matchingPhotos = productImagesForColor(p,color),
    photos = matchingPhotos.length ? matchingPhotos : availablePhotos,
    chosen = photos[0],
    alternate = photos.find(
      (i: any) =>
        i.url !== chosen?.url && (!i.color || i.color === chosen?.color),
    );
  const colors = [
    ...new Map(
      (p.variants || []).map((v: any) => [
        v.color,
        { name: v.color, hex: v.colorHex },
      ]),
    ).values(),
  ] as { name: string; hex: string }[];
  const colorHex=p.variants?.find((variant:any)=>variant.color===color)?.colorHex;
  const hasColorPhoto=(value:string)=>availablePhotos.some((image:any)=>image.color===value);
  const photoPending=!!color&&colors.length>1&&!hasColorPhoto(color);
  const referenceColor=availablePhotos.find((image:any)=>colors.some(c=>c.name===image.color))?.color;
  const spin=useMemo(()=>displaySpinFor(p,colorHex),[p,colorHex]);
  const preview = isUnreleasedDesign(p);
  const soldOut =
      p.variants?.length && p.variants.every((v: any) => v.available === 0),
    limited = p.collections?.some((c: any) =>
      /limited/i.test(c.campaign || c.name),
    );
  async function wish() {
    if (!user) {
      notify("Đăng nhập để lưu sản phẩm yêu thích.");
      return;
    }
    try {
      const nextSaved = await toggleWishlist(p.id);
      if (typeof nextSaved === "boolean")
        notify(nextSaved ? "Đã lưu vào yêu thích." : "Đã bỏ yêu thích.");
    } catch (e: any) {
      notify(e.message);
    }
  }
  return (
    <article
      className={`product-card ${chosen ? "product-card--photo" : "product-card--text"}`}
      data-selected-color={color}
      data-color-photo-status={photoPending?"pending":chosen?"ready":"missing"}
    >
      <div className="product-card-topline">
        <span className="eyebrow">{p.category?.name}</span>
        <button
          className={`wish ${saved ? "saved" : ""}`}
          disabled={!interactive || saving}
          aria-label={`${saved ? "Bỏ yêu thích" : "Yêu thích"} ${p.name}`}
          aria-busy={saving}
          aria-pressed={saved}
          onClick={wish}
        >
          <Heart size={19} fill={saved ? "currentColor" : "none"} />
        </button>
      </div>
      {chosen && (
        <div className="product-visual">
          <ProductCardPreview key={color} href={detailHref} name={p.name} spin={photoPending?null:spin}>
            {photoPending ? <div className="product-card-color-pending" role="status">
              <span className="product-card-pending-swatch" style={{background:colorHex}} aria-hidden="true" />
              <strong>{/^màu /i.test(color)?color:`Màu ${color}`}</strong>
              <span>Ảnh màu này đang cập nhật</span>
            </div> : <>
            <ProductPhoto
              key={chosen.url}
              src={chosen.url}
              alt={chosen.alt || p.name}
              loading={index < 2 ? "eager" : "lazy"}
              className="product-photo-primary"
            />
            {!spin && alternate && (
              <ProductPhoto
                src={alternate.url}
                alt={alternate.alt || p.name}
                className="product-photo-alternate"
              />
            )}
            </>}
          </ProductCardPreview>
        </div>
      )}
      <div className="product-meta">
        <div className="product-badges">
          {preview ? (
            <span>MẪU TRƯNG BÀY</span>
          ) : soldOut ? (
            <span>HẾT HÀNG</span>
          ) : limited ? (
            <span>LIMITED</span>
          ) : badge ? (
            <span>{badge}</span>
          ) : p.originalPrice > p.price ? (
            <span className="sale">
              −{Math.round((1 - p.price / p.originalPrice) * 100)}%
            </span>
          ) : null}
        </div>
        <Link className="product-name" href={detailHref}>
          {p.name}
        </Link>
        <p className="product-fit">
          {p.fit} <span>·</span> {p.material?.split(",")[0]}
        </p>
        <div className="prices">
          <b>{preview && "Dự kiến "}{money(p.price)}</b>
          {p.originalPrice > p.price && <del>{money(p.originalPrice)}</del>}
        </div>
        <div className="product-card-bottom">
          <div
            className="swatches"
            role="group"
            aria-label={`Màu sắc ${p.name}`}
          >
            {colors.slice(0, 5).map((c) => (
              <button
                key={c.name}
                disabled={!interactive}
                aria-label={`Xem màu ${c.name}`}
                aria-pressed={color === c.name}
                title={`${c.name}${hasColorPhoto(c.name)?"":" — Ảnh đang cập nhật"}`}
                data-photo-ready={hasColorPhoto(c.name)}
                className={color === c.name ? "selected" : ""}
                onClick={() => setColor(c.name)}
                style={{ background: c.hex }}
              />
            ))}
            {colors.length > 5 && <span>+{colors.length - 5}</span>}
          </div>
          <Link
            className="product-details-link"
            href={detailHref}
            aria-label={`Xem chi tiết ${p.name}`}
          >
            Xem chi tiết
            <ArrowUpRight size={16} />
          </Link>
        </div>
        {color&&<p className="product-card-selected-color" aria-live="polite">{/^màu /i.test(color)?color:`Màu: ${color}`}</p>}
        {tryOnSupports(p) && <Link className="product-try-on-link" href={tryOnHref(p.slug, color)} aria-label={`Dùng thử ${p.name}`}>
          <Sparkles size={15} /> Dùng thử <ArrowUpRight size={15} />
        </Link>}
        {!photos.length && (
          <p className="photo-pending-note">Ảnh thực tế đang cập nhật</p>
        )}
        {(p.design || photos.some((photo: any) => /mockup|thiết kế ai|ai-generated/i.test(photo.alt || ""))) && (
          <p className="product-media-caption">Milo Design</p>
        )}
        {photoPending&&referenceColor&&<button type="button" className="product-card-reference-link" onClick={()=>setColor(referenceColor)}>{/^màu thiết kế$/i.test(referenceColor)?"Xem ảnh mẫu ban đầu":`Xem ảnh màu ${referenceColor}`}</button>}
      </div>
    </article>
  );
}
