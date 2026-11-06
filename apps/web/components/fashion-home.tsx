"use client";
import { useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  ArrowRight,
  MoveUpRight,
  Plus,
  Camera,
  Instagram,
} from "lucide-react";
import { useResource } from "../hooks/use-resource";
import { ProductCard, Skeleton, ErrorBox, Empty, useShop } from "./client";
import { ConfiguredBanners } from "./configured-banners";
import { Recommendations } from "./recommendations";
import { Reveal } from "./reveal";
import { ProductPhoto, isRealPhoto } from "./product-media";
import { editorialAssets, journalArticles } from "../content/brand";
import { miloDesignText } from "../lib/milo-design";

export function EditorialHeading({
  number,
  kicker,
  title,
  href,
  link = "Khám phá thêm",
}: {
  number: string;
  kicker: string;
  title: string;
  href?: string;
  link?: string;
}) {
  return (
    <div className="edition-section-heading">
      <div className="edition-section-label">
        <span>{number}</span>
        <p className="eyebrow">{kicker}</p>
      </div>
      <div className="edition-heading-row">
        <h2>{title}</h2>
        {href && (
          <Link className="text-link" href={href}>
            {link}
            <ArrowUpRight size={18} />
          </Link>
        )}
      </div>
    </div>
  );
}
export function FashionHome({ initialProducts, initialBestsellers, initialTaxonomy }: { initialProducts?: any; initialBestsellers?: any; initialTaxonomy?: any }) {
  const [tab, setTab] = useState("all");
  const products = useResource(
    `/products?sort=newest&limit=4${tab === "all" ? "" : `&category=${tab}`}`,
    initialProducts,
  );
  const bestsellers = useResource("/products?sort=bestseller&limit=4", initialBestsellers);
  const taxonomy = useResource("/catalog", initialTaxonomy);
  const { config } = useShop();
  const coverProduct = products.data?.items?.[0];
  const coverImage = coverProduct?.images?.find((image: any) => isRealPhoto(image));
  const bannerPhoto = config?.banners?.find((b: any) => isRealPhoto(b.image));
  const hero =
    editorialAssets.hero ||
    (bannerPhoto
      ? {
          src: bannerPhoto.image,
          alt: bannerPhoto.title,
          caption: bannerPhoto.title,
          href: bannerPhoto.href,
        }
      : coverImage
        ? { src: coverImage.url, alt: coverImage.alt || coverProduct.name, caption: `Milo Design · ${coverProduct.name}`, href: `/san-pham/${coverProduct.slug}` }
        : null);
  const lookbook = editorialAssets.lookbook.filter((p) => isRealPhoto(p.src));
  const community = editorialAssets.community.filter((p) => isRealPhoto(p.src));
  return (
    <div className="fashion-home">
      <section className="edition-hero container" aria-labelledby="hero-title">
        <div className="edition-issue">
          <span>INDEPENDENT WEAR / EVERYDAY GOODS</span>
          <span>THE EVERYDAY ISSUE — No. 01</span>
        </div>
        <div className={`edition-cover ${hero ? "edition-cover--photo" : ""}`}>
          <div className="edition-cover-copy">
            <p className="eyebrow">
              <span className="edition-small-rule" /> A WARDROBE, A WAY OF LIFE
            </p>
            <h1 id="hero-title">
              Wear your
              <br />
              <em>own story.</em>
            </h1>
            <p className="hero-vietnamese">Không cần giống ai.</p>
            <p className="edition-hero-description">
              Một chút hoài niệm. Một phom áo vừa ý.
              <br />
              Những món đồ cơ bản, mang dấu ấn của riêng bạn.
            </p>
            <div className="edition-hero-actions">
              <Link className="button" href="/san-pham">
                KHÁM PHÁ SẢN PHẨM
                <ArrowUpRight size={19} />
              </Link>
              <Link className="text-link" href="/bo-suu-tap">
                XEM BỘ SƯU TẬP
                <ArrowUpRight size={17} />
              </Link>
            </div>
            <div className="edition-hero-footnote">
              <span className="edition-seal" aria-hidden="true">
                M<span>/</span>S
              </span>
              <p>
                VINTAGE SPIRIT. MODERN EVERYDAY.
                <br />
                <span>Ít khuôn mẫu. Nhiều chất riêng.</span>
              </p>
            </div>
          </div>
          {hero ? (
            <figure className="edition-hero-photo">
              <ProductPhoto src={hero.src} alt={hero.alt} loading="eager" sizes="(max-width: 760px) 90vw, 50vw" />
              <figcaption>
                <span>{miloDesignText(hero.caption)}</span>
                <Link href={hero.href} aria-label={`Khám phá ${hero.caption}`}>
                  <ArrowUpRight size={24} />
                </Link>
              </figcaption>
            </figure>
          ) : (
            <div
              className="edition-type-cover"
              aria-label="Bìa ấn phẩm thương hiệu"
            >
              <div className="edition-type-cover-top">
                <span>MILO SHOP HAND</span>
                <span>001 — EVERYDAY EDIT</span>
              </div>
              <p className="edition-cover-small">
                GOOD CLOTHES.
                <br />
                YOUR OWN WAY.
              </p>
              <p className="edition-cover-statement">
                Simple
                <br />
                <em>never</em>
                <br />
                ordinary.
              </p>
              <div className="edition-type-cover-bottom">
                <p>
                  THE ART OF
                  <br />
                  BEING YOURSELF.
                </p>
                <Link
                  href="/phong-cach#brand-story"
                  aria-label="Đọc câu chuyện Milo"
                >
                  <ArrowUpRight size={36} />
                </Link>
              </div>
              <span className="edition-side-caption">
                A NOTE FROM MILO — WEAR WHAT FEELS LIKE YOU
              </span>
            </div>
          )}
        </div>
        <div className="edition-cover-footer">
          <span>LOCAL ATTITUDE. TIMELESS ESSENTIALS.</span>
          <Link href="#new-arrivals">
            LẬT TRANG, TÌM CHẤT RIÊNG <span aria-hidden="true">↓</span>
          </Link>
        </div>
      </section>
      <div
        className="edition-marquee"
        aria-label="Wear your own story. Simple fit, unique identity."
      >
        <div className="edition-marquee-track" aria-hidden="true">
          {[0, 1].map((i) => (
            <div key={i}>
              <span>WEAR YOUR OWN STORY</span>
              <span className="marquee-mark">✳</span>
              <span>SIMPLE FIT. UNIQUE IDENTITY.</span>
              <span className="marquee-mark">✳</span>
              <span>MADE FOR YOUR EVERYDAY</span>
              <span className="marquee-mark">✳</span>
            </div>
          ))}
        </div>
      </div>
      <Reveal className="container edition-product-section" id="new-arrivals">
        <EditorialHeading
          number="01"
          kicker="FRESH PAGES / NEW ARRIVALS"
          title="Mới trong tủ đồ."
          href="/san-pham?sort=newest"
          link="Xem hàng mới"
        />
        <div className="edition-product-navigation">
          <div
            className="category-tabs"
            role="group"
            aria-label="Danh mục sản phẩm mới"
          >
            {[
              ["all", "Tất cả"],
              ["ao-phong", "Áo phông"],
              ["ao-hoodie", "Hoodie"],
              ["ao-khoac", "Áo khoác"],
              ["ao-bomber", "Bomber"],
            ].map(([slug, name]) => (
              <button
                key={slug}
                aria-pressed={tab === slug}
                className={tab === slug ? "selected" : ""}
                onClick={() => setTab(slug)}
              >
                {name}
              </button>
            ))}
          </div>
          <span className="edition-product-note">
            Chọn đồ theo cách bạn thích.
          </span>
        </div>
        {products.loading ? (
          <Skeleton />
        ) : products.error ? (
          <ErrorBox message={products.error} retry={products.retry} />
        ) : products.data?.items?.length ? (
          <div className="product-grid">
            {products.data.items.map((p: any, i: number) => (
              <ProductCard key={p.id} product={p} index={i} badge="NEW" />
            ))}
          </div>
        ) : (
          <Empty title="Danh mục này đang được cập nhật." href="/san-pham" />
        )}
      </Reveal>
      <ConfiguredBanners />
      <Reveal className="edition-story-band" id="brand-story">
        <div className="container edition-story-layout">
          <div className="edition-story-index">
            <span className="eyebrow">THE MILO PHILOSOPHY</span>
            <span className="edition-script-note">
              A little old soul.
              <br />A little new you.
            </span>
          </div>
          <div>
            <h2>
              Đơn giản để mặc.
              <br />
              <em>Tự do để là mình.</em>
            </h2>
            <p>
              Milo bắt đầu từ một ý tưởng giản dị: quần áo nên vừa với cuộc sống
              của bạn. Tinh thần đường phố, chút cảm hứng hoài niệm và những
              phom áo dễ phối — để mỗi ngày có thêm một cách kể câu chuyện
              riêng.
            </p>
            <Link className="text-link" href="/phong-cach#brand-story">
              Đọc câu chuyện Milo
              <ArrowUpRight size={18} />
            </Link>
          </div>
          <span className="edition-story-monogram" aria-hidden="true">
            m.
          </span>
        </div>
      </Reveal>
      <Reveal className="container edition-styles">
        <EditorialHeading
          number="02"
          kicker="SHOP BY STYLE / FIND YOUR MOOD"
          title="Cùng một bạn. Nhiều chất riêng."
        />
        <div className="edition-style-grid">
          {[
            {
              no: "01",
              title: "Everyday basic.",
              sub: "Ít chi tiết. Dễ phối. Mặc mỗi ngày.",
              href: "/san-pham?style=minimal",
              label: "BASIC",
            },
            {
              no: "02",
              title: "An old soul.",
              sub: "Cảm hứng retro từ những lớp bomber.",
              href: "/san-pham?category=ao-bomber",
              label: "VINTAGE INSPIRED",
            },
            {
              no: "03",
              title: "Room to move.",
              sub: "Phom rộng, thoải mái theo nhịp của bạn.",
              href: "/san-pham?fit=Oversized",
              label: "OVERSIZED",
            },
            {
              no: "04",
              title: "Street, your way.",
              sub: "Tự tin bước ra đường theo cách riêng.",
              href: "/san-pham?style=streetwear",
              label: "STREETWEAR",
            },
          ].map((s) => (
            <Link href={s.href} className="edition-style-card" key={s.no}>
              <div className="row between">
                <span className="eyebrow">
                  {s.no} / {s.label}
                </span>
                <ArrowUpRight size={22} />
              </div>
              <h3>{s.title}</h3>
              <p>{s.sub}</p>
            </Link>
          ))}
        </div>
      </Reveal>
      <Reveal className="container edition-lookbook" id="lookbook">
        <EditorialHeading
          number="03"
          kicker="THE LOOKBOOK / LAYERS OF YOU"
          title="Mặc một câu chuyện khác."
          href="/bo-suu-tap"
          link="Khám phá bộ sưu tập"
        />
        {lookbook.length ? (
          <Lookbook photos={lookbook} />
        ) : (
          <div className="edition-lookbook-copy">
            <div>
              <p className="eyebrow">LOOKBOOK / ĐANG BIÊN TẬP</p>
              <h3>
                Những lớp áo.
                <br />
                <em>Những ngày rất riêng.</em>
              </h3>
              <p>
                Bộ ảnh phối đồ sẽ được cập nhật từ các thiết kế thực tế của
                Milo. Trong lúc chờ, chọn bộ sưu tập phù hợp với nhịp sống và
                thời tiết của bạn.
              </p>
              <Link className="text-link" href="/bo-suu-tap">
                Tìm một bộ sưu tập
                <ArrowUpRight size={18} />
              </Link>
            </div>
            <div className="edition-collection-index">
              {taxonomy.data?.collections
                .slice(0, 3)
                .map((c: any, i: number) => (
                  <Link key={c.id} href={`/san-pham?collection=${c.slug}`}>
                    <span className="eyebrow">0{i + 1}</span>
                    <div>
                      <h4>{miloDesignText(c.name)}</h4>
                      <p>
                        {c.season} / {c.climate}
                      </p>
                    </div>
                    <ArrowUpRight size={22} />
                  </Link>
                ))}
              {taxonomy.error && (
                <ErrorBox message={taxonomy.error} retry={taxonomy.retry} />
              )}
            </div>
          </div>
        )}
      </Reveal>
      <Reveal className="container edition-product-section">
        <EditorialHeading
          number="04"
          kicker="FROM THE SHOP / BEST SELLERS"
          title="Những món đồ được chọn."
          href="/san-pham?sort=bestseller"
          link="Xem sản phẩm bán chạy"
        />
        {bestsellers.loading ? (
          <Skeleton />
        ) : bestsellers.error ? (
          <ErrorBox message={bestsellers.error} retry={bestsellers.retry} />
        ) : (
          <div className="product-grid">
            {bestsellers.data?.items.map((p: any, i: number) => (
              <ProductCard key={p.id} product={p} index={i} />
            ))}
          </div>
        )}
      </Reveal>
      <Recommendations />
      <Reveal className="edition-journal-band">
        <div className="container">
          <EditorialHeading
            number="05"
            kicker="MILO JOURNAL / READ & WEAR"
            title="Chuyện bên ngoài tủ đồ."
            href="/phong-cach"
            link="Đọc Milo Journal"
          />
          <div className="edition-journal-grid">
            {journalArticles.map((a, i) => (
              <Link
                href={`/phong-cach#${a.id}`}
                className="edition-journal-card"
                key={a.id}
              >
                <div className="row between">
                  <span className="eyebrow">{a.category}</span>
                  <span className="edition-article-number">0{i + 1}</span>
                </div>
                <h3>{a.title}</h3>
                <p>{a.excerpt}</p>
                <div className="row between">
                  <span>{a.readTime}</span>
                  <ArrowUpRight size={21} />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </Reveal>
      <Reveal className="container edition-community" id="community">
        <div className="edition-community-top">
          <span className="eyebrow">THE COMMUNITY / NOT JUST CLOTHES</span>
          <span className="eyebrow">#WEARMILO</span>
        </div>
        <h2>
          Milo, <em>as worn by you.</em>
        </h2>
        <p>
          Phối theo gu của bạn. Kể câu chuyện của bạn.
          <br />
          Mỗi cách mặc đều có một chỗ trong cộng đồng Milo.
        </p>
        {community.length > 0 && (
          <div className="edition-community-photos">
            {community.map((p) => (
              <Link href={p.href} key={p.src}>
                <ProductPhoto src={p.src} alt={p.alt} />
                <span>{p.caption}</span>
              </Link>
            ))}
          </div>
        )}
        <Link
          className="button secondary"
          href={editorialAssets.instagram || "/chinh-sach?tab=lien-he"}
        >
          {editorialAssets.instagram ? (
            <>
              <Instagram size={17} />
              GẶP MILO TRÊN INSTAGRAM
            </>
          ) : (
            <>CHIA SẺ CÂU CHUYỆN CỦA BẠN</>
          )}
          <ArrowUpRight size={18} />
        </Link>
        {!community.length && (
          <p className="edition-community-note">
            Câu chuyện và ảnh cộng đồng sẽ được đăng với sự đồng ý của người
            chia sẻ.
          </p>
        )}
      </Reveal>
    </div>
  );
}
function Lookbook({ photos }: { photos: typeof editorialAssets.lookbook }) {
  const [active, setActive] = useState(0);
  const photo = photos[active];
  return (
    <div className="edition-lookbook-gallery">
      <Link href={photo.href} className="edition-lookbook-frame">
        <ProductPhoto key={photo.src} src={photo.src} alt={photo.alt} />
        <span>
          {photo.caption}
          <ArrowUpRight size={22} />
        </span>
      </Link>
      <div className="edition-lookbook-controls">
        <span>
          {String(active + 1).padStart(2, "0")} /{" "}
          {String(photos.length).padStart(2, "0")}
        </span>
        <div className="row">
          {photos.map((p, i) => (
            <button
              key={p.src}
              onClick={() => setActive(i)}
              aria-label={`Xem lookbook ${i + 1}: ${p.caption}`}
              aria-pressed={active === i}
            >
              {String(i + 1).padStart(2, "0")}
            </button>
          ))}
        </div>
        {photo.credit && <small>{photo.credit}</small>}
      </div>
    </div>
  );
}
