import type { MetadataRoute } from "next";
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin",
        '/nguoi-ban',
        "/api/",
        "/tai-khoan",
        "/don-hang", "/don-khach", "/ho-tro",
        "/thanh-toan",
        "/gio-hang",
        "/dung-thu",
      ],
    },
    sitemap: `${process.env.APP_URL || "http://localhost:3000"}/sitemap.xml`,
  };
}
