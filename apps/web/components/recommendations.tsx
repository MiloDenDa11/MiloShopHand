"use client";
import { useEffect, useState } from "react";
import { api, useShop, ProductCard } from "./client";
import { miloDesignText } from "../lib/milo-design";
export function Recommendations() {
  const { user } = useShop();
  const [data, setData] = useState<any>(null);
  useEffect(() => {
    if (!user) {
      setData(null);
      return;
    }
    let recent: any[] = [];
    try {
      recent = JSON.parse(localStorage.getItem("milo-recent") || "[]");
    } catch {}
    api(
      `/me/recommendations?recent=${encodeURIComponent(recent.map((i) => i.slug).join(","))}`,
    )
      .then(setData)
      .catch(() => {});
  }, [user?.id]);
  if (!data?.items?.length) return null;
  return (
    <section className="container section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">PICKED FOR YOUR EVERYDAY</p>
          <h2>Gợi ý cho chất riêng của bạn.</h2>
        </div>
      </div>
      <div className="product-grid">
        {data.items.map((p: any) => (
          <div key={p.id}>
            <ProductCard product={p} />
            <p className="small muted" style={{ fontSize: 11, marginTop: 12 }}>
              {miloDesignText(p.reason)}
            </p>
          </div>
        ))}
      </div>
      <details>
        <summary>Vì sao có những gợi ý này?</summary>
        <p>{data.rules} Bạn có thể đổi sở thích tự nguyện trong tài khoản.</p>
      </details>
    </section>
  );
}
