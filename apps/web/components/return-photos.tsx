"use client";
import { api, useShop } from "./client";
import { useState } from "react";
export function ReturnPhotos({
  images,
  setImages,
}: {
  images: string[];
  setImages: (v: string[]) => void;
}) {
  const { notify } = useShop();
  const [busy, setBusy] = useState(false);
  return (
    <div>
      <label>
        Ảnh tình trạng sản phẩm (tùy chọn, tối đa 5)
        <input
          type="file"
          multiple
          accept="image/png,image/jpeg,image/webp,image/avif"
          disabled={busy || images.length >= 5}
          onChange={async (e) => {
            const files = [...(e.target.files || [])].slice(
              0,
              5 - images.length,
            );
            setBusy(true);
            const next = [...images];
            for (const file of files) {
              try {
                const form = new FormData();
                form.append("file", file);
                const data = await api("/returns/attachments", {
                  method: "POST",
                  body: form,
                });
                next.push(data.url);
              } catch (err: any) {
                notify(err.message);
              }
            }
            setImages(next);
            setBusy(false);
          }}
        />
        <small>
          Ảnh chỉ bạn và Admin có quyền xem. Không đính kèm giấy tờ cá nhân hoặc
          thông tin ngân hàng.
        </small>
      </label>
      {busy && <p className="small muted">Đang kiểm tra và lưu ảnh…</p>}
      <div className="thumbnails">
        {images.map((url, i) => (
          <div key={url}>
            <img src={url} width={80} alt={`Ảnh tình trạng ${i + 1}`} />
            <button
              type="button"
              className="small text-link"
              onClick={() => setImages(images.filter((v) => v !== url))}
            >
              Bỏ ảnh
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
