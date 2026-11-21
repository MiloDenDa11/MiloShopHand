import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import "./fashion.css";
import "./design-system.css";
import "./vintage-editorial.css";
import "./inventory.css";
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
  // Bump the version when replacing these files to invalidate browser icon caches.
  icons: {
    icon: [
      { url: "/favicon.ico?v=milo-cart-1", type: "image/x-icon", sizes: "32x32" },
      { url: "/favicon-512.png?v=milo-cart-1", type: "image/png", sizes: "512x512" },
      { url: "/favicon.svg?v=milo-cart-1", type: "image/svg+xml", sizes: "any" },
    ],
    shortcut: "/favicon.ico?v=milo-cart-1",
    apple: { url: "/favicon-512.png?v=milo-cart-1", type: "image/png", sizes: "512x512" },
  },
  robots: { index: true, follow: true },
};
export default async function Layout({ children }: { children: React.ReactNode }) {
  // Every HTML response must render with the nonce supplied by Proxy.
  await headers();
  return (
    <html lang="vi" data-scroll-behavior="smooth" className={`${bodyFont.variable} ${displayFont.variable}`}>
      {/* Extensions can add body attributes before hydration. Scope this
          exception to body so descendant mismatches remain detectable. */}
      <body suppressHydrationWarning>
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
