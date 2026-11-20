import { ProductDetail } from "../../../components/store";
import { serverApi } from "../../../lib/server-api";
import { miloDesignText } from "../../../lib/milo-design";
import { headers } from "next/headers";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  try {
    const p = await serverApi(`/products/${encodeURIComponent(slug)}`);
    return {
      title: p?.name || "Sản phẩm",
      description: miloDesignText(p?.description),
      alternates: { canonical: `/san-pham/${slug}` },
    };
  } catch {
    return { title: "Sản phẩm" };
  }
}
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ color?: string | string[]; size?: string | string[] }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const product = await serverApi(`/products/${encodeURIComponent(slug)}`);
  return <ProductDetail key={slug} slug={slug} initialData={product} nonce={(await headers()).get('x-nonce') || undefined} initialColor={typeof query.color === "string" ? query.color : ""} initialSize={typeof query.size === "string" ? query.size : ""} />;
}
