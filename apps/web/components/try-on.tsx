"use client";
import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, ImagePlus, LockKeyhole, ScanFace, Shirt, Trash2, Camera, RotateCcw, Copy, Download, ExternalLink, Sparkles } from "lucide-react";
import { useResource } from "../hooks/use-resource";
import { useTryOnPhoto } from "../hooks/use-try-on-photo";
import { useDirectTryOn } from "../hooks/use-direct-try-on";
import { DirectTryOnResult } from "./direct-try-on";
import { api, ErrorBox, Skeleton, money, useShop } from "./client";
import { ProductPhoto } from "./product-media";
import { productSelectionHref } from "../lib/product-selection";
import { initialTryOnSelection, TRY_ON_ACCEPT, tryOnDownload, tryOnDownloadName, tryOnPrompt, tryOnReference, tryOnSupports, type TryOnProduct, type TryOnPhotoMode } from "../lib/try-on";

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
  const { add, user, ready: accountReady, loadUser } = useShop();
  const [verificationBusy, setVerificationBusy] = useState(false);
  const [verificationMessage, setVerificationMessage] = useState('');
  const [verificationError, setVerificationError] = useState(false);
  const ai = useDirectTryOn(product.slug, color, user?.id);
  const requireVerifiedEmail = ai.config?.requireVerifiedEmail !== false;
  const [experience, setExperience] = useState<'manual' | 'direct' | null>(null);
  const direct = experience === 'direct';
  useEffect(() => {
    if (ai.config?.enabled && experience === null) { setExperience('direct'); setConsent(false); setStep(0); }
  }, [ai.config?.enabled, experience]);
  const heading = useRef<HTMLHeadingElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const reference = tryOnReference(product, color);
  const supported = tryOnSupports(product);
  const download = tryOnDownload(product, color);
  const ready = !!download;
  const variant = product.variants.find((item) => item.color === color && item.size === size);
  const colors = [...new Map(product.variants.map((item) => [item.color, item])).values()];
  const productHref = productSelectionHref(product.slug, color, size);
  const processing = ai.submitting || !!ai.job && ['queued', 'processing'].includes(ai.job.status);
  const generationBlock = processing ? { code: 'processing', message: 'Bạn đang có một lượt thử được xử lý. Hãy xem lượt thử đang có; hệ thống không tạo thêm lượt.' }
    : !ai.config?.enabled ? { code: 'configuration', message: 'Thử đồ AI hiện chưa khả dụng. Vui lòng quay lại sau.' }
    : !accountReady ? { code: 'account-loading', message: 'Đang kiểm tra phiên đăng nhập…' }
    : !user ? { code: 'login', message: 'Bạn cần đăng nhập tài khoản Milo trước khi tạo ảnh thử đồ.' }
    : requireVerifiedEmail && !user.verifiedAt ? { code: 'verification', message: 'Bạn đã đồng ý sử dụng ảnh, nhưng email tài khoản chưa được xác minh. Hãy mở liên kết xác minh trong email, rồi bấm kiểm tra lại bên dưới.' }
    : !ready ? { code: 'reference', message: 'Màu sản phẩm này chưa có ảnh tham chiếu phù hợp. Hãy chọn màu có ảnh.' }
    : photo.checking ? { code: 'photo-checking', message: 'Đang kiểm tra ảnh của bạn…' }
    : !photo.photo ? { code: 'photo', message: 'Bạn cần chọn một ảnh hợp lệ trước khi tạo ảnh thử đồ.' }
    : ai.quotaLoading ? { code: 'quota-loading', message: 'Đang kiểm tra hạn mức tạo ảnh…' }
    : !ai.quota ? { code: 'quota-unavailable', message: 'Chưa kiểm tra được hạn mức. Bấm kiểm tra lại; hệ thống chưa gửi ảnh của bạn.' }
    : ai.quota.remaining < 2 ? { code: 'quota-exhausted', message: 'Bạn đã dùng hết hai ảnh hôm nay. Hãy xem lượt thử đang có hoặc chờ đến 00:00 giờ Việt Nam.' }
    : !consent ? { code: 'consent', message: 'Hãy tích đồng ý sử dụng ảnh để tạo hai ảnh thử.' } : null;
  async function resendVerification() {
    if (verificationBusy) return;
    setVerificationBusy(true); setVerificationMessage(''); setVerificationError(false);
    try {
      const result = await api('/auth/verify/resend', { method: 'POST', body: '{}' });
      setVerificationMessage(result.message);
    } catch (error) { setVerificationError(true); setVerificationMessage(error instanceof Error ? error.message : 'Chưa gửi được yêu cầu xác minh. Vui lòng thử lại.'); }
    finally { setVerificationBusy(false); }
  }
  async function checkVerification() {
    if (verificationBusy) return;
    setVerificationBusy(true); setVerificationMessage(''); setVerificationError(false);
    try {
      const account = await loadUser();
      setVerificationMessage(account?.verifiedAt ? 'Email đã được xác minh. Bạn có thể tiếp tục khi đủ các điều kiện còn lại.' : 'Email vẫn chưa được xác minh. Hãy mở liên kết trong thư xác minh trước.');
      ai.refresh();
    } finally { setVerificationBusy(false); }
  }
  async function generate() {
    if (!consent || !photo.photo || !ready) return;
    const job = await ai.generate(photo.photo.file, mode);
    if (job) move(2);
  }

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
      <div className="try-on-intro"><span className="try-on-status"><span /> {direct ? 'Thử đồ AI tại Milo · 2 ảnh / ngày' : ai.config?.enabled ? 'Thao tác thủ công · Tự dùng ChatGPT' : 'Thao tác thủ công · AI chưa kết nối'}</span><p>{direct ? 'Xem mình trong đúng thiết kế và màu áo đang chọn. Mỗi tài khoản có tối đa hai ảnh thử trong ngày.' : 'Tải ảnh thiết kế, sao chép prompt rồi tự thử trong ChatGPT bằng tài khoản của bạn. Chế độ này không tạo ảnh AI trên website.'}</p></div>
    </header>
    <div className="try-on-experience" role="group" aria-label="Cách dùng thử">
      <button type="button" aria-pressed={direct} disabled={!ai.config?.enabled || ai.submitting} onClick={() => { invalidate(); setExperience('direct'); }}><Sparkles size={16} /> Thử đồ AI tại Milo</button>
      <button type="button" aria-pressed={!direct} disabled={ai.submitting} onClick={() => { invalidate(); setExperience('manual'); }}><ExternalLink size={16} /> Tự dùng ChatGPT</button>
      {!ai.config?.enabled && <span>Thử đồ AI tại Milo hiện chưa khả dụng.</span>}
    </div>
    {direct && <div className="try-on-ai-quota"><p>{user ? ai.quota ? `Còn ${ai.quota.remaining} / 2 ảnh hôm nay · Hạn mức đặt lại lúc 00:00 giờ Việt Nam.` : ai.quotaLoading ? 'Đang kiểm tra hạn mức…' : 'Chưa kiểm tra được hạn mức.' : requireVerifiedEmail ? 'Đăng nhập tài khoản Milo đã xác minh email để dùng thử AI.' : 'Đăng nhập tài khoản Milo để dùng thử AI.'}</p>{!user && <Link className="text-link" href={`/dang-nhap?next=${encodeURIComponent(`/dung-thu/${product.slug}?${new URLSearchParams({ color, size })}`)}`}>Đăng nhập <ArrowRight size={15} /></Link>}{user && requireVerifiedEmail && !user.verifiedAt && <Link className="text-link" href="/tai-khoan">Xác minh email trong tài khoản <ArrowRight size={15} /></Link>}{user && <button type="button" className="text-link" disabled={ai.quotaLoading || ai.submitting} onClick={ai.refresh}>Kiểm tra lại hạn mức</button>}{ai.job && <button type="button" className="text-link" onClick={() => move(2)}>Xem lượt thử đang có <ArrowRight size={15} /></button>}</div>}
    <ol className="try-on-steps" aria-label="Các bước dùng thử">
      {["Chuẩn bị", "Kiểm tra", direct ? 'Ảnh thử của bạn' : "Tự thử trong ChatGPT"].map((label, index) => <li key={label} aria-current={step === index ? "step" : undefined} className={step === index ? "current" : step > index ? "complete" : ""}><span>{step > index ? <Check size={15} /> : `0${index + 1}`}</span>{label}</li>)}
    </ol>
    <div className="try-on-mobile-selection"><Shirt size={19} /><div><small>SẢN PHẨM ĐANG THỬ</small><b>{product.name}</b><span>{color}{size ? ` · Size ${size}` : ""}</span></div><a className="text-link" href={`#${id}-product`}>Đổi lựa chọn <ArrowRight size={14} /></a></div>
    <div className="try-on-workspace">
      <section className="try-on-main" aria-labelledby={`${id}-stage-title`}>
        <div className="try-on-section-title"><h2 id={`${id}-stage-title`} ref={heading} tabIndex={-1}>{["Bắt đầu từ ảnh của bạn.", "Đúng bạn. Đúng thiết kế.", direct ? 'Diện mạo mới của bạn.' : "Mang thiết kế vào ChatGPT."][step]}</h2><span className="eyebrow">0{step + 1} / 03</span></div>

        {step === 0 && <>
          <p className="try-on-help">{direct ? 'Chọn ảnh của chính bạn hoặc ảnh bạn có quyền sử dụng, rõ mặt, đủ sáng và chỉ có một người. Ảnh thấy rõ từ đầu đến hông sẽ phù hợp hơn khi thử áo. Ảnh chưa được gửi đi ở bước này.' : 'Chọn ảnh rõ mặt, đủ sáng, chỉ có một người. Xem trước tại đây là tùy chọn; bạn có thể tiếp tục và tự chọn ảnh khi mở ChatGPT. Ảnh thấy rõ từ đầu đến hông sẽ phù hợp hơn khi thử áo.'}</p>
          <div className="try-on-photo-modes" role="group" aria-label="Loại ảnh của bạn">
            <button type="button" aria-pressed={mode === "upper-body"} onClick={() => { invalidate(); setMode("upper-body"); }}><Shirt size={19} /><span>Thân trên / toàn thân<small>Khuyên dùng khi thử áo</small></span></button>
            <button type="button" aria-pressed={mode === "portrait"} onClick={() => { invalidate(); setMode("portrait"); }}><ScanFace size={19} /><span>Chỉ có ảnh chân dung<small>Xem phong cách qua hình đại diện</small></span></button>
          </div>
          {mode === "portrait" && <p className="try-on-notice">Với ảnh chân dung, vóc dáng trong ảnh {direct ? 'kết quả' : 'tạo bằng ChatGPT'} có thể do AI mô phỏng. Ảnh này chỉ giúp tham khảo diện mạo và phong cách.</p>}
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
          <div className="try-on-stage-actions"><span><LockKeyhole size={16} /> Ảnh chưa được gửi đi.</span><button type="button" className="button" disabled={photo.checking || !ready || direct && !photo.photo} onClick={() => move(1)}>Tiếp tục <ArrowRight size={17} /></button></div>
        </>}

        {step === 1 && <>
          <p className="try-on-help">Kiểm tra ảnh và màu áo trước khi xác nhận. Bạn có thể đổi lựa chọn bất cứ lúc nào.</p>
          <div className="try-on-confirm-pair"><figure><div>{photo.photo ? <img src={photo.photo.url} alt="Ảnh cá nhân đã chọn" /> : <div className="try-on-personal-placeholder"><PhotoGuide portrait={mode === "portrait"} /><p>Bạn sẽ tự chọn ảnh của mình trong ChatGPT.</p></div>}</div><figcaption><span>01 / ẢNH CỦA BẠN</span><button type="button" className="text-link" onClick={() => move(0)}>{photo.photo ? "Thay ảnh" : "Xem trước ảnh"}</button></figcaption></figure><figure><div><ProductPhoto src={reference?.url} alt={`${product.name} — ${color}`} loading="eager" sizes="(max-width: 760px) 40vw, 25vw" /></div><figcaption><span>02 / {color}</span><span>{size ? `Size ${size}` : "Chưa chọn size"}</span></figcaption></figure></div>
          <p className="try-on-mode-caption">{mode === "portrait" ? "Chế độ ảnh chân dung: prompt sẽ ghi rõ phần vóc dáng không có trong ảnh chỉ là mô phỏng." : "Chế độ thân trên / toàn thân: prompt ưu tiên giữ tư thế và diện mạo trong ảnh."}</p>
          <label className="try-on-consent"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span>{direct ? 'Tôi có quyền sử dụng ảnh này và đồng ý gửi ảnh tới OpenAI qua Milo để tạo hai ảnh thử.' : 'Tôi hiểu mình sẽ tự tải ảnh lên ChatGPT bằng tài khoản của mình.'}<small>{direct ? `Ảnh được lưu tạm để xử lý và xóa khỏi máy chủ Milo sau khi xử lý xong. Kết quả hết hạn sau ${ai.config?.retentionHours || 24} giờ. Nếu lượt đã gửi tới AI nhưng không nhận được kết quả xác nhận, hạn mức vẫn được tính và không có lượt gửi lại tự động. Ảnh gửi tới OpenAI được xử lý theo chính sách của nhà cung cấp.` : 'Website không gửi ảnh, không kết nối tài khoản ChatGPT và không kiểm tra hạn mức của bạn.'}</small></span></label>
          {direct && ai.error && <p className="try-on-error" role="alert">{ai.error}</p>}
          {direct && generationBlock && <div className="try-on-notice try-on-generation-block" id={`${id}-generate-block`} data-reason={generationBlock.code}>
            <p role="status">{generationBlock.code === 'verification' && !consent ? 'Email tài khoản chưa được xác minh. Hãy mở liên kết xác minh trong email, rồi bấm kiểm tra lại bên dưới.' : generationBlock.message}</p>
            {generationBlock.code === 'verification' && <div className="try-on-verification-actions"><button type="button" className="text-link" disabled={verificationBusy} onClick={() => void resendVerification()}>Gửi lại email xác minh</button><button type="button" className="text-link" disabled={verificationBusy} onClick={() => void checkVerification()}>Đã xác minh, kiểm tra lại</button></div>}
            {generationBlock.code === 'login' && <Link className="text-link" href={`/dang-nhap?next=${encodeURIComponent(`/dung-thu/${product.slug}?${new URLSearchParams({ color, size })}`)}`}>Đăng nhập để tiếp tục <ArrowRight size={15} /></Link>}
            {['quota-unavailable', 'quota-loading'].includes(generationBlock.code) && <button type="button" className="text-link" disabled={ai.quotaLoading} onClick={ai.refresh}>Kiểm tra lại hạn mức tạo ảnh</button>}
            {['processing', 'quota-exhausted'].includes(generationBlock.code) && ai.job && <button type="button" className="text-link" onClick={() => move(2)}>Xem ảnh của lượt đang có <ArrowRight size={15} /></button>}
          </div>}
          {direct && verificationMessage && <p className={verificationError ? 'try-on-error' : 'try-on-help'} role={verificationError ? 'alert' : 'status'}>{verificationMessage}</p>}
          <div className="try-on-stage-actions"><button type="button" className="text-link" disabled={ai.submitting} onClick={() => move(0)}><ArrowLeft size={16} /> Quay lại</button>{direct ? <button type="button" className="button" disabled={!!generationBlock} aria-describedby={generationBlock ? `${id}-generate-block` : undefined} aria-busy={ai.submitting} onClick={() => void generate()}><Sparkles size={17} /> {ai.submitting ? 'Đang gửi…' : 'Tạo 2 ảnh thử đồ'}</button> : <button type="button" className="button" disabled={!consent || !ready} onClick={() => move(2)}>Chuẩn bị ảnh & prompt <ArrowRight size={17} /></button>}</div>
        </>}

        {step === 2 && <>
          {direct ? <DirectTryOnResult job={ai.job} error={ai.error} refresh={ai.refresh} /> : <ManualTryOnHandoff key={`${color}:${mode}`} product={product} color={color} mode={mode} download={download} />}
          <p className="try-on-disclaimer">{direct ? 'Ảnh mô phỏng bằng AI chỉ dùng để tham khảo cách phối và diện mạo.' : 'Nếu bạn tự tạo ảnh trong ChatGPT, ảnh chỉ dùng để tham khảo cách phối và diện mạo.'} Kết quả có thể sai chi tiết hoặc logo; hãy xem ảnh gốc và bảng size trước khi mua.</p>
          <div className="try-on-stage-actions"><button type="button" className="text-link" onClick={() => { setConsent(false); move(0); }}><RotateCcw size={16} /> Đổi ảnh hoặc lựa chọn</button><button type="button" className="text-link" disabled={direct && processing} onClick={() => { if (direct && ai.job) void ai.remove().then(deleted => { if (deleted) removePhoto(); }); else removePhoto(); }}><Trash2 size={16} /> {direct ? 'Xóa ảnh và kết quả' : 'Xóa ảnh của tôi'}</button></div>
        </>}
      </section>

      <aside className="try-on-product-panel" id={`${id}-product`} aria-label="Sản phẩm dùng thử">
        <div className="try-on-product-top"><p className="eyebrow">TRONG PHÒNG THỬ CỦA BẠN</p><Link className="text-link" href="/san-pham">Đổi sản phẩm <ArrowRight size={14} /></Link></div>
        <div className="try-on-product-image">{reference ? <ProductPhoto key={reference.url} src={reference.url} alt={`${product.name} — ${color}`} loading="eager" sizes="(max-width: 760px) 80vw, 30vw" /> : <div className="try-on-missing-image"><Shirt size={35} /><p>Ảnh riêng màu {color} đang cập nhật.</p><small>Chọn màu có ảnh để chuẩn bị dùng thử.</small></div>}<span className="try-on-product-tag">MILO DESIGN</span></div>
        <div className="try-on-product-copy"><p className="eyebrow">{product.category?.name}</p><h2>{product.name}</h2><p className="try-on-product-material">{product.fit} · {product.material}</p><b className="try-on-price">{money(variant?.price ?? product.price)}</b>
          <fieldset className="try-on-choices"><legend>Màu sắc <b>{color}</b></legend><div className="try-on-colors">{colors.map((item) => <button key={item.color} type="button" aria-label={`Dùng thử màu ${item.color}`} aria-pressed={color === item.color} title={`${item.color}${tryOnReference(product, item.color) ? "" : " — Ảnh đang cập nhật"}`} onClick={() => { invalidate(); setColor(item.color); setSize(""); }}><span style={{ background: item.colorHex }} />{item.color}{color === item.color && <Check size={13} />}</button>)}</div></fieldset>
          <fieldset className="try-on-choices"><legend>Size <span>Chọn khi thêm vào giỏ</span></legend><div className="try-on-sizes">{product.variants.filter((item) => item.color === color).map((item) => <button key={item.id} type="button" aria-label={`Size ${item.size}${item.available > 0 ? "" : " — hết hàng"}`} aria-pressed={size === item.size} disabled={item.available <= 0} onClick={() => { invalidate(); setSize(item.size); }}>{item.size}</button>)}</div></fieldset>
          {!supported && <p className="try-on-notice" role="status">Phòng thử hiện chuẩn bị cho áo phông, polo, hoodie, áo khoác và bomber. Nhóm sản phẩm này chưa được hỗ trợ.</p>}
          {!reference && <p className="try-on-notice" role="status">Chưa thể xác nhận dùng thử màu này vì thiếu ảnh sản phẩm tương ứng.</p>}
          {supported && reference && !download && <p className="try-on-notice" role="status">Ảnh màu này chưa có tệp tải phù hợp. Vui lòng chọn màu khác; Milo không thay bằng ảnh khác màu hoặc ảnh ghép nhiều góc.</p>}
          {cartError && <p className="try-on-error" role="alert">{cartError}</p>}
          <button type="button" className="button secondary full" aria-busy={busy} disabled={busy || !variant || variant.available <= 0} onClick={addToCart}>{busy ? "Đang thêm…" : "Thêm sản phẩm vào giỏ"}<ArrowRight size={17} /></button>
          <Link className="text-link try-on-size-link" href={`${productHref}#size-guide`}>Xem bảng size & chi tiết <ArrowRight size={15} /></Link>
          <p className="try-on-size-note">Ảnh dùng thử không xác định số đo hay đảm bảo độ vừa vặn. Hãy đối chiếu bảng size trước khi chọn mua.</p>
        </div>
      </aside>
    </div>
    <div className="try-on-privacy"><LockKeyhole size={20} /><div><h3>Ảnh của bạn, trong tay bạn.</h3><p>{direct ? 'Chỉ khi bạn đồng ý và bấm tạo ảnh, Milo mới tải ảnh lên để xử lý với OpenAI. Ảnh và kết quả không được công khai; chỉ tài khoản của bạn có thể xem. Rời trang không hủy lượt đã gửi; bạn có thể quay lại đúng sản phẩm và màu để xem kết quả còn hạn.' : 'Ảnh xem trước được giữ tạm trên thiết bị, không tải lên máy chủ và không lưu để dùng lại. Xóa ảnh hoặc rời phòng thử để bỏ ảnh khỏi phiên xem trước. Nếu bạn tự tải ảnh lên ChatGPT, ảnh sẽ được xử lý theo cài đặt và chính sách của dịch vụ đó.'}</p></div><span className="eyebrow">YOUR PHOTO. YOUR CHOICE.</span></div>
  </div>;
}

