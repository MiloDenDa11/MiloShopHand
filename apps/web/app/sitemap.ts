import type { MetadataRoute } from "next";
export const dynamic = "force-dynamic";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.APP_URL || "http://localhost:3000";
  let items: any[] = [];
  try {
    for (let page = 1; page <= 100; page++) {
      const r = await fetch(
        `${process.env.API_INTERNAL_URL || "http://localhost:4000"}/api/v1/products?limit=48&page=${page}`,
        { cache: "no-store" },
      ).then((r) => r.json());
      items.push(...(r.items || []));
      if (page >= r.pages) break;
    }
  } catch {}
  return [
    ...["", "/san-pham", "/bo-suu-tap", "/phong-cach", "/chinh-sach"].map(
      (p) => ({ url: base + p, changeFrequency: "weekly" as const }),
    ),
    ...items.map((p) => ({
      url: `${base}/san-pham/${p.slug}`,
      lastModified: p.createdAt,
      changeFrequency: "weekly" as const,
    })),
  ];
}
