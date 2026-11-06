import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { createGarment, packGlb } from "./garment-model.mjs";

const root = process.cwd();
const specs = JSON.parse(fs.readFileSync(path.join(root, "apps/web/content/collection-designs.json"), "utf8"));
const output = path.join(root, "apps/web/public/collection-3d");
fs.mkdirSync(output, { recursive: true });
const brand = path.join(root, "apps/web/public/brand");
fs.mkdirSync(brand, { recursive: true });
const monogram = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><g fill="none" stroke="#fff" stroke-width="26" stroke-linejoin="round" stroke-linecap="round"><path d="M103 375V132L232 323L348 132V375"/><path d="M276 101V377H417" stroke-width="30"/></g><path d="M257 256L279 288" fill="none" stroke="#000" stroke-opacity="0" stroke-width="34"/></svg>`;
const signature = `<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="384" viewBox="0 0 1536 384"><text x="768" y="246" text-anchor="middle" fill="#fff" font-family="Segoe Script, cursive" font-style="italic" font-size="182" letter-spacing="-8">MiloShopHand</text><path d="M200 285Q610 344 1320 271" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/></svg>`;
fs.writeFileSync(path.join(brand, "ml-monogram.svg"), monogram);
fs.writeFileSync(path.join(brand, "miloshophand-signature.svg"), signature);
const artwork = [await sharp(Buffer.from(monogram)).png().toBuffer(), await sharp(Buffer.from(signature)).png().toBuffer()];
const report = [];
for (const spec of specs) {
  const group = createGarment(spec);
  const glb = packGlb(group, artwork);
  fs.writeFileSync(path.join(output, `${spec.slug}.glb`), glb);
  let triangles = 0;
  group.traverse((mesh) => { if (mesh.isMesh) { triangles += mesh.geometry.index.count / 3; mesh.geometry.dispose(); mesh.material.dispose(); } });
  report.push({ slug: spec.slug, kind: spec.kind, url: `/collection-3d/${spec.slug}.glb`, bytes: glb.length, triangles, source: "native garment mesh from AI design specification" });
}
fs.writeFileSync(path.join(output, "manifest.json"), JSON.stringify(report, null, 2));
console.log(`Created ${report.length} true 3D GLB garments; ${(report.reduce((sum, item) => sum + item.bytes, 0) / 1024 / 1024).toFixed(1)} MiB total. Each loads only when its viewer opens.`);
