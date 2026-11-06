import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { createGarment, packGlb } from "./garment-model.mjs";

// Upgrade existing sample garments without changing their IDs, colours or stock.
const db = new PrismaClient();
const output = path.resolve("apps/web/public/collection-3d/legacy");
fs.mkdirSync(output, { recursive: true });
try {
  const products = await db.product.findMany({
    where: { OR: [{ images: { some: { url: { startsWith: "/products/" } } } }, { design: { path: ["source"], equals: "3d" } }] },
    include: { category: true, variants: true },
    orderBy: { slug: "asc" },
  });
  const artwork = await Promise.all(["ml-monogram.svg", "miloshophand-signature.svg"].map((file) => sharp(fs.readFileSync(path.resolve("apps/web/public/brand", file))).png().toBuffer()));
  const report = [];
  for (const product of products) {
    const kind = ({ "ao-phong": "tee", "ao-khoac": "jacket", "ao-bomber": "bomber", "ao-hoodie": "hoodie" })[product.category.slug];
    if (!kind) continue;
    const colors = [...new Map(product.variants.map((variant) => [variant.colorHex, variant])).values()];
    const modelsByColor = {};
    const images = [];
    for (const variant of colors) {
      const key = `${product.slug}-${variant.colorHex.replace("#", "")}`;
      const spec = { slug: key, name: product.name, kind, colorHex: variant.colorHex, accentHex: ["#242426", "#34465b", "#78846a"].includes(variant.colorHex) ? "#e8dfcd" : "#343b31", fit: product.fit,
        geometry: { collar: kind === "hoodie" ? "hood" : kind === "jacket" ? "stand" : kind === "bomber" ? "rib" : "crew", sleeve: kind === "tee" ? "short" : "long", pockets: kind === "hoodie" ? "kangaroo" : kind === "tee" ? "none" : "welt", zipper: ["jacket", "bomber"].includes(kind), panel: "none", stripe: false, hem: ["hoodie", "bomber"].includes(kind) ? "rib" : "straight" } };
      const group = createGarment(spec);
      const glb = packGlb(group, artwork);
      fs.writeFileSync(path.join(output, `${key}.glb`), glb);
      modelsByColor[variant.colorHex] = `/collection-3d/legacy/${key}.glb`;
      for (const view of ["front", "back"]) images.push({ url: `/collection-legacy/${key}-${view}.png`, modelUrl: modelsByColor[variant.colorHex], color: variant.color, colorHex: variant.colorHex, view, alt: `${product.name} — ${variant.color}, ${view === "front" ? "mặt trước" : "mặt sau"}, mô phỏng thiết kế 3D` });
      group.traverse((mesh) => { if (mesh.isMesh) { mesh.geometry.dispose(); mesh.material.dispose(); } });
    }
    report.push({ slug: product.slug, name: product.name, kind, modelsByColor, modelUrl: Object.values(modelsByColor)[0], images });
  }
  fs.writeFileSync(path.resolve("apps/web/content/legacy-designs.json"), JSON.stringify(report, null, 2));
  console.log(`Built ${report.reduce((sum, item) => sum + Object.keys(item.modelsByColor).length, 0)} colour-specific GLBs for ${report.length} existing products. Existing records unchanged.`);
} finally { await db.$disconnect(); }
