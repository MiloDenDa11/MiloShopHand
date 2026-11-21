"use client";
import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowUpRight, Truck, RotateCcw, ShieldCheck, CircleHelp, MessageCircle, PackageCheck, Ruler, Mail, ChevronDown, Search, MapPin, Clock3, UserRound, LockKeyhole } from "lucide-react";
import { ErrorBox, money } from "./client";
import { useResource } from "../hooks/use-resource";
import { useEditorialFragment } from "../hooks/use-editorial-fragment";
import { EditorialPhoto } from "./editorial-photo";
import { careSections, careVisuals, careFaqs, policyDetails } from "../content/customer-care";
import { sampleSizeGuide } from "../content/size-guide";

const menuIcons = [Truck, RotateCcw, ShieldCheck, CircleHelp, MessageCircle];
function publicEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim();
  if (!/^[^\s<>]+@[^\s<>]+\.[^\s<>]+$/.test(email) || /\.(local|test|invalid|example)$/i.test(email) || /@(?:example\.(?:com|org|net))$/i.test(email)) return null;
  return email;
}

function PolicyQuote({ text, name }: { text?: string; name: string }) {
  return <section className="care-policy" aria-label="Chính sách hiện hành" data-policy={name}>
    <span className="eyebrow">THÔNG TIN TỪ CỬA HÀNG</span>
    <p>{text || "Cửa hàng chưa công bố nội dung chính sách này. Vui lòng xem kênh liên hệ để được hỗ trợ."}</p>
  </section>;
}
function PolicyDetails({ rows }: { rows: { title: string; text: string }[] }) {
  return <div className="care-details">{rows.map((row, index) => <details key={row.title} open={index === 0}>
    <summary>{row.title}<ChevronDown size={18} aria-hidden="true" /></summary>
    <div><p>{row.text}</p></div>
  </details>)}</div>;
}
function Steps({ title, steps, id }: { title: string; steps: { title: string; text: string }[]; id?: string }) {
  return <section className="care-steps" id={id}>
    <h3>{title}</h3>
    <ol>{steps.map((step, i) => <li key={step.title}>
      <span className="care-step-number" aria-hidden="true">0{i + 1}</span>
      <div><h4>{step.title}</h4><p>{step.text}</p></div>
    </li>)}</ol>
  </section>;
}

function SizeGuide() {
  return <section className="care-size-guide" id="size-guide" aria-labelledby="care-size-title">
    <div className="care-section-title"><Ruler size={21} aria-hidden="true" /><h3 id="care-size-title">Tìm một phom áo vừa ý.</h3></div>
    <p>Bảng size sản phẩm mẫu dùng cm; đo một chiếc áo bạn đang mặc thoải mái để so sánh.</p>
    <div className="care-measure-tips">
      <div><span>A / VAI</span><p>Đo ngang giữa hai đường may vai.</p></div>
      <div><span>B / NGỰC</span><p>Đo ngang từ nách này sang nách kia; nhân đôi để so với vòng ngực.</p></div>
      <div><span>C / DÀI ÁO</span><p>Đo từ điểm vai cạnh cổ xuống gấu áo.</p></div>
    </div>
    <div className="care-size-table" role="region" aria-label="Bảng số đo áo mẫu, đơn vị cm" tabIndex={0}>
      <table><caption>Số đo mẫu · cm</caption><thead><tr><th scope="col">Size</th><th scope="col">Vòng ngực</th><th scope="col">Dài áo</th><th scope="col">Vai</th></tr></thead>
        <tbody>{sampleSizeGuide.map(row => <tr key={row.size}><th scope="row">{row.size}</th><td>{row.chest}</td><td>{row.length}</td><td>{row.shoulder}</td></tr>)}</tbody>
      </table>
    </div>
    <p className="care-fine-print">Đây là bảng số đo mẫu đang dùng trên trang sản phẩm. Ưu tiên thông tin riêng của sản phẩm và liên hệ cửa hàng khi cần hỗ trợ chọn size.</p>
  </section>;
}

