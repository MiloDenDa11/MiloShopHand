"use client";
import { useState, useEffect, useRef, FormEvent } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Search,
  UserRound,
  ShoppingBag,
  Menu,
  X,
  ArrowUpRight,
  ArrowRight,
  Truck,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { api, useShop, brand, money } from "./client";
import { ProductPhoto, realProductImages } from "./product-media";
import { editorialAssets } from "../content/brand";
const links = [
  ["/", "Trang chủ"],
  ["/san-pham", "Cửa hàng"],
  ["/san-pham?sort=newest", "Hàng mới"],
  ["/bo-suu-tap", "Bộ sưu tập"],
  ["/phong-cach", "Milo Journal"],
];

function useDialog(open: boolean) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!open) {
      ref.current?.close();
      return;
    }
    ref.current?.showModal();
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = old;
    };
  }, [open]);
  return ref;
}
export function SiteHeader() {
  const { cart, setDrawer, user, config } = useShop();
  const path = usePathname();
  const [menu, setMenu] = useState(false),
    [search, setSearch] = useState(false);
  const mobile = useDialog(menu);
  useEffect(() => {
    setMenu(false);
    setSearch(false);
  }, [path]);
  const count = cart.reduce((n: number, i: any) => n + i.quantity, 0);
  return (
    <div className="site-masthead">
      <div className="announcement">
        <span>
          {config?.announcement ||
            "FREE SHIPPING CHO ĐƠN TỪ 699K · ĐỔI SIZE TRONG 14 NGÀY"}
        </span>
        <ArrowUpRight size={13} />
      </div>
      <header className="header">
        <Link
          className="wordmark"
          href="/"
          aria-label="MILOSHOPHAND — Về trang chủ"
        >
          {config?.brand || brand}
          <span className="wordmark-note">independent wear</span>
        </Link>
        <nav className="desktop-nav" aria-label="Điều hướng chính">
          {links.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className={path === href ? "active" : ""}
              aria-current={path === href ? "page" : undefined}
            >
              {label}
              {label === "Hàng mới" && <span className="nav-new-dot" />}
            </Link>
          ))}
        </nav>
        <div className="header-actions">
          <button
            type="button"
            aria-label="Tìm kiếm"
            onClick={() => setSearch(true)}
            aria-haspopup="dialog"
          >
            <Search size={21} />
          </button>
          <Link
            href="/tai-khoan"
            aria-label={user ? "Tài khoản" : "Đăng nhập"}
            className={user ? "has-account" : ""}
          >
            <UserRound size={21} />
          </Link>
          <button
            type="button"
            className="bag-button"
            aria-label={`Giỏ hàng, ${count} sản phẩm`}
            onClick={() => setDrawer(true)}
          >
            <ShoppingBag size={20} />
            <span aria-live="polite">{count}</span>
          </button>
          <button
            type="button"
            className="mobile-menu"
            aria-label="Mở menu"
            aria-expanded={menu}
            aria-controls="mobile-navigation"
            onClick={() => setMenu(true)}
          >
            <Menu size={23} />
          </button>
        </div>
      </header>
      <dialog
        ref={mobile}
        id="mobile-navigation"
        className="mobile-navigation-dialog"
        aria-label="Menu điều hướng"
        onCancel={() => setMenu(false)}
      >
        <div className="mobile-navigation-top">
          <span className="wordmark">{config?.brand || brand}</span>
          <button aria-label="Đóng menu" onClick={() => setMenu(false)}>
            <X size={25} />
          </button>
        </div>
        <p className="eyebrow">THE EVERYDAY DIRECTORY</p>
        <nav aria-label="Điều hướng trên điện thoại">
          {links.map(([href, label], i) => (
            <Link href={href} key={href} onClick={() => setMenu(false)}>
              <span className="eyebrow">0{i + 1}</span>
              <span>{label}</span>
              <ArrowUpRight size={23} />
            </Link>
          ))}
        </nav>
        <div className="mobile-navigation-bottom">
          <p>
            Vintage spirit.
            <br />
            <em>Modern everyday.</em>
          </p>
          <Link
            className="text-link"
            href="/tai-khoan"
            onClick={() => setMenu(false)}
          >
            Tài khoản của bạn
            <ArrowRight size={17} />
          </Link>
        </div>
      </dialog>
      <SearchDialog open={search} onClose={() => setSearch(false)} />
    </div>
  );
}

function SearchDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const ref = useDialog(open),
    router = useRouter();
  const [query, setQuery] = useState(""),
    [results, setResults] = useState<any[]>([]),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) {
      setTimeout(() => input.current?.focus(), 50);
    } else {
      setQuery("");
      setResults([]);
      setError("");
    }
  }, [open]);
  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setResults([]);
      setLoading(false);
      setError("");
      return;
    }
    const ac = new AbortController();
    const t = setTimeout(() => {
      setLoading(true);
      setError("");
      api(`/products?q=${encodeURIComponent(query.trim())}&limit=4`, {
        signal: ac.signal,
      })
        .then((data) => setResults(data.items || []))
        .catch((e) => {
          if (e.name !== "AbortError") setError(e.message);
        })
        .finally(() => {
          if (!ac.signal.aborted) setLoading(false);
        });
    }, 300);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [query, open]);
  function submit(e: FormEvent) {
    e.preventDefault();
    router.push(
      `/san-pham${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ""}`,
    );
    onClose();
  }
  return (
    <dialog
      ref={ref}
      className="search-dialog"
      aria-label="Tìm kiếm sản phẩm"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="search-dialog-content">
        <div className="row between">
          <p className="eyebrow">FIND YOUR NEXT EVERYDAY</p>
          <button aria-label="Đóng tìm kiếm" onClick={onClose}>
            <X size={24} />
          </button>
        </div>
        <h2>Bạn đang tìm điều gì?</h2>
        <form onSubmit={submit} className="search-dialog-form">
          <label className="sr-only" htmlFor="global-search">
            Tìm kiếm sản phẩm
          </label>
          <input
            ref={input}
            id="global-search"
            type="search"
            value={query}
            maxLength={100}
            placeholder="Tên áo, chất liệu, phong cách…"
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
          />
          <button aria-label="Tìm sản phẩm" type="submit">
            <ArrowRight size={24} />
          </button>
        </form>
        {loading && (
          <p className="small muted" role="status">
            Đang tìm trong tủ đồ Milo…
          </p>
        )}
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        {results.length > 0 ? (
          <div className="search-results">
            {results.map((p) => (
              <Link key={p.id} href={`/san-pham/${p.slug}`} onClick={onClose}>
                <ProductPhoto src={realProductImages(p)[0]?.url} alt={p.name} />
                <div>
                  <span className="eyebrow">{p.category?.name}</span>
                  <b>{p.name}</b>
                </div>
                <span>{money(p.price)}</span>
                <ArrowUpRight size={18} />
              </Link>
            ))}
          </div>
        ) : query.trim().length >= 2 && !loading && !error ? (
          <p className="small muted">
            Chưa tìm thấy sản phẩm. Thử một từ khóa khác hoặc xem toàn bộ cửa
            hàng.
          </p>
        ) : (
          <div className="search-suggestions">
            <span className="eyebrow">GỢI Ý TỪ MILO</span>
            {[
              ["Áo phông", "/san-pham?category=ao-phong"],
              ["Oversized", "/san-pham?fit=Oversized"],
              ["Streetwear", "/san-pham?style=streetwear"],
              ["Hàng mới", "/san-pham?sort=newest"],
            ].map(([label, href]) => (
              <Link href={href} key={href} onClick={onClose}>
                {label}
                <ArrowUpRight size={14} />
              </Link>
            ))}
          </div>
        )}
        <Link
          className="text-link"
          href={`/san-pham${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ""}`}
          onClick={onClose}
        >
          Xem tất cả kết quả
          <ArrowUpRight size={17} />
        </Link>
      </div>
    </dialog>
  );
}

export function SiteFooter() {
  const { config } = useShop();
  const email =
    config?.contactEmail && !config.contactEmail.endsWith(".local")
      ? config.contactEmail
      : null;
  return (
    <>
      <div className="perks">
        <span>
          <Truck size={20} />
          Giao hàng toàn quốc
        </span>
        <span>
          <RotateCcw size={20} />
          Đổi size trong {config?.returnDays || 14} ngày
        </span>
        <span>
          <ShieldCheck size={20} />
          Thanh toán an toàn
        </span>
      </div>
      <footer className="edition-footer">
        <div className="footer-top">
          <div className="footer-brand-copy">
            <p className="eyebrow">GOOD CLOTHES. YOUR OWN WAY.</p>
            <h2>
              Ít khuôn mẫu.
              <br />
              <em>Nhiều chất riêng.</em>
            </h2>
            <p>
              Thời trang cho những ngày bình thường,
              <br />
              và một bạn không hề bình thường.
            </p>
            <Link className="text-link" href="/chinh-sach?tab=lien-he">
              Nói chuyện với Milo
              <ArrowUpRight size={17} />
            </Link>
            {email && (
              <a className="footer-email" href={`mailto:${email}`}>
                {email}
              </a>
            )}
          </div>
          <div>
            <h3>Tủ đồ Milo</h3>
            <Link href="/san-pham">Tất cả sản phẩm</Link>
            <Link href="/san-pham?sort=newest">Hàng mới</Link>
            <Link href="/bo-suu-tap">Bộ sưu tập</Link>
            <Link href="/phong-cach">Milo Journal</Link>
          </div>
          <div>
            <h3>Luôn ở đây để hỗ trợ</h3>
            <Link href="/chinh-sach?tab=giao-hang">Giao hàng & thanh toán</Link>
            <Link href="/chinh-sach?tab=doi-tra">Đổi trả & chọn size</Link>
            <Link href="/chinh-sach?tab=bao-mat">Quyền riêng tư</Link>
            <Link href="/chinh-sach?tab=faq">Câu hỏi thường gặp</Link>
          </div>
          <div className="footer-community">
            <h3>The Milo circle</h3>
            <p>
              Gặp nhau ở những câu chuyện
              <br />
              bên ngoài tủ đồ.
            </p>
            <Link
              href={editorialAssets.instagram || "/#community"}
              className="text-link"
            >
              {editorialAssets.instagram ? "Instagram" : "Cộng đồng Milo"}
              <ArrowUpRight size={17} />
            </Link>
            <span className="footer-community-tag">#WEARMILO</span>
          </div>
        </div>
        <Link
          className="footer-large-wordmark"
          href="/"
          aria-label="MILOSHOPHAND — Trang chủ"
        >
          {config?.brand || brand}
        </Link>
        <div className="footer-bottom">
          <span>
            © {new Date().getFullYear()} {config?.brand || brand}. Wear your
            own story.
          </span>
          <span>THIẾT KẾ CHO MỖI NGÀY · TIẾNG VIỆT / VND</span>
        </div>
      </footer>
    </>
  );
}
