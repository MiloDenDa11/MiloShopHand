"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { tryOnDimensionsError, tryOnImageSignature, tryOnPhotoError } from "../lib/try-on";

type LocalPhoto = { file: File; url: string; width: number; height: number };

// Photos never enter storage, a request body, or the shared shopping context.
export function useTryOnPhoto() {
  const [photo, setPhoto] = useState<LocalPhoto | null>(null);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const version = useRef(0);
  const urls = useRef(new Set<string>());
  const release = useCallback(() => {
    for (const url of urls.current) URL.revokeObjectURL(url);
    urls.current.clear();
  }, []);

  const remove = useCallback(() => {
    version.current++;
    release();
    setPhoto(null);
    setError("");
    setChecking(false);
  }, [release]);

  useEffect(() => {
    window.addEventListener("pagehide", remove);
    return () => { window.removeEventListener("pagehide", remove); version.current++; release(); };
  }, [release, remove]);

  async function choose(file: File) {
    const request = ++version.current;
    release();
    setPhoto(null);
    setError("");
    setChecking(true);
    let url = "";
    try {
      const validation = tryOnPhotoError(file);
      if (validation) throw new Error(validation);
      const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
      if (request !== version.current) return;
      if (!tryOnImageSignature(header, file.type)) throw new Error("Nội dung tệp không khớp định dạng ảnh. Hãy chọn một ảnh JPG, PNG hoặc WebP hợp lệ.");
      url = URL.createObjectURL(file);
      urls.current.add(url);
      const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
        const image = new Image();
        const timer = setTimeout(() => { image.onload = image.onerror = null; reject(new Error("Đọc ảnh quá lâu. Hãy chọn ảnh nhẹ hơn hoặc thử lại.")); }, 10_000);
        image.onload = () => { clearTimeout(timer); resolve({ width: image.naturalWidth, height: image.naturalHeight }); };
        image.onerror = () => { clearTimeout(timer); reject(new Error("Không đọc được ảnh. Tệp có thể bị hỏng; hãy chọn ảnh khác.")); };
        image.src = url;
      });
      if (request !== version.current) return;
      const dimensionError = tryOnDimensionsError(dimensions.width, dimensions.height);
      if (dimensionError) throw new Error(dimensionError);
      setPhoto({ file, url, ...dimensions });
    } catch (cause) {
      if (url) { URL.revokeObjectURL(url); urls.current.delete(url); }
      if (request === version.current) setError(cause instanceof Error ? cause.message : "Không đọc được ảnh. Hãy thử lại.");
    } finally {
      if (request === version.current) setChecking(false);
    }
  }

  return { photo, error, checking, choose, remove };
}
