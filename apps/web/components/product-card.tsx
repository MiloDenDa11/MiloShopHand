"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Heart, ArrowUpRight } from "lucide-react";
import { useShop, send, money } from "./client";
import { ProductPhoto, realProductImages, productImagesForColor } from "./product-media";
import { ProductCardPreview } from "./product-card-preview";
import { photoSpinFor } from "../lib/photo-spin";
export function ProductCard({
  product: p,
  index = 0,
  badge,
}: {
  product: any;
  index?: number;
  badge?: string;
}) {
  const { user, notify } = useShop();
  const [interactive,setInteractive]=useState(false);
  useEffect(()=>setInteractive(true),[]);
  const [color, setColor] = useState(p.variants?.[0]?.color || ""),
    [saved, setSaved] = useState(false),
    [saving, setSaving] = useState(false);
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
  const spin=photoSpinFor(p,p.variants?.find((variant:any)=>variant.color===color)?.colorHex);
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
    setSaving(true);
    try {
      await send("/me/wishlist/" + p.id, {}, saved ? "DELETE" : "POST");
      setSaved(!saved);
      notify(saved ? "Đã bỏ yêu thích." : "Đã lưu vào yêu thích.");
    } catch (e: any) {
      notify(e.message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <article
      className={`product-card ${chosen ? "product-card--photo" : "product-card--text"}`}
    >
      <div className="product-card-topline">
        <span className="eyebrow">{p.category?.name}</span>
        <button
          className={`wish ${saved ? "saved" : ""}`}
          disabled={saving}
          aria-label={`Yêu thích ${p.name}`}
          aria-pressed={saved}
          onClick={wish}
        >
          <Heart size={19} fill={saved ? "currentColor" : "none"} />
        </button>
      </div>
      {chosen && (
        <div className="product-visual">
          <ProductCardPreview key={color} href={`/san-pham/${p.slug}`} name={p.name} spin={spin}>
            <ProductPhoto
              key={chosen.url}
              src={chosen.url}
              alt={chosen.alt || p.name}
              loading={index < 2 ? "eager" : "lazy"}
              className="product-photo-primary"
            />
            {!spin && alternate && !chosen.url.includes("miloColor=") && (
              <ProductPhoto
                src={alternate.url}
                alt={alternate.alt || p.name}
                className="product-photo-alternate"
              />
            )}
          </ProductCardPreview>
        </div>
      )}
      <div className="product-meta">
        <div className="product-badges">
          {soldOut ? (
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
        <Link className="product-name" href={`/san-pham/${p.slug}`}>
          {p.name}
        </Link>
        <p className="product-fit">
          {p.fit} <span>·</span> {p.material?.split(",")[0]}
        </p>
        <div className="prices">
          <b>{money(p.price)}</b>
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
                title={c.name}
                className={color === c.name ? "selected" : ""}
                onClick={() => setColor(c.name)}
                style={{ background: c.hex }}
              />
            ))}
            {colors.length > 5 && <span>+{colors.length - 5}</span>}
          </div>
          <Link
            className="product-details-link"
            href={`/san-pham/${p.slug}`}
            aria-label={`Xem chi tiết ${p.name}`}
          >
            Xem chi tiết
            <ArrowUpRight size={16} />
          </Link>
        </div>
        {!photos.length && (
          <p className="photo-pending-note">Ảnh thực tế đang cập nhật</p>
        )}
        {(p.design || photos.some((photo: any) => /mockup|thiết kế ai|ai-generated/i.test(photo.alt || ""))) && (
          <p className="product-media-caption">Milo Design</p>
        )}
        {photos.some((image:any)=>image.url.includes("miloColor="))&&<p className="product-media-caption">Phối màu {color} xem trước</p>}
      </div>
    </article>
  );
}
