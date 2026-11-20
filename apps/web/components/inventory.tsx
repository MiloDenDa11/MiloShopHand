"use client";
import { Fragment, useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowUpRight, ArrowLeft, ArrowRight, Boxes, ChevronDown, ClipboardList, History, Layers3, Minus, Package, PackageX, Pencil, Plus, RefreshCw, Search, TriangleAlert, X } from "lucide-react";
import { api, send, useShop, ErrorBox } from "./client";
import { ProductPhoto } from "./product-media";
import { Select } from "./ui/select";
import { AdminDialog } from "./ui/admin-dialog";

type Variant = { id: string; variantId: string; sku: string; size: string; color: string; colorHex: string; active: boolean; onHand: number; reserved: number; available: number; sold: number; lowThreshold: number };
type Product = { id: string; name: string; active: boolean; category: { name: string }; images: { url: string; alt: string }[]; variants: Variant[] };
type Overview = { items: Product[]; total: number; page: number; pageSize: number; sizes: string[]; summary: { totalProducts: number; totalStock: number; lowProducts: number; outProducts: number; totalVariants: number } };
type Operation = "RECEIPT" | "ISSUE" | "ADJUSTMENT";
type Editor = { operation: Operation; product?: Product; variant?: Variant };
type Option = { id: string; name: string };
const labels: Record<string, string> = { RECEIPT: "Nhập kho", ISSUE: "Xuất kho", ADJUSTMENT: "Điều chỉnh", SALE: "Xuất theo đơn", RETURN: "Nhập hàng hoàn", EXCHANGE: "Xuất đổi size", RESERVE: "Giữ hàng", RELEASE: "Hủy giữ hàng" };
const number = (value: number) => value.toLocaleString("vi-VN");
const sizeOrder = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "2XL", "3XL", "4XL", "5XL"];
const compareSize = (a: string, b: string) => {
  const ai = sizeOrder.indexOf(a.toUpperCase()), bi = sizeOrder.indexOf(b.toUpperCase());
  return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || a.localeCompare(b, "vi", { numeric: true });
};
const status = (v: Pick<Variant, "available" | "lowThreshold">) => v.available === 0 ? "out" : v.available <= v.lowThreshold ? "low" : "ok";
const totals = (variants: Variant[]) => variants.reduce((a, v) => ({ stock: a.stock + v.onHand, reserved: a.reserved + v.reserved, sold: a.sold + v.sold, available: a.available + v.available }), { stock: 0, reserved: 0, sold: 0, available: 0 });
function StockBadge({ state }: { state: string }) {
  return <span className={`stock-badge is-${state}`}><span aria-hidden="true" />{state === "out" ? "Hết hàng" : state === "low" ? "Sắp hết hàng" : "Còn hàng"}</span>;
}
function Pager({ page, pageSize, total, onPage, onSize, busy = false }: { page: number; pageSize: number; total: number; onPage: (page: number) => void; onSize: (size: number) => void; busy?: boolean }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return <div className="inventory-pagination"><span role="status">{total ? `${number((page - 1) * pageSize + 1)}–${number(Math.min(page * pageSize, total))}` : "0"} / {number(total)} kết quả</span>
    <label>Số dòng <Select aria-label="Số dòng mỗi trang kho" value={pageSize} onChange={e => onSize(Number(e.target.value))} disabled={busy}>{[10,20,50].map(n => <option key={n} value={n}>{n}</option>)}</Select></label>
    <div><button type="button" aria-label="Trang kho trước" disabled={busy || page <= 1} onClick={() => onPage(page - 1)}><ArrowLeft size={17} /></button><span>Trang {page} / {pages}</span><button type="button" aria-label="Trang kho sau" disabled={busy || page >= pages} onClick={() => onPage(page + 1)}><ArrowRight size={17} /></button></div>
  </div>;
}

