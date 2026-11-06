import type { Metadata } from "next";
import "./globals.css";
import "./fashion.css";
import "./milo-ui.css";
import { bodyFont, displayFont } from "../components/brand-font";
import { Providers, Header, Footer } from "../components/client";
const brand = process.env.NEXT_PUBLIC_BRAND_NAME || "MILOSHOPHAND";
export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL || "http://localhost:3000"),
  title: {
    default: `${brand} — Wear your own story`,
    template: `%s | ${brand}`,
  },
  description:
    "MILOSHOPHAND — thời trang local brand với tinh thần vintage, streetwear và everyday basic. Chọn áo phông, hoodie, áo khoác và bomber theo chất riêng của bạn.",
  robots: { index: true, follow: true },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" data-scroll-behavior="smooth" className={`${bodyFont.variable} ${displayFont.variable}`}>
      <body>
        <Providers>
          <a className="skip-link" href="#main">
            Đến nội dung chính
          </a>
          <Header />
          <main id="main">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
