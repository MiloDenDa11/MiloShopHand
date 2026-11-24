"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
type Requester = (path: string, options?: RequestInit) => Promise<any>;
export type ShopChange = { kind: 'notifications' | 'orders' | 'seller' | 'resync'; orderId?: string; sequence: number };
export function useShopRealtime(user: any, request: Requester, onAuthenticationLost: () => void) {
  const [state, setState] = useState<'connecting' | 'live' | 'fallback'>('fallback');
  const [notifications, setNotifications] = useState<any[]>([]), [unread, setUnread] = useState(0), [sound, setSound] = useState(false), [change, setChange] = useState<ShopChange | null>(null);
  const lost = useRef(onAuthenticationLost); lost.current = onAuthenticationLost;
  const soundRef = useRef(false), audio = useRef<AudioContext | null>(null), lastBeep = useRef(0), sequence = useRef(0);
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    let active = true, source: EventSource | undefined, retry: ReturnType<typeof setTimeout> | undefined, fallback: ReturnType<typeof setInterval> | undefined, refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let live = false, connecting = false, loading = false, again = false, previousUnread: number | null = null, newMessage = false;
    setNotifications([]); setUnread(0); setChange(null); setState(user ? 'connecting' : 'fallback');
    try { soundRef.current = !!user && localStorage.getItem(`milo-notification-sound:${user.id}`) === 'true'; } catch { soundRef.current = false; } setSound(soundRef.current);
    async function refresh() {
      if (!user || !active) return;
      if (loading) { again = true; return; } loading = true;
      try {
        const [rows, summary] = await Promise.all([request('/me/notifications'), request('/me/notifications/summary')]);
        if (!active) return;
        const count = Number.isSafeInteger(summary.unread) ? summary.unread : 0;
        if (newMessage && previousUnread !== null && count > previousUnread && soundRef.current && audio.current?.state === 'running' && Date.now() - lastBeep.current > 3000) {
          const oscillator = audio.current.createOscillator(), gain = audio.current.createGain(), now = audio.current.currentTime;
          oscillator.frequency.value = 660; gain.gain.setValueAtTime(0.025, now); gain.gain.exponentialRampToValueAtTime(0.001, now + .16); oscillator.connect(gain); gain.connect(audio.current.destination); oscillator.start(); oscillator.stop(now + .17); lastBeep.current = Date.now();
        }
        newMessage = false; previousUnread = count; setNotifications(Array.isArray(rows) ? rows : []); setUnread(count);
      } catch { /* The fallback continues without displaying repeated network errors. */ }
      finally { loading = false; if (again && active) { again = false; void refresh(); } }
    }
    refreshRef.current = refresh;
    const schedule = () => { if (!active) return; live = false; setState('fallback'); source?.close(); clearTimeout(retry); retry = setTimeout(() => void connect(), 10000); };
    async function connect() {
      if (!active || !user || connecting) return; connecting = true;
      try {
        // Existing API helper refreshes expired JWT cookies without URL tokens.
        const config = await request('/me/realtime'); if (!active) return;
        if (config.role && config.role !== user.role) { lost.current(); return; }
        if (config.enabled !== true) { schedule(); return; }
        if (typeof EventSource === 'undefined') { setState('fallback'); return; }
        source?.close(); source = new EventSource('/api/v1/me/events');
        source.addEventListener('ready', () => {
          if (!active) return; live = true; setState('live'); void refresh();
          const detail: ShopChange = { kind: 'resync', sequence: ++sequence.current }; setChange(detail); window.dispatchEvent(new CustomEvent('milo:change', { detail }));
        });
        source.addEventListener('change', event => {
          if (!active) return;
          try {
            const value = JSON.parse((event as MessageEvent).data);
            if (!['notifications','orders','seller','resync'].includes(value.kind) || value.orderId !== undefined && (typeof value.orderId !== 'string' || value.orderId.length > 100)) return;
            const detail: ShopChange = { kind: value.kind, ...(value.orderId ? { orderId: value.orderId } : {}), sequence: ++sequence.current };
            setChange(detail); window.dispatchEvent(new CustomEvent('milo:change', { detail }));
            if (['notifications','resync'].includes(detail.kind)) { newMessage = detail.kind === 'notifications'; clearTimeout(refreshTimer); refreshTimer = setTimeout(() => void refresh(), 200); }
          } catch { /* Ignore invalid event frames. */ }
        });
        source.addEventListener('reconnect', schedule);
        source.addEventListener('authentication', () => { schedule(); lost.current(); });
        source.onerror = schedule;
      } catch (error: any) { if (!active) return; if (error.status === 401) { setState('fallback'); lost.current(); } else schedule(); }
      finally { connecting = false; }
    }
    if (user) {
      void refresh(); void connect();
      fallback = setInterval(() => { if (!live && document.visibilityState === 'visible') { newMessage = true; void refresh(); } }, 15000);
    }
    const focus = () => { if (user) { void refresh(); if (!live) { clearTimeout(retry); void connect(); } } };
    window.addEventListener('focus', focus);
    return () => { active = false; source?.close(); clearTimeout(retry); clearTimeout(refreshTimer); clearInterval(fallback); window.removeEventListener('focus', focus); refreshRef.current = async () => {}; void audio.current?.close().catch(() => {}); audio.current = null; };
  }, [user?.id, user?.role, request]);
  const markRead = useCallback(async (ids?: string[]) => {
    await request('/me/notifications/read', { method: 'PATCH', body: JSON.stringify(ids ? { ids } : { all: true }) });
    await refreshRef.current();
  }, [request]);
  async function enableSound(enabled: boolean) {
    if (enabled) {
      if (!window.AudioContext) throw Error('Trình duyệt này chưa hỗ trợ âm báo.');
      audio.current ||= new AudioContext(); await audio.current.resume();
      if (audio.current.state !== 'running') throw Error('Trình duyệt chưa cho phát âm thanh. Hãy bấm bật lại.');
    }
    soundRef.current = enabled; setSound(enabled);
    try { if (user) localStorage.setItem(`milo-notification-sound:${user.id}`, String(enabled)); } catch {}
  }
  return { state, notifications, unread, markRead, sound, enableSound, change };
}
