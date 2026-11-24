import type { Metadata } from "next";
import { TryOnPage } from "../../../components/try-on";
import { serverApi } from "../../../lib/server-api";
import "../../try-on.css";

export const metadata: Metadata = {
  title: "Phòng thử đồ Milo",
  description: "Thử thiết kế và màu áo bạn đang xem, hoặc chuẩn bị ảnh sản phẩm và prompt để tự dùng trong ChatGPT.",
  robots: { index: false, follow: false },
};

export default async function Page({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ color?: string | string[]; size?: string | string[] }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const product = await serverApi(`/products/${encodeURIComponent(slug)}`);
  const color = typeof query.color === "string" ? query.color : "";
  const size = typeof query.size === "string" ? query.size : "";
  return <TryOnPage key={`${slug}:${color}:${size}`} slug={slug} initialData={product} initialColor={color} initialSize={size} />;
}
