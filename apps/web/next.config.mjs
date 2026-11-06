import { config } from "dotenv";
config({ path: "../../.env" });
const storageOrigin = process.env.S3_PUBLIC_URL
  ? new URL(process.env.S3_PUBLIC_URL).origin
  : "";
export default {
  devIndicators: false,
  distDir: process.env.NEXT_BUILD_DIR || ".next",
  transpilePackages: ["@milo/shared"],
  images: {
    // Content hashes on managed assets invalidate resized image caches.
    // Omitting search permits that version query on these local paths.
    localPatterns: [
      { pathname: "/collection-ai/**" },
      { pathname: "/collection-legacy/**" },
      { pathname: "/collection-v2/**" },
      { pathname: "/collection-spin/**" },
      { pathname: "/uploads/**" },
      { pathname: "/products/**" },
      { pathname: "/hero-shirt.svg" },
    ],
  },
  env: {
    NEXT_PUBLIC_BRAND_NAME: process.env.BRAND_NAME || "MILOSHOPHAND",
    NEXT_PUBLIC_GOOGLE_MAPS_KEY: process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || "",
    NEXT_PUBLIC_GOOGLE_MAPS_ID: process.env.NEXT_PUBLIC_GOOGLE_MAPS_ID || "",
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.API_INTERNAL_URL || "http://localhost:4000"}/api/:path*`,
      },
      {
        source: "/uploads/:path*",
        destination: `${process.env.API_INTERNAL_URL || "http://localhost:4000"}/uploads/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; script-src 'self' 'unsafe-inline' https://maps.googleapis.com https://maps.gstatic.com" +
              (process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'") +
              `; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: ${storageOrigin} https://*.googleapis.com https://*.gstatic.com https://*.google.com; connect-src 'self' blob: https://*.googleapis.com https://*.gstatic.com; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`,
          },
        ],
      },
    ];
  },
};
