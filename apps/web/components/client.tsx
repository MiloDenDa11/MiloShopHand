"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  ReactNode,
} from "react";
import Link from "next/link";
import { ProductPhoto, realProductImages, productImagesForColor } from "./product-media";
import { usePathname } from "next/navigation";
import {
  ArrowUpRight,
  ArrowRight,
  Search,
  UserRound,
  ShoppingBag,
  Heart,
  X,
  Minus,
  Plus,
  Menu,
  Check,
  Instagram,
  Truck,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
export const brand = process.env.NEXT_PUBLIC_BRAND_NAME || "MILOSHOPHAND";
export const money = (n: number) =>
  new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(
    n,
  );
export async function api(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  if (options.method && options.method !== "GET") {
    let csrf = decodeURIComponent(
      document.cookie
        .split("; ")
        .find((s) => s.startsWith("milo_csrf="))
        ?.split("=")
        .slice(1)
        .join("=") || "",
    );
    if (!csrf) {
      const r = await fetch("/api/v1/auth/csrf", {
        credentials: "same-origin",
      });
      csrf = (await r.json()).token;
    }
    headers.set("X-CSRF-Token", csrf);
  }
  const r = await fetch(`/api/v1${path}`, {
    ...options,
    headers,
    credentials: "same-origin",
    signal: options.signal || AbortSignal.timeout(20000),
  });
  const b = await r
    .json()
    .catch(() => ({ message: "Máy chủ chưa sẵn sàng. Vui lòng thử lại." }));
  if (!r.ok) {
    const error = Object.assign(new Error(b.message), {
      code: b.code,
      status: r.status,
      fieldErrors: b.fieldErrors,
    });
    throw error;
  }
  return b;
}
export const send = (
  path: string,
  data: any,
  method = "POST",
  headers?: HeadersInit,
) => api(path, { method, body: JSON.stringify(data), headers });
type CartLine = {
  variantId: string;
  quantity: number;
  name: string;
  slug: string;
  image: string;
  price: number;
  color: string;
  size: string;
};
const Context = createContext<any>(null);
export function useShop() {
  return useContext(Context);
}
export function Providers({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<any>(null),
    [ready, setReady] = useState(false),
    [authError, setAuthError] = useState(""),
    [cart, setCart] = useState<CartLine[]>([]),
    [cartReady, setCartReady] = useState(false),
    [drawer, setDrawer] = useState(false),
    [toast, setToast] = useState(""),
    [config, setConfig] = useState<any>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function notify(message: string) {
    setToast(message);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(""), 4500);
  }
  async function loadUser() {
    setAuthError("");
    try {
      const u = await api("/me");
      setUser(u);
      return u;
    } catch (e: any) {
      if (e.status === 401) setUser(null);
      else
        setAuthError("Chưa kiểm tra được phiên đăng nhập. Vui lòng thử lại.");
      return null;
    } finally {
      setReady(true);
    }
  }
  async function loadCart() {
    try {
      const c = await api("/cart");
      const lines = (c?.items || []).map((i: any) => ({
        variantId: i.variantId,
        quantity: i.quantity,
        name: i.variant.product.name,
        slug: i.variant.product.slug,
        image: productImagesForColor(i.variant.product,i.variant.color,i.variant)[0]?.url || "",
        price: i.variant.price ?? i.variant.product.price,
        color: i.variant.color,
        size: i.variant.size,
      }));
      setCart(lines);
      return lines;
    } catch (e: any) {
      notify(e.message);
    }
  }
  useEffect(() => {
    try {
      setCart(JSON.parse(localStorage.getItem("milo-cart") || "[]"));
    } catch {}
    setCartReady(true);
    loadUser().then((u) => {
      if (u) loadCart();
    });
    api("/config")
      .then(setConfig)
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (cartReady) localStorage.setItem("milo-cart", JSON.stringify(cart));
  }, [cart, cartReady]);
  async function afterLogin() {
    const u = await loadUser();
    if (!u)
      throw new Error("Chưa đọc được phiên vừa đăng nhập. Vui lòng thử lại.");
    let local: CartLine[] = [];
    try {
      local = JSON.parse(localStorage.getItem("milo-cart") || "[]");
    } catch {}
    if (local.length && localStorage.getItem("milo-cart-owner") !== u?.id)
      await send("/cart/merge", {
        items: local.map(({ variantId, quantity }) => ({
          variantId,
          quantity,
        })),
      });
    await loadCart();
    localStorage.setItem("milo-cart-owner", u?.id || "guest");
  }
  async function changeCart(lines: CartLine[]) {
    setCart(lines);
    localStorage.setItem("milo-cart-owner", user?.id || "guest");
    if (user) {
      try {
        await send(
          "/cart",
          {
            items: lines.map(({ variantId, quantity }) => ({
              variantId,
              quantity,
            })),
          },
          "PATCH",
        );
      } catch (e: any) {
        notify(e.message);
        await loadCart();
        return false;
      }
    }
    return true;
  }
  async function add(
    product: any,
    v: any,
    quantity = 1,
    options: { openDrawer?: boolean } = {},
  ) {
    const old = cart.find((i) => i.variantId === v.id);
    if ((old?.quantity || 0) + quantity > Math.min(20, v.available)) {
      notify("Số lượng vượt tồn kho hiện tại.");
      return false;
    }
    const lines = old
      ? cart.map((i) =>
          i.variantId === v.id ? { ...i, quantity: i.quantity + quantity } : i,
        )
      : [
          ...cart,
          {
            variantId: v.id,
            quantity,
            name: product.name,
            slug: product.slug,
            image: productImagesForColor(product,v.color)[0]?.url || "",
            price: v.price,
            color: v.color,
            size: v.size,
          },
        ];
    const saved = await changeCart(lines);
    if (saved === false) return false;
    if (options.openDrawer !== false) setDrawer(true);
    notify("Đã thêm vào giỏ hàng.");
    return true;
  }
  async function logout() {
    try {
      await send("/auth/logout", {});
      setUser(null);
      setCart([]);
      localStorage.setItem("milo-cart-owner", "guest");
      notify("Đã đăng xuất.");
    } catch (e: any) {
      notify(e.message);
    }
  }
  return (
    <Context.Provider
      value={{
        user,
        ready,
        authError,
        cart,
        changeCart,
        add,
        drawer,
        setDrawer,
        notify,
        afterLogin,
        logout,
        loadUser,
        config,
      }}
    >
      {children}
      <CartDrawer />
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          {toast}
          <button aria-label="Đóng thông báo" onClick={() => setToast("")}>
            <X size={16} />
          </button>
        </div>
      )}
    </Context.Provider>
  );
}
export { SiteHeader as Header, SiteFooter as Footer } from "./site-shell";
export function CartDrawer() {
  const { drawer, setDrawer, cart, changeCart } = useShop();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (drawer) ref.current?.showModal();
    else ref.current?.close();
  }, [drawer]);
  return (
    <dialog
      className="cart-dialog"
      aria-label="Giỏ hàng"
      ref={ref}
      onCancel={() => setDrawer(false)}
      onClick={(e) => {
        if (e.target === ref.current) setDrawer(false);
      }}
    >
      <div className="drawer-inner">
        <div className="row between">
          <h2>
            Giỏ đồ của bạn <span className="muted">({cart.length})</span>
          </h2>
          <button aria-label="Đóng giỏ hàng" onClick={() => setDrawer(false)}>
            <X />
          </button>
        </div>
        <p className="muted small">Thêm vào giỏ chưa giữ hàng trong kho.</p>
        {!cart.length ? (
          <Empty
            title="Giỏ hàng đang chờ chất riêng của bạn."
            href="/san-pham"
            text="Khám phá ngay"
            onClick={() => setDrawer(false)}
          />
        ) : (
          <>
            <div className="drawer-lines">
              {cart.map((i: any) => (
                <div className="cart-line" key={i.variantId}>
                  <ProductPhoto src={i.image} alt={i.name} />
                  <div>
                    <Link
                      href={`/san-pham/${i.slug}`}
                      onClick={() => setDrawer(false)}
                    >
                      {i.name}
                    </Link>
                    <p className="muted small">
                      {i.color} / {i.size}
                    </p>
                    <b>{money(i.price)}</b>
                    <Quantity
                      value={i.quantity}
                      onChange={(n) =>
                        changeCart(
                          n
                            ? cart.map((c: any) =>
                                c.variantId === i.variantId
                                  ? { ...c, quantity: n }
                                  : c,
                              )
                            : cart.filter(
                                (c: any) => c.variantId !== i.variantId,
                              ),
                        )
                      }
                    />
                  </div>
                  <button
                    aria-label={`Xóa ${i.name}`}
                    onClick={() =>
                      changeCart(
                        cart.filter((c: any) => c.variantId !== i.variantId),
                      )
                    }
                  >
                    <X size={17} />
                  </button>
                </div>
              ))}
            </div>
            <div className="drawer-total">
              <div className="row between">
                <span>Tạm tính</span>
                <b>
                  {money(
                    cart.reduce(
                      (s: number, i: any) => s + i.price * i.quantity,
                      0,
                    ),
                  )}
                </b>
              </div>
              <p className="small muted">
                Phí vận chuyển và ưu đãi được tính ở bước tiếp theo.
              </p>
              <Link
                className="button full"
                href="/thanh-toan"
                onClick={() => setDrawer(false)}
              >
                Thanh toán <ArrowRight size={18} />
              </Link>
              <Link
                className="button secondary full"
                href="/gio-hang"
                onClick={() => setDrawer(false)}
              >
                Xem giỏ hàng
              </Link>
            </div>
          </>
        )}
      </div>
    </dialog>
  );
}
export function Quantity({
  value,
  onChange,
  max = 20,
}: {
  value: number;
  onChange: (n: number) => void;
  max?: number;
}) {
  return (
    <div className="quantity">
      <button
        aria-label="Giảm số lượng"
        disabled={value <= 1}
        onClick={() => onChange(Math.max(1, value - 1))}
      >
        <Minus size={13} />
      </button>
      <span aria-live="polite">{value}</span>
      <button
        aria-label="Tăng số lượng"
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
      >
        <Plus size={13} />
      </button>
    </div>
  );
}
export { ProductCard } from "./product-card";
export function Empty({
  title,
  href,
  text,
  onClick,
}: {
  title: string;
  href?: string;
  text?: string;
  onClick?: () => void;
}) {
  return (
    <div className="empty">
      <ShoppingBag size={36} strokeWidth={1} />
      <h3>{title}</h3>
      {href && (
        <Link className="button" href={href} onClick={onClick}>
          {text || "Khám phá sản phẩm"} <ArrowRight size={16} />
        </Link>
      )}
    </div>
  );
}
export function ErrorBox({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  return (
    <div className="error-box" role="alert">
      <p>{message}</p>
      {retry && (
        <button className="button secondary" onClick={retry}>
          Thử lại
        </button>
      )}
    </div>
  );
}
export function Skeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="product-grid" aria-label="Đang tải sản phẩm">
      {Array.from({ length: count }, (_, i) => (
        <div className="skeleton" key={i}>
          <div />
          <p />
          <p />
        </div>
      ))}
    </div>
  );
}
