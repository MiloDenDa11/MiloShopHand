"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { QRCodeSVG } from 'qrcode.react';
import { Printer, ScanLine, CheckCircle2, Undo2 } from 'lucide-react';
import { api, send, ErrorBox } from './client';
import { AdminDialog } from './ui/admin-dialog';
import { statusText } from './account';
export function PackingDesk({ orderId, status, disabled, onVerified, refreshKey }: { orderId: string; status: string; disabled: boolean; onVerified: (orderId: string, complete: boolean) => void; refreshKey: string }) {
  const [progress, setProgress] = useState<any>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false), [resetting, setResetting] = useState(false);
  const input = useRef<HTMLInputElement>(null), inFlight = useRef(false), pending = useRef<any>(null), current = useRef<any>(null), active = useRef(true);
  const load = useCallback(async () => {
    try { const value = await api(`/seller/orders/${encodeURIComponent(orderId)}/packing`); if (active.current && (!current.current || value.revision >= current.current.revision)) { current.current = value; setProgress(value); } }
    catch (error: any) { if (active.current) setError(error.message); }
  }, [orderId]);
  useEffect(() => {
    active.current = true; let timer: ReturnType<typeof setTimeout>;
    const refresh = (event: Event) => { const value = (event as CustomEvent).detail; if (value.kind === 'resync' || value.kind === 'seller' && value.orderId === orderId) { clearTimeout(timer); timer = setTimeout(() => void load(), 200); } };
    const focus = () => void load(); window.addEventListener('milo:change', refresh); window.addEventListener('focus', focus);
    return () => { active.current = false; clearTimeout(timer); window.removeEventListener('milo:change', refresh); window.removeEventListener('focus', focus); };
  }, [load, orderId]);
  useEffect(() => { onVerified(orderId, !!progress?.complete); }, [orderId, progress?.complete, onVerified]);
  useEffect(() => { void load(); }, [status, refreshKey, load]);
  useEffect(() => { if (!busy && status === 'PACKING' && !disabled && !uncertain) input.current?.focus({ preventScroll: true }); }, [busy]);
  async function change(action: any, retry = false) {
    if (inFlight.current || disabled || status !== 'PACKING' || !current.current || uncertain && !retry) return;
    const body = retry ? pending.current : { ...action, requestId: crypto.randomUUID(), expectedRevision: current.current.revision };
    if (!body) return; pending.current = body; inFlight.current = true; setBusy(true); setError('');
    try {
      const value = await send(`/seller/orders/${encodeURIComponent(orderId)}/packing`, body);
      if (!active.current) return; current.current = value; setProgress(value); pending.current = null; setUncertain(false); setResetting(false); if (input.current) input.current.value = ''; input.current?.focus();
    } catch (error: any) {
      if (!active.current) return;
      if (!error.status || error.status >= 500) { setUncertain(true); setError('Chưa xác nhận được kết quả. Gửi lại đúng thao tác để kiểm tra, tránh đếm thêm lần nữa.'); }
      else { pending.current = null; setUncertain(false); setError(error.message); }
      await load();
    } finally { inFlight.current = false; if (active.current) setBusy(false); }
  }
  const editable = status === 'PACKING' && !disabled && !busy && !uncertain;
  return <section className="packing-desk" aria-label="Kiểm SKU đóng gói"><div className="row between"><h3><ScanLine size={18} /> Kiểm hàng trước khi đóng gói</h3>{progress?.complete && <span className="packing-complete"><CheckCircle2 size={16} /> Đã kiểm đủ</span>}</div>
    <p className="small muted">Quét mã SKU bằng máy quét hoặc nhập mã rồi nhấn Enter. Mỗi lần xác nhận tính một sản phẩm.</p>
    {progress ? <><div className="packing-meter"><progress value={progress.checkedTotal} max={Math.max(1, progress.expectedTotal)} /><b>{progress.checkedTotal}/{progress.expectedTotal} sản phẩm</b></div>
      {progress.needsReset && <p role="alert">Nội dung đơn đã thay đổi. Hãy bắt đầu kiểm lại để xác nhận đúng sản phẩm.</p>}
      {status === 'PACKING' ? <form onSubmit={event => { event.preventDefault(); const sku = input.current?.value.trim(); if (sku) void change({ action: 'SCAN', sku }); }}><label>Mã SKU cần kiểm<input ref={input} name="sku" autoComplete="off" maxLength={150} placeholder="Quét hoặc nhập đúng SKU" disabled={!editable || progress.needsReset} /></label><button className="button secondary small-button" disabled={!editable || progress.needsReset}>Xác nhận 1 sản phẩm</button></form> : <p className="small muted">{['CONFIRMED','PENDING_CONFIRMATION','PENDING_PAYMENT'].includes(status) ? 'Bắt đầu đóng gói để kiểm SKU.' : 'Kết quả kiểm hàng được giữ lại để đối chiếu.'}</p>}
      <ul className="packing-items">{progress.items.map((item: any) => <li key={item.id}><div><b>{item.name}</b><small>{item.color} · Size {item.size}</small><code>{item.sku}</code></div><strong>{item.checked}/{item.quantity}</strong>{status === 'PACKING' && <button type="button" className="packing-undo" aria-label={`Hoàn tác một ${item.sku}`} disabled={!editable || !item.checked || progress.needsReset} onClick={() => void change({ action: 'UNDO', sku: item.sku, reason: 'Nhân viên hoàn tác một lần kiểm SKU' })}><Undo2 size={16} /></button>}</li>)}</ul>
      {status === 'PACKING' && <button type="button" className="text-link" disabled={!editable || !progress.checkedTotal && !progress.needsReset} onClick={() => setResetting(true)}>Bắt đầu kiểm lại</button>}
    </> : <p>Đang tải kết quả kiểm…</p>}
    {error && <ErrorBox message={error} />}{uncertain && <button type="button" className="button secondary" disabled={busy || disabled} onClick={() => void change(null, true)}>Gửi lại thao tác chưa xác nhận</button>}
    {resetting && <AdminDialog title="Bắt đầu kiểm SKU lại" busy={busy} onClose={() => setResetting(false)}><p>Số lượng đã kiểm sẽ trở về 0. Tồn kho và nội dung đơn được giữ nguyên.</p><form onSubmit={event => { event.preventDefault(); void change({ action: 'RESET', reason: new FormData(event.currentTarget).get('reason') }); }}><label>Lý do kiểm lại<input name="reason" minLength={5} maxLength={300} required defaultValue="Nhân viên yêu cầu kiểm lại toàn bộ kiện hàng" /></label><button className="button" disabled={busy}>Xác nhận kiểm lại</button></form></AdminDialog>}
  </section>;
}
function SlipContent({ slip }: { slip: any }) {
  return <article className="packing-slip"><header><div><p className="eyebrow">MILOSHOPHAND</p><h2>Phiếu đóng gói</h2><b>{slip.code}</b><p>{statusText(slip.status)}</p></div><QRCodeSVG value={slip.code} size={76} level="M" title={`Mã đơn ${slip.code}`} /></header><section><h3>Người nhận</h3><p><b>{slip.recipient.name}</b> · {slip.recipient.phone}</p><p>{slip.recipient.address}</p>{slip.recipient.instructions && <p>Ghi chú: {slip.recipient.instructions}</p>}</section><table><thead><tr><th>Sản phẩm / SKU</th><th>Màu / Size</th><th>SL</th></tr></thead><tbody>{slip.items.map((line: any, index: number) => <tr key={index}><td><b>{line.name}</b><br /><code>{line.sku}</code></td><td>{line.color}<br />Size {line.size}</td><td>{line.quantity}</td></tr>)}</tbody></table><p className="packing-slip-total">Tổng: <b>{slip.totalQuantity} sản phẩm</b></p><footer><p>Kiểm đủ mẫu, màu, size và số lượng trước khi đóng kiện.</p><p>Phiếu soạn hàng nội bộ · Không thay thế vận đơn.</p><small>Tạo lúc {new Date(slip.generatedAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</small></footer></article>;
}
export function PackingSlipButton({ orderId, status }: { orderId: string; status: string }) {
  const [slip, setSlip] = useState<any>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  return <><button type="button" className="button secondary small-button" disabled={busy || ['PENDING_PAYMENT','PENDING_CONFIRMATION','CANCELLED'].includes(status)} onClick={async () => { setBusy(true); setError(''); try { setSlip(await send(`/seller/orders/${encodeURIComponent(orderId)}/packing-slip`, {})); } catch (error: any) { setError(error.message); } finally { setBusy(false); } }}><Printer size={16} /> Phiếu đóng gói</button>{error && <ErrorBox message={error} />}
    {slip && <><AdminDialog title={`Phiếu đóng gói · ${slip.code}`} busy={false} onClose={() => setSlip(null)}><SlipContent slip={slip} /><button type="button" className="button" onClick={() => window.print()}><Printer size={16} /> In phiếu đóng gói</button></AdminDialog>{createPortal(<div className="milo-print-root"><SlipContent slip={slip} /></div>, document.body)}</>}
  </>;
}
