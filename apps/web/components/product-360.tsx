"use client";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Box, X } from "lucide-react";
import { photoSpinFor } from "../lib/photo-spin";
const PhotoSpinViewer = dynamic(() => import("./photo-spin-viewer"), { ssr: false, loading: () => <div className="garment-viewer-boot" role="status">Đang mở bộ ảnh 360°…</div> });
export function Product360({ product, colorHex, color, onColorChange, request }: { product: any; colorHex?: string; color: string; onColorChange: (color: string) => void; request?: { serial: number; view: string } }) {
  const [open, setOpen] = useState(false);
  const [interactive,setInteractive] = useState(false);
  useEffect(()=>setInteractive(true),[]);
  const [initialView, setInitialView] = useState("front");
  const dialog = useRef<HTMLDialogElement>(null);
  const design = product.design;
  const spin = photoSpinFor(product,colorHex);
  useEffect(() => { if (request?.serial) { setInitialView(request.view); setOpen(true); } }, [request]);
  useEffect(() => {
    if (!open) { dialog.current?.close(); return; }
    dialog.current?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [open]);
  if (!spin && !open) return <p className="product-design-label photo-spin-pending">Ảnh 360° cho màu này đang được bổ sung.</p>;
  return <section className="product-360" aria-label="Xem sản phẩm 360 độ">
    <button className="button secondary full" disabled={!interactive} onClick={() => { setInitialView("front"); setOpen(true); }} aria-expanded={open} aria-controls="product-360-viewer">
      Khám phá thiết kế 360°<Box size={18} />
    </button>
    <dialog ref={dialog} className="product-360-dialog" id="product-360-viewer" aria-label={`Xem 360°: ${product.name}`} onCancel={() => setOpen(false)} onClose={() => setOpen(false)} onClick={event => { if (event.target === event.currentTarget) setOpen(false); }}>
      {open && <div className="product-360-content">
        <header className="product-360-header"><div><p className="eyebrow">MILOSHOPHAND / 360°</p><h2>{product.name}</h2></div><button autoFocus onClick={() => setOpen(false)} aria-label="Đóng chế độ 360°"><X size={24}/></button></header>
        <div className="product-360-colors" role="group" aria-label="Màu áo trong chế độ 360">
          {[...new Set<string>(product.variants.map((v: any) => v.color))].map(value => <button key={value} aria-pressed={value === color} onClick={() => onColorChange(value)}><span style={{ background: product.variants.find((v: any) => v.color === value)?.colorHex }} />{value}</button>)}
        </div>
        {spin ? <PhotoSpinViewer spin={spin} name={product.name} initialView={initialView} /> : <p className="garment-viewer-boot" role="status">Ảnh 360° cho màu {color} đang được bổ sung. Ảnh gốc vẫn có trong thư viện.</p>}
      </div>}
    </dialog>
  </section>;
}
