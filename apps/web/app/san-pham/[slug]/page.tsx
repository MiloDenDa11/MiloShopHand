import { ProductDetail } from "../../../components/store";
import { serverApi } from "../../../lib/server-api";
import { miloDesignText } from "../../../lib/milo-design";
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
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = await serverApi(`/products/${encodeURIComponent(slug)}`);
  return <ProductDetail key={slug} slug={slug} initialData={product} />;
}