function Faq({ config }: { config: any }) {
  const [query, setQuery] = useState(""), [topic, setTopic] = useState("Tất cả");
  const searchId = useId();
  const faqs = [...careFaqs,
    ...(config?.shippingPolicy ? [{ id: "shipping-policy", topic: "Giao hàng", question: "Phí giao hàng được tính thế nào?", answer: config.shippingPolicy }] : []),
    ...(config?.returnPolicy ? [{ id: "return-policy", topic: "Đổi trả & size", question: "Điều kiện đổi trả hiện tại là gì?", answer: config.returnPolicy }] : []),
  ];
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
  const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
  const filtered = faqs.filter(item => (topic === "Tất cả" || item.topic === topic) && terms.every(term => normalize(item.question + " " + item.answer).includes(term)));
  return <section className="care-faq" aria-label="Tra cứu câu hỏi">
    <label className="care-search" htmlFor={searchId}><Search size={19} aria-hidden="true" /><input id={searchId} type="search" placeholder="Bạn đang tìm điều gì?" aria-label="Tìm câu hỏi" value={query} onChange={e => setQuery(e.target.value)} /></label>
    <div className="care-faq-topics" role="group" aria-label="Chủ đề câu hỏi">{["Tất cả", ...new Set(faqs.map(item => item.topic))].map(value => <button key={value} type="button" aria-pressed={topic === value} onClick={() => setTopic(value)}>{value}</button>)}</div>
    <p className="care-faq-count" role="status">{filtered.length} câu hỏi{topic !== "Tất cả" ? ` · ${topic}` : ""}</p>
    <div className="care-faq-list">{filtered.map(item => <details key={item.id}>
      <summary><span>{item.question}</span><ChevronDown size={18} aria-hidden="true" /></summary>
      <div className="care-faq-answer"><p>{item.answer}</p>{"href" in item && <Link className="text-link" href={item.href!}>{item.cta}<ArrowUpRight size={16} /></Link>}</div>
    </details>)}</div>
    {!filtered.length && <div className="care-faq-empty"><CircleHelp size={27} aria-hidden="true" /><h3>Chưa tìm thấy câu hỏi phù hợp.</h3><p>Thử một từ ngắn hơn hoặc chọn lại chủ đề.</p><button className="button secondary" type="button" onClick={() => { setQuery(""); setTopic("Tất cả"); }}>Xem tất cả câu hỏi</button></div>}
    <div className="care-inline-help"><MessageCircle size={21} aria-hidden="true" /><div><h3>Vẫn còn điều muốn hỏi?</h3><p>Milo để các kênh hỗ trợ hiện có ở trang liên hệ.</p></div><Link className="text-link" href="/chinh-sach?tab=lien-he">Liên hệ<ArrowUpRight size={17} /></Link></div>
  </section>;
}

function Contact({ config }: { config: any }) {
  const email = publicEmail(config?.contactEmail);
  return <section className="care-contact" aria-label="Thông tin liên hệ">
    <div className="care-contact-primary"><Mail size={25} aria-hidden="true" /><span className="eyebrow">EMAIL / MỘT LỜI NHẮN CHO MILO</span>
      {email ? <><a className="care-email" href={`mailto:${email}`}>{email}</a><a className="button" href={`mailto:${email}`}>Gửi email cho Milo<ArrowUpRight size={18} /></a></> : <><h3>Email hỗ trợ chưa được công bố.</h3><p>Thông tin liên hệ đang chờ cửa hàng cập nhật. Bạn có thể xem câu hỏi thường gặp hoặc kiểm tra đơn hàng trong tài khoản.</p><Link className="button secondary" href="/chinh-sach?tab=faq">Xem câu hỏi thường gặp<ArrowUpRight size={18} /></Link></>}
    </div>
    <div className="care-contact-meta"><div><MapPin size={19} aria-hidden="true" /><h4>Địa chỉ cửa hàng</h4><p>Chưa được cửa hàng công bố.</p></div><div><Clock3 size={19} aria-hidden="true" /><h4>Giờ hỗ trợ</h4><p>Chưa được cửa hàng công bố.</p></div></div>
    <div className="care-note"><ShieldCheck size={20} aria-hidden="true" /><p>Khi liên hệ về đơn hàng, vui lòng cung cấp mã đơn và mô tả vấn đề. Không gửi mật khẩu, mã TOTP hoặc mã khôi phục.</p></div>
    <Link className="text-link" href="/tai-khoan"><UserRound size={17} />Tìm mã đơn trong tài khoản<ArrowUpRight size={17} /></Link>
    {(config?.paymentMode === "mock" || config?.shippingMode === "mock") && <p className="care-fine-print">Cửa hàng đang ở môi trường phát triển. Thông tin pháp nhân, địa chỉ kinh doanh, điện thoại và giờ hỗ trợ cần được quản trị cấu hình trước khi mở bán thật.</p>}
  </section>;
}