export function InventoryManager() {
  const [data, setData] = useState<Overview | null>(null), [error, setError] = useState("");
  const [busy, setBusy] = useState(true), [revision, setRevision] = useState(0);
  const [q, setQ] = useState(""), [query, setQuery] = useState(""), [size, setSize] = useState(""), [filter, setFilter] = useState(""), [sort, setSort] = useState("name");
  const [page, setPage] = useState(1), [pageSize, setPageSize] = useState(10);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editor, setEditor] = useState<Editor | null>(null), [tab, setTab] = useState("stock"), [historyProduct, setHistoryProduct] = useState("");
  const { notify } = useShop();
  useEffect(() => {
    if (q.trim() === query) return;
    const timer = setTimeout(() => { setQuery(q.trim()); setPage(1); }, 250);
    return () => clearTimeout(timer);
  }, [q, query]);
  useEffect(() => {
    const controller = new AbortController();
    setBusy(true); setError("");
    const params = new URLSearchParams({ q: query, size, status: filter, sort, page: String(page), pageSize: String(pageSize) });
    api(`/admin/inventory/overview?${params}`, { signal: controller.signal }).then(result => {
      if (controller.signal.aborted) return;
      const last = Math.max(1, Math.ceil(result.total / pageSize));
      if (page > last) setPage(last); else setData(result);
    }).catch(e => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [query, size, filter, sort, page, pageSize, revision]);
  function toggle(id: string) { setExpanded(previous => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }
  function history(id = "") { setHistoryProduct(id); setTab("history"); }
  const cards = data && [
    ["Sản phẩm trong kho", data.summary.totalProducts, Package, "Tất cả sản phẩm, kể cả đang ẩn"],
    ["Tổng tồn thực tế", data.summary.totalStock, Boxes, "Bao gồm hàng đang giữ cho đơn"],
    ["Có size sắp hết", data.summary.lowProducts, TriangleAlert, "Theo ngưỡng cảnh báo từng SKU"],
    ["Sản phẩm hết hàng", data.summary.outProducts, PackageX, "Không còn size nào có thể bán"],
    ["Biến thể màu / size", data.summary.totalVariants, Layers3, "Mỗi SKU được quản lý riêng"],
  ] as const;
  return <div className="inventory-manager">
    <div className="inventory-intro"><div><p className="eyebrow">MILO STOCKROOM / MAIN</p><h2>Mọi size, trong tầm mắt.</h2><p>Theo dõi hàng trong kho, hàng đang giữ và lượng sẵn sàng bán.</p></div><div className="inventory-primary-actions"><button className="button secondary" onClick={() => setEditor({ operation: "ISSUE" })}><ArrowUpRight size={17} />Xuất kho</button><button className="button" onClick={() => setEditor({ operation: "RECEIPT" })}><Plus size={18} />Nhập kho</button></div></div>
    <div className="inventory-stats" aria-label="Thống kê toàn bộ kho MAIN">{cards ? cards.map(([label, value, Icon, description]) => <article className="inventory-stat" key={label}><span className="inventory-stat-icon"><Icon size={21} strokeWidth={1.6} /></span><p>{label}</p><strong>{number(value)}</strong><small>{description}</small></article>) : Array.from({ length: 5 }, (_, i) => <div key={i} className="inventory-stat inventory-skeleton" aria-label="Đang tải thống kê kho" />)}</div>
    <div className="inventory-tabs" role="tablist" aria-label="Chế độ xem kho"><button id="inventory-stock-tab" role="tab" aria-selected={tab === "stock"} aria-controls="inventory-stock-panel" onClick={() => setTab("stock")}><Boxes size={17} />Tồn kho theo size</button><button id="inventory-history-tab" role="tab" aria-selected={tab === "history"} aria-controls="inventory-history-panel" onClick={() => history()}><History size={17} />Lịch sử giao dịch</button></div>
    {tab === "stock" ? <section id="inventory-stock-panel" role="tabpanel" aria-labelledby="inventory-stock-tab" aria-busy={busy}>
      <div className="inventory-filters"><label className="inventory-search"><Search size={18} aria-hidden="true" /><input type="search" aria-label="Tìm tên sản phẩm hoặc SKU trong kho" placeholder="Tên sản phẩm hoặc mã SKU…" value={q} onChange={e => setQ(e.target.value)} />{q && <button aria-label="Xóa tìm kiếm kho" onClick={() => setQ("")}><X size={16} /></button>}</label>
        <label>Trạng thái<Select value={filter} aria-label="Lọc trạng thái tồn kho" onChange={e => { setFilter(e.target.value); setPage(1); }}><option value="">Tất cả trạng thái</option><option value="IN_STOCK">Còn hàng</option><option value="LOW">Sắp hết hàng</option><option value="OUT">Hết hàng</option></Select></label>
        <label>Size<Select value={size} aria-label="Lọc size kho" onChange={e => { setSize(e.target.value); setPage(1); }}><option value="">Tất cả size</option>{[...(data?.sizes || [])].sort(compareSize).map(s => <option key={s} value={s}>{s}</option>)}</Select></label>
        <label>Sắp xếp<Select value={sort} aria-label="Sắp xếp tồn kho" onChange={e => { setSort(e.target.value); setPage(1); }}><option value="name">Tên sản phẩm A–Z</option><option value="stock-asc">Tồn kho tăng dần</option><option value="stock-desc">Tồn kho giảm dần</option></Select></label>
        <button className="inventory-refresh" aria-label="Làm mới kho" disabled={busy} onClick={() => setRevision(n => n + 1)}><RefreshCw size={18} className={busy ? "is-spinning" : ""} /></button>
      </div>
      <p className="inventory-help">Bấm tên sản phẩm để xem từng màu / size. Bộ lọc chọn sản phẩm có SKU phù hợp; khi mở rộng vẫn hiển thị đủ size. Trạng thái dựa trên lượng <b>có thể bán</b>.</p>
      {error && <ErrorBox message={error} retry={() => setRevision(n => n + 1)} />}
      {!data && busy ? <div className="inventory-loading" role="status"><RefreshCw className="is-spinning" size={22} />Đang tải dữ liệu kho…</div> : data && <div className="data-table inventory-table">
        <div className="table-wrap" role="region" aria-label="Bảng kho theo sản phẩm và size" tabIndex={0}><table><caption className="sr-only">Tồn thực tế theo sản phẩm; mở rộng để quản lý từng SKU màu và size</caption><thead><tr>{["STT", "Sản phẩm", "Mã SKU", "Size", "Tồn kho", "Đã bán", "Trạng thái", "Thao tác"].map(h => <th key={h} scope="col">{h}</th>)}</tr></thead><tbody>
          {data.items.map((p, index) => {
            const total = totals(p.variants), opened = expanded.has(p.id);
            const sizes = [...new Set(p.variants.map(v => v.size))].sort(compareSize);
            const state = !total.available ? "out" : p.variants.some(v => status(v) === "low") ? "low" : "ok";
            return <Fragment key={p.id}><tr className={`inventory-product-row ${opened ? "is-open" : ""}`}>
              <td>{(data.page - 1) * data.pageSize + index + 1}</td><td><button className="inventory-product-toggle" aria-expanded={opened} aria-controls={`inventory-details-${p.id}`} onClick={() => toggle(p.id)}><span className="inventory-product-image"><ProductPhoto src={p.images[0]?.url} alt={p.name} sizes="56px" /></span><span><b>{p.name}</b><small>{p.category.name} · {new Set(p.variants.map(v => v.color)).size} màu{!p.active ? " · Đang ẩn" : ""}</small></span><ChevronDown size={18} /></button></td>
              <td><code>{p.variants[0]?.sku}</code><small>{p.variants.length} SKU riêng biệt</small></td>
              <td><div className="inventory-size-chips">{sizes.map(s => { const all = p.variants.filter(v => v.size === s), t = totals(all); const threshold = all.reduce((a, v) => a + v.lowThreshold, 0); return <span key={s} className={`is-${status({ available: t.available, lowThreshold: threshold })}`} title={`${s}: tồn thực tế ${t.stock}, có thể bán ${t.available}`}><b>{s}</b>{number(t.stock)}</span>; })}</div></td>
              <td><strong className="inventory-quantity">{number(total.stock)}</strong><small>{number(total.reserved)} đang giữ · {number(total.available)} có thể bán</small></td>
              <td title="Lượng đã xuất theo đơn hàng; chưa trừ hàng hoàn/đổi size"><b className="inventory-sold">{number(total.sold)}</b></td><td><StockBadge state={state} /></td>
              <td><div className="inventory-row-actions"><button aria-label={`Nhập kho ${p.name}`} onClick={() => setEditor({ operation: "RECEIPT", product: p })} disabled={busy}><Plus size={17} />Nhập</button><button aria-label={`Lịch sử kho ${p.name}`} onClick={() => history(p.id)}><History size={17} />Lịch sử</button></div></td>
            </tr>{opened && <tr id={`inventory-details-${p.id}`} className="inventory-details-row"><td colSpan={8}><div className="inventory-details"><div className="inventory-details-heading"><div><p className="eyebrow">CHI TIẾT MÀU / SIZE</p><h3>{p.name}</h3></div><span>{p.variants.length} SKU · Kho MAIN</span></div><table className="inventory-variants"><caption className="sr-only">Tồn kho từng size của {p.name}</caption><thead><tr>{["Màu", "Size", "Mã SKU", "Tồn thực tế", "Đang giữ", "Có thể bán", "Đã bán", "Trạng thái", "Điều chỉnh"].map(h => <th key={h} scope="col">{h}</th>)}</tr></thead><tbody>
              {[...p.variants].sort((a, b) => a.color.localeCompare(b.color, "vi") || compareSize(a.size, b.size)).map(v => <tr key={v.id} data-inventory-id={v.id}><td><span className="inventory-color"><i style={{ background: /^#[0-9a-f]{6}$/i.test(v.colorHex) ? v.colorHex : "#ddd" }} />{v.color}</span>{!v.active && <small>SKU đang ẩn</small>}</td><td><b className="inventory-size-label">{v.size}</b></td><td><code>{v.sku}</code></td><td><strong className="inventory-quantity">{number(v.onHand)}</strong></td><td>{number(v.reserved)}</td><td><b>{number(v.available)}</b></td><td>{number(v.sold)}</td><td><StockBadge state={status(v)} /><small>Ngưỡng sắp hết: {v.lowThreshold}</small></td><td><div className="inventory-row-actions"><button disabled={busy} aria-label={`Nhập ${v.sku}`} onClick={() => setEditor({ operation: "RECEIPT", product: p, variant: v })}><Plus size={16} /></button><button disabled={busy || !v.available} aria-label={`Xuất ${v.sku}`} onClick={() => setEditor({ operation: "ISSUE", product: p, variant: v })}><Minus size={16} /></button><button disabled={busy} aria-label={`Chỉnh sửa ${v.sku}`} onClick={() => setEditor({ operation: "ADJUSTMENT", product: p, variant: v })}><Pencil size={15} />Sửa</button></div></td></tr>)}
            </tbody><tfoot><tr><th colSpan={3}>Tổng sản phẩm</th><td>{number(total.stock)}</td><td>{number(total.reserved)}</td><td>{number(total.available)}</td><td>{number(total.sold)}</td><td colSpan={2} /></tr></tfoot></table></div></td></tr>}</Fragment>;
          })}
        </tbody></table></div>
        {!data.items.length && <div className="inventory-empty" role="status"><PackageX size={34} /><h3>Chưa tìm thấy sản phẩm phù hợp</h3><p>Thử tên, mã SKU hoặc bộ lọc khác.</p><button className="button secondary" onClick={() => { setQ(""); setQuery(""); setFilter(""); setSize(""); setPage(1); }}>Xóa bộ lọc</button></div>}
        <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} onSize={n => { setPageSize(n); setPage(1); }} busy={busy} />
      </div>}
      <p className="inventory-help">“Đã bán” là số lượng đã xuất theo đơn giao vận, chưa trừ hàng hoàn và không cộng hàng thay thế đổi size. Số trên thẻ thống kê luôn tính toàn bộ kho.</p>
    </section> : <InventoryHistory key={historyProduct} productId={historyProduct} revision={revision} />}
    {editor && <StockEditor initial={editor} onClose={() => setEditor(null)} onSaved={() => { notify("Đã lưu giao dịch kho."); setEditor(null); setRevision(n => n + 1); }} />}
  </div>;
}

function StockEditor({ initial, onClose, onSaved }: { initial: Editor; onClose: () => void; onSaved: () => void }) {
  const [options, setOptions] = useState<Option[]>(initial.product ? [initial.product] : []);
  const [productId, setProductId] = useState(initial.product?.id || "");
  const [product, setProduct] = useState<Product | null>(initial.product || null);
  const [inventoryId, setInventoryId] = useState(initial.variant?.id || initial.product?.variants[0]?.id || "");
  const [quantity, setQuantity] = useState(String(initial.operation === "ADJUSTMENT" ? initial.variant?.onHand ?? initial.product?.variants[0]?.onHand ?? 0 : 1));
  const [reason, setReason] = useState(""), [error, setError] = useState(""), [loading, setLoading] = useState(false), [saving, setSaving] = useState(false), [refresh, setRefresh] = useState(0);
  const [pending, setPending] = useState<{ operation: Operation; quantity: number; reason: string; key: string; expectedOnHand: number } | null>(null);
  const requested = useRef(initial.product?.id), confirmation = useRef<HTMLDivElement>(null);
  useEffect(() => { if (pending) confirmation.current?.scrollIntoView({ block: "nearest", behavior: "instant" }); }, [pending]);
  const { notify } = useShop();
  const variant = product?.variants.find(v => v.id === inventoryId);
  useEffect(() => { let live = true; api("/admin/inventory/options").then(list => { if (live) setOptions(list); }).catch(e => { if (live) setError(e.message); }); return () => { live = false; }; }, []);
  useEffect(() => {
    if (!productId || (requested.current === productId && !refresh)) return;
    const controller = new AbortController(); setLoading(true); setProduct(null); setPending(null);
    api(`/admin/inventory/overview?productId=${encodeURIComponent(productId)}&pageSize=1`, { signal: controller.signal }).then(data => {
      if (controller.signal.aborted) return;
      const selected = data.items[0] as Product | undefined;
      if (!selected) throw new Error("Sản phẩm không còn tồn tại trong kho.");
      setProduct(selected);
      setInventoryId(current => selected.variants.some(v => v.id === current) ? current : selected.variants[0]?.id || "");
      requested.current = productId;
    }).catch(e => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [productId, refresh]);
  function review(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError("");
    const amount = Number(quantity);
    if (reason.trim().length < 5) { setError("Lý do cần ít nhất 5 ký tự, không chỉ có khoảng trắng."); return; }
    if (!variant || !Number.isInteger(amount) || amount < (initial.operation === "ADJUSTMENT" ? 0 : 1) || amount > 100000) { setError("Vui lòng chọn SKU và nhập số lượng nguyên hợp lệ."); return; }
    const after = initial.operation === "ADJUSTMENT" ? amount : variant.onHand + amount * (initial.operation === "ISSUE" ? -1 : 1);
    if (after < variant.reserved) { setError(`Không thể giảm quá ${variant.available} sản phẩm có thể bán. Có ${variant.reserved} sản phẩm đang giữ cho đơn.`); return; }
    if (after === variant.onHand) { setError("Số lượng tồn kho chưa thay đổi."); return; }
    setPending({ operation: initial.operation, quantity: amount, reason: reason.trim(), expectedOnHand: variant.onHand, key: crypto.randomUUID() });
  }
  async function save() {
    if (!pending || saving || !variant) return;
    setSaving(true); setError("");
    try { await send(`/admin/inventory/${variant.id}/movements`, pending); onSaved(); }
    catch (e: any) { setError(e.message); notify(e.message); if (e.code === "STOCK_CHANGED") { setPending(null); setRefresh(n => n + 1); } }
    finally { setSaving(false); }
  }
  const after = variant && pending ? pending.operation === "ADJUSTMENT" ? pending.quantity : variant.onHand + pending.quantity * (pending.operation === "ISSUE" ? -1 : 1) : null;
  return <AdminDialog title={labels[initial.operation]} onClose={onClose} busy={saving} className="inventory-dialog"><div className="inventory-editor">
    <p className="inventory-help">Mỗi giao dịch gắn với một SKU màu / size. Lượng đang giữ cho đơn hàng được bảo toàn.</p>
    <form onSubmit={review}>
      <label>Sản phẩm<Select aria-label="Sản phẩm giao dịch kho" value={productId} required disabled={saving || !!pending} onChange={e => { setProductId(e.target.value); setError(""); }}><option value="">Chọn sản phẩm</option>{options.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></label>
      <label>Màu / size / SKU<Select aria-label="Biến thể giao dịch kho" value={inventoryId} required disabled={loading || !product || saving || !!pending} onChange={e => { setInventoryId(e.target.value); if (initial.operation === "ADJUSTMENT") setQuantity(String(product?.variants.find(v => v.id === e.target.value)?.onHand ?? 0)); setError(""); }}><option value="">Chọn màu và size</option>{product?.variants.map(v => <option key={v.id} value={v.id}>{v.color} / {v.size} · {v.sku}</option>)}</Select></label>
      {loading && <p role="status">Đang cập nhật tồn kho…</p>}
      {variant && <div className="inventory-editor-balance"><span>Tồn thực tế<b>{number(variant.onHand)}</b></span><span>Đang giữ<b>{number(variant.reserved)}</b></span><span>Có thể bán<b>{number(variant.available)}</b></span></div>}
      <label>{initial.operation === "ADJUSTMENT" ? "Tồn thực tế sau điều chỉnh" : "Số lượng " + (initial.operation === "RECEIPT" ? "nhập" : "xuất")}<div className="inventory-stepper"><button type="button" aria-label="Giảm số lượng kho" disabled={saving || !!pending || Number(quantity) <= (initial.operation === "ADJUSTMENT" ? 0 : 1)} onClick={() => setQuantity(String(Math.max(initial.operation === "ADJUSTMENT" ? 0 : 1, Number(quantity) - 1)))}><Minus size={18} /></button><input aria-label="Số lượng giao dịch kho" type="number" inputMode="numeric" value={quantity} min={initial.operation === "ADJUSTMENT" ? 0 : 1} max={100000} step={1} required disabled={saving || !!pending} onChange={e => setQuantity(e.target.value)} /><button type="button" aria-label="Tăng số lượng kho" disabled={saving || !!pending || Number(quantity) >= 100000} onClick={() => setQuantity(String(Math.min(100000, Number(quantity) + 1)))}><Plus size={18} /></button></div></label>
      <label>Lý do / ghi chú<textarea aria-label="Lý do giao dịch kho" value={reason} minLength={5} maxLength={1000} required placeholder="Ví dụ: Nhập bổ sung từ nhà cung cấp…" disabled={saving || !!pending} onChange={e => setReason(e.target.value)} /></label>
      {error && <div className="error-box" role="alert">{error}</div>}
      {pending && variant ? <div className="inventory-confirmation" ref={confirmation}><div><ClipboardList size={22} /><h3>Xác nhận thay đổi tồn kho</h3></div><p>{product?.name} · {variant.color} / {variant.size}</p><p className="inventory-confirm-balance"><b>{number(variant.onHand)}</b><ArrowRight size={20} /><b>{number(after!)}</b><span>sản phẩm trong kho</span></p><p>Sau giao dịch: {number(after! - variant.reserved)} có thể bán · {number(variant.reserved)} đang giữ.</p><div className="inventory-editor-actions"><button type="button" className="button secondary" disabled={saving} onClick={() => { setPending(null); setError(""); }}>Quay lại</button><button type="button" className="button" aria-busy={saving} disabled={saving} onClick={save}>{saving ? "Đang lưu…" : "Xác nhận lưu"}</button></div></div> : <div className="inventory-editor-actions"><button type="button" className="button secondary" onClick={onClose}>Hủy</button><button type="submit" className="button" disabled={!variant || loading}>Kiểm tra và lưu</button></div>}
    </form></div></AdminDialog>;
}

function InventoryHistory({ productId: initialProduct, revision }: { productId: string; revision: number }) {
  const [productId, setProductId] = useState(initialProduct), [kind, setKind] = useState(""), [page, setPage] = useState(1), [pageSize, setPageSize] = useState(10), [options, setOptions] = useState<Option[]>([]);
  const [data, setData] = useState<{ items: any[]; total: number; page: number; pageSize: number } | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(true), [refresh, setRefresh] = useState(0);
  useEffect(() => { let live = true; api("/admin/inventory/options").then(result => { if (live) setOptions(result); }).catch(e => { if (live) setError(e.message); }); return () => { live = false; }; }, []);
  useEffect(() => {
    const controller = new AbortController(); setBusy(true); setError("");
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (productId) params.set("productId", productId); if (kind) params.set("kind", kind);
    api(`/admin/inventory/history?${params}`, { signal: controller.signal }).then(result => { if (!controller.signal.aborted) setData(result); }).catch(e => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [page, pageSize, kind, productId, revision, refresh]);
  return <section id="inventory-history-panel" role="tabpanel" aria-labelledby="inventory-history-tab" aria-busy={busy}>
    <div className="inventory-history-heading"><div><p className="eyebrow">STOCK JOURNAL</p><h2>Mỗi thay đổi đều có dấu vết.</h2></div><button className="button secondary" disabled={busy} onClick={() => setRefresh(n => n + 1)}><RefreshCw size={17} />Làm mới lịch sử</button></div>
    <div className="inventory-filters"><label>Sản phẩm<Select aria-label="Sản phẩm trong lịch sử kho" value={productId} onChange={e => { setProductId(e.target.value); setPage(1); }}><option value="">Tất cả sản phẩm</option>{options.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></label><label>Loại giao dịch<Select aria-label="Loại giao dịch kho" value={kind} onChange={e => { setKind(e.target.value); setPage(1); }}><option value="">Tất cả giao dịch</option>{Object.entries(labels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select></label></div>
    <p className="inventory-help">Tồn trước / sau là tồn thực tế trong kho. Nhật ký cũ chưa ghi mốc tồn được hiển thị “—”.</p>
    {error && <ErrorBox message={error} retry={() => setRefresh(n => n + 1)} />}
    {!data && busy ? <div className="inventory-loading" role="status">Đang tải lịch sử kho…</div> : data && <div className="data-table inventory-history-table"><div className="table-wrap" role="region" aria-label="Lịch sử nhập xuất và điều chỉnh kho" tabIndex={0}><table><caption className="sr-only">Lịch sử kho, thời gian Việt Nam</caption><thead><tr>{["Thời gian", "Sản phẩm / SKU", "Màu / size", "Giao dịch", "Thay đổi", "Tồn trước", "Tồn sau", "Người thực hiện", "Ghi chú"].map(h => <th scope="col" key={h}>{h}</th>)}</tr></thead><tbody>{data.items.map(m => <tr key={m.id}><td><time dateTime={m.createdAt}>{new Date(m.createdAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}</time></td><td><b>{m.inventory.variant.product.name}</b><small><code>{m.inventory.variant.sku}</code></small></td><td>{m.inventory.variant.color} / <b>{m.inventory.variant.size}</b></td><td><span className="badge">{labels[m.kind] || m.kind}</span></td><td><strong className={`inventory-delta ${m.delta < 0 ? "negative" : m.delta > 0 ? "positive" : ""}`}>{m.delta > 0 ? "+" : ""}{number(m.delta)}</strong></td><td>{m.onHandBefore === null ? "—" : number(m.onHandBefore)}</td><td><b>{m.onHandAfter === null ? "—" : number(m.onHandAfter)}</b></td><td>{m.actorName}</td><td><span className="inventory-history-reason">{m.reason}</span></td></tr>)}</tbody></table></div>{!data.items.length && <div className="inventory-empty" role="status"><History size={32} /><h3>Chưa có giao dịch trong phạm vi này</h3><p>Giao dịch đã lưu sẽ xuất hiện tại đây.</p></div>}<Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} onSize={n => { setPageSize(n); setPage(1); }} busy={busy} /></div>}
  </section>;
}
