"use client";
import { useState, useEffect, useRef, ReactNode, FormEvent } from "react";
import Link from "next/link";
import {
  X,
  ArrowUpRight,
  Download,
  Plus,
  RefreshCw,
  Package,
  Search,
  Printer,
} from "lucide-react";
import { api, send, useShop, money, Empty, ErrorBox } from "./client";
import { statusText, SecurityForm } from "./account";
import { ExchangeOffer, AdminExchanges } from "./exchanges";
import { BannerFields } from "./configured-banners";
import { ProductPhoto } from "./product-media";
import { miloDesignText } from "../lib/milo-design";
const menus = [
  ["dashboard", "Tổng quan"],
  ["orders", "Đơn hàng"],
  ["products", "Sản phẩm"],
  ["inventory", "Tồn kho"],
  ["categories", "Danh mục"],
  ["collections", "Bộ sưu tập"],
  ["styles", "Tag phong cách"],
  ["coupons", "Mã ưu đãi"],
  ["payments", "Thanh toán & COD"],
  ["refunds", "Hoàn tiền"],
  ["returns", "Đổi trả"],
  ["exchanges", "Exchange / Size"],
  ["users", "Khách hàng"],
  ["reviews", "Đánh giá"],
  ["settings", "Nội dung & cấu hình"],
  ["audit", "Nhật ký quản trị"],
  ["jobs", "Tác vụ nền"],
  ["security", "Xác thực lại"],
];
const states: Record<string, string[]> = {
  PENDING_PAYMENT: ["CANCELLED"],
  PENDING_CONFIRMATION: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PACKING", "CANCELLED"],
  PACKING: ["READY_TO_SHIP", "CANCELLED"],
  READY_TO_SHIP: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["DELIVERED"],
  DELIVERED: ["COMPLETED"],
};
const date = (d: string) =>
  new Date(d).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog ref={ref} className="admin-dialog" onCancel={onClose}>
      <header>
        <h2>{title}</h2>
        <button onClick={onClose} aria-label="Đóng">
          <X size={22} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