export function CustomerCare({ initialConfig }: { initialConfig?: any }) {
  const params = useSearchParams(), { data: config, loading, error, retry } = useResource("/config", initialConfig);
  const section = careSections.find(item => item.id === params.get("tab")) || careSections[0];
  const tab = section.id, email = publicEmail(config?.contactEmail);
  useEditorialFragment(tab === "doi-tra" ? ["size-guide", "return-process"] : [], !loading && !error);
  const title = useRef<HTMLHeadingElement>(null), previousTab = useRef(tab);
  useEffect(() => {
    if (previousTab.current === tab) return;
    previousTab.current = tab;
    const heading = title.current;
    if (!heading) return;
    heading.focus({ preventScroll: true });
    const bounds = heading.getBoundingClientRect();
    if (bounds.top < 130 || bounds.top > innerHeight * .75) heading.scrollIntoView({ block: "start", behavior: "instant" });
  }, [tab]);
  const amount = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? money(value) : "Xem khi thanh toán";
  return <div className="container care-page">
    <header className="care-page-heading"><div><p className="eyebrow">MILO CUSTOMER CARE / A LITTLE HELP, EVERYDAY</p><h1>Milo luôn <em>ở đây.</em></h1><p>Từ chiếc áo đầu tiên đến những lần mặc thật lâu.<br />Một chút hướng dẫn, để bạn an tâm chọn điều mình thích.</p></div><div className="care-heading-note"><span className="care-handwritten">With care,<br />Milo.</span><span className="eyebrow">THE EVERYDAY SERVICE EDITION</span></div></header>
    <div className="care-layout">
      <aside className="care-sidebar"><p className="eyebrow">CHÚNG MÌNH CÓ THỂ GIÚP GÌ?</p><nav className="care-nav policy-nav" aria-label="Chăm sóc khách hàng">{careSections.map((item, i) => { const Icon = menuIcons[i]; return <Link key={item.id} href={`/chinh-sach?tab=${item.id}`} scroll={false} aria-current={tab === item.id ? "page" : undefined}><Icon size={18} aria-hidden="true" /><span>{item.label}</span><ArrowUpRight size={14} aria-hidden="true" /></Link>; })}</nav><div className="care-sidebar-note"><MessageCircle size={22} aria-hidden="true" /><p>Một câu hỏi nhỏ,<br />một lời giải đáp riêng.</p><Link className="text-link" href="/chinh-sach?tab=lien-he">Nói chuyện với Milo<ArrowUpRight size={15} /></Link></div></aside>
      <article className="care-content" key={tab} data-care-tab={tab} aria-labelledby="care-content-title">
        <header className="care-content-heading"><span className="eyebrow">{section.kicker}</span><h2 id="care-content-title" ref={title} tabIndex={-1}>{section.label}</h2><p>{section.intro}</p></header>
        <figure className={`care-cover care-cover--${tab}`}><EditorialPhoto photo={section.photo} eager sizes="(max-width: 760px) 92vw, (max-width: 1100px) 65vw, 48vw" /><figcaption>{tab === "lien-he" ? "MILO MOOD / KHÔNG GIAN BOUTIQUE Ý TƯỞNG" : "THE MILO WAY / EVERY LITTLE DETAIL"}</figcaption></figure>
        {loading ? <div className="care-skeleton" role="status"><span className="sr-only">Đang tải thông tin cửa hàng…</span><span /><span /><span /></div> : error ? <ErrorBox message="Chưa tải được thông tin chính sách. Vui lòng thử lại để xem dữ liệu hiện hành." retry={retry} /> : <>
          {tab === "giao-hang" && <>
            {config?.shippingMode === "mock" && <p className="care-mode-note">Giao hàng mô phỏng · Môi trường phát triển</p>}
            <PolicyQuote name="shipping" text={config?.shippingPolicy} />
            {config?.shippingMode === "mock" && <div className="care-fees"><div><Truck size={20} aria-hidden="true" /><span>Phí giao hàng mô phỏng</span><strong>{amount(config?.flatShipping)}</strong></div><div><PackageCheck size={20} aria-hidden="true" /><span>Miễn phí từ · sau giảm giá</span><strong>{amount(config?.freeShippingMin)}</strong></div></div>}
            <p className="care-fine-print">Phí thực tế và các điều kiện áp dụng được hiển thị trước khi xác nhận thanh toán. Xem chính sách hiện hành ở trên.</p>
            <Steps title="Từ lựa chọn đến đơn hàng." steps={[{ title: "Chọn món đồ của bạn", text: "Chọn màu, size và số lượng trước khi thêm vào giỏ." }, { title: "Kiểm tra & xác nhận", text: "Đăng nhập, xác minh email, nhập địa chỉ và kiểm tra các khoản thanh toán." }, { title: "Theo dõi đơn hàng", text: "Xem thông tin và trạng thái đơn trong tài khoản; liên hệ cửa hàng kèm mã đơn khi cần." }]} />
            <PolicyDetails rows={policyDetails.shipping} />
          </>}
          {tab === "doi-tra" && <>
            <PolicyQuote name="returns" text={config?.returnPolicy} />
            <SizeGuide />
            <Steps id="return-process" title="Khi bạn cần đổi trả." steps={[{ title: "Gửi yêu cầu từ đơn đã giao", text: "Chọn dòng hàng, số lượng và lý do trên trang chi tiết đơn." }, { title: "Chờ cửa hàng kiểm tra", text: "Tồn kho, chênh lệch giá và phí được xác nhận trước khi xử lý đổi size." }, { title: "Theo dõi kết quả xử lý", text: "Hoàn tiền được phê duyệt riêng và chỉ hoàn tất khi có chứng từ chi trả." }]} />
            <PolicyDetails rows={policyDetails.returns} />
          </>}
          {tab === "bao-mat" && <>
            <PolicyQuote name="privacy" text={config?.privacyPolicy} />
            <div className="care-privacy-points">{[{ icon: MapPin, title: "Vị trí là tùy chọn", text: "Chỉ lấy khi bạn chủ động cấp quyền." }, { icon: ShieldCheck, title: "Lựa chọn của bạn", text: "Marketing cần sự đồng ý riêng." }, { icon: LockKeyhole, title: "Quản lý phiên đăng nhập", text: "Xem và thu hồi trong tài khoản." }].map(item => <div key={item.title}><item.icon size={21} aria-hidden="true" /><h3>{item.title}</h3><p>{item.text}</p></div>)}</div>
            <PolicyDetails rows={policyDetails.privacy} />
            <Link className="button secondary" href="/tai-khoan">Quản lý tài khoản của bạn<ArrowUpRight size={18} /></Link>
          </>}
          {tab === "faq" && <Faq config={config} />}
          {tab === "lien-he" && <Contact config={config} />}
        </>}
        <p className="care-image-note">Ảnh editorial & không gian boutique là ảnh ý tưởng được tạo bằng AI.</p>
      </article>
      <aside className="care-visuals" aria-label="Góc đọc cùng Milo" data-care-visual-tab={tab} key={`visual-${tab}`}>
        <div className="care-visuals-title"><span className="eyebrow">THE MILO COMPANION</span><span>Notes & little guides</span></div>
        {careVisuals[tab].map(item => <Link className={`care-visual-card ${item.tall ? "care-visual-card--tall" : ""}`} href={item.href} key={item.photo}>
          <EditorialPhoto photo={item.photo} sizes="(max-width: 560px) 92vw, (max-width: 1100px) 40vw, 25vw" />
          <div><p className="eyebrow">{item.kicker}</p><h3>{item.title}</h3><p>{item.text}</p><span className="text-link">{item.cta}<ArrowUpRight size={17} /></span></div>
        </Link>)}
        <div className="care-help-card"><MessageCircle size={24} aria-hidden="true" /><p className="eyebrow">A NOTE AWAY</p><h3>Milo nghe bạn.</h3><p>{email ? "Gửi một lời nhắn qua email của cửa hàng." : "Tìm thông tin và các kênh hỗ trợ đang được công bố."}</p><Link className="text-link" href="/chinh-sach?tab=lien-he">Kênh liên hệ<ArrowUpRight size={17} /></Link></div>
      </aside>
    </div>
  </div>;
}
