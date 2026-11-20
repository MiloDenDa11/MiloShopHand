import { config } from "dotenv";
config({ path: "../../.env" });
export default {
  poweredByHeader: false,
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
        source: "/product-media/:path*",
        headers: [{key:"Cache-Control",value:"public, max-age=31536000, immutable"}],
      },
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self), payment=(), usb=(), browsing-topics=()' },
          ...(process.env.NODE_ENV === 'production' && process.env.APP_URL?.startsWith('https://') ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000' }] : []),
        ],
      },
    ];
  },
};
