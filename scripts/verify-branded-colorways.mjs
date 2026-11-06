import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { CORE_GARMENT_COLORS, garmentPalette } from "../packages/shared/src/garment-palette.mjs";

const root = path.resolve("apps/web/public"), db = new PrismaClient();
const file = (url) => {
  const target = path.resolve(root, `.${new URL(url, "http://local").pathname}`);
  assert(target.startsWith(root + path.sep)); assert(fs.statSync(target).isFile(), url); return target;
};
const hash = value => createHash("sha256").update(value).digest("hex");
try {
  const manifest = JSON.parse(fs.readFileSync("apps/web/content/branded-colorways.json", "utf8"));
  const products = await db.product.findMany({ include: { variants: true, images: true } });
  const sourceLogo = hash(fs.readFileSync(file("/brand/floral-miloshophand-white-v2.png")));
  let posters = 0, colorways = 0, minContrast = Infinity, bytes = 0;
  for (const spec of manifest) {
    const product = products.find(p => p.slug === spec.slug);
    assert(product, `Missing product ${spec.slug}`);
    assert.equal(product.design.brandVersion, "floral-v2");
    assert.equal(product.design.modelUrl, spec.modelUrl);
    if (spec.meshVersion) assert.equal(product.design.meshVersion, spec.meshVersion);
    for (const core of CORE_GARMENT_COLORS) for (const size of ["S", "M", "L", "XL"]) assert(product.variants.some(v => v.color === core.name && v.size === size), `${spec.slug} missing ${core.name}/${size}`);
    const glb = fs.readFileSync(file(spec.modelUrl)); bytes += glb.length;
    assert.equal(glb.readUInt32LE(0), 0x46546c67); assert.equal(glb.readUInt32LE(8), glb.length);
    const jsonLength = glb.readUInt32LE(12), gltf = JSON.parse(glb.subarray(20, 20 + jsonLength).toString());
    if (spec.meshVersion) assert.equal(gltf.scenes[0].extras.meshVersion, spec.meshVersion);
    assert(gltf.meshes.length > 8);
    if (spec.kind === "hoodie" && spec.meshVersion === "rounded-shell-v3") {
      const lining = gltf.meshes.find(m=>m.name === "Hood interior lining");
      assert(lining?.primitives[0].attributes.COLOR_0 !== undefined, `Missing hood lining/shading ${spec.slug}`);
      assert(gltf.meshes.some(m=>m.name === "Rolled hood opening"));
      assert(!gltf.meshes.some(m=>m.name === "Three-dimensional open hood"));
    }
    for (const name of ["BrandML", "BrandBack"]) assert(gltf.materials.find(m => m.name === name)?.pbrMetallicRoughness.baseColorTexture);
    const view = gltf.bufferViews[gltf.images[1].bufferView], start = 28 + jsonLength + (view.byteOffset || 0);
    assert.equal(hash(glb.subarray(start, start + view.byteLength)), sourceLogo, `Wrong back logo ${spec.slug}`);
    for (const color of spec.colorways) {
      const palette = garmentPalette(color.hex, spec.accentHex);
      assert(palette.contrast >= 4.5); minContrast = Math.min(minContrast, palette.contrast);
      assert.equal(color.inkHex, palette.ink);
      assert.equal(product.design.modelsByColor[color.hex], spec.modelUrl);
      for (const side of ["front", "back"]) {
        const url = color[side + "Url"];
        const gallery = product.images.find(i => i.url === url && i.color === color.name && i.view === side);
        assert(gallery && gallery.alt.includes("MiloShopHand") || gallery && side === "front", `Wrong gallery ${spec.slug}/${color.name}/${side}`);
        const info = await sharp(file(url)).metadata();
        assert.equal(info.format, "webp"); assert.equal(info.width, 720); assert.equal(info.height, 960); posters++;
      }
      colorways++;
    }
    for (const variant of product.variants) assert(spec.colorways.some(c => c.name === variant.color && c.hex === variant.colorHex), `Unmapped colour ${variant.sku}`);
  }
  let preserved;
  if (process.argv.includes("--check-original")) {
    const snapshotIndex = process.argv.indexOf("--snapshot");
    const before = JSON.parse(fs.readFileSync(snapshotIndex >= 0 ? process.argv[snapshotIndex + 1] : ".local/brand-v2/before.private.json", "utf8"));
    const variants = new Map((await db.productVariant.findMany()).map(v => [v.id, v]));
    const stock = new Map((await db.inventory.findMany()).map(v => [v.id, v]));
    for (const p of before.products) {
      const current = products.find(v => v.id === p.id);
      assert(current && current.slug === p.slug && current.price === p.price && current.name === p.name, `Original product changed ${p.slug}`);
    }
    for (const v of before.variants) assert.deepEqual(variants.get(v.id), v, `Original SKU changed ${v.sku}`);
    for (const v of before.stock) for (const key of ["variantId", "warehouse", "onHand", "reserved", "lowThreshold"]) assert.equal(stock.get(v.id)?.[key], v[key], `Original inventory changed ${v.id}/${key}`);
    for (const order of before.orders) assert.deepEqual(JSON.parse(JSON.stringify(await db.order.findUnique({where:{id:order.id}}))), order);
    for (const user of before.users) assert.equal((await db.user.findUnique({where:{id:user.id}}))?.email, user.email);
    preserved = { products: before.products.length, variants: before.variants.length, inventory: before.stock.length, orders: before.orders.length, users: before.users.length };
  }
  const report = { at: new Date().toISOString(), products: manifest.length, colorways, posters, models: manifest.length, modelMiB: +(bytes/1024/1024).toFixed(2), minLogoContrast: +minContrast.toFixed(2), originalDataPreserved: preserved, result: "PASS" };
  fs.mkdirSync(".local/brand-v2", {recursive:true}); fs.writeFileSync(".local/brand-v2/verification.json", JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { await db.$disconnect(); }
