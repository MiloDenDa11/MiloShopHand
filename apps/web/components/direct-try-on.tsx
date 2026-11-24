"use client";
import { Download, RefreshCw, Sparkles } from 'lucide-react';
import type { DirectTryOnJob } from '../hooks/use-direct-try-on';

const errors: Record<string, string> = {
  TRY_ON_PROVIDER_UNCERTAIN: 'Chưa nhận được kết quả xác nhận từ AI. Lượt này vẫn được tính trong hạn mức vì dịch vụ có thể đã xử lý; Milo không tự gửi lại.',
  TRY_ON_PROVIDER_LIMIT: 'Dịch vụ AI đang hết hạn mức hoặc quá tải. Milo không tự gửi lại lượt này.',
  TRY_ON_PROVIDER_REJECTED: 'AI chưa thể xử lý ảnh này. Không có lượt tạo bù tự động.',
  TRY_ON_PROVIDER_RESPONSE: 'AI chưa trả đủ hai ảnh hợp lệ. Milo không tự tạo bù để tránh phát sinh thêm lượt.',
};
export function DirectTryOnResult({ job, error, refresh }: { job: DirectTryOnJob | null; error: string; refresh: () => void }) {
  const pending = !!job && ['queued', 'processing'].includes(job.status);
  return <div className="try-on-direct-result" aria-busy={pending}>
    <p className="try-on-help">{job ? `${job.productName} · ${job.color}` : 'Chưa có lượt thử đồ cho lựa chọn này.'}</p>
    {pending && <div className="try-on-ai-progress" role="status"><Sparkles size={30} /><h3>{job.status === 'queued' ? 'Ảnh của bạn đang chờ xử lý.' : 'Đang tạo hai góc nhìn mới.'}</h3><p>Bạn có thể chờ tại đây hoặc quay lại sau. Bấm kiểm tra tiến độ không tạo thêm ảnh.</p></div>}
    {job?.status === 'succeeded' && <><div className="try-on-ai-images">{job.images.map((image, index) => <figure key={image}><img src={image} alt={`Ảnh thử ${index + 1}: ${job.productName}, màu ${job.color}`} /><figcaption><span>Góc nhìn {index + 1}</span><a className="text-link" href={image} download={`milo-try-on-${job.productSlug}-${index + 1}.webp`}><Download size={15} /> Tải ảnh</a></figcaption></figure>)}</div><p className="try-on-help">Ảnh có thể sai chi tiết hoặc logo, không xác định số đo hay bảo đảm độ vừa size. Kết quả chỉ được lưu tạm và sẽ hết hạn.</p></>}
    {job && ['failed', 'expired', 'deleted'].includes(job.status) && <p className="try-on-notice" role="status">{job.status === 'expired' ? 'Ảnh đã hết hạn lưu trữ.' : job.status === 'deleted' ? 'Ảnh đã được xóa.' : errors[job.errorCode || ''] || 'Lượt thử chưa hoàn thành.'} {job.quotaCharged ? 'Hạn mức của lượt đã được giữ lại.' : 'Lượt chưa gửi tới AI không bị tính vào hạn mức.'}</p>}
    {error && <p className="try-on-error" role="alert">{error}</p>}
    <button type="button" className="text-link" onClick={refresh}><RefreshCw size={15} /> Kiểm tra tiến độ & hạn mức</button>
  </div>;
}
