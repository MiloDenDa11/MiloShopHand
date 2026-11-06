"use client";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  ArrowUpRight,
  ArrowLeft,
  ArrowRight,
  Check,
  Star,
  Truck,
  RotateCcw,
  ShieldCheck,
  X,
  Maximize2,
} from "lucide-react";
import { useResource } from "../hooks/use-resource";
import {
  useShop,
  money,
  Quantity,
  ProductCard,
  Skeleton,
  ErrorBox,
} from "./client";
import { ProductPhoto, realProductImages, productImagesForColor } from "./product-media";
import { EditorialHeading } from "./fashion-home";
import { Product360 } from "./product-360";
import { photoSpinFor } from "../lib/photo-spin";
import { miloDesignText } from "../lib/milo-design";
import "../app/product-360.css";
export function FashionProductDetail({ slug, initialData }: { slug: string; initialData?: any }) {
  const { data: p, error, loading, retry } = useResource(`/products/${slug}`, initialData);
  const { add, notify, config } = useShop();
  const router = useRouter();
  const [viewRequest, setViewRequest] = useState({ serial: 0, view: "front" });
  const [interactive,setInteractive]=useState(false);
  useEffect(()=>setInteractive(true),[]);
  const [color, setColor] = useState(initialData?.variants?.[0]?.color || ""),
    [size, setSize] = useState(""),
    [quantity, setQuantity] = useState(1),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!p) return;
    setColor(p.variants[0]?.color || "");
    setSize("");
    setQuantity(1);
    try {
      const recent = JSON.parse(localStorage.getItem("milo-recent") || "[]");
      localStorage.setItem(
        "milo-recent",
        JSON.stringify(
          [
            {
              slug: p.slug,
              name: p.name,
              image: realProductImages(p)[0]?.url || "",
              price: p.price,
            },
            ...recent.filter((i: any) => i.slug !== p.slug),
          ].slice(0, 12),
        ),
      );
    } catch {}
  }, [p]);
  if (loading)
    return (
      <div className="container section">
        <Skeleton count={2} />
      </div>
    );
  if (error)
    return (
      <div className="container section">
        <ErrorBox message={error} retry={retry} />
      </div>
    );
  if (!p) return null;
  const colors = [...new Set<string>(p.variants.map((v: any) => v.color))];
  const variant = p.variants.find(
    (v: any) => v.color === color && v.size === size,
  );
  const price = variant?.price ?? p.price;
  const reviews = p.reviews || [];
  const average = reviews.length
    ? reviews.reduce((n: number, r: any) => n + r.rating, 0) / reviews.length
    : 0;
  async function purchase(now: boolean) {
    if (!variant) {
      notify("Vui lòng chọn kích thước.");
      document.getElementById("size-options")?.focus();
      return;
    }
    setBusy(true);
    try {
      const saved = await add(p, variant, quantity, { openDrawer: !now });
      if (saved && now) router.push("/thanh-toan");
    } finally {
      setBusy(false);
    }
  }
  function sizeGuide() {
    const el = document.getElementById(
      "size-guide",
    ) as HTMLDetailsElement | null;
    if (el) {
      el.open = true;
      el.scrollIntoView({
        block: "center",
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      });
    }
  }
  const photos = productImagesForColor(p,color);
  return (
    <div className="container product-page fashion-product">
      <nav className="breadcrumb" aria-label="Đường dẫn">
        <Link href="/">Trang chủ</Link>
        <span>/</span>
        <Link href={`/san-pham?category=${p.category.slug}`}>
          {p.category.name}
        </Link>
        <span>/</span>
        <span>{p.name}</span>
      </nav>
      <div
        className={`detail-grid ${photos.length ? "" : "detail-grid--notes"}`}
      >
        <div className="detail-gallery">
          {photos.length ? (
            <PhotoGallery photos={photos} color={color} onOpen360={photoSpinFor(p,p.variants.find((v:any)=>v.color===color)?.colorHex) ? (view) => setViewRequest(previous => ({ serial: previous.serial + 1, view })) : undefined} />
          ) : (
            <GarmentNotes product={p} />
          )}
          {p.design && <p className="product-design-label">Milo Design</p>}
          {photos.some((image:any)=>image.url.includes("miloColor="))&&<p className="product-design-label">Milo Design · Phối màu {color} xem trước.</p>}
          <Product360 product={p} color={color} colorHex={p.variants.find((v: any) => v.color === color)?.colorHex} request={viewRequest} onColorChange={value => { setColor(value); setSize(""); setQuantity(1); }} />
        </div>
        <div className="detail-copy">
          <p className="eyebrow">{p.category.name} / THE EVERYDAY WARDROBE</p>
          <h1>{p.name}</h1>
          <div className="review-caption">
            {reviews.length ? (
              <>
                <Star size={14} />
                <a href="#product-reviews">
                  {average.toFixed(1)} · {reviews.length} đánh giá từ người mua
                </a>
              </>
            ) : (
              <span>Chưa có đánh giá từ người mua</span>
            )}
          </div>
          <div className="detail-prices">
            <b>{money(price)}</b>
            {p.originalPrice > price && (
              <>
                <del>{money(p.originalPrice)}</del>
                <span>Tiết kiệm {money(p.originalPrice - price)}</span>
              </>
            )}
          </div>
          <p className="detail-intro">
            {p.material}. {p.fit}. Một thiết kế dễ phối, sẵn sàng đi cùng bạn
            qua những ngày bình thường.
          </p>
          <div className="choice-block">
            <p>
              Màu sắc: <b>{color}</b>
            </p>
            <div className="color-choices">
              {colors.map((c) => (
                <button
                  key={c}
                  disabled={!interactive}
                  aria-pressed={c === color}
                  title={c}
                  className={c === color ? "selected" : ""}
                  onClick={() => {
                    setColor(c);
                    setSize("");
                    setQuantity(1);
                  }}
                >
                  <span
                    style={{
                      background: p.variants.find((v: any) => v.color === c)
                        .colorHex,
                    }}
                  />
                  <span className="color-name">{c}</span>
                  {c === color && <Check size={13} />}
                </button>
              ))}
            </div>
          </div>
          <div className="choice-block">
            <div className="row between">
              <p>
                Kích thước: <b>{size || "Chọn size của bạn"}</b>
              </p>
              <button className="text-link small" onClick={sizeGuide}>
                Bảng size
                <ArrowUpRight size={14} />
              </button>
            </div>
            <div
              className="size-choices"
              id="size-options"
              tabIndex={-1}
              role="group"
              aria-label="Chọn kích thước"
            >
              {p.variants
                .filter((v: any) => v.color === color)
                .map((v: any) => (
                  <button
                    key={v.id}
                    disabled={!v.available}
                    aria-pressed={size === v.size}
                    className={size === v.size ? "selected" : ""}
                    onClick={() => {
                      setSize(v.size);
                      setQuantity(1);
                    }}
                    title={!v.available ? `${v.size} — hết hàng` : v.size}
                  >
                    {v.size}
                  </button>
                ))}
            </div>
            <p
              className={`stock-caption ${variant?.available ? "stock-ok" : "muted"}`}
              aria-live="polite"
            >
              {variant ? (
                <>
                  <Check size={14} />
                  {variant.available
                    ? `Còn ${variant.available} sản phẩm · SKU ${variant.sku}`
                    : "Biến thể này đang hết hàng"}
                </>
              ) : (
                "Chọn kích thước để kiểm tra tồn kho."
              )}
            </p>
          </div>
          <div className="purchase-controls">
            <div className="add-row">
              <Quantity
                value={quantity}
                max={variant ? Math.min(20, variant.available) : 20}
                onChange={setQuantity}
              />
              <button
                className="button"
                disabled={busy || variant?.available === 0}
                onClick={() => purchase(false)}
              >
                {busy ? "Đang thêm…" : "Thêm vào giỏ hàng"}
                <Plus size={18} />
              </button>
            </div>
            <button
              className="button secondary full buy-now"
              disabled={busy || variant?.available === 0}
              onClick={() => purchase(true)}
            >
              Mua ngay
              <ArrowUpRight size={19} />
            </button>
          </div>
          <div className="detail-perks">
            <p>
              <Truck size={18} />
              Phí giao hàng được xác nhận trước khi đặt đơn.
            </p>
            <p>
              <RotateCcw size={18} />
              Đổi size trong {config?.returnDays || 14} ngày theo điều kiện.
            </p>
            <p>
              <ShieldCheck size={18} />
              QR qua payOS hoặc thanh toán khi nhận hàng.
            </p>
          </div>
          <details open>
            <summary>Thiết kế & chất liệu</summary>
            <p>{miloDesignText(p.description)}</p>
            <dl className="product-specifications">
              <div>
                <dt>Chất liệu</dt>
                <dd>{p.material}</dd>
              </div>
              <div>
                <dt>Phom áo</dt>
                <dd>{p.fit}</dd>
              </div>
              <div>
                <dt>Danh mục</dt>
                <dd>{p.category.name}</dd>
              </div>
            </dl>
          </details>
          <details>
            <summary>Hướng dẫn bảo quản</summary>
            <p>{p.care}</p>
          </details>
          <details id="size-guide">
            <summary>Bảng size & cách chọn</summary>
            <p>
              Số đo mẫu (cm). So với một chiếc áo bạn đang mặc thoải mái; tham
              khảo hướng dẫn và liên hệ Milo khi cần hỗ trợ chọn size.
            </p>
            <div className="size-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Size</th>
                    <th>Vòng ngực</th>
                    <th>Dài áo</th>
                    <th>Vai</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["S", 104, 68, 48],
                    ["M", 110, 71, 51],
                    ["L", 116, 74, 54],
                    ["XL", 122, 77, 57],
                  ].map((row) => (
                    <tr key={row[0]}>
                      {row.map((cell, i) => (
                        <td key={i}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <details>
            <summary>Giao hàng & đổi trả</summary>
            <p>
              {config?.returnPolicy ||
                "Đổi size trong 14 ngày theo điều kiện cửa hàng. Giữ nguyên nhãn và chưa sử dụng."}
            </p>
            <Link className="text-link small" href="/chinh-sach?tab=doi-tra">
              Xem chính sách đầy đủ
              <ArrowUpRight size={14} />
            </Link>
          </details>
        </div>
      </div>
      <section className="section product-review-section" id="product-reviews">
        <EditorialHeading
          number="01"
          kicker="FROM PEOPLE WHO WEAR IT"
          title="Một chút trải nghiệm thật."
        />
        {reviews.length ? (
          <div className="review-grid">
            {reviews.map((r: any) => (
              <article className="review" key={r.id}>
                <div className="row between">
                  <b>{r.name}</b>
                  <span aria-label={`${r.rating} trên 5 sao`}>
                    {"★".repeat(r.rating)}
                    {"☆".repeat(5 - r.rating)}
                  </span>
                </div>
                <p>{r.content}</p>
                <small>
                  {r.color} / {r.size} · Đã mua và nhận hàng
                </small>
              </article>
            ))}
          </div>
        ) : (
          <div className="edition-empty-reviews">
            <p>Chưa có đánh giá cho thiết kế này.</p>
            <span>
              Chia sẻ trải nghiệm sau khi nhận hàng — câu chuyện của bạn sẽ giúp
              người mua tiếp theo chọn đúng hơn.
            </span>
          </div>
        )}
      </section>
      <section className="section">
        <EditorialHeading
          number="02"
          kicker="ANOTHER PAGE IN YOUR WARDROBE"
          title="Phối thêm một chút chất riêng."
          href="/san-pham"
          link="Tiếp tục khám phá"
        />
        <p className="recommendation-explanation">{miloDesignText(p.recommendationReason)}</p>
        <div className="product-grid">
          {p.related.map((r: any) => (
            <ProductCard key={r.id} product={r} />
          ))}
        </div>
      </section>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Product",
            name: p.name,
            description: miloDesignText(p.description),
            ...(photos.length ? { image: photos.map((i: any) => i.url) } : {}),
            offers: {
              "@type": "Offer",
              price: p.price,
              priceCurrency: "VND",
              availability: p.variants.some((v: any) => v.available)
                ? "https://schema.org/InStock"
                : "https://schema.org/OutOfStock",
            },
          }).replace(/</g, "\u003c"),
        }}
      />
    </div>
  );
}
function GarmentNotes({ product: p }: { product: any }) {
  return (
    <div className="garment-notes">
      <div className="garment-notes-top">
        <span className="eyebrow">M/S GARMENT NOTES</span>
        <span className="eyebrow">THE EVERYDAY EDIT</span>
      </div>
      <p className="garment-note-category">{p.category.name}</p>
      <h2>
        Good things
        <br />
        take <em>shape.</em>
      </h2>
      <dl>
        <div>
          <dt>THE FABRIC</dt>
          <dd>{p.material}</dd>
        </div>
        <div>
          <dt>THE FIT</dt>
          <dd>{p.fit}</dd>
        </div>
        <div>
          <dt>THE FEELING</dt>
          <dd>Thoải mái. Dễ phối. Là bạn.</dd>
        </div>
      </dl>
      <div className="garment-notes-bottom">
        <span className="garment-notes-monogram" aria-hidden="true">
          m.
        </span>
        <p>
          Ảnh thực tế của thiết kế này đang được cập nhật.
          <br />
          Thông tin sản phẩm và lựa chọn size/màu vẫn có sẵn.
        </p>
      </div>
    </div>
  );
}
function PhotoGallery({ photos, color, onOpen360 }: { photos: any[]; color: string; onOpen360?: (view: string) => void }) {
  const [interactive,setInteractive] = useState(false);
  useEffect(()=>setInteractive(true),[]);
  const [selected, setSelected] = useState(0),
    [zoom, setZoom] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const i = photos.findIndex((p) => p.color === color);
    setSelected(Math.max(0, i));
  }, [color]);
  useEffect(() => {
    if (zoom) ref.current?.showModal();
    else ref.current?.close();
  }, [zoom]);
  const image = photos[selected] || photos[0];
  function move(step: number) {
    setSelected((i) => (i + step + photos.length) % photos.length);
  }
  return (
    <>
      <figure className="detail-main">
        <button
          className="detail-image-zoom"
          disabled={!interactive}
          onClick={() => onOpen360 ? onOpen360(image.view || "front") : setZoom(true)}
          aria-label={`${onOpen360 ? "Xoay 360°" : "Phóng to"} ${image.alt}`}
        >
          <ProductPhoto
            key={image.url}
            src={image.url}
            alt={image.alt}
            loading="eager"
            sizes="(max-width: 760px) 90vw, 55vw"
          />
          <span>
            {onOpen360 ? <>360° <RotateCcw size={18} /></> : <Maximize2 size={18} />}
          </span>
        </button>
        <figcaption>
          <span>{image.color || "MILOSHOPHAND"}</span>
          <span>
            {String(selected + 1).padStart(2, "0")} /{" "}
            {String(photos.length).padStart(2, "0")}
          </span>
        </figcaption>
      </figure>
      {onOpen360 && <button className="text-link product-photo-enlarge" onClick={() => setZoom(true)}><Maximize2 size={15} /> Phóng to ảnh tĩnh</button>}
      <div className="thumbnails" role="group" aria-label="Ảnh sản phẩm">
        {photos.map((p, i) => (
          <button
            key={p.id || p.url}
            className={selected === i ? "selected" : ""}
            onClick={() => setSelected(i)}
            aria-pressed={selected === i}
            aria-label={`Xem ${p.alt}`}
          >
            <ProductPhoto src={p.url} alt={p.alt} sizes="80px" />
          </button>
        ))}
      </div>
      <dialog
        className="product-zoom-dialog"
        ref={ref}
        onCancel={() => setZoom(false)}
        aria-label={`Ảnh phóng to: ${image.alt}`}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") move(-1);
          if (e.key === "ArrowRight") move(1);
        }}
      >
        <button
          className="zoom-close"
          aria-label="Đóng ảnh phóng to"
          onClick={() => setZoom(false)}
        >
          <X size={25} />
        </button>
        <div className="zoom-image">
          <ProductPhoto
            key={image.url}
            src={image.url}
            alt={image.alt}
            loading="eager"
            sizes="95vw"
          />
        </div>
        <div className="zoom-controls">
          <button aria-label="Ảnh trước" onClick={() => move(-1)}>
            <ArrowLeft size={22} />
          </button>
          <span>
            {selected + 1} / {photos.length} — {image.alt}
          </span>
          <button aria-label="Ảnh tiếp theo" onClick={() => move(1)}>
            <ArrowRight size={22} />
          </button>
        </div>
      </dialog>
    </>
  );
}
