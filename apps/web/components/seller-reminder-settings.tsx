"use client";
import { useState } from 'react';
import { send, ErrorBox, useShop } from './client';
export function SellerReminderSettings({ policy, onSaved }: { policy: { enabled: boolean; pendingMinutes: number; packingMinutes: number }; onSaved: () => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(''); const { notify } = useShop();
  return <details className="seller-policy"><summary>Cấu hình nhắc việc nội bộ</summary><p className="small muted">Mốc tính theo thời gian thực, kể cả ngoài giờ. Đây là lời nhắc cho nhân viên, không phải cam kết giao hàng hoặc tự hủy đơn.</p>
    <form key={`${policy.enabled}:${policy.pendingMinutes}:${policy.packingMinutes}`} onSubmit={async event => { event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setError(''); try { await send('/seller/settings', { enabled: form.get('enabled') === 'on', pendingMinutes: Number(form.get('pendingMinutes')), packingMinutes: Number(form.get('packingMinutes')) }, 'PATCH'); notify('Đã lưu mốc nhắc việc.'); onSaved(); } catch (error: any) { setError(error.message); } finally { setBusy(false); } }}>
      <label className="checkbox"><input name="enabled" type="checkbox" defaultChecked={policy.enabled} /> Bật nhắc việc</label><div className="form-row"><label>Chờ duyệt tối đa (phút)<input name="pendingMinutes" type="number" min={5} max={10080} defaultValue={policy.pendingMinutes} required /></label><label>Từ duyệt đến đóng gói xong (phút)<input name="packingMinutes" type="number" min={5} max={10080} defaultValue={policy.packingMinutes} required /></label></div>
      {error && <ErrorBox message={error} />}<button className="button secondary" disabled={busy}>Lưu mốc nhắc việc</button>
    </form>
  </details>;
}
