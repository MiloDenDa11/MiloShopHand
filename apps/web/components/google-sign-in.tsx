"use client";
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, send, useShop, ErrorBox } from './client';
import { safeLocalRedirect } from '../../../packages/shared/src/security';
export const googleMessages: Record<string, string> = {
  GOOGLE_LINK_REQUIRED: 'Email đã có tài khoản Milo. Hãy đăng nhập bằng mật khẩu và liên kết Google tại Tài khoản → Bảo mật.',
  GOOGLE_EMAIL_UNTRUSTED: 'Hãy đăng ký và xác minh email tại Milo trước, sau đó liên kết Google trong Bảo mật.',
  GOOGLE_EMAIL_MISMATCH: 'Hãy chọn tài khoản Google có cùng email với tài khoản Milo đang đăng nhập.',
  GOOGLE_ALREADY_LINKED: 'Tài khoản Google hoặc Milo đã có liên kết. Hãy kiểm tra tại Tài khoản → Bảo mật.',
  GOOGLE_CANCELLED: 'Bạn chưa hoàn tất đăng nhập Google. Có thể chọn lại khi sẵn sàng.',
  GOOGLE_SESSION_CHANGED: 'Phiên đăng nhập đã thay đổi. Hãy đăng nhập và xác thực lại trước khi liên kết.',
  GOOGLE_STATE_INVALID: 'Lượt đăng nhập Google đã hết hạn. Vui lòng thử lại.',
};
export async function beginGoogle(mode: 'login' | 'link', next?: string) {
  const result = await send('/auth/google/start', { mode, ...(next ? { next: safeLocalRedirect(next) } : {}) });
  const target = new URL(result.url);
  if (target.protocol !== 'https:' || target.hostname !== 'accounts.google.com') throw Error('Địa chỉ đăng nhập Google không hợp lệ.');
  window.location.assign(target.href);
}
export function GoogleSignIn({ next }: { next?: string | null }) {
  const [enabled, setEnabled] = useState<boolean | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => { let active = true; api('/auth/google/config').then(value => { if (active) setEnabled(value.enabled === true); }).catch(() => { if (active) setEnabled(false); }); return () => { active = false; }; }, []);
  return <div className="google-sign-in"><button type="button" className="button secondary full" disabled={busy || !enabled} onClick={async () => { setBusy(true); setError(''); try { await beginGoogle('login', next || undefined); } catch (error: any) { setError(error.message); setBusy(false); } }}><span className="google-symbol" aria-hidden="true">G</span> Tiếp tục với Google / Gmail</button>
    {enabled === false && <p className="small muted">Đăng nhập Google đang chờ shop hoàn tất kết nối.</p>}{error && <ErrorBox message={error} />}
  </div>;
}
export function GoogleLoginFinish({ next }: { next?: string | null }) {
  const { afterLogin, notify } = useShop(), router = useRouter();
  const [busy, setBusy] = useState(false), [needsOtp, setNeedsOtp] = useState(false), [error, setError] = useState('');
  const started = useRef(false), inFlight = useRef(false);
  async function complete(otp?: string) {
    if (inFlight.current) return; inFlight.current = true; setBusy(true); setError('');
    try { await send('/auth/google/complete', otp ? { otp } : {}); await afterLogin(); notify('Đăng nhập Google thành công.'); router.replace(safeLocalRedirect(next)); }
    catch (error: any) { if (['MFA_REQUIRED', 'MFA_INVALID'].includes(error.code)) setNeedsOtp(true); setError(error.message); }
    finally { inFlight.current = false; setBusy(false); }
  }
  useEffect(() => { if (!started.current) { started.current = true; void complete(); } }, []);
  return <div className="container section auth-recovery-page"><p className="eyebrow">WELCOME BACK TO MILO</p><h1>{needsOtp ? 'Xác nhận thêm một bước.' : 'Đang hoàn tất đăng nhập Google.'}</h1>
    {needsOtp && <form onSubmit={event => { event.preventDefault(); void complete(new FormData(event.currentTarget).get('otp') as string); }}><label>Mã 2FA hoặc mã khôi phục<input name="otp" required maxLength={100} autoComplete="one-time-code" autoFocus /></label><button className="button" disabled={busy}>Xác nhận đăng nhập Google</button></form>}
    {error && <ErrorBox message={error} />}<Link className="text-link" href="/dang-nhap">Quay lại đăng nhập</Link>
  </div>;
}
export function GoogleAccountSettings() {
  const { notify } = useShop();
  const [status, setStatus] = useState<{ available: boolean; linked: boolean; email: string | null; passwordEnabled: boolean } | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const load = () => api('/auth/google/status').then(setStatus);
  useEffect(() => { let active = true; api('/auth/google/status').then(value => { if (active) setStatus(value); }).catch(() => { if (active) setError('Chưa kiểm tra được liên kết Google.'); }); return () => { active = false; }; }, []);
  return <section className="form-panel google-account-settings"><h3>Tài khoản Google</h3><p className="small muted">Xác thực lại trước khi liên kết hoặc bỏ liên kết. Google dùng để đăng nhập, không cấp cho Milo quyền đọc Gmail.</p>
    {status?.linked ? <><p>Đã liên kết: {status.email}</p>{!status.passwordEnabled && <p className="small">Bạn đang dùng Google để đăng nhập. <Link href="/quen-mat-khau">Tạo mật khẩu bằng mã gửi email</Link> trước khi bỏ liên kết.</p>}<button type="button" className="button secondary" disabled={busy || !status.passwordEnabled} onClick={async () => { setBusy(true); setError(''); try { await send('/auth/google/link', {}, 'DELETE'); await load(); notify('Đã bỏ liên kết Google.'); } catch (error: any) { setError(error.message); } finally { setBusy(false); } }}>Bỏ liên kết Google</button></> : <button type="button" className="button secondary" disabled={busy || !status?.available} onClick={async () => { setBusy(true); setError(''); try { await beginGoogle('link'); } catch (error: any) { setError(error.message); setBusy(false); } }}>Liên kết Google cùng email</button>}
    {status && !status.available && <p className="small muted">Shop chưa hoàn tất cấu hình Google OAuth.</p>}{error && <ErrorBox message={error} />}
  </section>;
}
