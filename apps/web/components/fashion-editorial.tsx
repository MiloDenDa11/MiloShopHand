"use client";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useResource } from "../hooks/use-resource";
import { ErrorBox, useShop } from "./client";
import { ProductPhoto, isRealPhoto } from "./product-media";
import { journalArticles } from "../content/brand";
import { miloDesignText } from "../lib/milo-design";
export function FashionCollections() {
  const { data, error, loading, retry } = useResource("/catalog");
  return (
    <div className="container section">
      <header className="edition-page-heading">
        <p className="eyebrow">THE MILO EDITIONS / CURATED FOR EVERYDAY</p>
        <h1 className="editorial-title">
          Mùa nào.
          <br />
          <em>Chất riêng ấy.</em>
        </h1>
        <p>
          Chọn một bộ sưu tập theo thời tiết, theo nhịp sống, hay đơn giản là
          cảm xúc của ngày hôm nay.
        </p>
      </header>
      {error && <ErrorBox message={error} retry={retry} />}
      <div className="collection-directory">
        {loading ? (
          <p role="status">Đang mở những trang bộ sưu tập…</p>
        ) : (
          data?.collections.map((c: any, i: number) => (
            <article key={c.id}>
              <p className="eyebrow">
                0{i + 1} / {c.season} / {c.climate}
              </p>
              {isRealPhoto(c.image) && (
                <Link href={`/san-pham?collection=${c.slug}`}>
                  <ProductPhoto src={c.image} alt={`Bộ sưu tập ${c.name}`} />
                </Link>
              )}
              <h2>
                <Link href={`/san-pham?collection=${c.slug}`}>{miloDesignText(c.name)}</Link>
              </h2>
              <p>
                {c.campaign ||
                  "Những thiết kế được Milo chọn để phối cùng bạn mỗi ngày."}
              </p>
              <Link
                className="text-link"
                href={`/san-pham?collection=${c.slug}`}
              >
                Mở bộ sưu tập
                <ArrowUpRight size={19} />
              </Link>
            </article>
          ))
        )}
      </div>
      <div className="collection-editor-note">
        <p className="eyebrow">A NOTE FROM MILO</p>
        <p>
          Không phải mùa nào cũng giống nhau. Bộ sưu tập được sắp xếp theo khí
          hậu để bạn chọn những lớp áo phù hợp với nơi mình đang sống.
        </p>
      </div>
    </div>
  );
}
export function FashionJournal() {
  const { config } = useShop();
  return (
    <div className="container section">
      <header className="edition-page-heading">
        <p className="eyebrow">MILO JOURNAL / STYLE, STORIES & EVERYDAY LIFE</p>
        <h1 className="editorial-title">
          Chuyện bên ngoài
          <br />
          <em>tủ đồ.</em>
        </h1>
        <p>
          Một góc nhỏ dành cho cách phối đồ, những món đồ yêu thích và câu
          chuyện về sự thoải mái khi là chính mình.
        </p>
      </header>
      <section className="journal-story" id="brand-story">
        <h2>
          Ít khuôn mẫu.
          <br />
          <em>Nhiều chất riêng.</em>
        </h2>
        <div>
          <p>
            {config?.brand || "MILOSHOPHAND"} mang tinh thần của một tủ đồ độc
            lập: có chút hoài niệm, có cá tính đường phố và luôn gần với cuộc
            sống thường ngày.
          </p>
          <p>
            Chúng mình thích những món đồ không đòi hỏi bạn phải trở thành một
            người khác. Một chiếc áo phom rộng, một bảng màu trung tính, một lớp
            khoác quen thuộc — phần còn lại là cách bạn mặc, và câu chuyện bạn
            mang theo.
          </p>
          <Link className="text-link" href="/san-pham">
            Viết tiếp câu chuyện bằng tủ đồ của bạn
            <ArrowUpRight size={18} />
          </Link>
        </div>
      </section>
      <div className="journal-reading-list">
        {journalArticles.map((a, i) => (
          <article className="journal-reading-article" id={a.id} key={a.id}>
            <span className="journal-reading-index">0{i + 1}</span>
            <div>
              <p className="eyebrow">{a.category}</p>
              <h2>{a.title}</h2>
              <p>{a.text}</p>
              <div className="journal-reading-footer">
                <span>{a.readTime}</span>
                <Link className="text-link" href={a.href}>
                  {a.cta}
                  <ArrowUpRight size={17} />
                </Link>
              </div>
            </div>
          </article>
        ))}
      </div>
      <div className="journal-story-end">
        <span className="eyebrow">THE LAST WORD</span>
        <p>
          Đồ có thể giống nhau.
          <br />
          <em>Cách bạn mặc thì không.</em>
        </p>
        <Link className="button secondary" href="/bo-suu-tap">
          TÌM MỘT BỘ SƯU TẬP
          <ArrowUpRight size={18} />
        </Link>
      </div>
    </div>
  );
}
