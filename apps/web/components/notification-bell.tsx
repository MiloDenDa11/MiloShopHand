"use client";
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { Bell, CheckCheck, Volume2 } from 'lucide-react';
import { useShop } from './client';
import { safeLocalRedirect } from '../../../packages/shared/src/security';
export function NotificationBell() {
  const { user, realtime, notify } = useShop();
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), ref = useRef<HTMLDivElement>(null);
  const [panelTop, setPanelTop] = useState(100);
  useEffect(() => { if (!open) return; const position = () => { if (ref.current) setPanelTop(ref.current.getBoundingClientRect().bottom + 12); }; position(); window.addEventListener('resize', position); return () => window.removeEventListener('resize', position); }, [open]);
  useEffect(() => { const close = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false); }; const key = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); }; document.addEventListener('pointerdown', close); document.addEventListener('keydown', key); return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', key); }; }, []);
  useEffect(() => { setOpen(false); }, [user?.id]);
  if (!user || !realtime) return null;
  return <div className="notification-bell" ref={ref}><button type="button" aria-label={`Thông báo${realtime.unread ? `, ${realtime.unread} chưa đọc` : ''}`} aria-expanded={open} aria-controls="milo-notification-panel" onClick={() => setOpen(value => !value)}><Bell size={20} />{realtime.unread > 0 && <span className="notification-count">{realtime.unread > 99 ? '99+' : realtime.unread}</span>}</button>
    {open && <section id="milo-notification-panel" className="notification-panel" aria-label="Thông báo của bạn" style={{ '--notification-top': `${panelTop}px` } as CSSProperties}><div className="row between"><h2>Thông báo</h2><small className={`realtime-status ${realtime.state}`}>{realtime.state === 'live' ? 'Đang kết nối trực tiếp' : 'Đang cập nhật định kỳ'}</small></div>
      <div className="notification-tools"><label><input type="checkbox" checked={realtime.sound} onChange={async event => { try { await realtime.enableSound(event.target.checked); } catch (error: any) { notify(error.message); } }} /><Volume2 size={15} /> Âm báo</label><button type="button" disabled={busy || !realtime.unread} onClick={async () => { setBusy(true); try { await realtime.markRead(); } catch (error: any) { notify(error.message); } finally { setBusy(false); } }}><CheckCheck size={15} /> Đọc tất cả</button></div>
      <div className="notification-list">{realtime.notifications.length ? realtime.notifications.slice(0, 8).map((note: any) => <article key={note.id} className={note.readAt ? '' : 'unread'}><Link href={safeLocalRedirect(note.href, '/tai-khoan?tab=notifications')} onClick={() => { setOpen(false); if (safeLocalRedirect(note.href, '/tai-khoan?tab=notifications').startsWith('/tai-khoan')) window.dispatchEvent(new Event('milo:notifications-open')); void realtime.markRead([note.id]).catch(() => {}); }}><b>{note.title}</b><p>{note.body}</p><small>{new Date(note.createdAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</small></Link></article>) : <p className="muted">Bạn chưa có thông báo.</p>}</div><Link className="text-link" href="/tai-khoan?tab=notifications" onClick={() => { setOpen(false); window.dispatchEvent(new Event('milo:notifications-open')); }}>Xem thông báo trong tài khoản →</Link>
    </section>}
  </div>;
}
