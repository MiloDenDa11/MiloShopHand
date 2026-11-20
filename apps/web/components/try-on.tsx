"use client";
import { useId, useRef, useState, type ChangeEvent } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, ImagePlus, LockKeyhole, ScanFace, Shirt, Sparkles, Trash2, Camera, RotateCcw } from "lucide-react";
import { useResource } from "../hooks/use-resource";
import { useTryOnPhoto } from "../hooks/use-try-on-photo";
import { ErrorBox, Skeleton, money, useShop } from "./client";
import { ProductPhoto } from "./product-media";
import { productSelectionHref } from "../lib/product-selection";
import { initialTryOnSelection, TRY_ON_ACCEPT, tryOnReference, tryOnSupports, type TryOnProduct, type TryOnPhotoMode } from "../lib/try-on";

export function TryOnPage({ slug, initialData, initialColor, initialSize }: {
  slug: string; initialData?: TryOnProduct; initialColor?: string; initialSize?: string;
}) {
  const { data, loading, error, retry } = useResource(`/products/${encodeURIComponent(slug)}`, initialData);
  if (loading) return <div className="container section"><Skeleton count={2} /></div>;
  if (error || !data) return <div className="container section try-on-empty"><h1>Chưa mở được phòng thử.</h1><ErrorBox message={error || "Sản phẩm không còn khả dụng."} retry={retry} /><Link className="text-link" href="/san-pham">Chọn sản phẩm khác <ArrowRight size={16} /></Link></div>;
  return <TryOnStudio product={data} initialColor={initialColor} initialSize={initialSize} />;
}

