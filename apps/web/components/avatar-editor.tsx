"use client";
import { useEffect, useId, useRef, useState } from 'react';
import { Camera, Trash2 } from 'lucide-react';
import { api, send, useShop, ErrorBox } from './client';
const maxBytes = 5 * 1024 * 1024;
const formats = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
export function AvatarEditor() {
  const { user, loadUser, notify } = useShop();
  const id = useId(), input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null), [preview, setPreview] = useState('');
  const [enabled, setEnabled] = useState<boolean | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => { let active = true; api('/me/avatar/config').then(result => { if (active) setEnabled(result.enabled); }).catch(() => { if (active) setEnabled(false); }); return () => { active = false; }; }, []);
  useEffect(() => { if (!file) { setPreview(''); return; } const url = URL.createObjectURL(file); setPreview(url); return () => URL.revokeObjectURL(url); }, [file]);
  async function upload() {
    if (!file || busy || !enabled) return;
    setBusy(true); setError('');
    try { const form = new FormData(); form.set('file', file); await api('/me/avatar', { method: 'POST', body: form }); await loadUser(); setFile(null); if (input.current) input.current.value = ''; notify('Đã cập nhật ảnh đại diện.'); }
    catch (error: any) { setError(error.message); } finally { setBusy(false); }
  }
  async function remove() {
    if (busy) return; setBusy(true); setError('');
    try { await send('/me/avatar', {}, 'DELETE'); setFile(null); await loadUser(); notify('Đã xóa ảnh đại diện.'); } catch (error: any) { setError(error.message); } finally { setBusy(false); }
  }
  return <section className="avatar-editor" aria-labelledby={`${id}-title`}>
    <div className="avatar-preview">{preview || user.avatarUrl ? <img src={preview || user.avatarUrl} alt="Xem trước ảnh đại diện" width={88} height={88} referrerPolicy="no-referrer" /> : <Camera size={28} aria-hidden="true" />}</div>
    <div><h3 id={`${id}-title`}>Ảnh đại diện</h3><p className="small muted" id={`${id}-help`}>JPG, PNG, WebP hoặc AVIF · Tối đa 5 MB. Khi bấm lưu, ảnh được gửi đến Cloudinary để lưu trữ.</p>
      {enabled === false && <p className="small" role="status">Chưa kết nối Cloudinary. Quản trị viên cần hoàn tất cấu hình để tải ảnh.</p>}
      <label className="avatar-file">Chọn ảnh đại diện<input ref={input} type="file" accept={formats.join(',')} disabled={busy || enabled !== true} aria-describedby={`${id}-help`} onChange={event => {
        setError(''); const selected = event.target.files?.[0]; setFile(null); if (!selected) return;
        if (selected.size > maxBytes) { setError('Ảnh đại diện không được vượt quá 5 MB.'); event.target.value = ''; return; }
        if (!formats.includes(selected.type)) { setError('Chỉ nhận ảnh JPG, PNG, WebP hoặc AVIF.'); event.target.value = ''; return; }
        setFile(selected);
      }} /></label>
      <div className="row"><button type="button" className="button small-button" disabled={busy || !file || !enabled} onClick={() => void upload()} aria-busy={busy}>Lưu ảnh đại diện</button>{user.avatarUrl && <button type="button" className="text-link" disabled={busy} onClick={() => void remove()}><Trash2 size={15} /> Xóa ảnh</button>}</div>
      {error && <ErrorBox message={error} />}
    </div>
  </section>;
}
