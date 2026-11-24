"use client";
import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { ShieldCheck } from 'lucide-react';
import { api, send, ErrorBox, useShop } from './client';
export function TwoFactorSettings() {
  const { notify } = useShop();
  const [status, setStatus] = useState<{ available: boolean; enabled: boolean; recoveryRemaining: number } | null>(null);
  const [setup, setSetup] = useState<{ setupId: string; secret: string; uri: string } | null>(null), [codes, setCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => { let active = true; api('/auth/mfa/status').then(value => { if (active) setStatus(value); }).catch(() => { if (active) setError('Chưa kiểm tra được trạng thái 2FA. Tải lại trang để thử lại.'); }); return () => { active = false; }; }, []);
  async function start() { setBusy(true); setError(''); try { setSetup(await send('/auth/mfa/setup', {})); setCodes([]); } catch (error: any) { setError(error.message); } finally { setBusy(false); } }
  if (status && !status.available) return null;
  return <section className="two-factor-settings form-panel"><h3><ShieldCheck size={19} /> Xác thực 2 bước (tùy chọn)</h3>
    <p className="small muted">Dùng ứng dụng Authenticator để bảo vệ tài khoản. Chỉ yêu cầu mã sau khi bạn tự bật 2FA. Xác thực lại bằng mật khẩu ở phía trên trước khi thay đổi thiết lập.</p>
    {error && <ErrorBox message={error} />}
    {!status && !error && <p>Đang kiểm tra 2FA…</p>}
    {status && <p className="small">{status.enabled ? `Đã bật · Còn ${status.recoveryRemaining} mã khôi phục.` : 'Chưa bật 2FA.'}</p>}
    {status && !status.enabled && !setup && <button type="button" className="button secondary" disabled={busy} onClick={() => void start()}>Thiết lập 2FA</button>}
    {setup && <div className="two-factor-setup"><p>Quét QR bằng ứng dụng Authenticator, rồi nhập mã 6 số để xác nhận. Lượt thiết lập hết hạn sau 10 phút.</p><QRCodeSVG value={setup.uri} size={180} marginSize={2} title="QR thiết lập 2FA cho tài khoản của bạn" />
      <details><summary>Nhập khóa thủ công</summary><code className="two-factor-secret">{setup.secret}</code></details>
      <form onSubmit={async event => { event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setError(''); try { const result = await send('/auth/mfa/enable', { setupId: setup.setupId, otp: form.get('otp') }); setCodes(result.recoveryCodes); setSetup(null); setStatus({ available: true, enabled: true, recoveryRemaining: result.recoveryCodes.length }); notify('Đã bật xác thực 2 bước và thu hồi các phiên khác.'); } catch (error: any) { setError(error.message); } finally { setBusy(false); } }}>
        <label>Mã xác thực để bật 2FA<input name="otp" required inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} autoComplete="one-time-code" /></label><div className="row"><button className="button" disabled={busy}>Xác nhận bật 2FA</button><button className="text-link" type="button" disabled={busy} onClick={() => setSetup(null)}>Để sau</button></div>
      </form></div>}
    {codes.length > 0 && <div className="two-factor-recovery" role="status"><h4>Lưu các mã khôi phục này</h4><p className="small">Mỗi mã dùng được một lần khi không có ứng dụng xác thực. Mã chỉ hiển thị lần này; hãy lưu ở nơi riêng tư.</p><textarea readOnly rows={10} value={codes.join('\n')} aria-label="Các mã khôi phục 2FA" /><div className="row"><button type="button" className="button secondary" onClick={async () => { try { await navigator.clipboard.writeText(codes.join('\n')); notify('Đã sao chép mã khôi phục.'); } catch { notify('Hãy chọn các mã trong ô và lưu thủ công.'); } }}>Sao chép mã khôi phục</button><button type="button" className="text-link" onClick={() => setCodes([])}>Tôi đã lưu mã</button></div></div>}
    {status?.enabled && <details><summary>Tắt xác thực 2 bước</summary><form onSubmit={async event => { event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setError(''); try { await send('/auth/mfa', { otp: form.get('otp') }, 'DELETE'); setCodes([]); setStatus({ available: true, enabled: false, recoveryRemaining: 0 }); notify('Đã tắt 2FA và thu hồi các phiên khác.'); } catch (error: any) { setError(error.message); } finally { setBusy(false); } }}><label>Mã 2FA hoặc mã khôi phục<input name="otp" required autoComplete="one-time-code" minLength={6} maxLength={100} /></label><button className="button secondary" disabled={busy}>Xác nhận tắt 2FA</button></form></details>}
  </section>;
}