function TryOnStudio({ product, initialColor, initialSize }: { product: TryOnProduct; initialColor?: string; initialSize?: string }) {
  const id = useId();
  const selection = initialTryOnSelection(product, initialColor, initialSize);
  const [color, setColor] = useState(selection.color);
  const [size, setSize] = useState(selection.size);
  const [mode, setMode] = useState<TryOnPhotoMode>("upper-body");
  const [step, setStep] = useState(0);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cartError, setCartError] = useState("");
  const photo = useTryOnPhoto();
  const { add } = useShop();
  const heading = useRef<HTMLHeadingElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const reference = tryOnReference(product, color);
  const supported = tryOnSupports(product);
  const ready = supported && !!reference;
  const variant = product.variants.find((item) => item.color === color && item.size === size);
  const colors = [...new Map(product.variants.map((item) => [item.color, item])).values()];
  const productHref = productSelectionHref(product.slug, color, size);

  function invalidate() { setStep(0); setConsent(false); setCartError(""); }
  function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (file) { invalidate(); void photo.choose(file); }
  }
  function removePhoto() { invalidate(); photo.remove(); }
  function move(next: number) {
    setStep(next);
    requestAnimationFrame(() => heading.current?.focus({ preventScroll: false }));
  }
  async function addToCart() {
    if (!variant || variant.available <= 0) { setCartError("Chọn size còn hàng trước khi thêm vào giỏ."); return; }
    setBusy(true); setCartError("");
    try { await add(product, variant, 1); }
    catch (error) { setCartError(error instanceof Error ? error.message : "Chưa thêm được vào giỏ. Vui lòng thử lại."); }
    finally { setBusy(false); }
  }

  return <div className="container try-on-page">
    <div className="try-on-topline">
      <Link className="text-link" href={productHref}><ArrowLeft size={16} /> Về sản phẩm</Link>
      <span className="try-on-edition">M/S STUDIO · PERSONAL EDITION</span>
    </div>
    <header className="try-on-heading">
      <div><p className="eyebrow">MỘT GÓC NHÌN MANG DẤU ẤN CỦA BẠN</p><h1>Thử một chút.<br /><em>Thấy mình trong đó.</em></h1></div>
      <div className="try-on-intro"><span className="try-on-status"><span /> Bản trải nghiệm · AI sắp ra mắt</span><p>Chuẩn bị ảnh của bạn, chọn thiết kế yêu thích. Cùng hình dung một cách phối thật riêng.</p></div>
    </header>
    <ol className="try-on-steps" aria-label="Các bước dùng thử">
      {["Ảnh của bạn", "Xác nhận", "Kết quả"].map((label, index) => <li key={label} aria-current={step === index ? "step" : undefined} className={step === index ? "current" : step > index ? "complete" : ""}><span>{step > index ? <Check size={15} /> : `0${index + 1}`}</span>{label}</li>)}
    </ol>
    <div className="try-on-mobile-selection"><Shirt size={19} /><div><small>SẢN PHẨM ĐANG THỬ</small><b>{product.name}</b><span>{color}{size ? ` · Size ${size}` : ""}</span></div><a className="text-link" href={`#${id}-product`}>Đổi lựa chọn <ArrowRight size={14} /></a></div>
    <div className="try-on-workspace">
      <section className="try-on-main" aria-labelledby={`${id}-stage-title`}>
        <div className="try-on-section-title"><h2 id={`${id}-stage-title`} ref={heading} tabIndex={-1}>{["Bắt đầu từ ảnh của bạn.", "Đúng bạn. Đúng thiết kế.", "Không gian cho diện mạo mới."][step]}</h2><span className="eyebrow">0{step + 1} / 03</span></div>

        {step === 0 && <>
          <p className="try-on-help">Chọn ảnh rõ mặt, đủ sáng, chỉ có một người. Với áo, ảnh thấy rõ từ đầu đến hông sẽ giúp thể hiện thiết kế tốt hơn.</p>
          <div className="try-on-photo-modes" role="group" aria-label="Loại ảnh của bạn">
            <button type="button" aria-pressed={mode === "upper-body"} onClick={() => { invalidate(); setMode("upper-body"); }}><Shirt size={19} /><span>Thân trên / toàn thân<small>Khuyên dùng khi thử áo</small></span></button>
            <button type="button" aria-pressed={mode === "portrait"} onClick={() => { invalidate(); setMode("portrait"); }}><ScanFace size={19} /><span>Chỉ có ảnh chân dung<small>Xem phong cách qua hình đại diện</small></span></button>
          </div>
          {mode === "portrait" && <p className="try-on-notice">Với ảnh chân dung, vóc dáng trong kết quả sau này có thể do AI mô phỏng. Ảnh này chỉ giúp tham khảo diện mạo và phong cách.</p>}
          <input ref={input} id={`${id}-photo`} className="sr-only" type="file" accept={TRY_ON_ACCEPT} onChange={choosePhoto} aria-label="Chọn ảnh của bạn" aria-describedby={`${id}-file-help ${id}-photo-error`} aria-invalid={!!photo.error} />
          <input ref={camera} className="sr-only" type="file" accept={TRY_ON_ACCEPT} capture="user" onChange={choosePhoto} aria-label="Chụp ảnh của bạn" tabIndex={-1} />
          <div className={`try-on-upload ${photo.photo ? "has-photo" : ""}`} aria-busy={photo.checking} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file) { invalidate(); void photo.choose(file); } }}>
            {photo.photo ? <>
              <img src={photo.photo.url} alt="Ảnh bạn đã chọn để dùng thử" className="try-on-personal-photo" />
              <div className="try-on-photo-tools"><button type="button" onClick={() => input.current?.click()}><ImagePlus size={16} /> Thay ảnh</button><button type="button" onClick={removePhoto}><Trash2 size={16} /> Xóa ảnh</button></div>
            </> : <div className="try-on-upload-empty">
              <PhotoGuide portrait={mode === "portrait"} />
              <h3>{photo.checking ? "Đang kiểm tra ảnh…" : "Một tấm ảnh. Một cách nhìn mới."}</h3>
              <p>Kéo ảnh vào đây hoặc chọn từ thiết bị.</p>
              <button type="button" className="button" disabled={photo.checking} onClick={() => input.current?.click()}><ImagePlus size={18} /> Chọn ảnh của bạn</button>
              <button type="button" className="text-link" disabled={photo.checking} onClick={() => camera.current?.click()}><Camera size={16} /> Chụp ảnh</button>
            </div>}
          </div>
          <div className="try-on-file-meta"><p id={`${id}-file-help`}>JPG, PNG, WebP · tối đa 8 MB · từ 512 × 512 px</p>{photo.photo && <span>{photo.photo.width} × {photo.photo.height} px</span>}</div>
          <p id={`${id}-photo-error`} className="try-on-error" role={photo.error ? "alert" : undefined}>{photo.error}</p>
          <ul className="try-on-photo-tips"><li><Check size={15} /> Mặt hướng về máy ảnh, vùng vai và áo không bị che.</li><li><Check size={15} /> Nền gọn, ánh sáng tự nhiên, tránh kính lọc làm đổi diện mạo.</li></ul>
          <div className="try-on-stage-actions"><span><LockKeyhole size={16} /> Ảnh chỉ nằm trên thiết bị của bạn.</span><button type="button" className="button" disabled={!photo.photo || photo.checking || !ready} onClick={() => move(1)}>Tiếp tục <ArrowRight size={17} /></button></div>
        </>}

        {step === 1 && photo.photo && <>
          <p className="try-on-help">Kiểm tra ảnh và màu áo trước khi xác nhận. Bạn có thể đổi lựa chọn bất cứ lúc nào.</p>
          <div className="try-on-confirm-pair"><figure><div><img src={photo.photo.url} alt="Ảnh cá nhân đã chọn" /></div><figcaption><span>01 / ẢNH CỦA BẠN</span><button type="button" className="text-link" onClick={() => move(0)}>Thay ảnh</button></figcaption></figure><figure><div><ProductPhoto src={reference?.url} alt={`${product.name} — ${color}`} loading="eager" sizes="(max-width: 760px) 40vw, 25vw" /></div><figcaption><span>02 / {color}</span><span>{size ? `Size ${size}` : "Chưa chọn size"}</span></figcaption></figure></div>
          <p className="try-on-mode-caption">{mode === "portrait" ? "Chế độ ảnh chân dung: vóc dáng có thể được AI mô phỏng khi tính năng được kết nối." : "Chế độ thân trên / toàn thân: ưu tiên giữ tư thế và diện mạo trong ảnh."}</p>
          <label className="try-on-consent"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span>Tôi đồng ý sử dụng ảnh đã chọn cho lượt dùng thử này.<small>Bản trải nghiệm hiện chỉ xem ảnh trên thiết bị. Chưa có ảnh nào được gửi tới dịch vụ AI.</small></span></label>
          <div className="try-on-stage-actions"><button type="button" className="text-link" onClick={() => move(0)}><ArrowLeft size={16} /> Quay lại</button><button type="button" className="button" disabled={!consent || !ready} onClick={() => move(2)}>Xác nhận & xem bước kết quả <ArrowRight size={17} /></button></div>
        </>}

        {step === 2 && <>
          <div className="try-on-result-empty" role="status"><div className="try-on-result-icon"><Sparkles size={34} /></div><p className="eyebrow">CHƯA CÓ ẢNH KẾT QUẢ</p><h3>Lựa chọn của bạn đã sẵn sàng.</h3><p>Tính năng tạo ảnh AI chưa được kết nối. Hiện chưa tạo ảnh bạn mặc sản phẩm và chưa gửi ảnh của bạn đi.</p><button type="button" className="button" disabled><Sparkles size={17} /> Tạo ảnh dùng thử · Sắp ra mắt</button><small>Khi tính năng sẵn sàng, bạn sẽ xác nhận lại trước khi gửi ảnh.</small></div>
          <p className="try-on-disclaimer">Ảnh mô phỏng bằng AI, dùng để tham khảo cách phối và diện mạo. Vui lòng xem thông tin kích thước của sản phẩm trước khi mua.</p>
          <div className="try-on-stage-actions"><button type="button" className="text-link" onClick={() => { setConsent(false); move(0); }}><RotateCcw size={16} /> Đổi ảnh hoặc lựa chọn</button><button type="button" className="text-link" onClick={removePhoto}><Trash2 size={16} /> Xóa ảnh của tôi</button></div>
        </>}
      </section>

      <aside className="try-on-product-panel" id={`${id}-product`} aria-label="Sản phẩm dùng thử">
        <div className="try-on-product-top"><p className="eyebrow">TRONG PHÒNG THỬ CỦA BẠN</p><Link className="text-link" href="/san-pham">Đổi sản phẩm <ArrowRight size={14} /></Link></div>
        <div className="try-on-product-image">{reference ? <ProductPhoto key={reference.url} src={reference.url} alt={`${product.name} — ${color}`} loading="eager" sizes="(max-width: 760px) 80vw, 30vw" /> : <div className="try-on-missing-image"><Shirt size={35} /><p>Ảnh riêng màu {color} đang cập nhật.</p><small>Chọn màu có ảnh để chuẩn bị dùng thử.</small></div>}<span className="try-on-product-tag">MILO DESIGN</span></div>
        <div className="try-on-product-copy"><p className="eyebrow">{product.category?.name}</p><h2>{product.name}</h2><p className="try-on-product-material">{product.fit} · {product.material}</p><b className="try-on-price">{money(variant?.price ?? product.price)}</b>
          <fieldset className="try-on-choices"><legend>Màu sắc <b>{color}</b></legend><div className="try-on-colors">{colors.map((item) => <button key={item.color} type="button" aria-label={`Dùng thử màu ${item.color}`} aria-pressed={color === item.color} title={`${item.color}${tryOnReference(product, item.color) ? "" : " — Ảnh đang cập nhật"}`} onClick={() => { invalidate(); setColor(item.color); setSize(""); }}><span style={{ background: item.colorHex }} />{item.color}{color === item.color && <Check size={13} />}</button>)}</div></fieldset>
          <fieldset className="try-on-choices"><legend>Size <span>Chọn khi thêm vào giỏ</span></legend><div className="try-on-sizes">{product.variants.filter((item) => item.color === color).map((item) => <button key={item.id} type="button" aria-label={`Size ${item.size}${item.available > 0 ? "" : " — hết hàng"}`} aria-pressed={size === item.size} disabled={item.available <= 0} onClick={() => { invalidate(); setSize(item.size); }}>{item.size}</button>)}</div></fieldset>
          {!supported && <p className="try-on-notice" role="status">Phòng thử hiện chuẩn bị cho áo phông, hoodie, áo khoác và bomber. Nhóm sản phẩm này chưa được hỗ trợ.</p>}
          {!reference && <p className="try-on-notice" role="status">Chưa thể xác nhận dùng thử màu này vì thiếu ảnh sản phẩm tương ứng.</p>}
          {cartError && <p className="try-on-error" role="alert">{cartError}</p>}
          <button type="button" className="button secondary full" aria-busy={busy} disabled={busy || !variant || variant.available <= 0} onClick={addToCart}>{busy ? "Đang thêm…" : "Thêm sản phẩm vào giỏ"}<ArrowRight size={17} /></button>
          <Link className="text-link try-on-size-link" href={`${productHref}#size-guide`}>Xem bảng size & chi tiết <ArrowRight size={15} /></Link>
          <p className="try-on-size-note">Ảnh dùng thử không xác định số đo hay đảm bảo độ vừa vặn. Hãy đối chiếu bảng size trước khi chọn mua.</p>
        </div>
      </aside>
    </div>
    <div className="try-on-privacy"><LockKeyhole size={20} /><div><h3>Ảnh của bạn, trong tay bạn.</h3><p>Ảnh được giữ tạm trong trang này, không tải lên máy chủ và không lưu để dùng lại. Xóa ảnh hoặc rời phòng thử để bỏ ảnh khỏi phiên xem trước.</p></div><span className="eyebrow">YOUR PHOTO. YOUR CHOICE.</span></div>
  </div>;
}

function PhotoGuide({ portrait }: { portrait: boolean }) {
  return <svg className="try-on-photo-guide" viewBox="0 0 180 170" fill="none" aria-hidden="true"><path d="M30 46V24h22m76 0h22v22M30 124v22h22m76 0h22v-22" stroke="currentColor" strokeWidth="1.2" /><ellipse cx="90" cy="65" rx="23" ry="29" stroke="currentColor" strokeWidth="1.4" /><path d={portrait ? "M48 132c0-29 18-43 42-43s42 14 42 43" : "M71 91 45 108l-7 32m71-49 26 17 7 32M61 102l-5 43m63-43 5 43M78 94q12 14 24 0"} stroke="currentColor" strokeWidth="1.4" /><path d="M27 84h126" stroke="currentColor" strokeOpacity=".18" strokeDasharray="3 4" /></svg>;
}
