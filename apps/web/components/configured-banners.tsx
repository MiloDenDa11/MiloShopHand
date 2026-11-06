"use client";
import { useShop } from "./client";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { ProductPhoto } from "./product-media";
export function ConfiguredBanners() {
  const { config } = useShop();
  if (!config?.banners?.length) return null;
  return (
    <section
      className="container section configured-banners"
      aria-label="Chiến dịch cửa hàng"
    >
      {config.banners.map((b: any, i: number) => (
        <Link href={b.href} key={i} className="configured-banner">
          <ProductPhoto src={b.image} alt={b.title} />
          <h2>
            {b.title} <ArrowUpRight size={24} />
          </h2>
        </Link>
      ))}
    </section>
  );
}
export function BannerFields({
  banners,
  setBanners,
}: {
  banners: any[];
  setBanners: (v: any[]) => void;
}) {
  return (
    <fieldset>
      <legend>Banner / lookbook dẫn tới sản phẩm hoặc bộ sưu tập</legend>
      {banners.map((b: any, i: number) => (
        <div className="admin-panel" key={i}>
          {[
            ["title", "Tiêu đề"],
            ["image", "Đường dẫn ảnh đã tải lên"],
            ["href", "Đường dẫn sản phẩm / bộ sưu tập"],
          ].map(([key, label]) => (
            <label key={key}>
              {label}
              <input
                value={b[key]}
                required={key !== "image"}
                pattern={key === "href" ? "/.*" : undefined}
                onChange={(e) =>
                  setBanners(
                    banners.map((v, n) =>
                      n === i ? { ...v, [key]: e.target.value } : v,
                    ),
                  )
                }
              />
            </label>
          ))}
          <button
            type="button"
            className="text-link small"
            onClick={() => setBanners(banners.filter((_, n) => n !== i))}
          >
            Bỏ banner
          </button>
        </div>
      ))}
      <button
        type="button"
        className="button secondary small-button"
        disabled={banners.length >= 10}
        onClick={() =>
          setBanners([...banners, { title: "", image: "", href: "/san-pham" }])
        }
      >
        ＋ Thêm banner
      </button>
    </fieldset>
  );
}
