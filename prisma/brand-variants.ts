import { PrismaClient } from "@prisma/client";
import { existsSync, readFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import { isDeepStrictEqual } from "node:util";

type Colorway = { name: string; hex: string; key?: string; frontUrl: string; backUrl: string; inkHex: string; contrast: number };
type BrandedDesign = { slug: string; name: string; kind: string; modelUrl: string; meshVersion?: string; geometry: object; accentHex: string; brandVersion: string; colorways: Colorway[] };
const project = resolve(__dirname, "..");

export async function applyBrandedColorways(db: PrismaClient) {
  if (process.env.NODE_ENV === "production") throw new Error("Development garment colourway seeding is disabled in production.");
  const manifest = resolve(project, "apps/web/content/branded-colorways.json");
  if (!existsSync(manifest)) return;
  const designs: BrandedDesign[] = JSON.parse(readFileSync(manifest, "utf8"));
  // Validate every asset before the first mutation.
  for (const design of designs) for (const url of [design.modelUrl, ...design.colorways.flatMap(c => [c.frontUrl, c.backUrl])]) {
    const target = resolve(project, "apps/web/public", url.replace(/^\//, ""));
    if (!target.startsWith(resolve(project, "apps/web/public") + sep) || !existsSync(target)) throw new Error(`Missing branded asset: ${url}`);
  }
  let added = 0, updated = 0;
  const products = await db.product.findMany({ where: { slug: { in: designs.map(d => d.slug) } }, include: { variants: true, images: true } });
  for (const design of designs) {
    const product = products.find(p => p.slug === design.slug);
    if (!product) continue;
    const current = product.design as any;
    if (current && current.managedBy !== "milo-collection-v1") continue;
    // Image-based presentation is selected explicitly by the shop owner.
    if (current?.mediaPresentation === "photo") continue;
    const metadata = { ...current, version: 2, managedBy: "milo-collection-v1", brandVersion: design.brandVersion, ...(design.meshVersion ? {meshVersion:design.meshVersion} : {}), renderedMedia: true,
      kind: design.kind, geometry: design.geometry, accentHex: design.accentHex, modelUrl: design.modelUrl,
      modelsByColor: Object.fromEntries(design.colorways.map(c => [c.hex, design.modelUrl])),
      colorways: design.colorways, frontUrl: design.colorways[0].frontUrl, backUrl: design.colorways[0].backUrl };
    const gallery = design.colorways.flatMap((color, index) => ["front", "back"].map((view, offset) => ({
      url: view === "front" ? color.frontUrl : color.backUrl, color: color.name, view, crop: null, position: -20 + index * 2 + offset,
      alt: `${design.name} — ${color.name}, ${view === "front" ? "mặt trước, logo ML" : "mặt sau, logo hoa MiloShopHand"} — mô phỏng thiết kế 3D${current?.source === "ai" ? " từ ý tưởng AI" : ""}`,
    })));
    const keep = gallery.map(i => i.url);
    const managedExtras = product.images.filter(i => ["/collection-ai/", "/collection-legacy/", "/collection-v2/"].some(prefix => i.url.startsWith(prefix)) && !keep.includes(i.url));
    const changedImages = gallery.filter(data => {
      const image = product.images.find(i => i.url === data.url);
      return !image || !Object.entries(data).every(([key, value]) => (image as any)[key] === value);
    });
    const missingVariants = design.colorways.filter(c => c.key).flatMap(c => ["S", "M", "L", "XL"].filter(size => !product.variants.some(v => v.color === c.name && v.size === size)));
    if (isDeepStrictEqual(current, metadata) && !managedExtras.length && !changedImages.length && !missingVariants.length) { updated++; continue; }
    await db.$transaction(async (tx) => {
      if (!isDeepStrictEqual(current, metadata)) await tx.product.update({ where: { id: product.id }, data: { design: metadata } });
      for (const [index, color] of design.colorways.entries()) {
        if (color.contrast < 4.5) throw new Error(`Low contrast: ${design.slug} / ${color.name}`);
        for (const size of ["S", "M", "L", "XL"]) {
          const existing = product.variants.find(v => v.color === color.name && v.size === size);
          if (!existing && color.key) {
            const sku = `${design.slug}-C-${color.key}-${size}`;
            await tx.productVariant.create({ data: { productId: product.id, sku, color: color.name, colorHex: color.hex, size,
              inventories: { create: { warehouse: "MAIN", onHand: 12, lowThreshold: 3,
                movements: { create: { delta: 12, reason: "Tồn mẫu phát triển cho màu bổ sung", reference: `brand-v2-initial:${sku}` } } } } } });
            added++;
          }
        }
      }
      for (const data of changedImages) {
        const existing = product.images.find(i => i.url === data.url);
        if (existing) await tx.productImage.update({ where: { id: existing.id }, data });
        else await tx.productImage.create({ data: { productId: product.id, ...data } });
      }
      // Replace generated galleries only; retain merchant uploads.
      if (managedExtras.length) await tx.productImage.deleteMany({ where: { id: {in: managedExtras.map(i => i.id)} } });
    });
    updated++;
  }
  console.log(`Floral branding: ${updated} products updated, ${added} new size/colour SKUs. Existing stock, prices and IDs retained.`);
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/prisma/brand-variants.ts")) {
  const db = new PrismaClient();
  applyBrandedColorways(db).catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.$disconnect());
}
