"use client";
import { useState, useEffect, FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  LogOut,
  UserRound,
  Package,
  MapPin,
  Heart,
  Monitor,
  RotateCcw,
  Bell,
  Clock,
  Check,
  LockKeyhole,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { api, send, useShop, money, Empty, ErrorBox } from "./client";
import { useResource } from "./store";
import AddressMap from "./address-map";
import { ProductPhoto, realProductImages } from "./product-media";
import { ReturnPhotos } from "./return-photos";
import { MyExchanges } from "./exchanges";
const labels: Record<string, string> = {
  PENDING_PAYMENT: "Chờ thanh toán",
  PENDING_CONFIRMATION: "Chờ xác nhận",
  CONFIRMED: "Đã xác nhận",
  PACKING: "Đang đóng gói",
  READY_TO_SHIP: "Sẵn sàng giao",
  SHIPPED: "Đang giao",
  DELIVERED: "Đã giao",
  COMPLETED: "Hoàn tất",
  CANCELLED: "Đã hủy",
  UNPAID: "Chưa thu tiền",
  PENDING: "Đang chờ",
  PAID: "Đã thanh toán",
  EXPIRED: "Hết hạn",
  EXCEPTION: "Cần đối soát",
  PARTIALLY_REFUNDED: "Hoàn một phần",
  REFUNDED: "Đã hoàn",
  REQUESTED: "Đã gửi yêu cầu",
  APPROVED: "Đã duyệt",
  RECEIVED: "Đã nhận hàng hoàn",
  REJECTED: "Từ chối",
  NOT_CREATED: "Chưa tạo vận đơn",
  CREATED: "Đã tạo vận đơn",
  PICKED_UP: "Đã lấy hàng",
  IN_TRANSIT: "Đang vận chuyển",
  OUT_FOR_DELIVERY: "Đang giao đến bạn",
  DELIVERY_FAILED: "Giao chưa thành công",
  RETURNING: "Đang hoàn về",
  RETURNED: "Đã hoàn về",
};
export const statusText = (v: string) => labels[v] || v;
const date = (s: string) =>
  new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(s));
