"use client";
import { useState, useEffect, useRef, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  ArrowLeft,
  LockKeyhole,
  Truck,
  Check,
  Trash2,
} from "lucide-react";
import { useShop, send, api, money, Quantity, Empty, ErrorBox } from "./client";
import AddressMap from "./address-map";
import { VariantSwitcher } from "./variant-switcher";
import { ProductPhoto, isRealPhoto } from "./product-media";
const emptyAddress = {
  recipient: "",
  phone: "",
  text: "",
  detail: "",
  instructions: "",
  confirmed: false,
  isDefault: false,
};
export function CartPage() {
  const { cart, changeCart } = useShop();
  return (
    <div className="container section cart-page">
      <p className="eyebrow">YOUR EVERYDAY PICKS</p>
      <h1>Giỏ đồ của bạn.</h1>
      {!cart.length ? (
        <Empty title="Chưa có sản phẩm trong giỏ." href="/san-pham" />
      ) : (
        <div className="checkout-layout">
          <section>
            {cart.map((i: any) => (
              <div className="cart-line large" key={i.variantId}>
                {isRealPhoto(i.image) && (
                  <Link href={`/san-pham/${i.slug}`}>
                    <ProductPhoto src={i.image} alt={i.name} />
                  </Link>
                )}
                <div>
                  <Link href={`/san-pham/${i.slug}`}>
                    <h3>{i.name}</h3>
                  </Link>
                  <p className="muted">
                    {i.color} / {i.size}
                  </p>
                  <b>{money(i.price)}</b>
                  <Quantity
                    value={i.quantity}
                    onChange={(n) =>
                      changeCart(
                        cart.map((c: any) =>
                          c.variantId === i.variantId
                            ? { ...c, quantity: n }
                            : c,
                        ),
                      )
                    }
                  />
                  <VariantSwitcher line={i} />
                </div>
                <button
                  aria-label={`Xóa ${i.name}`}
                  onClick={() =>
                    changeCart(
                      cart.filter((c: any) => c.variantId !== i.variantId),
                    )
                  }
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
            <Link className="text-link" href="/san-pham">
              <ArrowLeft size={16} /> Tiếp tục chọn đồ
            </Link>
          </section>
          <aside className="order-summary">
            <h2>Tạm tính</h2>
            <div className="row between">
              <span>Tiền hàng</span>
              <b>
                {money(
                  cart.reduce(
                    (s: number, i: any) => s + i.price * i.quantity,
                    0,
                  ),
                )}
              </b>
            </div>
            <p className="muted small">
              Giá, tồn kho, phí vận chuyển và ưu đãi được backend kiểm tra lại
              tại checkout. Giỏ hàng chưa giữ kho.
            </p>
            <Link className="button full" href="/thanh-toan">
              Đến thanh toán <ArrowRight size={17} />
            </Link>
            <p className="small muted">
              <LockKeyhole size={14} /> Cần đăng nhập và xác minh email để đặt
              hàng.
            </p>
          </aside>
        </div>
      )}
    </div>
  );
}
export function Checkout() {
  const { cart, user, ready, notify, changeCart, config, authError, loadUser } =
    useShop();
  const router = useRouter();
  const [address, setAddress] = useState<any>(emptyAddress),
    [saved, setSaved] = useState<any[]>([]),
    [method, setMethod] = useState("QR"),
    [coupon, setCoupon] = useState(""),
    [quote, setQuote] = useState<any>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [areas, setAreas] = useState<any>({
      provinces: [],
      districts: [],
      wards: [],
    }),
    [province, setProvince] = useState("");
  const payload = () => ({
    items: cart.map(({ variantId, quantity }: any) => ({
      variantId,
      quantity,
    })),
    address,
    method,
    ...(coupon.trim() ? { coupon: coupon.trim() } : {}),
  });
  useEffect(() => {
    if (user)
      api("/addresses")
        .then((a: any[]) => {
          setSaved(a);
          const d = a.find((s) => s.isDefault);
          if (d) {
            const { id, userId, createdAt, ...fields } = d;
            Object.keys(fields).forEach((k) => {
              if (fields[k] === null) delete fields[k];
            });
            setAddress(fields);
          }
        })
        .catch(() => {});
  }, [user]);
  useEffect(() => {
    if (config?.shippingMode === "ghn")
      api("/shipping/areas?type=province")
        .then((data) => setAreas((a: any) => ({ ...a, provinces: data })))
        .catch((e) => setError(e.message));
  }, [config?.shippingMode]);
  function field(key: string, value: any) {
    setAddress((a: any) => ({ ...a, [key]: value }));
    setQuote(null);
  }
  async function getQuote(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const q = await send("/checkout/quote", payload());
      setQuote(q);
    } catch (e: any) {
      setError(
        e.message +
          (e.fieldErrors ? " " + Object.values(e.fieldErrors).join(" ") : ""),
      );
    } finally {
      setBusy(false);
    }
  }
  async function place() {
    setBusy(true);
    setError("");
    try {
      const body = payload(),
        content = JSON.stringify(body);
      const prior = JSON.parse(
        sessionStorage.getItem("milo-checkout-key") || "null",
      );
      const key = prior?.content === content ? prior.key : crypto.randomUUID();
      sessionStorage.setItem(
        "milo-checkout-key",
        JSON.stringify({ key, content }),
      );
      const o = await send("/checkout", body, "POST", {
        "Idempotency-Key": key,
      });
      await changeCart([]);
      sessionStorage.removeItem("milo-checkout-key");
      notify("Đã tạo đơn hàng.");
      router.push(`/don-hang/${o.id}`);
    } catch (e: any) {
      setError(e.message);
      if (["PRICE_CHANGED", "OUT_OF_STOCK", "COUPON_LIMIT"].includes(e.code))
        setQuote(null);
    } finally {
      setBusy(false);
    }
  }
  if (!ready)
    return <div className="container section">Đang kiểm tra phiên…</div>;
  if (authError)
    return (
      <div className="container section">
        <ErrorBox message={authError} retry={loadUser} />
      </div>
    );
  if (!user)
    return (
      <div className="container section">
        <h1>Hoàn tất phong cách của bạn.</h1>
        <Empty
          title="Đăng nhập để đặt hàng an toàn và theo dõi đơn."
          href="/dang-nhap?next=/thanh-toan"
          text="Đăng nhập"
        />
      </div>
    );
  if (!cart.length)
    return <Empty title="Giỏ hàng chưa có sản phẩm." href="/san-pham" />;
  return (
    <div className="container checkout-page">
      <div className="breadcrumb">
        <Link href="/gio-hang">Giỏ hàng</Link>
        <span>/</span>
        <b>Thanh toán</b>
        <span>/</span>
        <span>Hoàn tất</span>
      </div>
      <div className="section-heading">
        <div>
          <p className="eyebrow">ONE STEP CLOSER TO YOUR STYLE</p>
          <h1>Chốt đơn, lên đồ.</h1>
        </div>
        <span className="secure-caption">
          <LockKeyhole size={16} /> Thông tin được bảo vệ
        </span>
      </div>
      {!user.verifiedAt && (
        <ErrorBox message="Email của bạn chưa được xác minh. Hãy mở email xác minh trước khi xác nhận đơn." />
      )}
      <div className="checkout-layout">
        <form id="checkout-form" onSubmit={getQuote} className="checkout-form">
          <section className="form-panel">
            <h2>
              <span>01</span> Địa chỉ nhận hàng
            </h2>
            {saved.length > 0 && (
              <label>
                Địa chỉ đã lưu
                <select
                  defaultValue=""
                  onChange={(e) => {
                    const a = saved.find((s) => s.id === e.target.value);
                    if (a) {
                      const { id, userId, createdAt, ...fields } = a;
                      Object.keys(fields).forEach((k) => {
                        if (fields[k] === null) delete fields[k];
                      });
                      setAddress(fields);
                      setQuote(null);
                    }
                  }}
                >
                  <option value="">Nhập địa chỉ mới</option>
                  {saved.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.recipient} — {a.text}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="form-row">
              <label>
                Họ tên người nhận
                <input
                  autoComplete="name"
                  required
                  minLength={2}
                  value={address.recipient}
                  onChange={(e) => field("recipient", e.target.value)}
                />
              </label>
              <label>
                Số điện thoại
                <input
                  type="tel"
                  autoComplete="tel"
                  required
                  value={address.phone}
                  onChange={(e) => field("phone", e.target.value)}
                  placeholder="09xx xxx xxx"
                />
              </label>
            </div>
            <AddressMap
              position={
                address.lat !== undefined
                  ? {
                      lat: address.lat,
                      lng: address.lng,
                      accuracy: address.accuracy,
                    }
                  : undefined
              }
              onPosition={(p) => {
                setAddress((a: any) => ({ ...a, ...p, confirmed: false }));
                setQuote(null);
              }}
              onAddress={(text) => field("text", text)}
            />
            <label>
              Địa chỉ giao hàng đầy đủ
              <input
                autoComplete="street-address"
                required
                minLength={10}
                value={address.text}
                onChange={(e) => field("text", e.target.value)}
                placeholder="Số nhà, đường, phường/xã, tỉnh/thành"
              />
            </label>
            <label>
              Tầng, căn hộ, tòa nhà
              <input
                value={address.detail}
                onChange={(e) => field("detail", e.target.value)}
                placeholder="Ví dụ: tầng 3, căn 302"
              />
            </label>
            {config?.shippingMode === "ghn" && (
              <>
                <label>
                  Tỉnh/thành theo GHN
                  <select
                    required
                    value={province}
                    onChange={async (e) => {
                      setProvince(e.target.value);
                      field("districtId", undefined);
                      const data = await api(
                        `/shipping/areas?type=district&parent=${e.target.value}`,
                      ).catch((err) => {
                        setError(err.message);
                        return [];
                      });
                      setAreas((a: any) => ({
                        ...a,
                        districts: data,
                        wards: [],
                      }));
                    }}
                  >
                    <option value="">Chọn tỉnh/thành</option>
                    {areas.provinces.map((a: any) => (
                      <option key={a.ProvinceID} value={a.ProvinceID}>
                        {a.ProvinceName}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Khu vực giao hàng GHN
                  <select
                    required
                    value={address.districtId || ""}
                    onChange={async (e) => {
                      field("districtId", Number(e.target.value));
                      const data = await api(
                        `/shipping/areas?type=ward&parent=${e.target.value}`,
                      ).catch((err) => {
                        setError(err.message);
                        return [];
                      });
                      setAreas((a: any) => ({ ...a, wards: data }));
                    }}
                  >
                    <option value="">Chọn khu vực</option>
                    {areas.districts.map((a: any) => (
                      <option key={a.DistrictID} value={a.DistrictID}>
                        {a.DistrictName}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Phường/xã theo GHN
                  <select
                    required
                    value={address.wardCode || ""}
                    onChange={(e) => field("wardCode", e.target.value)}
                  >
                    <option value="">Chọn phường/xã</option>
                    {areas.wards.map((a: any) => (
                      <option key={a.WardCode} value={a.WardCode}>
                        {a.WardName}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
            <label>
              Hướng dẫn giao hàng
              <textarea
                value={address.instructions}
                onChange={(e) => field("instructions", e.target.value)}
                placeholder="Ví dụ: gọi trước khi đến, gửi bảo vệ…"
                rows={2}
              />
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                required
                checked={address.confirmed}
                onChange={(e) => field("confirmed", e.target.checked)}
              />{" "}
              Tôi đã kiểm tra và xác nhận địa chỉ giao hàng cuối cùng.
            </label>
            <button
              type="button"
              className="text-link small"
              onClick={async () => {
                try {
                  await send("/addresses", address);
                  notify("Đã lưu địa chỉ vào tài khoản.");
                } catch (e: any) {
                  notify(e.message);
                }
              }}
            >
              Lưu địa chỉ vào tài khoản <PlusIcon />
            </button>
          </section>
          <section className="form-panel">
            <h2>
              <span>02</span> Vận chuyển & thanh toán
            </h2>
            <p className="small muted">
              Phí và dịch vụ được kiểm tra theo địa chỉ trước khi đặt đơn.
              Thuế/phụ phí hiện tại: 0đ.
            </p>
            <div className="payment-methods">
              {[
                [
                  "QR",
                  "QR / chuyển khoản qua payOS",
                  "Giữ hàng trong 15 phút. Chỉ xác nhận khi có bằng chứng từ nhà cung cấp.",
                ],
                [
                  "COD",
                  "Thanh toán khi nhận hàng",
                  "Tối đa 3.000.000đ/đơn. Cửa hàng xác nhận trước khi gửi.",
                ],
              ].map(([v, title, text]) => (
                <label key={v} className={method === v ? "selected" : ""}>
                  <input
                    type="radio"
                    name="payment"
                    value={v}
                    checked={method === v}
                    onChange={() => {
                      setMethod(v);
                      setQuote(null);
                    }}
                  />
                  <span>
                    <b>{title}</b>
                    <small>{text}</small>
                  </span>
                </label>
              ))}
            </div>
            {(config?.paymentMode === "mock" ||
              config?.shippingMode === "mock") && (
              <p className="development-note">
                Môi trường phát triển:{" "}
                {config.paymentMode === "mock"
                  ? "QR mô phỏng, không chuyển tiền thật. "
                  : ""}
                {config.shippingMode === "mock"
                  ? "Vận chuyển mô phỏng, không tạo đơn GHN thật."
                  : ""}
              </p>
            )}
            <label>
              Mã ưu đãi
              <input
                value={coupon}
                onChange={(e) => {
                  setCoupon(e.target.value);
                  setQuote(null);
                }}
                placeholder="Ví dụ: HELLOMILO"
                maxLength={40}
              />
            </label>
            <button className="button secondary full" disabled={busy}>
              {busy ? "Đang kiểm tra…" : "Kiểm tra giá & phí giao hàng"}{" "}
              <Truck size={17} />
            </button>
          </section>
        </form>
        <aside className="order-summary">
          <h2>
            Đơn hàng của bạn <small>({cart.length})</small>
          </h2>
          {cart.map((i: any) => (
            <div className="summary-line" key={i.variantId}>
              <ProductPhoto src={i.image} alt={i.name} />
              <div>
                <b>{i.name}</b>
                <small>
                  {i.color} / {i.size} × {i.quantity}
                </small>
              </div>
              <span>
                {money(
                  (quote?.lines.find((l: any) => l.variantId === i.variantId)
                    ?.price ?? i.price) * i.quantity,
                )}
              </span>
            </div>
          ))}
          {quote ? (
            <>
              <div className="summary-totals">
                <div>
                  <span>Tiền hàng</span>
                  <b>{money(quote.subtotal)}</b>
                </div>
                <div>
                  <span>Ưu đãi hàng hóa</span>
                  <b>−{money(quote.discount)}</b>
                </div>
                <div>
                  <span>Phí vận chuyển</span>
                  <b>{money(quote.shippingFee)}</b>
                </div>
                <div>
                  <span>Thuế / phụ phí</span>
                  <b>{money(quote.tax)}</b>
                </div>
                <div className="total">
                  <span>Tổng thanh toán</span>
                  <b>{money(quote.total)}</b>
                </div>
              </div>
              <p className="small muted">{quote.shipping.label}</p>
              <button
                className="button full"
                disabled={busy || !user.verifiedAt}
                onClick={place}
              >
                {busy ? "Đang tạo đơn…" : "Xác nhận đặt hàng"}{" "}
                <ArrowRight size={18} />
              </button>
            </>
          ) : (
            <p className="muted small">
              Nhập địa chỉ và bấm kiểm tra để biết tổng thanh toán chính xác.
            </p>
          )}
          {error && <ErrorBox message={error} />}
          <p className="small muted">
            Bằng việc đặt hàng, bạn đồng ý với{" "}
            <Link href="/chinh-sach?tab=giao-hang">
              điều kiện giao dịch và chính sách đổi trả
            </Link>
            .
          </p>
        </aside>
      </div>
    </div>
  );
}
function PlusIcon() {
  return <span>＋</span>;
}
