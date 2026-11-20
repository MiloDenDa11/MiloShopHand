// Read-only coverage audit. Never treats a pending directory or flat photo as 360°.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname, sep } from "node:path";
import { photoSpinFor } from "../apps/web/lib/photo-spin";
import { displaySpinFor } from "../apps/web/lib/display-spin";

async function main() {
  const db = new PrismaClient();
  const publicRoot = resolve("apps/web/public");
  function localFile(url: unknown) {
    if (typeof url !== "string" || !url.startsWith("/") || url.startsWith("//")) return false;
    const file = resolve(publicRoot, `.${new URL(url, "https://milo.local").pathname}`);
    return file.startsWith(publicRoot + sep) && existsSync(file);
  }
  try {
    const products = await db.product.findMany({ include: { variants: true }, orderBy: { slug: "asc" } });
    const rows = products.filter((p) => p.active).map((product) => {
      const design = product.design as any;
      const colors = [...new Map(product.variants.filter((v) => v.active).map((v) => [v.colorHex.toLowerCase(), v])).values()];
      return {
        slug: product.slug, name: product.name, kind: design?.kind,
        colors: colors.map((variant) => {
          const spin = photoSpinFor(product, variant.colorHex);
          const photosReady = !!spin && spin.atlases.every((atlas) => localFile(atlas.src));
          const display = displaySpinFor(product, variant.colorHex);
          const rotationReady = !!display && display.atlases.every((atlas) => localFile(atlas.src));
          const candidate = design?.modelsByColor?.[variant.colorHex.toLowerCase()] || design?.modelUrl;
          const modelUrl = typeof candidate === "string" ? candidate : candidate?.url;
          return { name: variant.color, hex: variant.colorHex, photosReady, rotationReady, modelAvailable: localFile(modelUrl), modelUrl: modelUrl || null };
        }),
      };
    });
    const report = {
      generatedAt: new Date().toISOString(),
      products: rows.length,
      colorGroups: rows.reduce((n, p) => n + p.colors.length, 0),
      photoReadyColorGroups: rows.reduce((n, p) => n + p.colors.filter((c) => c.photosReady).length, 0),
      productsWithAnyPhotoSpin: rows.filter((p) => p.colors.some((c) => c.photosReady)).length,
      productsWithEveryColorPhotoSpin: rows.filter((p) => p.colors.length && p.colors.every((c) => c.photosReady)).length,
      rotationReadyColorGroups: rows.reduce((n,p)=>n+p.colors.filter(c=>c.rotationReady).length,0),
      productsWithEveryColorRotation: rows.filter(p=>p.colors.length&&p.colors.every(c=>c.rotationReady)).length,
      productsWithNoPhotoSpin: rows.filter((p) => !p.colors.some((c) => c.photosReady)).map((p) => p.slug),
      rows,
    };
    const output = resolve(".local/spin-completion/rotation-coverage.json");
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
    const { rows: details, ...summary } = report;
    console.log(JSON.stringify(summary, null, 2));
    console.log(`Read-only report: ${output}`);
    if (process.argv.includes("--require-all") && report.rotationReadyColorGroups !== report.colorGroups) process.exitCode = 1;
    if (process.argv.includes("--require-native") && report.photoReadyColorGroups !== report.colorGroups) process.exitCode = 1;
  } finally { await db.$disconnect(); }
}
main().catch((e) => { console.error(e.message); process.exitCode = 1; });
