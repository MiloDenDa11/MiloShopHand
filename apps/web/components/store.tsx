"use client";
import { useEffect, useState, FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, SlidersHorizontal, X } from "lucide-react";
import { ProductCard, Skeleton, ErrorBox, Empty } from "./client";
import { useResource } from "../hooks/use-resource";
import { miloDesignText } from "../lib/milo-design";
export { useResource } from "../hooks/use-resource";
export { FashionHome as Home } from "./fashion-home";
export { FashionProductDetail as ProductDetail } from "./fashion-product";
export function Catalog({ initialProducts, initialTaxonomy }: { initialProducts?: any; initialTaxonomy?: any }) {
  const params = useSearchParams();
  const query = params.toString();
  const products = useResource(`/products?${query}`, initialProducts);
  const metadata = useResource("/catalog", initialTaxonomy);
  const [filtersOpen, setFiltersOpen] = useState(false);
  useEffect(() => {
    const media = matchMedia("(min-width: 761px)");
    const sync = () => setFiltersOpen(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  function change(key: string, value: string) {
    const next = new URLSearchParams(query);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    window.history.pushState(null, "", `/san-pham${next.size ? `?${next}` : ""}`);
  }
  function filters(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const next = new URLSearchParams();
    new FormData(e.currentTarget).forEach((value, key) => {
      if (value) next.set(key, String(value));
    });
    window.history.pushState(null, "", `/san-pham${next.size ? `?${next}` : ""}`);
  }
  return (
    <div className="container catalog-page">
      <div className="breadcrumb">
        <Link href="/">Trang chủ</Link>
        <span>/</span>
        <span>Cửa hàng</span>
      </div>
      <div className="catalog-title">
        <p className="eyebrow">THE WARDROBE / MILOSHOPHAND</p>
        <h1>
          Tủ đồ <i>của bạn.</i>
        </h1>
        <p>
          Những thiết kế dễ mặc, dễ phối. Sẵn sàng cho mọi phiên bản của bạn.
        </p>
      </div>
      <div className="catalog-layout">
        <aside className="filters">
          <details
            open={filtersOpen}
            onToggle={(e) => setFiltersOpen(e.currentTarget.open)}
          >
            <summary>
              <SlidersHorizontal size={17} /> Bộ lọc sản phẩm
            </summary>
            {metadata.error && (
              <ErrorBox message={metadata.error} retry={metadata.retry} />
            )}
            <form key={`${query}:${metadata.data ? "loaded" : "pending"}`} onSubmit={filters}>
              <label>
                Tìm kiếm
                <input
                  name="q"
                  placeholder="Tên, chất liệu, phong cách…"
                  defaultValue={params.get("q") || ""}
                />
              </label>
              <label>
                Danh mục
                <select
                  name="category"
                  defaultValue={params.get("category") || ""}
                >
                  <option value="">Tất cả danh mục</option>
                  {metadata.data?.categories.map((c: any) => (
                    <option key={c.id} value={c.slug}>
                      {miloDesignText(c.name)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Bộ sưu tập
                <select
                  name="collection"
                  defaultValue={params.get("collection") || ""}
                >
                  <option value="">Tất cả bộ sưu tập</option>
                  {metadata.data?.collections.map((c: any) => (
                    <option key={c.id} value={c.slug}>
                      {miloDesignText(c.name)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Phong cách
                <select name="style" defaultValue={params.get("style") || ""}>
                  <option value="">Mọi phong cách</option>
                  {metadata.data?.styles.map((c: any) => (
                    <option key={c.id} value={c.slug}>
                      {miloDesignText(c.name)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="form-row">
                <label>
                  Kích thước
                  <select name="size" defaultValue={params.get("size") || ""}>
                    <option value="">Tất cả</option>
                    {["S", "M", "L", "XL"].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Màu
                  <select name="color" defaultValue={params.get("color") || ""}>
                    <option value="">Tất cả</option>
                    {[
                      "Đen",
                      "Kem",
                      "Tím",
                      "Xanh olive",
                      "Xám",
                      "Xanh navy",
                    ].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                Mùa / thời tiết
                <select name="season" defaultValue={params.get("season") || ""}>
                  <option value="">Mọi mùa</option>
                  {[
                    ...new Set<string>(
                      metadata.data?.collections.map((c: any) => c.season) ||
                        [],
                    ),
                  ].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label>
                Chất liệu
                <input
                  name="material"
                  placeholder="Cotton, nylon…"
                  defaultValue={params.get("material") || ""}
                />
              </label>
              <label>
                Kiểu dáng
                <select name="fit" defaultValue={params.get("fit") || ""}>
                  <option value="">Mọi kiểu dáng</option>
                  <option>Oversized</option>
                  <option>Relaxed fit</option>
                </select>
              </label>
              <div className="form-row">
                <label>
                  Giá từ
                  <input
                    type="number"
                    min="0"
                    step="10000"
                    name="min"
                    defaultValue={params.get("min") || ""}
                    placeholder="0"
                  />
                </label>
                <label>
                  Đến
                  <input
                    type="number"
                    min="0"
                    step="10000"
                    name="max"
                    defaultValue={params.get("max") || ""}
                    placeholder="2.000.000"
                  />
                </label>
              </div>
              <label className="checkbox">
                <input
                  name="stock"
                  value="true"
                  type="checkbox"
                  defaultChecked={params.get("stock") === "true"}
                />{" "}
                Chỉ sản phẩm còn hàng
              </label>
              <input
                type="hidden"
                name="sort"
                value={params.get("sort") || "newest"}
              />
              <button className="button full">
                Áp dụng bộ lọc <ArrowRight size={16} />
              </button>
              <Link className="clear-filter" href="/san-pham">
                Xóa tất cả bộ lọc
              </Link>
            </form>
          </details>
        </aside>
        <section aria-busy={products.loading}>
          <div className="catalog-toolbar">
            <span>{products.data?.total ?? "…"} thiết kế cho bạn</span>
            <label>
              Sắp xếp{" "}
              <select
                aria-label="Sắp xếp sản phẩm"
                value={params.get("sort") || "newest"}
                onChange={(e) => change("sort", e.target.value)}
              >
                {[
                  ["newest", "Mới nhất"],
                  ["price-asc", "Giá tăng dần"],
                  ["price-desc", "Giá giảm dần"],
                  ["bestseller", "Bán chạy"],
                  ["rating", "Đánh giá cao"],
                ].map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {query && (
            <div className="filter-chips">
              {[...params]
                .filter(([k]) => !["sort", "page"].includes(k))
                .map(([k, v]) => (
                  <button key={k} onClick={() => change(k, "")}>
                    {v === "true" ? "Còn hàng" : k==="collection"?miloDesignText(metadata.data?.collections.find((c:any)=>c.slug===v)?.name||v):v} <X size={12} />
                  </button>
                ))}
            </div>
          )}
          {products.loading ? (
            <Skeleton count={6} />
          ) : products.error ? (
            <ErrorBox message={products.error} retry={products.retry} />
          ) : products.data?.items.length ? (
            <>
              <div className="product-grid catalog-grid">
                {products.data.items.map((p: any, i: number) => (
                  <ProductCard product={p} key={p.id} index={i} />
                ))}
              </div>
              <div className="pagination">
                {Array.from({ length: products.data.pages }, (_, i) => (
                  <button
                    className={products.data.page === i + 1 ? "selected" : ""}
                    onClick={() => change("page", String(i + 1))}
                    key={i}
                    aria-label={`Trang ${i + 1}`}
                    aria-current={
                      products.data.page === i + 1 ? "page" : undefined
                    }
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <Empty
              title="Chưa có thiết kế phù hợp với bộ lọc."
              href="/san-pham"
              text="Xem tất cả"
            />
          )}
        </section>
      </div>
    </div>
  );
}
