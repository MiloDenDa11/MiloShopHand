import { Suspense } from "react";
import { Catalog } from "../../components/store";
import { serverApi } from "../../lib/server-api";
import Loading from "../loading";
export const metadata = {
  title: "Cửa hàng",
  alternates: { canonical: "/san-pham" },
};
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) value.forEach(item => query.append(key, item));
    else if (value !== undefined) query.set(key, value);
  }
  const [products, taxonomy] = await Promise.all([
    serverApi(`/products?${query}`), serverApi("/catalog"),
  ]);
  return (
    <Suspense fallback={<Loading />}>
      <Catalog key={query.toString()} initialProducts={products} initialTaxonomy={taxonomy} />
    </Suspense>
  );
}
