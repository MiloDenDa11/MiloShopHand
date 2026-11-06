import { Home } from "../components/store";
import { serverApi } from "../lib/server-api";
export default async function Page() {
  const [products, bestsellers, taxonomy] = await Promise.all([
    serverApi("/products?sort=newest&limit=4"),
    serverApi("/products?sort=bestseller&limit=4"),
    serverApi("/catalog"),
  ]);
  return <Home initialProducts={products} initialBestsellers={bestsellers} initialTaxonomy={taxonomy} />;
}