function Table({ headers, rows }: { headers: string[]; rows: ReactNode[][] }) {
  return rows.length ? (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((v, j) => (
                <td key={j}>{v}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <div className="no-data">Chưa có dữ liệu trong phạm vi này.</div>
  );
}
export function Admin() {
  const { user, ready, authError, loadUser } = useShop();
  if (authError)
    return (
      <div className="container section">
        <ErrorBox message={authError} retry={loadUser} />
      </div>
    );
  if (!ready)
    return <div className="admin-error">Đang kiểm tra quyền truy cập…</div>;
  if (!user)
    return (
      <Empty
        title="Đăng nhập tài khoản Admin đã bật MFA."
        href="/dang-nhap?next=/admin"
        text="Đăng nhập Admin"
      />
    );
  if (user.role !== "ADMIN")
    return (
      <div className="admin-error">
        <h1>Bạn không có quyền truy cập.</h1>
        <p>Khu vực này dành cho quản trị cửa hàng.</p>
        <Link className="button" href="/">
          Về cửa hàng
        </Link>
      </div>
    );
  return <AdminWorkspace />;
}
function AdminWorkspace() {
  const { notify, config } = useShop();
  const [tab, setTab] = useState("dashboard"),
    [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [selected, setSelected] = useState<any>(null),
    [editor, setEditor] = useState(false),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState(""),
    [from, setFrom] = useState(
      new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
    ),
    [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  async function load() {
    setLoading(true);
    setError("");
    try {
      const path =
        tab === "dashboard"
          ? `/admin/dashboard?from=${from}T00:00:00%2B07:00&to=${to}T23:59:59%2B07:00`
          : tab === "orders"
            ? `/admin/orders?q=${encodeURIComponent(search)}${filter ? `&status=${filter}` : ""}`
            : ["products", "inventory"].includes(tab)
              ? `/admin/${tab}`
              : `/admin/data/${tab}`;
      if (!["security", "exchanges"].includes(tab)) setData(await api(path));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    setData(null);
    setSelected(null);
    setEditor(false);
    setFilter("");
    load();
  }, [tab]);
  async function act(path: string, body: any, method = "POST") {
    try {
      await send(path, body, method);
      notify("Đã lưu thao tác.");
      await load();
      return true;
    } catch (e: any) {
      notify(e.message);
      setError(e.message);
      return false;
    }
  }
  const list = Array.isArray(data) ? data : data?.items || [];
  const editable = [
    "products",
    "categories",
    "collections",
    "styles",
    "coupons",
  ].includes(tab);
  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <h2>MILO / ADMIN</h2>
        <p>CỬA HÀNG · MỘT KHO MAIN</p>
        <nav aria-label="Quản trị">
          {menus.map(([key, title]) => (
            <button
              key={key}
              className={tab === key ? "selected" : ""}
              onClick={() => setTab(key)}
            >
              {title}
            </button>
          ))}
        </nav>
      </aside>
      <section className="admin-main">
        <header>
          <div>
            <p>MILOSHOPHAND / QUẢN TRỊ CỬA HÀNG</p>
            <h1>{menus.find((m) => m[0] === tab)?.[1]}</h1>
          </div>
          <Link className="button secondary" href="/">
            Xem cửa hàng <ArrowUpRight size={16} />
          </Link>
        </header>
        {error && <ErrorBox message={error} retry={load} />}
        <div className="admin-toolbar">
          {tab === "dashboard" && (
            <>
              <label>
                Từ ngày
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </label>
              <label>
                Đến ngày
                <input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
              </label>
              <button className="button secondary small-button" onClick={load}>
                Áp dụng
              </button>
            </>
          )}
          {tab === "orders" && (
            <form
              className="row"
              onSubmit={(e) => {
                e.preventDefault();
                load();
              }}
            >
              <input
                aria-label="Tìm đơn hàng"
                placeholder="Mã đơn, khách, điện thoại, vận đơn…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <select
                aria-label="Lọc trạng thái đơn"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="">Mọi trạng thái</option>
                {Object.keys(states)
                  .concat(["COMPLETED", "CANCELLED"])
                  .map((s) => (
                    <option key={s} value={s}>
                      {statusText(s)}
                    </option>
                  ))}
              </select>
              <button className="button small-button">
                <Search size={15} />
                Tìm
              </button>
            </form>
          )}
          {editable && (
            <button
              className="button small-button"
              onClick={() => {
                setSelected(null);
                setEditor(true);
              }}
            >
              <Plus size={14} />
              Thêm mới
            </button>
          )}
          <button className="button secondary small-button" onClick={load}>
            <RefreshCw size={13} />
            Làm mới
          </button>
          {["dashboard", "orders", "payments"].includes(tab) && (
            <a
              className="button secondary small-button"
              href={`/api/v1/admin/export.csv?from=${from}T00:00:00%2B07:00&to=${to}T23:59:59%2B07:00`}
            >
              <Download size={14} />
              Xuất CSV
            </a>
          )}
        </div>
        {loading && !data ? (
          <p className="no-data">Đang tải dữ liệu…</p>
        ) : (
          <>
            {tab === "dashboard" && data && <Dashboard data={data} />}
            {tab === "orders" && data && (
              <>
                <Table
                  headers={[
                    "Mã đơn / thời gian",
                    "Khách hàng",
                    "Trạng thái",
                    "Thanh toán",
                    "Vận chuyển",
                    "Tổng cộng",
                    "",
                  ]}
                  rows={list.map((o: any) => [
                    <>
                      <b>{o.code}</b>
                      <p>{date(o.createdAt)}</p>
                    </>,
                    <>
                      {o.user.name}
                      <p>{o.user.email}</p>
                      <p>{o.address.phone}</p>
                    </>,
                    <span className="badge">{statusText(o.status)}</span>,
                    <>
                      {o.method}
                      <p>{statusText(o.payment.status)}</p>
                    </>,
                    <>
                      {statusText(o.shipment?.status)}
                      <p>{o.shipment?.trackingCode}</p>
                    </>,
                    money(o.total),
                    <button onClick={() => setSelected(o)}>Xử lý ↗</button>,
                  ])}
                />
                <p className="admin-note">
                  Hiển thị tối đa 30 đơn gần nhất theo điều kiện. Tổng kết quả:{" "}
                  {data.total}.
                </p>
              </>
            )}
            {tab === "products" && (
              <Table
                headers={[
                  "Sản phẩm",
                  "Danh mục",
                  "Giá / giá vốn",
                  "SKU",
                  "Trạng thái",
                  "",
                ]}
                rows={list.map((p: any) => [
                  <div className="admin-products-row">
                    <ProductPhoto src={p.images[0]?.url} alt={p.name} sizes="48px" />
                    <b>{p.name}</b>
                  </div>,
                  p.category.name,
                  <>
                    {money(p.price)}
                    <p>Vốn {money(p.cost)}</p>
                  </>,
                  p.variants.filter((v: any) => v.active).length,
                  p.active ? "Đang bán" : "Đã ẩn",
                  <button
                    onClick={() => {
                      setSelected(p);
                      setEditor(true);
                    }}
                  >
                    Chỉnh sửa ↗
                  </button>,
                ])}
              />
            )}
            {tab === "inventory" && (
              <Table
                headers={[
                  "SKU / sản phẩm",
                  "Kho",
                  "Thực tế",
                  "Đang giữ",
                  "Có thể bán",
                  "Cảnh báo",
                  "",
                ]}
                rows={list.map((i: any) => [
                  <>
                    <b>{i.variant.sku}</b>
                    <p>{i.variant.product.name}</p>
                    <p>
                      {i.variant.color} / {i.variant.size}
                    </p>
                  </>,
                  i.warehouse,
                  i.onHand,
                  i.reserved,
                  i.onHand - i.reserved,
                  i.onHand - i.reserved <= i.lowThreshold ? (
                    <span className="badge">Sắp hết</span>
                  ) : (
                    "—"
                  ),
                  <button onClick={() => setSelected(i)}>
                    Điều chỉnh / nhật ký
                  </button>,
                ])}
              />
            )}
            {["categories", "collections", "styles", "coupons"].includes(
              tab,
            ) && (
              <Table
                headers={
                  tab === "coupons"
                    ? [
                        "Mã ưu đãi",
                        "Giá trị",
                        "Giới hạn",
                        "Thời gian",
                        "Trạng thái",
                        "",
                      ]
                    : ["Tên", "Slug", "Thông tin", ""]
                }
                rows={list.map((i: any) =>
                  tab === "coupons"
                    ? [
                        i.code,
                        i.type === "PERCENT"
                          ? `${i.value}% (tối đa ${money(i.maxDiscount)})`
                          : money(i.value),
                        `${i.used} / ${i.maxUses} · ${i.perUserLimit}/khách`,
                        <>
                          {date(i.startsAt)}
                          <p>đến {date(i.endsAt)}</p>
                        </>,
                        i.active ? "Đang bật" : "Tắt",
                        <button
                          onClick={() => {
                            setSelected(i);
                            setEditor(true);
                          }}
                        >
                          Sửa
                        </button>,
                      ]
                    : [
                        miloDesignText(i.name),
                        i.slug,
                        tab === "collections"
                          ? `${i.season} · ${i.climate} · ${i.campaign}`
                          : "—",
                        <button
                          onClick={() => {
                            setSelected(i);
                            setEditor(true);
                          }}
                        >
                          Sửa
                        </button>,
                      ],
                )}
              />
            )}
            {tab === "payments" && (
              <>
                <p className="admin-note">
                  PAID chỉ đến từ bằng chứng provider hoặc COD đã thu có chứng
                  từ. Giao thành công và tiền COD chuyển về được theo dõi riêng.
                </p>
                <Table
                  headers={[
                    "Đơn hàng",
                    "Phương thức",
                    "Trạng thái",
                    "Số tiền",
                    "Đã nhận / đã hoàn",
                    "Ngoại lệ",
                    "",
                  ]}
                  rows={list.map((p: any) => [
                    p.order.code,
                    p.provider,
                    <span className="badge">{statusText(p.status)}</span>,
                    money(p.amount),
                    <>
                      {money(p.received)}
                      <p>Hoàn {money(p.refunded)}</p>
                    </>,
                    p.events.filter((e: any) => e.result === "EXCEPTION")
                      .length,
                    <button onClick={() => setSelected(p)}>Đối soát ↗</button>,
                  ])}
                />
              </>
            )}
            {tab === "refunds" && (
              <>
                <p className="admin-note">
                  Hoàn tiền qua chuyển khoản thủ công có chứng từ. Chưa tích hợp
                  API hoàn tiền tự động payOS; gửi yêu cầu chưa đồng nghĩa đã
                  hoàn.
                </p>
                <Table
                  headers={[
                    "Mã hoàn",
                    "Số tiền",
                    "Lý do",
                    "Trạng thái",
                    "Chứng từ",
                    "",
                  ]}
                  rows={list.map((f: any) => [
                    f.id,
                    money(f.amount),
                    f.reason,
                    statusText(f.status),
                    f.evidence || "Chưa có",
                    <button onClick={() => setSelected(f)}>Xử lý</button>,
                  ])}
                />
              </>
            )}
            {tab === "returns" && (
              <Table
                headers={[
                  "Đơn hàng",
                  "Ngày yêu cầu",
                  "Lý do",
                  "Số dòng",
                  "Trạng thái",
                  "",
                ]}
                rows={list.map((r: any) => [
                  r.order.code,
                  date(r.createdAt),
                  r.reason,
                  r.items.length,
                  statusText(r.status),
                  <button onClick={() => setSelected(r)}>
                    Kiểm tra / xử lý
                  </button>,
                ])}
              />
            )}
            {tab === "users" && (
              <Table
                headers={[
                  "Khách hàng",
                  "Email",
                  "Vai trò",
                  "Xác minh",
                  "Trạng thái",
                  "",
                ]}
                rows={list.map((u: any) => [
                  u.name,
                  u.email,
                  u.role,
                  u.verifiedAt ? "Đã xác minh" : "Chờ xác minh",
                  u.disabled ? "Đã khóa" : "Hoạt động",
                  <button
                    onClick={() =>
                      act(
                        `/admin/users/${u.id}`,
                        { disabled: !u.disabled },
                        "PATCH",
                      )
                    }
                  >
                    {u.disabled ? "Mở khóa" : "Khóa tài khoản"}
                  </button>,
                ])}
              />
            )}
            {tab === "reviews" && (
              <Table
                headers={[
                  "Điểm",
                  "Nội dung",
                  "Ngày",
                  "Trạng thái",
                  "Lý do kiểm duyệt",
                  "",
                ]}
                rows={list.map((v: any) => [
                  `${v.rating}/5`,
                  v.content,
                  date(v.createdAt),
                  v.visible ? "Hiển thị" : "Ẩn",
                  v.moderationReason || "—",
                  <button onClick={() => setSelected(v)}>Kiểm duyệt</button>,
                ])}
              />
            )}
            {tab === "audit" && (
              <Table
                headers={[
                  "Thời điểm",
                  "Actor",
                  "Thao tác",
                  "Đối tượng",
                  "Dữ liệu",
                ]}
                rows={list.map((a: any) => [
                  date(a.createdAt),
                  a.actorId || "Hệ thống",
                  a.action,
                  `${a.entity} / ${a.entityId}`,
                  <details>
                    <summary>Chi tiết</summary>
                    <pre>{JSON.stringify(a.data, null, 2)}</pre>
                  </details>,
                ])}
              />
            )}
            {tab === "jobs" && (
              <Table
                headers={[
                  "Loại",
                  "Trạng thái",
                  "Lần thử",
                  "Thử lại lúc",
                  "Lỗi",
                  "",
                ]}
                rows={list.map((j: any) => [
                  j.kind,
                  j.status,
                  j.attempts,
                  date(j.nextAttemptAt),
                  j.lastError || "—",
                  j.status === "FAILED" ? (
                    <button
                      onClick={() => act(`/admin/jobs/${j.id}/retry`, {})}
                    >
                      Thử lại
                    </button>
                  ) : (
                    "—"
                  ),
                ])}
              />
            )}
            {tab === "settings" && data && (
              <SettingsForm
                data={
                  data.find((s: any) => s.key === "public")?.value || config
                }
                onSave={(d) => act("/admin/settings", d)}
              />
            )}
            {tab === "exchanges" && <AdminExchanges />}
            {tab === "security" && (
              <div className="admin-panel">
                <SecurityForm />
              </div>
            )}
          </>
        )}
        {editor && (
          <Modal
            title={
              tab === "products"
                ? "Biên tập sản phẩm"
                : selected
                  ? "Cập nhật cấu hình"
                  : "Thêm cấu hình"
            }
            onClose={() => {
              setEditor(false);
              setSelected(null);
            }}
          >
            {tab === "products" ? (
              <ProductForm
                product={selected}
                onSave={async (d) => {
                  const ok = await act(
                    selected
                      ? `/admin/products/${selected.id}`
                      : "/admin/products",
                    d,
                    selected ? "PATCH" : "POST",
                  );
                  if (ok) {
                    setEditor(false);
                    setSelected(null);
                  }
                }}
              />
            ) : (
              <MetadataForm
                kind={tab}
                item={selected}
                onRemove={
                  selected
                    ? async () => {
                        if (
                          await act(
                            `/admin/data/${tab}/${selected.id}`,
                            {},
                            "DELETE",
                          )
                        ) {
                          setEditor(false);
                          setSelected(null);
                        }
                      }
                    : undefined
                }
                onSave={async (d) => {
                  if (await act(`/admin/data/${tab}`, d)) {
                    setEditor(false);
                    setSelected(null);
                  }
                }}
              />
            )}
          </Modal>
        )}
        {selected && !editor && (
          <Modal
            title={
              tab === "orders"
                ? `Đơn ${selected.code}`
                : menus.find((m) => m[0] === tab)?.[1] || "Chi tiết"
            }
            onClose={() => setSelected(null)}
          >
            <AdminAction
              tab={tab}
              item={selected}
              act={act}
              onClose={() => setSelected(null)}
            />
          </Modal>
        )}
      </section>
    </div>
  );
}
function Dashboard({ data: d }: { data: any }) {
  const stats = [
    ["Đơn được tạo", d.count, false, "Tất cả trạng thái trong kỳ"],
    ["Giá trị đơn tạo", d.createdValue, true, "Chưa phải tiền đã thu"],
    ["Doanh số đã giao", d.sales, true, "Tiền hàng − ưu đãi, đơn đã giao"],
    [
      "Doanh thu thuần bán hàng",
      d.netSales,
      true,
      "Doanh số đã giao − hoàn tiền",
    ],
    [
      "Tiền về ngân hàng (ròng)",
      d.bankCash,
      true,
      "QR + COD chuyển về − phí COD − hoàn",
    ],
    ["Tiền đã hoàn", d.refunds, true, "Chỉ refund đã hoàn tất"],
    [
      "COD đơn vị vận chuyển đã thu",
      d.codCollected,
      true,
      "Có chứng từ xác nhận thu",
    ],
    [
      "COD chờ chuyển về",
      d.codPendingRemittance,
      true,
      "Đã thu − đã đối soát chuyển về",
    ],
  ];
  return (
    <>
      <div className="stat-grid">
        {stats.map(([title, value, isMoney, note]) => (
          <div className="stat-card" key={String(title)}>
            <span>{title}</span>
            <b>{isMoney ? money(Number(value)) : value}</b>
            <small>{note}</small>
          </div>
        ))}
      </div>
      <div className="admin-panels">
        <div className="admin-panel">
          <h3>Doanh số theo ngày · VND</h3>
          {d.daily.length ? (
            <div className="chart">
              {d.daily.map((p: any) => (
                <div
                  key={p.date}
                  className="chart-col"
                  title={`${p.date}: ${money(p.value)}`}
                  style={{
                    height: `${Math.max(3, (p.value / Math.max(...d.daily.map((i: any) => i.value), 1)) * 100)}%`,
                  }}
                >
                  <span>
                    {p.date}: {money(p.value)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="no-data">Chưa có doanh số đã giao trong kỳ.</p>
          )}
          <p className="admin-note">
            Ngày theo Asia/Ho_Chi_Minh. Kỳ lọc theo ngày tạo đơn; không phải báo
            cáo kế toán tiền mặt theo ngày nhận tiền.
          </p>
        </div>
        <div className="admin-panel">
          <h3>Trạng thái đơn hàng</h3>
          {Object.entries(d.byStatus).map(([key, value]: any) => (
            <div
              className="row between"
              key={key}
              style={{ marginBottom: 8, fontSize: 11 }}
            >
              <span>{statusText(key)}</span>
              <b>{value}</b>
            </div>
          ))}
        </div>
      </div>
      <div className="admin-panels">
        <div className="admin-panel">
          <h3>Sản phẩm bán chạy</h3>
          <Table
            headers={["Sản phẩm", "Đã giao", "Giá trị"]}
            rows={d.bestsellers.map((p: any) => [
              p.name,
              p.quantity,
              money(p.value),
            ])}
          />
        </div>
        <div className="admin-panel">
          <h3>Hàng sắp hết</h3>
          <Table
            headers={["SKU", "Sản phẩm", "Có thể bán"]}
            rows={d.lowStock
              .slice(0, 8)
              .map((i: any) => [i.sku, i.name, i.available])}
          />
        </div>
      </div>
      <div className="admin-panel">
        <h3>Chi phí & chất lượng vận hành</h3>
        <Table
          headers={["Chỉ tiêu", "Giá trị"]}
          rows={[
            ["Giảm giá", money(d.discounts)],
            ["Phí vận chuyển thu khách", money(d.shippingCharged)],
            ["Giá vốn đơn đã giao", money(d.costOfGoods)],
            ["Biên gộp ước tính", money(d.estimatedGrossMargin)],
            ["Tỷ lệ hủy", `${(d.cancelRate * 100).toFixed(1)}%`],
            ["Tỷ lệ có yêu cầu đổi trả", `${(d.returnRate * 100).toFixed(1)}%`],
            [
              "Tỷ lệ đang giao thất bại",
              `${(d.deliveryFailedRate * 100).toFixed(1)}%`,
            ],
          ]}
        />
        <p className="admin-note">{d.marginNote}</p>
      </div>
    </>
  );
}
function ProductForm({
  product: p,
  onSave,
}: {
  product: any;
  onSave: (d: any) => Promise<void>;
}) {
  const [meta, setMeta] = useState<any>(null),
    [variants, setVariants] = useState<any[]>(
      p?.variants.map(
        ({ id, sku, color, colorHex, size, price, active }: any) => ({
          id,
          sku,
          color,
          colorHex,
          size,
          price,
          active,
        }),
      ) || [
        {
          sku: "",
          color: "Đen",
          colorHex: "#242426",
          size: "M",
          price: null,
          active: true,
        },
      ],
    ),
    [images, setImages] = useState<any[]>(
      p?.images.map(({ url, alt, color, view, crop }: any) => ({
        url,
        alt,
        ...(color ? { color } : {}),
        ...(view ? { view } : {}),
        ...(crop ? { crop } : {}),
      })) || [],
    ),
    [busy, setBusy] = useState(false);
  const { notify } = useShop();
  useEffect(() => {
    api("/catalog").then(setMeta);
  }, []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const f = new FormData(e.currentTarget);
    await onSave({
      name: f.get("name"),
      slug: f.get("slug"),
      description: f.get("description"),
      categoryId: f.get("categoryId"),
      material: f.get("material"),
      fit: f.get("fit"),
      care: f.get("care"),
      price: Number(f.get("price")),
      originalPrice: f.get("originalPrice")
        ? Number(f.get("originalPrice"))
        : null,
      cost: Number(f.get("cost")),
      active: f.get("active") === "on",
      featured: f.get("featured") === "on",
      styleIds: f.getAll("styles"),
      collectionIds: f.getAll("collections"),
      variants,
      images,
    });
    setBusy(false);
  }
  return (
    <form className="admin-form" onSubmit={submit}>
      <div className="form-row">
        <label>
          Tên sản phẩm
          <input name="name" defaultValue={p?.name} required />
        </label>
        <label>
          Đường dẫn (slug)
          <input
            name="slug"
            defaultValue={p?.slug}
            pattern="[a-z0-9-]+"
            required
          />
        </label>
        <label>
          Danh mục
          <select name="categoryId" defaultValue={p?.categoryId} required>
            {meta?.categories.map((c: any) => (
              <option key={c.id} value={c.id}>
                {miloDesignText(c.name)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Chất liệu
          <input
            name="material"
            defaultValue={p?.material || "Cotton 100%"}
            required
          />
        </label>
        <label>
          Giá bán VND
          <input
            name="price"
            type="number"
            min="1"
            defaultValue={p?.price || 249000}
            required
          />
        </label>
        <label>
          Giá trước giảm VND
          <input
            name="originalPrice"
            type="number"
            min="1"
            defaultValue={p?.originalPrice || ""}
          />
        </label>
        <label>
          Giá vốn VND
          <input
            name="cost"
            type="number"
            min="0"
            defaultValue={p?.cost || 100000}
            required
          />
        </label>
        <label>
          Kiểu dáng
          <input name="fit" defaultValue={p?.fit || "Oversized"} required />
        </label>
      </div>
      <label>
        Mô tả
        <textarea
          name="description"
          minLength={10}
          required
          defaultValue={miloDesignText(p?.description)}
        />
      </label>
      <label>
        Bảo quản
        <textarea name="care" defaultValue={p?.care || "Giặt nhẹ dưới 30°C."} />
      </label>
      <div className="row">
        <label className="checkbox">
          <input
            name="active"
            type="checkbox"
            defaultChecked={p?.active ?? true}
          />
          Đang bán
        </label>
        <label className="checkbox">
          <input name="featured" type="checkbox" defaultChecked={p?.featured} />
          Nổi bật
        </label>
      </div>
      <fieldset>
        <legend>Tag phong cách</legend>
        <div className="interest-choices">
          {meta?.styles.map((c: any) => (
            <label className="checkbox" key={c.id}>
              <input
                name="styles"
                type="checkbox"
                value={c.id}
                defaultChecked={p?.styles.some((s: any) => s.id === c.id)}
              />
              {miloDesignText(c.name)}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>Bộ sưu tập</legend>
        {meta?.collections.map((c: any) => (
          <label className="checkbox" key={c.id}>
            <input
              name="collections"
              type="checkbox"
              value={c.id}
              defaultChecked={p?.collections.some((s: any) => s.id === c.id)}
            />
            {miloDesignText(c.name)} · {c.season} / {c.climate}
          </label>
        ))}
      </fieldset>
      <h3>Ảnh sản phẩm</h3>
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        aria-label="Tải ảnh sản phẩm"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          try {
            const form = new FormData();
            form.append("file", file);
            const r = await api("/admin/uploads", {
              method: "POST",
              body: form,
            });
            setImages([
              ...images,
              { url: r.url, alt: p?.name || "Ảnh sản phẩm" },
            ]);
          } catch (e: any) {
            notify(e.message);
          }
        }}
      />
      {images.map((img: any, i: number) => (
        <div className="summary-line" key={i}>
          <ProductPhoto src={img.url} alt={img.alt || "Ảnh sản phẩm"} sizes="54px" />
          <label>
            Mô tả ảnh
            <input
              value={img.alt}
              onChange={(e) =>
                setImages(
                  images.map((v: any, n: number) =>
                    n === i ? { ...v, alt: e.target.value } : v,
                  ),
                )
              }
            />
          </label>
          <label>
            Màu (tùy chọn)
            <input
              value={img.color || ""}
              onChange={(e) =>
                setImages(
                  images.map((v: any, n: number) =>
                    n === i ? { ...v, color: e.target.value } : v,
                  ),
                )
              }
            />
          </label>
          <button
            type="button"
            aria-label="Xóa ảnh"
            onClick={() =>
              setImages(images.filter((_: any, n: number) => n !== i))
            }
          >
            <X size={17} />
          </button>
        </div>
      ))}
      <h3 style={{ marginTop: 25 }}>Biến thể / SKU</h3>
      <p className="admin-note">
        Kho khởi tạo bằng 0. Nhập hàng qua Tồn kho có lý do; bỏ biến thể sẽ
        ngừng bán và giữ lịch sử đơn cũ.
      </p>
      {variants.map((v: any, i: number) => (
        <div className="admin-panel" key={i}>
          <div className="form-row">
            {[
              ["sku", "SKU"],
              ["color", "Màu"],
              ["colorHex", "Mã màu HEX"],
              ["size", "Size"],
            ].map(([k, label]) => (
              <label key={k}>
                {label}
                <input
                  required
                  value={v[k]}
                  onChange={(e) =>
                    setVariants(
                      variants.map((s: any, n: number) =>
                        n === i ? { ...s, [k]: e.target.value } : s,
                      ),
                    )
                  }
                />
              </label>
            ))}
            <label>
              Giá riêng (trống = giá sản phẩm)
              <input
                type="number"
                min="1"
                value={v.price || ""}
                onChange={(e) =>
                  setVariants(
                    variants.map((s: any, n: number) =>
                      n === i
                        ? {
                            ...s,
                            price: e.target.value
                              ? Number(e.target.value)
                              : null,
                          }
                        : s,
                    ),
                  )
                }
              />
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={v.active}
                onChange={(e) =>
                  setVariants(
                    variants.map((s: any, n: number) =>
                      n === i ? { ...s, active: e.target.checked } : s,
                    ),
                  )
                }
              />
              Đang bán
            </label>
          </div>
          <button
            className="text-link small"
            type="button"
            onClick={() =>
              setVariants(variants.filter((_: any, n: number) => n !== i))
            }
          >
            Bỏ biến thể
          </button>
        </div>
      ))}
      <button
        className="button secondary small-button"
        type="button"
        onClick={() =>
          setVariants([
            ...variants,
            {
              sku: "",
              color: "Đen",
              colorHex: "#242426",
              size: "M",
              price: null,
              active: true,
            },
          ])
        }
      >
        ＋ Thêm biến thể
      </button>
      <button className="button full" disabled={busy} style={{ marginTop: 20 }}>
        {busy ? "Đang lưu…" : "Lưu sản phẩm"}
      </button>
    </form>
  );
}
function MetadataForm({
  kind,
  item: i,
  onSave,
  onRemove,
}: {
  kind: string;
  item: any;
  onSave: (d: any) => Promise<void>;
  onRemove?: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget),
          d: any = { ...(i ? { id: i.id } : {}) };
        for (const [k, v] of f)
          d[k] = [
            "value",
            "maxDiscount",
            "minSubtotal",
            "maxUses",
            "perUserLimit",
          ].includes(k)
            ? Number(v)
            : v;
        if (["collections", "coupons"].includes(kind))
          d.active = f.get("active") === "on";
        if (kind === "coupons") {
          d.startsAt = new Date(
            String(f.get("startsAt")) + "+07:00",
          ).toISOString();
          d.endsAt = new Date(String(f.get("endsAt")) + "+07:00").toISOString();
          d.productIds = String(f.get("productIds") || "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          d.userIds = String(f.get("userIds") || "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
        }
        setBusy(true);
        await onSave(d);
        setBusy(false);
      }}
    >
      {kind === "coupons" ? (
        <>
          <label>
            Mã ưu đãi
            <input name="code" defaultValue={i?.code} required minLength={3} />
          </label>
          <div className="form-row">
            <label>
              Kiểu giảm
              <select name="type" defaultValue={i?.type || "PERCENT"}>
                <option value="PERCENT">Phần trăm</option>
                <option value="FIXED">Số tiền VND</option>
              </select>
            </label>
            {[
              ["value", "Giá trị", 10],
              ["maxDiscount", "Giảm tối đa VND", 100000],
              ["minSubtotal", "Đơn tối thiểu VND", 200000],
              ["maxUses", "Tổng lượt", 100],
              ["perUserLimit", "Lượt mỗi khách", 1],
            ].map(([k, label, def]) => (
              <label key={String(k)}>
                {label}
                <input
                  type="number"
                  min="0"
                  name={String(k)}
                  defaultValue={i?.[String(k)] ?? def}
                  required
                />
              </label>
            ))}
            <label>
              Bắt đầu (giờ Việt Nam, UTC+7)
              <input
                name="startsAt"
                type="datetime-local"
                defaultValue={new Date(
                  new Date(i?.startsAt || Date.now()).getTime() + 7 * 3600000,
                )
                  .toISOString()
                  .slice(0, 16)}
                required
              />
            </label>
            <label>
              Kết thúc (giờ Việt Nam, UTC+7)
              <input
                name="endsAt"
                type="datetime-local"
                defaultValue={
                  i?.endsAt
                    ? new Date(new Date(i.endsAt).getTime() + 7 * 3600000)
                        .toISOString()
                        .slice(0, 16)
                    : undefined
                }
                required
              />
            </label>
          </div>
          <label>
            ID sản phẩm áp dụng (phân cách dấu phẩy, trống = tất cả)
            <input name="productIds" defaultValue={i?.productIds.join(",")} />
          </label>
          <label>
            ID khách hàng (trống = mọi khách)
            <input name="userIds" defaultValue={i?.userIds.join(",")} />
          </label>
        </>
      ) : (
        <>
          <label>
            Tên
            <input name="name" defaultValue={miloDesignText(i?.name)} required minLength={2} />
          </label>
          <label>
            Slug
            <input
              name="slug"
              defaultValue={i?.slug}
              pattern="[a-z0-9-]+"
              required
            />
          </label>
          {kind === "collections" && (
            <>
              {[
                ["season", "Mùa"],
                ["climate", "Khí hậu / thời tiết"],
                ["campaign", "Chiến dịch"],
                ["image", "Ảnh (đường dẫn)"],
              ].map(([k, label]) => (
                <label key={k}>
                  {label}
                  <input
                    name={k}
                    defaultValue={i?.[k]}
                    required={["season", "climate"].includes(k)}
                  />
                </label>
              ))}
            </>
          )}
        </>
      )}
      {["collections", "coupons"].includes(kind) && (
        <label className="checkbox">
          <input
            name="active"
            type="checkbox"
            defaultChecked={i?.active ?? true}
          />
          Đang áp dụng
        </label>
      )}
      <button className="button" disabled={busy}>
        Lưu cấu hình
      </button>
      {onRemove && (
        <button
          type="button"
          className="button secondary"
          onClick={onRemove}
          disabled={busy}
          style={{ marginLeft: 12 }}
        >
          {["coupons", "collections"].includes(kind)
            ? "Ngừng áp dụng"
            : "Xóa mục chưa dùng"}
        </button>
      )}
    </form>
  );
}
function SettingsForm({
  data: d,
  onSave,
}: {
  data: any;
  onSave: (d: any) => Promise<boolean>;
}) {
  const [banners, setBanners] = useState(d.banners || []);
  return (
    <form
      className="admin-panel"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        await onSave({ ...Object.fromEntries(f), banners });
      }}
    >
      {[
        ["brand", "Tên thương hiệu"],
        ["announcement", "Thông báo đầu trang"],
        ["contactEmail", "Email liên hệ"],
      ].map(([k, l]) => (
        <label key={k}>
          {l}
          <input name={k} defaultValue={d[k]} required />
        </label>
      ))}
      {[
        ["shippingPolicy", "Chính sách giao hàng"],
        ["returnPolicy", "Chính sách đổi trả"],
        ["privacyPolicy", "Chính sách bảo mật"],
      ].map(([k, l]) => (
        <label key={k}>
          {l}
          <textarea name={k} defaultValue={d[k]} rows={5} />
        </label>
      ))}
      <BannerFields banners={banners} setBanners={setBanners} />
      <button className="button">Lưu nội dung cửa hàng</button>
    </form>
  );
}
function AdminAction({
  tab,
  item: i,
  act,
  onClose,
}: {
  tab: string;
  item: any;
  act: (p: string, d: any, m?: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const [reason, setReason] = useState(""),
    [action, setAction] = useState(""),
    [busy, setBusy] = useState(false);
  const { notify } = useShop();
  async function run(path: string, data: any, method = "POST") {
    if (reason.trim().length < 5) {
      notify("Cần lý do ít nhất 5 ký tự.");
      return;
    }
    setBusy(true);
    if (await act(path, data, method)) onClose();
    setBusy(false);
  }
  if (tab === "orders")
    return (
      <>
        <div className="admin-order-address">
          <b>
            {i.user.name} · {i.user.email}
          </b>
          <p>
            {i.address.recipient} · {i.address.phone}
            <br />
            {i.address.text} {i.address.detail}
          </p>
          <p>
            Đơn: {statusText(i.status)} · Thanh toán {i.method}:{" "}
            {statusText(i.payment.status)}
            <br />
            Vận đơn: {i.shipment?.trackingCode || "Chưa tạo"} /{" "}
            {statusText(i.shipment?.status)}
          </p>
        </div>
        <Table
          headers={["SKU / sản phẩm", "Size / màu", "SL", "Giá", "Giảm"]}
          rows={i.items.map((l: any) => [
            <>
              {l.sku}
              <p>{l.name}</p>
            </>,
            `${l.size} / ${l.color}`,
            l.quantity,
            money(l.price),
            money(l.discount),
          ])}
        />
        <b>Tổng: {money(i.total)}</b>
        <label style={{ marginTop: 18 }}>
          Lý do thao tác / chứng cứ giao hàng
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            minLength={5}
          />
        </label>
        <div className="admin-actions">
          {(states[i.status] || []).map((s) => (
            <button
              key={s}
              className="button secondary"
              disabled={busy}
              onClick={() =>
                run(
                  `/admin/orders/${i.id}/status`,
                  { status: s, reason },
                  "PATCH",
                )
              }
            >
              {statusText(s)}
            </button>
          ))}
          {i.status === "READY_TO_SHIP" && !i.shipment?.trackingCode && (
            <button
              className="button"
              onClick={() => run(`/admin/orders/${i.id}/shipment`, {})}
            >
              Tạo vận đơn
            </button>
          )}
          {i.shipment?.trackingCode &&
            !["SHIPPED", "DELIVERED", "COMPLETED"].includes(i.status) && (
              <button
                className="button secondary"
                onClick={() => run(`/admin/orders/${i.id}/shipment/cancel`, {})}
              >
                Hủy vận đơn
              </button>
            )}
          <button className="button secondary" onClick={() => window.print()}>
            <Printer size={14} />
            In phiếu đóng gói
          </button>
        </div>
        <label>
          Ghi chú nội bộ
          <textarea
            value={action || i.internalNote}
            onChange={(e) => setAction(e.target.value)}
          />
        </label>
        <button
          className="button secondary small-button"
          onClick={() =>
            run(`/admin/orders/${i.id}/note`, { note: action }, "PATCH")
          }
        >
          Lưu ghi chú
        </button>
        {i.method === "COD" && (
          <details>
            <summary>Chứng từ thu & đối soát COD</summary>
            <EvidenceForm
              label="Xác nhận đơn vị vận chuyển đã thu"
              onSubmit={(d) => run(`/admin/cod/${i.shipment.id}/collect`, d)}
              amount={i.total}
            />
            <EvidenceForm
              label="Đối soát COD chuyển về cửa hàng"
              onSubmit={(d) => run(`/admin/cod/${i.shipment.id}/settle`, d)}
              amount={i.total}
              fee
            />
          </details>
        )}
        <details>
          <summary>Lịch sử thao tác</summary>
          {i.history.map((h: any) => (
            <p key={h.id}>
              {date(h.createdAt)} · {statusText(h.to)} · {h.reason}
            </p>
          ))}
        </details>
      </>
    );
  if (tab === "inventory")
    return (
      <>
        <p>
          {i.variant.sku} · {i.variant.product.name}
        </p>
        <p>
          Thực tế {i.onHand} · Đang giữ {i.reserved} · Có thể bán{" "}
          {i.onHand - i.reserved}
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            run(`/admin/inventory/${i.id}/adjust`, {
              delta: Number(f.get("delta")),
              reason,
              key: crypto.randomUUID(),
            });
          }}
        >
          <label>
            Lượng tăng/giảm (dùng số âm để giảm)
            <input name="delta" type="number" required />
          </label>
          <label>
            Lý do
            <input
              value={reason}
              minLength={5}
              required
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <button className="button">Ghi nhận điều chỉnh</button>
        </form>
        <Table
          headers={["Ngày", "Biến động", "Lý do", "Tham chiếu"]}
          rows={i.movements.map((m: any) => [
            date(m.createdAt),
            m.delta,
            m.reason,
            m.reference,
          ])}
        />
      </>
    );
  if (tab === "payments")
    return (
      <>
        <p>
          Đơn {i.order.code} · {i.provider} · {statusText(i.status)}
        </p>
        <p>
          Phải thu: {money(i.amount)} · Đã nhận: {money(i.received)} · Đã hoàn:{" "}
          {money(i.refunded)}
        </p>
        <label>
          Lý do đối soát
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            minLength={5}
          />
        </label>
        {i.provider !== "COD" && (
          <button
            className="button secondary"
            onClick={() => run(`/admin/orders/${i.orderId}/reconcile`, {})}
          >
            Đối soát với provider
          </button>
        )}
        <Table
          headers={["Giao dịch duy nhất", "Số tiền", "Nguồn", "Ngày"]}
          rows={i.transactions.map((t: any) => [
            t.reference,
            money(t.amount),
            t.source,
            date(t.createdAt),
          ])}
        />
        <h3>Yêu cầu hoàn tiền</h3>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            run("/admin/refunds", {
              paymentId: i.id,
              amount: Number(f.get("amount")),
              shippingAmount: Number(f.get("shippingAmount") || 0),
              taxAmount: Number(f.get("taxAmount") || 0),
              reason,
              key: crypto.randomUUID(),
            });
          }}
        >
          <label>
            Số tiền hoàn VND
            <input
              type="number"
              name="amount"
              min="1"
              max={i.received - i.refunded}
              required
            />
          </label>
          <div className="form-row">
            <label>
              Trong đó hoàn phí vận chuyển VND
              <input
                name="shippingAmount"
                type="number"
                min="0"
                defaultValue={0}
              />
            </label>
            <label>
              Trong đó hoàn thuế VND
              <input name="taxAmount" type="number" min="0" defaultValue={0} />
            </label>
          </div>
          <p className="admin-note">
            Phần còn lại được ghi là hoàn tiền hàng. Tổng phân loại phải khớp
            tổng hoàn.
          </p>
          <button className="button">Mở yêu cầu hoàn tiền</button>
        </form>
        <p className="admin-note">
          Không có nút đánh dấu đã thanh toán. Các giao dịch sai tiền, đến muộn
          hoặc đơn đã hủy cần xử lý có chứng cứ.
        </p>
      </>
    );
  if (tab === "refunds")
    return (
      <>
        <p>
          {money(i.amount)} · {i.reason} · {statusText(i.status)}
        </p>
        <label>
          Chứng từ / mã chuyển khoản / lý do
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            minLength={10}
          />
        </label>
        <div className="admin-actions">
          {i.status === "REQUESTED" && (
            <button
              className="button"
              onClick={() =>
                run(`/admin/refunds/${i.id}/process`, {
                  action: "APPROVE",
                  evidence: reason,
                })
              }
            >
              Phê duyệt
            </button>
          )}
          {i.status === "APPROVED" && (
            <button
              className="button"
              onClick={() =>
                run(`/admin/refunds/${i.id}/process`, {
                  action: "COMPLETE",
                  evidence: reason,
                })
              }
            >
              Xác nhận đã hoàn với chứng từ
            </button>
          )}
          {!["COMPLETED", "REJECTED"].includes(i.status) && (
            <button
              className="button secondary"
              onClick={() =>
                run(`/admin/refunds/${i.id}/process`, {
                  action: "REJECT",
                  evidence: reason,
                })
              }
            >
              Từ chối
            </button>
          )}
        </div>
      </>
    );
  if (tab === "returns")
    return (
      <>
        <p>
          Đơn {i.order.code} · {statusText(i.status)}
        </p>
        <p>{i.reason}</p>
        <div className="thumbnails">
          {i.images?.map((url: string) => (
            <a href={url} target="_blank" rel="noreferrer" key={url}>
              <img src={url} alt="Return inspection" width={90} />
            </a>
          ))}
        </div>
        <label>
          Lý do / kết quả kiểm tra
          <input
            value={reason}
            minLength={5}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <div className="admin-actions">
          {(i.status === "REQUESTED"
            ? ["APPROVE", "REJECT"]
            : i.status === "APPROVED"
              ? ["RECEIVE", "REJECT"]
              : i.status === "RECEIVED"
                ? ["COMPLETE"]
                : []
          ).map((a) => (
            <button
              className="button secondary"
              key={a}
              onClick={() =>
                run(`/admin/returns/${i.id}/process`, { action: a, reason })
              }
            >
              {
                (
                  {
                    APPROVE: "Duyệt yêu cầu",
                    REJECT: "Từ chối",
                    RECEIVE: "Đã thực nhận hàng",
                    COMPLETE: "Hoàn tất xử lý",
                  } as any
                )[a]
              }
            </button>
          ))}
        </div>
        {i.items.map((l: any) => (
          <div className="admin-panel" key={l.id}>
            <b>
              {l.orderItem.name} / {l.orderItem.sku} × {l.quantity}
            </b>
            <p className="small">
              Kiểm tra: {l.inspection} ·{" "}
              {l.restockedAt ? "Đã nhập lại kho" : "Chưa nhập kho"}
            </p>
            {i.status === "RECEIVED" && l.inspection === "PASS" && (
              <ExchangeOffer returnItemId={l.id} onDone={onClose} />
            )}{" "}
            {i.status === "RECEIVED" && (
              <div className="admin-actions">
                {["QC_PASS", "QC_FAIL", "RESTOCK"].map((a) => (
                  <button
                    className="button secondary"
                    key={a}
                    onClick={() =>
                      run(`/admin/returns/${i.id}/process`, {
                        action: a,
                        itemId: l.id,
                        reason,
                      })
                    }
                  >
                    {
                      (
                        {
                          QC_PASS: "Kiểm tra đạt",
                          QC_FAIL: "Không đạt",
                          RESTOCK: "Nhập lại kho",
                        } as any
                      )[a]
                    }
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        <p className="admin-note">
          Hoàn tiền mở riêng từ giao dịch, theo giá dòng hàng và phần giảm đã
          phân bổ. Hàng chưa kiểm tra đạt không được nhập kho bán lại.
        </p>
      </>
    );
  if (tab === "reviews")
    return (
      <>
        <p>{i.content}</p>
        <label>
          Lý do kiểm duyệt
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            minLength={5}
          />
        </label>
        <button
          className="button"
          onClick={() =>
            run(`/admin/reviews/${i.id}/moderate`, {
              visible: !i.visible,
              reason,
            })
          }
        >
          {i.visible ? "Ẩn nội dung vi phạm" : "Hiển thị lại"}
        </button>
      </>
    );
  return <p>Chọn thao tác trong bảng để tiếp tục.</p>;
}
function EvidenceForm({
  label,
  onSubmit,
  amount,
  fee = false,
}: {
  label: string;
  onSubmit: (d: any) => void;
  amount: number;
  fee?: boolean;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        onSubmit({
          amount: Number(f.get("amount")),
          reference: f.get("reference"),
          evidence: f.get("evidence"),
          ...(fee ? { fee: Number(f.get("fee")) } : {}),
        });
      }}
    >
      <h3 style={{ marginTop: 20 }}>{label}</h3>
      <label>
        Số tiền COD gộp VND
        <input
          name="amount"
          type="number"
          min="1"
          defaultValue={amount}
          required
        />
      </label>
      {fee && (
        <label>
          Phí đơn vị vận chuyển VND
          <input name="fee" type="number" min="0" defaultValue={0} required />
        </label>
      )}
      <label>
        Mã giao dịch / đối soát duy nhất
        <input name="reference" required minLength={5} />
      </label>
      <label>
        Bằng chứng (mã sao kê, đường dẫn chứng từ)
        <input name="evidence" required minLength={10} />
      </label>
      <button className="button secondary small-button">
        Ghi nhận có chứng từ
      </button>
    </form>
  );
}