function ManualTryOnHandoff({ product, color, mode, download }: { product: TryOnProduct; color: string; mode: TryOnPhotoMode; download?: string }) {
  const id = useId();
  const text = useRef<HTMLTextAreaElement>(null);
  const [copyStatus, setCopyStatus] = useState("");
  const prompt = tryOnPrompt(product, color, mode);
  async function copyPrompt() {
    if (!prompt) return;
    try {
      await navigator.clipboard.writeText(prompt);
      setCopyStatus("Đã sao chép prompt. Hãy dán vào ChatGPT cùng hai ảnh.");
    } catch {
      text.current?.focus(); text.current?.select();
      setCopyStatus("Không thể sao chép tự động. Prompt đã được chọn; hãy sao chép bằng menu thiết bị hoặc Ctrl/Cmd+C.");
    }
  }
  return <div className="try-on-handoff">
    <p className="try-on-help">AI trên website chưa kết nối. Bạn sẽ tự thực hiện trong ChatGPT; ảnh và prompt không được gửi tự động.</p>
    <ol className="try-on-manual-steps">
      <li><span>01</span><div><h3>Tải đúng thiết kế.</h3><p>{product.name} · {color}. Tệp tải là ảnh sản phẩm đang chọn, không phải ảnh của bạn.</p>{download ? <a className="button secondary" href={download} download={tryOnDownloadName(product, color, download)}><Download size={16} /> Tải ảnh sản phẩm</a> : <p role="status">Chưa có ảnh phù hợp để tải. Hãy chọn lại màu sản phẩm.</p>}</div></li>
      <li><span>02</span><div><h3>Mang theo lời nhắn.</h3><label className="sr-only" htmlFor={`${id}-prompt`}>Prompt thử áo</label><textarea ref={text} id={`${id}-prompt`} readOnly value={prompt} rows={8} spellCheck={false} aria-describedby={`${id}-copy-status`} /><button type="button" className="button secondary" disabled={!prompt} onClick={() => void copyPrompt()}><Copy size={16} /> Sao chép prompt</button><p id={`${id}-copy-status`} className="try-on-copy-status" role="status">{copyStatus}</p></div></li>
      <li><span>03</span><div><h3>Tự thử trong ChatGPT.</h3><p>Đăng nhập tài khoản của bạn. Đính kèm ảnh cá nhân trước, ảnh sản phẩm vừa tải sau, rồi dán prompt. Bạn tự quyết định gửi yêu cầu tạo ảnh và xem kết quả tại đó.</p><a className="button" href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Mở ChatGPT <ExternalLink size={16} /></a></div></li>
    </ol>
    <p className="try-on-notice">Chỉ dùng hạn mức có sẵn trong tài khoản của bạn. Nếu hết hạn mức hoặc không có quyền tạo ảnh, hãy dừng và chờ; không mua credit hay nâng cấp để tiếp tục. Milo không kiểm tra hoặc kiểm soát hạn mức và thanh toán bên ChatGPT.</p>
  </div>;
}

function PhotoGuide({ portrait }: { portrait: boolean }) {
  return <svg className="try-on-photo-guide" viewBox="0 0 180 170" fill="none" aria-hidden="true"><path d="M30 46V24h22m76 0h22v22M30 124v22h22m76 0h22v-22" stroke="currentColor" strokeWidth="1.2" /><ellipse cx="90" cy="65" rx="23" ry="29" stroke="currentColor" strokeWidth="1.4" /><path d={portrait ? "M48 132c0-29 18-43 42-43s42 14 42 43" : "M71 91 45 108l-7 32m71-49 26 17 7 32M61 102l-5 43m63-43 5 43M78 94q12 14 24 0"} stroke="currentColor" strokeWidth="1.4" /><path d="M27 84h126" stroke="currentColor" strokeOpacity=".18" strokeDasharray="3 4" /></svg>;
}
