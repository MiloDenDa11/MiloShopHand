"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../components/client';
import type { TryOnPhotoMode } from '../lib/try-on';

export type DirectTryOnJob = { id: string; status: 'queued' | 'processing' | 'succeeded' | 'failed' | 'expired' | 'deleted'; productSlug: string; productName: string; color: string; images: string[]; quotaCharged: boolean; expiresAt: string; errorCode?: string };
type Config = { enabled: boolean; requireVerifiedEmail: boolean; imagesPerRequest: number; dailyImages: number; retentionHours: number };
type Quota = { remaining: number; used: number; resetsAt: string; latestJob: DirectTryOnJob | null };
export function useDirectTryOn(productSlug: string, color: string, userId?: string) {
  const [config, setConfig] = useState<Config | null>(null);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [job, setJob] = useState<DirectTryOnJob | null>(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [quotaLoading, setQuotaLoading] = useState(false);
  const identity = useRef(userId); identity.current = userId;
  const attempt = useRef<{ file: File; productSlug: string; color: string; mode: string; key: string } | null>(null);
  const inFlight = useRef(false);
  const [pollAgain, setPollAgain] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    api('/try-on/config', { signal: controller.signal }).then(setConfig).catch(() => { if (!controller.signal.aborted) setConfig({ enabled: false, requireVerifiedEmail: true, imagesPerRequest: 2, dailyImages: 2, retentionHours: 24 }); });
    return () => controller.abort();
  }, []);
  const refreshQuota = useCallback(async () => {
    if (!userId || !config?.enabled) return null;
    setQuotaLoading(true);
    try {
      const result: Quota = await api('/try-on/quota');
      if (identity.current !== userId) return null;
      setQuota(result); setError('');
      setJob(result.latestJob);
      return result.latestJob;
    } catch (cause) {
      if (identity.current === userId) setError(cause instanceof Error ? cause.message : 'Chưa kiểm tra được hạn mức. Vui lòng thử lại.');
      return null;
    } finally { if (identity.current === userId) setQuotaLoading(false); }
  }, [userId, config?.enabled]);
  useEffect(() => { setQuota(null); setJob(null); setError(''); attempt.current = null; void refreshQuota(); }, [refreshQuota]);
  const currentJob = userId && job?.productSlug === productSlug && job.color === color ? job : null;
  useEffect(() => {
    if (!userId || !currentJob || !['queued', 'processing'].includes(currentJob.status)) return;
    const id = currentJob.id, controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const deadline = Date.now() + 10 * 60000;
    async function poll() {
      try {
        const result: DirectTryOnJob = await api(`/try-on/jobs/${encodeURIComponent(id)}`, { signal: controller.signal });
        if (controller.signal.aborted || identity.current !== userId) return;
        setJob(result); setError('');
        if (!['queued', 'processing'].includes(result.status)) { void refreshQuota(); return; }
      } catch {
        if (controller.signal.aborted) return;
        setError('Chưa đọc được tiến độ. Không có yêu cầu tạo ảnh mới nào được gửi.');
      }
      if (Date.now() < deadline) timer = setTimeout(() => void poll(), 2500);
      else setError('Đã tạm dừng kiểm tra tiến độ. Bấm kiểm tra lại để đọc lượt đang có; hệ thống không tự tạo thêm ảnh.');
    }
    timer = setTimeout(() => void poll(), 1500);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [currentJob?.id, currentJob?.status, userId, refreshQuota, pollAgain]);
  async function generate(file: File, mode: TryOnPhotoMode) {
    if (inFlight.current || !config?.enabled || !userId || !quota || quota.remaining < 2) return null;
    const current = attempt.current;
    const previousJobId = job?.id;
    const key = current && current.file === file && current.productSlug === productSlug && current.color === color && current.mode === mode ? current.key : crypto.randomUUID();
    attempt.current = { file, productSlug, color, mode, key };
    const form = new FormData();
    form.set('photo', file); form.set('productSlug', productSlug); form.set('color', color); form.set('mode', mode); form.set('consent', 'true');
    inFlight.current = true; setSubmitting(true); setError('');
    try {
      const result: DirectTryOnJob = await api('/try-on/jobs', { method: 'POST', body: form, headers: { 'Idempotency-Key': key } });
      if (identity.current !== userId) return null;
      attempt.current = null;
      setJob(result); setQuota(previous => previous ? { ...previous, remaining: 0, used: 2, latestJob: result } : previous);
      return result;
    } catch (cause) {
      const recovered = await refreshQuota();
      if (recovered?.id !== previousJobId && recovered?.productSlug === productSlug && recovered.color === color && ['queued', 'processing', 'succeeded'].includes(recovered.status)) { attempt.current = null; return recovered; }
      if (identity.current === userId) setError(cause instanceof Error ? cause.message : 'Chưa gửi được lượt thử. Vui lòng kiểm tra lại.');
      return null;
    } finally { inFlight.current = false; setSubmitting(false); }
  }
  async function remove() {
    if (!currentJob) return;
    try {
      await api(`/try-on/jobs/${encodeURIComponent(currentJob.id)}`, { method: 'DELETE' });
      setJob(null); attempt.current = null; await refreshQuota();
      return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Chưa xóa được ảnh. Vui lòng thử lại.'); return false; }
  }
  return { config, quota, job: currentJob, error, submitting, quotaLoading, generate, remove, refresh: () => { setPollAgain(value => value + 1); void refreshQuota(); } };
}
