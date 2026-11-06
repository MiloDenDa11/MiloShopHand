"use client";
import { useState } from "react";
import { api, useShop } from "./client";
import { productImagesForColor } from "./product-media";
export function VariantSwitcher({ line }: { line: any }) {
  const { cart, changeCart, notify } = useShop();
  const [product, setProduct] = useState<any>(null),
    [busy, setBusy] = useState(false);
  return (
    <details
      className="variant-switcher"
      onToggle={async (e) => {
        if (!e.currentTarget.open || product || busy) return;
        setBusy(true);
        try {
          setProduct(await api(`/products/${line.slug}`));
        } catch (error: any) {
          notify(error.message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <summary>Đổi màu / size</summary>
      {busy ? (
        <p className="small">Đang kiểm tra tồn…</p>
      ) : (
        product && (
          <label>
            Biến thể mới
            <select
              value={line.variantId}
              onChange={async (e) => {
                const v = product.variants.find(
                  (v: any) => v.id === e.target.value,
                );
                if (!v?.available) return;
                const existing = cart.find((c: any) => c.variantId === v.id);
                const quantity = Math.min(
                  20,
                  v.available,
                  line.quantity + (existing?.quantity || 0),
                );
                const next = cart.filter(
                  (c: any) =>
                    c.variantId !== line.variantId && c.variantId !== v.id,
                );
                await changeCart([
                  ...next,
                  {
                    ...line,
                    variantId: v.id,
                    color: v.color,
                    size: v.size,
                    price: v.price,
                    quantity,
                    image: productImagesForColor(product,v.color)[0]?.url || "",
                  },
                ]);
                notify(
                  "Đã đổi biến thể và kiểm tra lại số lượng theo tồn kho.",
                );
              }}
            >
              {product.variants.map((v: any) => (
                <option key={v.id} value={v.id} disabled={!v.available}>
                  {v.color} / {v.size} —{" "}
                  {v.available ? "còn " + v.available : "hết hàng"}
                </option>
              ))}
            </select>
          </label>
        )
      )}
    </details>
  );
}
