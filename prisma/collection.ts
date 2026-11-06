import "dotenv/config";
import { PrismaClient, Prisma } from "@prisma/client";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fold } from "../packages/shared/src";
import { createHash } from "node:crypto";
import { applyBrandedColorways } from "./brand-variants";
import { applyPhotoPresentation } from "./photo-presentation";

const project = resolve(__dirname, "..");
const publicFile = (url: string) => resolve(project, "apps/web/public", url.replace(/^\//, "").split("?")[0]);
const read = (file: string) => JSON.parse(readFileSync(resolve(project, file), "utf8"));
const categories: Record<string, string> = { tee: "ao-phong", jacket: "ao-khoac", bomber: "ao-bomber", hoodie: "ao-hoodie" };
const prices: Record<string, number> = { tee: 289000, jacket: 649000, bomber: 799000, hoodie: 549000 };

async function image(db: Prisma.TransactionClient, productId: string, value: { url: string; alt: string; color?: string; position: number; view: string; crop?: string }) {
  const previous = await db.productImage.findFirst({ where: { productId, OR: [{ url: value.url }, { position: value.position, view: value.view, color: value.color, url: { startsWith: value.url.startsWith("/collection-ai/") ? "/collection-ai/" : "/collection-legacy/" } }] } });
  if (!previous) await db.productImage.create({ data: { productId, ...value } });
  // Existing images retain their IDs. Only these managed assets are updated.
  else await db.productImage.update({ where: { id: previous.id }, data: value });
}

export async function seedCollection(db: PrismaClient, { readyOnly = false, legacyOnly = false } = {}) {
  if (process.env.NODE_ENV === "production") throw new Error("Collection mockups and initial demonstration stock are development-only.");
  const designs: any[] = read("apps/web/content/collection-designs.json");
  const legacyPath = "apps/web/content/legacy-designs.json";
  const legacy: any[] = existsSync(resolve(project, legacyPath)) ? read(legacyPath) : [];
  const ready = designs.filter((design) => existsSync(publicFile(design.image)) && existsSync(publicFile(`/collection-3d/${design.slug}.glb`)));
  if (!legacyOnly && !readyOnly && ready.length !== 60) throw new Error(`Collection incomplete: ${ready.length}/60 designs have both AI imagery and GLB. No collection changes applied.`);
  const missingLegacy = legacy.flatMap((item) => item.images.filter((entry: any) => !existsSync(publicFile(entry.url))).map((entry: any) => entry.url));
  if (missingLegacy.length) throw new Error(`Legacy front/back images must be rendered first (${missingLegacy.length} missing).`);
  const collection = await db.collection.upsert({ where: { slug: "ml-atelier-ai-2026" }, update: {}, create: { slug: "ml-atelier-ai-2026", name: "ML Atelier — thiết kế AI", season: "Quanh năm", climate: "Hằng ngày", campaign: "ML interwoven / MiloShopHand" } });
  let created = 0, upgraded = 0;
  if (!legacyOnly) for (const design of ready) {
    const category = await db.category.findUniqueOrThrow({ where: { slug: categories[design.kind] } });
    const style = await db.styleTag.findUnique({ where: { slug: "streetwear" } });
    const existing = await db.product.findUnique({ where: { slug: design.slug } });
    // Branded products already retain the original AI reference and base SKUs.
    // Do not downgrade their media on every seed; the v2 helper below repairs
    // or upgrades only records that actually differ.
    if ((existing?.design as any)?.brandVersion === "floral-v2") continue;
    const metadata = { version: 1, managedBy: "milo-collection-v1", source: "ai", kind: design.kind, colorHex: design.colorHex, accentHex: design.accentHex, geometry: design.geometry, modelUrl: `/collection-3d/${design.slug}.glb`, aiPlateUrl: design.image, frontUrl: `${design.image}?view=front`, backUrl: `${design.image}?view=back` };
    await db.$transaction(async (tx) => {
      const product = existing || await tx.product.create({ data: {
        slug: design.slug, name: design.name, description: design.description,
        searchText: fold([design.name, category.name, design.material, design.fit, "ML MiloShopHand thiết kế AI"].join(" ")),
        material: design.material, fit: design.fit, care: "Giặt nhẹ dưới 30°C. Lộn trái khi giặt. Không tẩy hoặc sấy nhiệt cao; tránh là trực tiếp lên logo.",
        price: prices[design.kind] + (Number(design.id.slice(-2)) % 3) * 10000, cost: Math.floor(prices[design.kind] * .45),
        featured: design.id.endsWith("-01"), categoryId: category.id, design: metadata,
        collections: { connect: { id: collection.id } }, ...(style ? { styles: { connect: { id: style.id } } } : {}),
      } });
      const current = product.design as any;
      if (!current || current.managedBy === "milo-collection-v1") await tx.product.update({ where: { id: product.id }, data: { design: metadata } });
      for (const [position, view] of ["front", "back"].entries()) await image(tx, product.id, { url: `${design.image}?view=${view}`, alt: `${design.name} — ${view === "front" ? "mặt trước, logo ML đan xen" : "mặt sau, chữ MiloShopHand"} — mockup AI`, position: position - 20, view, crop: view === "front" ? "left" : "right" });
      // No updates on existing SKUs: quantities, reservations, prices and IDs survive reruns.
      for (const size of ["S", "M", "L", "XL"]) {
        const sku = `${design.id}-${size}`;
        await tx.productVariant.upsert({ where: { sku }, update: {}, create: { productId: product.id, sku, color: "Màu thiết kế", colorHex: design.colorHex, size,
          inventories: { create: { warehouse: "MAIN", onHand: 12, lowThreshold: 3, movements: { create: { delta: 12, reason: "Tồn mẫu phát triển cho thiết kế AI", reference: `ai-initial:${sku}` } } } },
        } });
      }
    });
    if (!existing) created++;
  }
  for (const item of legacy) {
    const product = await db.product.findUnique({ where: { slug: item.slug } });
    if (!product) continue;
    const current = product.design as any;
    if (current && current.managedBy !== "milo-collection-v1") continue;
    if (current?.brandVersion === "floral-v2") { upgraded++; continue; }
    await db.$transaction(async (tx) => {
      await tx.product.update({ where: { id: product.id }, data: { design: { source: "3d", version: 1, managedBy: "milo-collection-v1", kind: item.kind, modelUrl: item.modelUrl, modelsByColor: item.modelsByColor } } });
      for (const [position, entry] of item.images.entries()) {
        const version = createHash("sha256").update(readFileSync(publicFile(entry.url))).digest("hex").slice(0, 10);
        await image(tx, product.id, { url: `${entry.url}?v=${version}`, alt: entry.alt, color: entry.color, position: position - 20, view: entry.view });
      }
      // Replace only the known, generated seed illustrations. Merchant uploads remain.
      await tx.productImage.deleteMany({ where: { productId: product.id, url: { startsWith: "/products/", endsWith: ".svg" } } });
    });
    upgraded++;
  }
  await applyBrandedColorways(db);
  await applyPhotoPresentation(db);
  console.log(`Collection ready: ${legacyOnly ? 0 : ready.length}/60 AI designs (${created} newly created), ${upgraded} existing products processed. Original photo presentation applied; approved 24-view spins only. Existing stock/identities retained.`);
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/prisma/collection.ts")) {
  const db = new PrismaClient();
  seedCollection(db, { readyOnly: process.argv.includes("--ready-only"), legacyOnly: process.argv.includes("--legacy-only") })
    .catch((error) => { console.error(error.message); process.exitCode = 1; })
    .finally(() => db.$disconnect());
}