export function AuthForm({
  mode,
}: {
  mode: "login" | "register" | "forgot" | "reset" | "verify";
}) {
  const { afterLogin, notify } = useShop(),
    params = useSearchParams(),
    router = useRouter();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [fields, setFields] = useState<any>({});
  const titles = {
    login: "Chào bạn, lại là Milo.",
    register: "Bắt đầu chất riêng.",
    forgot: "Quên mật khẩu?",
    reset: "Mật khẩu mới, an tâm mới.",
    verify: "Xác minh email của bạn.",
  };
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setFields({});
    const f = new FormData(e.currentTarget);
    try {
      let data: any, path: string;
      if (mode === "login") {
        data = {
          email: f.get("email"),
          password: f.get("password"),
          ...(f.get("otp") ? { otp: f.get("otp") } : {}),
        };
        path = "/auth/login";
      } else if (mode === "register") {
        data = {
          name: f.get("name"),
          email: f.get("email"),
          password: f.get("password"),
          marketingConsent: f.get("marketing") === "on",
        };
        path = "/auth/register";
      } else if (mode === "forgot") {
        data = { email: f.get("email") };
        path = "/auth/forgot";
      } else {
        data = {
          token: params.get("token") || "",
          ...(mode === "reset" ? { password: f.get("password") } : {}),
        };
        path = `/auth/${mode}`;
      }
      const r = await send(path, data);
      if (mode === "login") {
        await afterLogin();
        notify("Đăng nhập thành công.");
        const next = params.get("next");
        router.push(
          next && next.startsWith("/") && !next.startsWith("//")
            ? next
            : "/tai-khoan",
        );
      } else setMessage(r.message);
    } catch (e: any) {
      setError(e.message);
      setFields(e.fieldErrors || {});
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-layout container">
      <div className="auth-art">
        <p className="eyebrow">WELCOME TO THE MILO CLUB</p>
        <h2>
          BE YOU.
          <br />
          WEAR
          <br />
          <i>MILO.</i>
        </h2>
        <span className="auth-star">✳</span>
        <p>
          Một tủ đồ dễ mặc.
          <br />
          Một không gian để là chính mình.
        </p>
      </div>
      <div className="auth-form">
        <p className="eyebrow">YOUR STYLE STARTS HERE</p>
        <h1>{titles[mode]}</h1>
        <p className="muted">
          {mode === "login"
            ? "Đăng nhập để lưu gu, giữ đơn và theo dõi hành trình."
            : mode === "register"
              ? "Tạo tài khoản. Xác minh email. Sẵn sàng lên đồ."
              : "Bảo vệ tài khoản của bạn bằng các bước xác minh an toàn."}
        </p>
        {message ? (
          <div className="success-box" role="status">
            <Check />
            <p>{message}</p>
            <Link className="button" href="/dang-nhap">
              Đến đăng nhập <ArrowRight size={16} />
            </Link>
          </div>
        ) : (
          <form onSubmit={submit}>
            {mode === "register" && (
              <label>
                Họ và tên
                <input
                  name="name"
                  autoComplete="name"
                  required
                  minLength={2}
                  maxLength={100}
                />
                {fields.name && (
                  <small className="field-error">{fields.name}</small>
                )}
              </label>
            )}
            {["login", "register", "forgot"].includes(mode) && (
              <label>
                Email
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={254}
                />
                {fields.email && (
                  <small className="field-error">{fields.email}</small>
                )}
              </label>
            )}
            {["login", "register", "reset"].includes(mode) && (
              <label>
                Mật khẩu
                <input
                  name="password"
                  type="password"
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  required
                  minLength={mode === "login" ? 1 : 15}
                  maxLength={256}
                />
                {mode !== "login" && (
                  <small>
                    Ít nhất 15 ký tự. Cho phép dấu cách, Unicode và trình quản
                    lý mật khẩu.
                  </small>
                )}
                {fields.password && (
                  <small className="field-error">{fields.password}</small>
                )}
              </label>
            )}
            {mode === "login" && (
              <>
                <label>
                  Mã xác thực Admin <span className="muted">(nếu có)</span>
                  <input
                    name="otp"
                    autoComplete="one-time-code"
                    placeholder="TOTP hoặc mã khôi phục"
                    maxLength={100}
                  />
                </label>
                <Link className="text-link small" href="/quen-mat-khau">
                  Quên mật khẩu?
                </Link>
              </>
            )}
            {mode === "register" && (
              <label className="checkbox">
                <input name="marketing" type="checkbox" /> Tôi muốn nhận email
                về bộ sưu tập và ưu đãi (tùy chọn).
              </label>
            )}
            {error && <ErrorBox message={error} />}
            <button className="button full" disabled={busy}>
              {busy
                ? "Đang xử lý…"
                : mode === "login"
                  ? "Đăng nhập"
                  : mode === "register"
                    ? "Tạo tài khoản"
                    : mode === "verify"
                      ? "Xác minh email"
                      : "Gửi yêu cầu"}{" "}
              <ArrowRight size={17} />
            </button>
          </form>
        )}
        <div className="auth-switch">
          {mode === "login" ? (
            <>
              Mới ghé Milo? <Link href="/dang-ky">Tạo tài khoản ngay ↗</Link>
            </>
          ) : (
            <Link href="/dang-nhap">Đã có tài khoản? Đăng nhập ↗</Link>
          )}
        </div>
        <p className="small muted">
          Thông tin của bạn được xử lý theo{" "}
          <Link href="/chinh-sach?tab=bao-mat">chính sách bảo mật</Link>.
        </p>
      </div>
    </div>
  );
}
export function Account() {
  const { user, ready, logout, notify, loadUser, authError } = useShop();
  const [tab, setTab] = useState("profile"),
    [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [recent, setRecent] = useState<any[]>([]);
  const tabs = [
    ["profile", "Hồ sơ", UserRound],
    ["orders", "Đơn hàng", Package],
    ["addresses", "Địa chỉ", MapPin],
    ["wishlist", "Yêu thích", Heart],
    ["recent", "Đã xem gần đây", Clock],
    ["returns", "Đổi trả", RotateCcw],
    ["sessions", "Phiên đăng nhập", Monitor],
    ["notifications", "Thông báo", Bell],
    ["security", "Bảo mật", LockKeyhole],
  ] as const;
  async function load() {
    setError("");
    if (["profile", "security", "recent"].includes(tab)) {
      setData(null);
      return;
    }
    try {
      const paths: any = {
        orders: "/orders",
        addresses: "/addresses",
        wishlist: "/me/wishlist",
        returns: "/returns",
        sessions: "/me/sessions",
        notifications: "/me/notifications",
      };
      setData(await api(paths[tab]));
    } catch (e: any) {
      setError(e.message);
    }
  }
  useEffect(() => {
    if (user) load();
    try {
      setRecent(JSON.parse(localStorage.getItem("milo-recent") || "[]"));
    } catch {}
  }, [tab, user]);
  if (!ready)
    return <div className="container section">Đang tải tài khoản…</div>;
  if (authError)
    return (
      <div className="container section">
        <ErrorBox message={authError} retry={loadUser} />
      </div>
    );
  if (!user)
    return (
      <Empty
        title="Tủ đồ và hành trình của bạn ở đây."
        href="/dang-nhap"
        text="Đăng nhập"
      />
    );
  async function profile(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      await send(
        "/me",
        {
          name: f.get("name"),
          phone: f.get("phone") || undefined,
          preferences: f.getAll("preferences"),
          marketingConsent: f.get("marketing") === "on",
        },
        "PATCH",
      );
      await loadUser();
      notify("Đã lưu hồ sơ.");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="container section">
      <p className="eyebrow">YOUR PERSONAL SPACE</p>
      <div className="row between">
        <h1>Xin chào, {user.name.split(" ").at(-1)}.</h1>
        {user.role === "ADMIN" && (
          <Link className="button secondary" href="/admin">
            Trang quản trị <ArrowUpRight size={17} />
          </Link>
        )}
      </div>
      <div className="account-layout">
        <aside className="account-nav">
          {tabs.map(([key, label, Icon]) => (
            <button
              key={key}
              className={tab === key ? "selected" : ""}
              onClick={() => {
                setTab(key);
                setData(null);
              }}
            >
              <Icon size={17} />
              {label}
            </button>
          ))}
          <button onClick={logout}>
            <LogOut size={17} />
            Đăng xuất
          </button>
        </aside>
        <section className="account-content">
          {error && <ErrorBox message={error} retry={load} />}
          <h2>{tabs.find((t) => t[0] === tab)?.[1]}</h2>
          {tab === "profile" && (
            <form onSubmit={profile}>
              <p className="small">
                {user.email} ·{" "}
                {user.verifiedAt
                  ? "Email đã xác minh"
                  : "Email chưa xác minh; hãy mở liên kết trong hộp thư."}
              </p>
              <label>
                Họ tên
                <input
                  name="name"
                  defaultValue={user.name}
                  required
                  minLength={2}
                />
              </label>
              <label>
                Số điện thoại
                <input
                  name="phone"
                  type="tel"
                  defaultValue={user.phone || ""}
                />
              </label>
              <fieldset>
                <legend>Phong cách yêu thích (tùy chọn)</legend>
                <p className="small muted">
                  Dùng tag phong cách để gợi ý sản phẩm. Bạn có thể thay đổi bất
                  kỳ lúc nào.
                </p>
                <div className="interest-choices">
                  {["streetwear", "minimal", "casual", "sporty"].map((s) => (
                    <label className="checkbox" key={s}>
                      <input
                        type="checkbox"
                        name="preferences"
                        value={s}
                        defaultChecked={user.preferences.includes(s)}
                      />
                      {s}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="checkbox">
                <input
                  type="checkbox"
                  name="marketing"
                  defaultChecked={user.marketingConsent}
                />{" "}
                Đồng ý nhận email marketing
              </label>
              <button className="button" disabled={busy}>
                Lưu thay đổi <Check size={16} />
              </button>
              {user.preferences.length > 0 && (
                <p className="small">
                  <Link href={`/san-pham?style=${user.preferences[0]}`}>
                    Gợi ý theo phong cách {user.preferences[0]} của bạn ↗
                  </Link>
                </p>
              )}
            </form>
          )}
          {tab === "orders" &&
            data &&
            (data.length ? (
              data.map((o: any) => (
                <Link
                  className="order-row"
                  key={o.id}
                  href={`/don-hang/${o.id}`}
                >
                  <div>
                    <b>{o.code}</b>
                    <small>
                      {date(o.createdAt)} · {o.items.length} dòng sản phẩm
                    </small>
                  </div>
                  <span className="badge">{statusText(o.status)}</span>
                  <b>{money(o.total)}</b>
                  <ArrowRight size={17} />
                </Link>
              ))
            ) : (
              <Empty
                title="Chưa có đơn nào. Tìm món đồ đầu tiên nhé."
                href="/san-pham"
              />
            ))}
          {tab === "addresses" && (
            <>
              <div className="address-grid">
                {data?.map((a: any) => (
                  <div className="address-card" key={a.id}>
                    <b>
                      {a.recipient}{" "}
                      {a.isDefault && <span className="badge">Mặc định</span>}
                    </b>
                    <p>
                      {a.phone}
                      <br />
                      {a.text}
                      <br />
                      {a.detail}
                    </p>
                    <div className="row">
                      <button
                        className="text-link small"
                        onClick={async () => {
                          try {
                            const { id, userId, createdAt, ...fields } = a;
                            Object.keys(fields).forEach((k) => {
                              if (fields[k] === null) delete fields[k];
                            });
                            await send(
                              `/addresses/${a.id}`,
                              { ...fields, isDefault: true },
                              "PATCH",
                            );
                            load();
                          } catch (e: any) {
                            notify(e.message);
                          }
                        }}
                      >
                        Đặt mặc định
                      </button>
                      <button
                        className="text-link small"
                        onClick={async () => {
                          await send(`/addresses/${a.id}`, {}, "DELETE");
                          load();
                        }}
                      >
                        Xóa
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <AddressForm onSaved={load} />
            </>
          )}
          {tab === "wishlist" &&
            data &&
            (data.length ? (
              <div className="recent-grid">
                {data.map((i: any) => (
                  <Link key={i.productId} href={`/san-pham/${i.product.slug}`}>
                    <ProductPhoto
                      src={realProductImages(i.product)[0]?.url}
                      alt={i.product.name}
                    />
                    <b>{i.product.name}</b>
                    <p>{money(i.product.price)}</p>
                  </Link>
                ))}
              </div>
            ) : (
              <p>Nhấn biểu tượng trái tim trên sản phẩm để lưu vào đây.</p>
            ))}
          {tab === "recent" &&
            (recent.length ? (
              <div className="recent-grid">
                {recent.map((i) => (
                  <Link key={i.slug} href={`/san-pham/${i.slug}`}>
                    <ProductPhoto src={i.image} alt={i.name} />
                    <b>{i.name}</b>
                    <p>{money(i.price)}</p>
                  </Link>
                ))}
              </div>
            ) : (
              <p>Bạn chưa xem sản phẩm nào trên thiết bị này.</p>
            ))}
          {tab === "sessions" &&
            data?.map((s: any) => (
              <div className="list-card" key={s.id}>
                <Monitor size={20} />
                <div>
                  <b>{s.agent}</b>
                  <small>
                    Hoạt động: {date(s.lastSeenAt)} · Hết hạn:{" "}
                    {date(s.expiresAt)}
                  </small>
                </div>
                <button
                  className="button secondary small-button"
                  onClick={async () => {
                    await send(`/me/sessions/${s.id}`, {}, "DELETE");
                    await loadUser();
                    load();
                  }}
                >
                  Thu hồi
                </button>
              </div>
            ))}
          {tab === "returns" && <MyExchanges />}
          {tab === "returns" &&
            data &&
            (data.length ? (
              data.map((r: any) => (
                <div className="list-card" key={r.id}>
                  <div>
                    <b>{r.order.code}</b>
                    <p>{r.reason}</p>
                    <small>{date(r.createdAt)}</small>
                  </div>
                  <span className="badge">{statusText(r.status)}</span>
                </div>
              ))
            ) : (
              <p>
                Chưa có yêu cầu đổi trả. Bạn có thể gửi từ chi tiết đơn đã giao.
              </p>
            ))}
          {tab === "notifications" &&
            data &&
            (data.length ? (
              data.map((n: any) => (
                <div className="list-card" key={n.id}>
                  <Bell size={18} />
                  <div>
                    <b>{n.title}</b>
                    <p>{n.body}</p>
                    <small>{date(n.createdAt)}</small>
                  </div>
                </div>
              ))
            ) : (
              <p>Chưa có thông báo mới.</p>
            ))}
          {tab === "security" && <SecurityForm />}
        </section>
      </div>
    </div>
  );
}
export function SecurityForm() {
  const { notify } = useShop();
  const [error, setError] = useState("");
  return (
    <>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          const f = new FormData(e.currentTarget);
          try {
            await send("/auth/reauth", {
              password: f.get("password"),
              ...(f.get("otp") ? { otp: f.get("otp") } : {}),
            });
            notify("Đã xác thực lại trong 10 phút.");
          } catch (e: any) {
            setError(e.message);
          }
        }}
      >
        <h3>Xác thực lại cho thao tác nhạy cảm</h3>
        <label>
          Mật khẩu hiện tại
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </label>
        <label>
          Mã Admin TOTP / khôi phục (nếu có)
          <input name="otp" autoComplete="one-time-code" />
        </label>
        <button className="button secondary">Xác thực lại</button>
      </form>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          const f = new FormData(e.currentTarget);
          try {
            await send("/auth/password", {
              currentPassword: f.get("currentPassword"),
              password: f.get("password"),
            });
            notify("Đã đổi mật khẩu.");
            e.currentTarget?.reset();
          } catch (e: any) {
            setError(e.message);
          }
        }}
      >
        <h3>Đổi mật khẩu</h3>
        <label>
          Mật khẩu hiện tại
          <input
            name="currentPassword"
            type="password"
            required
            autoComplete="current-password"
          />
        </label>
        <label>
          Mật khẩu mới
          <input
            name="password"
            type="password"
            required
            minLength={15}
            maxLength={256}
            autoComplete="new-password"
          />
        </label>
        <button className="button">Lưu mật khẩu mới</button>
      </form>
      {error && <ErrorBox message={error} />}
    </>
  );
}
function AddressForm({ onSaved }: { onSaved: () => void }) {
  const { notify } = useShop();
  const [a, setA] = useState<any>({
    recipient: "",
    phone: "",
    text: "",
    detail: "",
    instructions: "",
    confirmed: false,
    isDefault: false,
  });
  function field(k: string, v: any) {
    setA((old: any) => ({ ...old, [k]: v }));
  }
  return (
    <details className="form-panel">
      <summary>＋ Thêm địa chỉ</summary>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await send("/addresses", a);
            notify("Đã lưu địa chỉ.");
            onSaved();
          } catch (e: any) {
            notify(e.message);
          }
        }}
      >
        <div className="form-row">
          <label>
            Người nhận
            <input
              required
              value={a.recipient}
              onChange={(e) => field("recipient", e.target.value)}
            />
          </label>
          <label>
            Điện thoại
            <input
              required
              type="tel"
              value={a.phone}
              onChange={(e) => field("phone", e.target.value)}
            />
          </label>
        </div>
        <AddressMap
          position={
            a.lat ? { lat: a.lat, lng: a.lng, accuracy: a.accuracy } : undefined
          }
          onPosition={(p) => setA((v: any) => ({ ...v, ...p }))}
          onAddress={(text) => field("text", text)}
        />
        <label>
          Địa chỉ đầy đủ
          <input
            required
            minLength={10}
            value={a.text}
            onChange={(e) => field("text", e.target.value)}
          />
        </label>
        <label>
          Tầng / căn hộ
          <input
            value={a.detail}
            onChange={(e) => field("detail", e.target.value)}
          />
        </label>
        <label>
          Ghi chú
          <input
            value={a.instructions}
            onChange={(e) => field("instructions", e.target.value)}
          />
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={a.isDefault}
            onChange={(e) => field("isDefault", e.target.checked)}
          />{" "}
          Đặt làm mặc định
        </label>
        <label className="checkbox">
          <input
            required
            type="checkbox"
            checked={a.confirmed}
            onChange={(e) => field("confirmed", e.target.checked)}
          />{" "}
          Tôi xác nhận địa chỉ này chính xác.
        </label>
        <button className="button">Lưu địa chỉ</button>
      </form>
    </details>
  );
}
export function OrderDetail({ id }: { id: string }) {
  const { data: o, error, loading, retry } = useResource(`/orders/${id}`);
  const { notify } = useShop();
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    if (!o || o.payment?.status !== "PENDING") return;
    let count = 0;
    const timer = setInterval(() => {
      if (++count >= 60) {
        clearInterval(timer);
        setChecking(false);
        return;
      }
      retry();
    }, 5000);
    return () => clearInterval(timer);
  }, [o?.payment?.status, id]);
  if (loading && !o)
    return <div className="container section">Đang tải đơn hàng…</div>;
  if (error)
    return (
      <div className="container section">
        <ErrorBox message={error} retry={retry} />
      </div>
    );
  if (!o) return null;
  return (
    <div className="container section order-detail">
      <div className="breadcrumb">
        <Link href="/tai-khoan">Tài khoản</Link>
        <span>/</span>
        <span>{o.code}</span>
      </div>
      <div className="section-heading">
        <div>
          <p className="eyebrow">YOUR MILO JOURNEY</p>
          <h1>Đơn hàng {o.code}</h1>
          <p className="muted">{date(o.createdAt)}</p>
        </div>
        <span className="badge large-badge">{statusText(o.status)}</span>
      </div>
      <div className="checkout-layout">
        <section>
          <div className="form-panel">
            <h2>Hành trình đơn hàng</h2>
            <ol className="timeline">
              {o.history.map((h: any) => (
                <li key={h.id}>
                  <span className="timeline-dot" />
                  <div>
                    <b>{statusText(h.to)}</b>
                    <small>{date(h.createdAt)}</small>
                    <p>{h.reason}</p>
                  </div>
                </li>
              ))}
            </ol>
            {["PENDING_PAYMENT", "PENDING_CONFIRMATION"].includes(o.status) && (
              <button
                className="button secondary"
                onClick={async () => {
                  try {
                    await send(`/orders/${id}/cancel`, {});
                    notify("Đã hủy đơn và giải phóng hàng đang giữ.");
                    retry();
                  } catch (e: any) {
                    notify(e.message);
                  }
                }}
              >
                Hủy đơn hàng
              </button>
            )}
          </div>
          {o.method === "QR" && (
            <div className="form-panel payment-panel">
              <h2>Thanh toán QR</h2>
              <span className="badge">{statusText(o.payment.status)}</span>
              {o.payment.provider === "mock" && (
                <p className="development-note">
                  QR PHÁT TRIỂN — KHÔNG CHUYỂN TIỀN THẬT. Kết quả chỉ thay đổi
                  bằng sự kiện kiểm thử đã ký.
                </p>
              )}
              {o.payment.status === "PENDING" && (
                <>
                  {o.payment.qrData ? (
                    <QRCodeSVG
                      value={o.payment.qrData}
                      size={220}
                      marginSize={3}
                    />
                  ) : (
                    <p>
                      Đang chờ nhà cung cấp tạo mã QR. Worker sẽ thử lại khi
                      dịch vụ sẵn sàng.
                    </p>
                  )}
                  <h3>{money(o.payment.amount)}</h3>
                  <p>
                    Nội dung: <b>{o.code}</b>
                    <br />
                    Hạn thanh toán: {date(o.payment.expiresAt)}
                  </p>
                  {o.payment.checkoutUrl && o.payment.provider !== "mock" && (
                    <a
                      className="button"
                      href={o.payment.checkoutUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Mở trang thanh toán <ArrowUpRight size={16} />
                    </a>
                  )}
                  <p className="small muted">
                    {checking
                      ? "Đang cập nhật từ backend (tối đa 5 phút)."
                      : "Đã dừng tự kiểm tra. Bấm cập nhật để xem trạng thái."}{" "}
                    Trang quay về và ảnh chuyển khoản không xác nhận thanh toán.
                  </p>
                </>
              )}
              <button className="text-link" onClick={retry}>
                Cập nhật trạng thái ↻
              </button>
              {o.payment.status === "EXCEPTION" && (
                <p className="field-error">
                  Giao dịch cần cửa hàng đối soát (số tiền hoặc thời điểm không
                  khớp). Đơn không tự động được khôi phục.
                </p>
              )}
            </div>
          )}
          <div className="form-panel">
            <h2>Sản phẩm</h2>
            {o.items.map((i: any) => (
              <div key={i.id}>
                <div className="summary-line">
                  <ProductPhoto src={i.image} alt={i.name} />
                  <div>
                    <b>{i.name}</b>
                    <small>
                      {i.color} / {i.size} × {i.quantity}
                    </small>
                    <small>SKU: {i.sku}</small>
                  </div>
                  <span>{money(i.price * i.quantity - i.discount)}</span>
                </div>
                {["DELIVERED", "COMPLETED"].includes(o.status) && (
                  <details>
                    <summary>Viết đánh giá cho sản phẩm đã nhận</summary>
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const f = new FormData(e.currentTarget);
                        try {
                          await send("/reviews", {
                            orderItemId: i.id,
                            rating: Number(f.get("rating")),
                            content: f.get("content"),
                          });
                          notify("Cảm ơn bạn đã chia sẻ trải nghiệm.");
                        } catch (e: any) {
                          notify(e.message);
                        }
                      }}
                    >
                      <label>
                        Điểm đánh giá
                        <select name="rating">
                          {[5, 4, 3, 2, 1].map((n) => (
                            <option key={n} value={n}>
                              {n} sao
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Nội dung
                        <textarea
                          name="content"
                          required
                          minLength={10}
                          maxLength={2000}
                        />
                      </label>
                      <button className="button secondary small-button">
                        Gửi đánh giá
                      </button>
                    </form>
                  </details>
                )}
              </div>
            ))}
          </div>
          {["DELIVERED", "COMPLETED"].includes(o.status) && (
            <ReturnForm order={o} onSaved={retry} />
          )}
        </section>
        <aside>
          <div className="order-summary">
            <h2>Thông tin thanh toán</h2>
            <div className="summary-totals">
              <div>
                <span>Tiền hàng</span>
                <b>{money(o.subtotal)}</b>
              </div>
              <div>
                <span>Giảm giá</span>
                <b>−{money(o.discount)}</b>
              </div>
              <div>
                <span>Vận chuyển</span>
                <b>{money(o.shippingFee - o.shippingDiscount)}</b>
              </div>
              <div>
                <span>Thuế / phụ phí</span>
                <b>{money(o.tax)}</b>
              </div>
              <div className="total">
                <span>Tổng cộng</span>
                <b>{money(o.total)}</b>
              </div>
            </div>
            <p>
              {o.method === "COD"
                ? "Thanh toán khi nhận hàng"
                : "QR qua " + o.payment.provider}
              <br />
              <span className="badge">{statusText(o.payment.status)}</span>
            </p>
            {o.method === "COD" && (
              <p className="small muted">
                Cần thu: {money(o.total)}
                <br />
                Đơn vị vận chuyển đã thu: {money(o.shipment?.codCollected || 0)}
                <br />
                Đã chuyển về cửa hàng: {money(o.shipment?.codRemitted || 0)}
              </p>
            )}
            {o.payment.refunded > 0 && (
              <p>Đã hoàn: {money(o.payment.refunded)}</p>
            )}
            <hr />
            <h3>Địa chỉ nhận</h3>
            <b>{o.address.recipient}</b>
            <p>
              {o.address.phone}
              <br />
              {o.address.text}
              <br />
              {o.address.detail}
            </p>
            <p className="small muted">{o.address.instructions}</p>
            <hr />
            <h3>Vận chuyển</h3>
            <p>
              {statusText(o.shipment?.status || "NOT_CREATED")}
              <br />
              {o.shipment?.trackingCode || "Chưa có mã vận đơn"}
            </p>
            {o.shipment?.events?.map((e: any) => (
              <p className="small" key={e.id}>
                {date(e.createdAt)} · {statusText(e.status)}
              </p>
            ))}
            <p className="small muted">
              Không cung cấp vị trí trực tiếp của shipper khi chưa có nguồn GPS
              được cấp quyền.
            </p>
          </div>
          {o.returns.length > 0 && (
            <div className="form-panel">
              <h3>Yêu cầu đổi trả</h3>
              {o.returns.map((r: any) => (
                <p key={r.id}>
                  {r.reason}
                  <br />
                  <span className="badge">{statusText(r.status)}</span>
                </p>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
function ReturnForm({ order, onSaved }: { order: any; onSaved: () => void }) {
  const { notify } = useShop();
  const [images, setImages] = useState<string[]>([]);
  return (
    <details className="form-panel">
      <summary>Yêu cầu đổi trả / hỗ trợ đổi size</summary>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const items = order.items
            .filter((i: any) => f.get(`select-${i.id}`))
            .map((i: any) => ({
              orderItemId: i.id,
              quantity: Number(f.get(`qty-${i.id}`)),
            }));
          try {
            await send("/returns", {
              orderId: order.id,
              reason: f.get("reason"),
              items,
              images,
            });
            notify(
              "Đã gửi yêu cầu. Cửa hàng sẽ kiểm tra điều kiện và liên hệ.",
            );
            onSaved();
          } catch (e: any) {
            notify(e.message);
          }
        }}
      >
        <p className="small muted">
          Trong 14 ngày kể từ giao hàng. Với đổi size, ghi size mong muốn; phí
          và chênh lệch chỉ áp dụng sau khi bạn xác nhận.
        </p>
        <ReturnPhotos images={images} setImages={setImages} />
        {order.items.map((i: any) => (
          <div className="row" key={i.id}>
            <label className="checkbox">
              <input type="checkbox" name={`select-${i.id}`} />
              {i.name} / {i.size}
            </label>
            <label>
              Số lượng
              <input
                name={`qty-${i.id}`}
                type="number"
                min="1"
                max={i.quantity}
                defaultValue={1}
              />
            </label>
          </div>
        ))}
        <label>
          Lý do / size mong muốn
          <textarea name="reason" required minLength={10} maxLength={1000} />
        </label>
        <button className="button secondary">Gửi yêu cầu</button>
      </form>
    </details>
  );
}
