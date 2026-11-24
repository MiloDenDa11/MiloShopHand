"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Package, RefreshCw, ArrowRight, Truck, ClipboardCheck, Search, Clock } from 'lucide-react';
import { api, send, useShop, ErrorBox, money } from './client';
import { statusText } from './account';
import { Select } from './ui/select';
import { AdminDialog } from './ui/admin-dialog';
import { ProductPhoto } from './product-media';
import { SellerReminderSettings } from './seller-reminder-settings';
import { PackingDesk, PackingSlipButton } from './packing-desk';
const actions: Record<string, string> = { CONFIRMED: 'Duyệt đơn', PACKING: 'Bắt đầu đóng gói', READY_TO_SHIP: 'Đóng gói xong', SHIPPED: 'Đã bàn giao vận chuyển', CANCELLED: 'Từ chối đơn' };
const dates = (value: string) => new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
export function SellerWorkspace({ initialOrder = '' }: { initialOrder?: string }) {
  const { user, ready, notify, realtime } = useShop();
  const permitted = !!user && ['ADMIN', 'SELLER'].includes(user.role);
  const [query, setQuery] = useState(''), [status, setStatus] = useState(''), [page, setPage] = useState(1);
  const [assignee, setAssignee] = useState('all'), [overdue, setOverdue] = useState(false), [staff, setStaff] = useState<any[]>([]), [overview, setOverview] = useState<any>(null);
  const [list, setList] = useState<any>(null), [counts, setCounts] = useState<Record<string, number>>({}), [selected, setSelected] = useState(initialOrder), [order, setOrder] = useState<any>(null);
  const [error, setError] = useState(''), [loading, setLoading] = useState(false), [busy, setBusy] = useState(false), [updated, setUpdated] = useState('');
  const [action, setAction] = useState<{ id: string; from: string; to: string } | null>(null), [actionError, setActionError] = useState('');
  const sequence = useRef(0);
  const [packed, setPacked] = useState<{ orderId: string; complete: boolean } | null>(null);
  const verified = useCallback((orderId: string, complete: boolean) => setPacked(previous => previous?.orderId === orderId && previous.complete === complete ? previous : { orderId, complete }), []);
  const detailRef = useRef<HTMLElement>(null), openingOrder = useRef(false);
  useEffect(() => {
    if (order && openingOrder.current) { openingOrder.current = false; if (window.matchMedia('(max-width: 700px)').matches) detailRef.current?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }); }
  }, [order]);
  const load = useCallback(async () => {
    if (!permitted) return;
    const current = ++sequence.current; setLoading(true);
    const params = new URLSearchParams({ page: String(page), assignee, overdue: String(overdue), ...(status ? { status } : {}), ...(query ? { q: query } : {}) });
    try {
      const [rows, overview, detail, employees] = await Promise.all([api(`/seller/orders?${params}`), api('/seller/overview'), selected ? api(`/seller/orders/${encodeURIComponent(selected)}`) : Promise.resolve(null), api('/seller/staff')]);
      if (sequence.current !== current) return;
      setList(rows); setCounts(overview.counts); setOrder(detail); setError(''); setUpdated(new Date().toISOString());
      setOverview(overview); setStaff(Array.isArray(employees) ? employees : []);
    } catch (error: any) { if (sequence.current === current) setError(error.message); }
    finally { if (sequence.current === current) setLoading(false); }
  }, [permitted, page, query, status, selected, assignee, overdue]);
  async function assign(assigneeId: string | null, reason: string) {
    if (!order || busy) return; setBusy(true);
    try { await send(`/seller/orders/${order.id}/assignment`, { assigneeId, expectedRevision: order.assignment?.revision || 0, reason }, 'PATCH'); notify('Đã cập nhật người phụ trách.'); await load(); }
    catch (error: any) { notify(error.message); await load(); } finally { setBusy(false); }
  }
  useEffect(() => {
    void load(); const timer = setInterval(() => { if (realtime?.state !== 'live' && document.visibilityState === 'visible') void load(); }, 15000);
    let eventTimer: ReturnType<typeof setTimeout>;
    const changed = (event: Event) => { if (['seller','orders','resync'].includes((event as CustomEvent).detail.kind)) { clearTimeout(eventTimer); eventTimer = setTimeout(() => void load(), 250); } };
    window.addEventListener('milo:change', changed);
    const focus = () => { void load(); }; window.addEventListener('focus', focus);
    return () => { sequence.current++; clearInterval(timer); clearTimeout(eventTimer); window.removeEventListener('milo:change', changed); window.removeEventListener('focus', focus); };
  }, [load, realtime?.state]);
  if (!ready) return <div className="container section">Đang kiểm tra tài khoản…</div>;
  if (!user) return <div className="container section"><h1>Không gian Người bán</h1><p>Đăng nhập bằng tài khoản được cấp quyền xử lý đơn của MiloShopHand.</p><Link className="button" href="/dang-nhap?next=%2Fnguoi-ban">Đăng nhập <ArrowRight size={16} /></Link></div>;
  if (!permitted) return <div className="container section"><h1>Bạn chưa được cấp quyền Người bán.</h1><p>Liên hệ Admin MiloShopHand để được phân quyền xử lý đơn.</p><Link href="/tai-khoan" className="text-link">Về tài khoản</Link></div>;
  const assignedElsewhere = order?.assignment?.assigneeId && order.assignment.assigneeId !== user.id && user.role !== 'ADMIN';
  return <div className="container section seller-workspace">
    <div className="seller-heading"><div><p className="eyebrow">MILO · ORDER DESK</p><h1>Chăm chút từng đơn hàng.</h1><p className="muted">Từ khi khách đặt đến lúc kiện hàng rời cửa hàng.</p></div><div><button type="button" className="button secondary" disabled={loading} onClick={() => void load()}><RefreshCw size={16} /> Làm mới</button>{updated && <small className="seller-updated">Cập nhật {dates(updated)} · {realtime?.state === 'live' ? 'Đang nhận thay đổi trực tiếp' : 'Tự làm mới mỗi 15 giây'}</small>}</div></div>
    <div className="seller-metrics">{[['PENDING_CONFIRMATION', ClipboardCheck, 'Chờ duyệt'], ['PENDING_PAYMENT', Clock, 'Chờ thanh toán'], ['PACKING', Package, 'Đang đóng gói'], ['SHIPPED', Truck, 'Đang giao']].map(([key, Icon, label]) => { const MetricIcon = Icon as typeof Package; return <button type="button" key={key as string} onClick={() => { setStatus(key as string); setPage(1); }}><MetricIcon size={21} /><span>{label as string}<b>{counts[key as string] || 0}</b></span><ArrowRight size={15} /></button>; })}</div>
    <form className="seller-filters" onSubmit={event => { event.preventDefault(); setQuery(new FormData(event.currentTarget).get('q') as string); setPage(1); }}>
      <label>Tìm đơn hàng<div className="seller-search"><Search size={17} /><input name="q" placeholder="Mã đơn hoặc tên khách hàng" maxLength={100} /></div></label>
      <label>Trạng thái<Select value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="">Tất cả</option>{['PENDING_PAYMENT', 'PENDING_CONFIRMATION', 'CONFIRMED', 'PACKING', 'READY_TO_SHIP', 'SHIPPED', 'DELIVERED', 'COMPLETED', 'CANCELLED'].map(value => <option key={value} value={value}>{statusText(value)}</option>)}</Select></label><button className="button secondary">Tìm kiếm</button>
    </form>
    <div className="seller-work-filters"><button type="button" aria-pressed={assignee === 'mine'} onClick={() => { setAssignee(assignee === 'mine' ? 'all' : 'mine'); setPage(1); }}>Đơn của tôi ({overview?.mine || 0})</button><button type="button" aria-pressed={assignee === 'unassigned'} onClick={() => { setAssignee(assignee === 'unassigned' ? 'all' : 'unassigned'); setPage(1); }}>Chưa phân công ({overview?.unassigned || 0})</button><button type="button" aria-pressed={overdue} onClick={() => { setOverdue(value => !value); setPage(1); }}>Cần xử lý ({overview?.overdue || 0})</button></div>
    <p><Link className="button secondary" href="/ho-tro">Bàn chăm sóc khách hàng →</Link></p>
    <p className="seller-policy-note small muted">{overview?.policy?.enabled ? `Nhắc nội bộ: chờ duyệt ${overview.policy.pendingMinutes} phút · Đóng gói ${overview.policy.packingMinutes} phút sau duyệt.` : 'Nhắc việc nội bộ đang tắt.'}</p>
    {user.role === 'ADMIN' && overview?.policy && <SellerReminderSettings policy={overview.policy} onSaved={() => void load()} />}
    {error && <ErrorBox message={error} retry={load} />}
    <details className="form-panel"><summary>Hàng cần bổ sung · {overview?.lowStock?.length||0} SKU{overview?.lowStock?.length===100?" (hiển thị tối đa 100)":""}</summary><p className="small muted">Số có thể bán đã trừ hàng đang được giữ cho đơn. Phiếu nhập và giá vốn do Admin quản lý.</p>{overview?.lowStock?.map((row:any)=><p key={row.id}><b>{row.name}</b> · {row.color} / {row.size} · {row.sku} · Có thể bán: {row.available} · Ngưỡng: {row.threshold}</p>)}</details>
    <div className="seller-columns">
      <section className="seller-orders" aria-label="Danh sách đơn hàng"><div className="row between"><h2>Đơn hàng</h2><small>{list?.total || 0} đơn</small></div>
        {!list && loading && <p>Đang tải đơn…</p>}{list?.items.length === 0 && <p>Chưa có đơn hàng phù hợp.</p>}
        {list?.items.map((item: any) => <button type="button" key={item.id} className={`seller-order-row ${selected === item.id ? 'selected' : ''}`} aria-pressed={selected === item.id} onClick={() => { openingOrder.current = true; if (selected === item.id) { void load(); return; } setSelected(item.id); setOrder(null); }}>
          <div className="row between"><b>{item.code}</b><span className="badge" data-status={item.status}>{statusText(item.status)}</span></div><p>{item.address.recipient} <span>· {item.items.reduce((sum: number, line: any) => sum + line.quantity, 0)} món</span></p><small>Phụ trách: {item.assignment?.assignee?.name || 'Chưa phân công'}</small>{item.deadline?.overdue && <p className="seller-overdue">Quá mốc nội bộ {item.deadline.minutesOverdue} phút</p>}<div className="row between"><small>{dates(item.createdAt)}</small><b>{money(item.total)}</b></div>
        </button>)}
        {list?.pages > 1 && <div className="row between seller-pagination"><button type="button" disabled={page === 1 || loading} onClick={() => setPage(value => value - 1)}>Trước</button><span>Trang {page} / {list.pages}</span><button type="button" disabled={page >= list.pages || loading} onClick={() => setPage(value => value + 1)}>Sau</button></div>}
      </section>
      <section ref={detailRef} className="seller-order-detail" aria-label="Chi tiết đơn hàng">
        {!order ? <div className="seller-detail-empty"><Package size={40} /><h2>{selected && loading ? 'Đang mở đơn hàng…' : 'Mỗi đơn, một hành trình.'}</h2><p>Chọn đơn bên trái để xem người nhận, sản phẩm và các bước xử lý.</p></div> : <>
          <div className="row between"><div><p className="eyebrow">ORDER DETAILS</p><h2>{order.code}</h2></div><span className="badge" data-status={order.status}>{statusText(order.status)}</span></div>
          <div className="seller-address"><h3>Người mua & nơi nhận</h3><p><b>{order.address.recipient}</b> · <a href={`tel:${order.address.phone}`}>{order.address.phone}</a></p><p>{order.address.text}{order.address.detail ? ` · ${order.address.detail}` : ''}</p>{order.address.instructions && <p>Ghi chú giao hàng: {order.address.instructions}</p>}<small>Tài khoản đặt: {order.buyer?.name} · {order.buyer?.email}</small></div>
          <div className="seller-assignment"><h3>Người phụ trách</h3><p>{order.assignment?.assignee?.name || 'Chưa phân công'}{order.assignment?.assignee?.active === false ? ' · Tài khoản không còn hoạt động, cần Admin giao lại' : ''}</p>
            {['PENDING_PAYMENT', 'PENDING_CONFIRMATION', 'CONFIRMED', 'PACKING', 'READY_TO_SHIP'].includes(order.status) && <>
              {!order.assignment?.assigneeId && <button type="button" className="button secondary small-button" disabled={busy} onClick={() => void assign(user.id, 'Nhân viên nhận phụ trách đơn')}>Nhận phụ trách</button>}
              {order.assignment?.assigneeId === user.id && <button type="button" className="text-link" disabled={busy} onClick={() => void assign(null, 'Nhân viên bỏ phụ trách đơn')}>Bỏ phụ trách</button>}
              {user.role === 'ADMIN' && <form key={`${order.id}:${order.assignment?.revision || 0}`} onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); void assign(form.get('assigneeId') as string || null, form.get('reason') as string); }}><label>Giao đơn cho<Select name="assigneeId" defaultValue={order.assignment?.assigneeId || ''}><option value="">Chưa phân công</option>{staff.map(employee => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</Select></label><label>Lý do phân công<input name="reason" defaultValue="Admin phân công người phụ trách" minLength={5} maxLength={300} required /></label><button className="button secondary small-button" disabled={busy}>Lưu phân công</button></form>}
            </>}
            {assignedElsewhere && <p className="small muted">Bạn có thể xem đơn. Các bước xử lý do người phụ trách thực hiện; Admin có thể phân công lại.</p>}
            {order.deadline && <p className={order.deadline.overdue ? 'seller-overdue' : 'small muted'}>Mốc nhắc {order.deadline.phase === 'approval' ? 'duyệt' : 'đóng gói'} nội bộ: {dates(order.deadline.dueAt)}{order.deadline.overdue ? ` · Quá ${order.deadline.minutesOverdue} phút` : ''}</p>}
          </div>
          <div className="seller-lines">{order.items.map((item: any) => <article key={item.id}><div className="seller-item-image"><ProductPhoto src={item.image} alt={item.name} /></div><div><b>{item.name}</b><p>{item.color} · Size {item.size} · SL {item.quantity}</p><small>{money(item.price)} / sản phẩm</small></div><b>{money(item.price * item.quantity - item.discount)}</b></article>)}</div>
          <dl className="seller-totals"><div><dt>Phương thức</dt><dd>{order.method === 'COD' ? 'Thanh toán khi nhận hàng' : 'Thanh toán QR'} · {statusText(order.payment?.status || '')}</dd></div><div><dt>Tiền sản phẩm</dt><dd>{money(order.subtotal)}</dd></div><div><dt>Giảm giá</dt><dd>−{money(order.discount)}</dd></div><div><dt>Phí vận chuyển</dt><dd>{money(order.shippingFee - (order.shippingDiscount || 0))}</dd></div>{order.tax > 0 && <div><dt>Thuế</dt><dd>{money(order.tax)}</dd></div>}<div><dt>Tổng đơn</dt><dd><b>{money(order.total)}</b></dd></div></dl>
          {order.shipment?.trackingCode && <p className="seller-tracking"><Truck size={17} /> Mã vận đơn: <b>{order.shipment.trackingCode}</b> · {statusText(order.shipment.status)}</p>}
          {order.status === 'PENDING_PAYMENT' && <p className="seller-note">Đơn QR cần được hệ thống xác nhận thanh toán trước khi duyệt.</p>}
          {['CONFIRMED','PACKING','READY_TO_SHIP','SHIPPED','DELIVERED','COMPLETED'].includes(order.status) && <><PackingSlipButton key={`slip:${order.id}`} orderId={order.id} status={order.status} /><PackingDesk key={order.id} orderId={order.id} status={order.status} disabled={busy || !!assignedElsewhere} onVerified={verified} refreshKey={updated} /></>}
          <div className="seller-actions">{order.allowedActions.map((to: string) => <button type="button" className={`button ${to === 'CANCELLED' ? 'secondary' : ''}`} key={to} disabled={busy || !!assignedElsewhere || to === 'READY_TO_SHIP' && !(packed?.orderId === order.id && packed?.complete) || (to === 'SHIPPED' && !order.shipment?.trackingCode)} onClick={() => { setActionError(''); setAction({ id: order.id, from: order.status, to }); }}>{actions[to]}</button>)}
            {order.status === 'READY_TO_SHIP' && !order.shipment?.trackingCode && <button type="button" className="button secondary" disabled={busy || !!assignedElsewhere} onClick={async () => { setBusy(true); try { const result = await send(`/seller/orders/${order.id}/shipment`, {}); notify(result.message); await load(); } catch (error: any) { notify(error.message); } finally { setBusy(false); } }}><Truck size={17} /> Tạo vận đơn</button>}
          </div>
          <details className="seller-history" open><summary>Lịch sử xử lý</summary><ol className="timeline">{order.history.map((entry: any) => <li key={entry.id}><span className="timeline-dot" /><div><b>{statusText(entry.to)}</b><small>{dates(entry.createdAt)}</small><p>{entry.reason}</p></div></li>)}</ol></details>
        </>}
      </section>
    </div>
    {action && <AdminDialog title={`${actions[action.to]} · ${order?.code || ''}`} busy={busy} onClose={() => setAction(null)}>
      <p>{action.to === 'CONFIRMED' ? 'Sau khi duyệt, người mua không thể tự hủy đơn. Kiểm tra đủ hàng và thông tin nhận trước khi xác nhận.' : action.to === 'CANCELLED' ? 'Từ chối sẽ giải phóng hàng đang giữ. Đơn đã thanh toán được đưa vào quy trình hoàn tiền, không tự xác nhận đã hoàn.' : 'Ghi nhận bước xử lý thực tế của đơn hàng.'}</p>
      <form onSubmit={async event => { event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setActionError(''); try { await send(`/seller/orders/${action.id}/status`, { from: action.from, status: action.to, reason: form.get('reason') }, 'PATCH'); setAction(null); notify('Đã cập nhật đơn hàng.'); await load(); } catch (error: any) { setActionError(error.message); await load(); } finally { setBusy(false); } }}>
        <label>Lý do / ghi nhận<textarea name="reason" required minLength={5} maxLength={500} defaultValue={action.to === 'CANCELLED' ? '' : `Người bán: ${actions[action.to].toLowerCase()}`} /></label>
        {action.to === 'SHIPPED' && <label className="checkbox"><input type="checkbox" required /> Tôi xác nhận kiện hàng đã được bàn giao thực tế cho đơn vị vận chuyển.</label>}
        {actionError && <ErrorBox message={actionError} />}<button className="button" disabled={busy}>Xác nhận {actions[action.to].toLowerCase()}</button>
      </form>
    </AdminDialog>}
  </div>;
}
