import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";

const root = process.cwd();
const publicRoot = path.resolve("apps/web/public");
const fileFor = (url) => {
  const file = path.resolve(publicRoot, `.${new URL(url, "https://milo.local").pathname}`);
  if (!file.startsWith(publicRoot + path.sep)) throw new Error("Asset escaped public directory");
  if (!fs.statSync(file).isFile()) throw new Error(`Missing asset ${url}`);
  return file;
};
const assert = (condition, message) => { if (!condition) throw new Error(message); };
function validateGlb(url) {
  const buffer = fs.readFileSync(fileFor(url));
  assert(buffer.readUInt32LE(0) === 0x46546c67 && buffer.readUInt32LE(4) === 2, `Invalid GLB ${url}`);
  assert(buffer.readUInt32LE(8) === buffer.length, `Truncated GLB ${url}`);
  const length = buffer.readUInt32LE(12);
  const gltf = JSON.parse(buffer.subarray(20, 20 + length).toString());
  assert(gltf.asset.version === "2.0" && gltf.meshes.length > 8, `Missing garment geometry ${url}`);
  assert(gltf.images.length === 2 && gltf.images.every((image) => image.bufferView !== undefined && !image.uri), `Brand artwork must be embedded ${url}`);
  for (const name of ["BrandML", gltf.materials.some(m => m.name === "BrandBack") ? "BrandBack" : "BrandWord"]) {
    const material = gltf.materials.find((item) => item.name === name);
    assert(material?.alphaMode === "BLEND" && material.pbrMetallicRoughness.baseColorTexture, `Missing ${name} ${url}`);
  }
  for (const mesh of gltf.meshes) for (const primitive of mesh.primitives) {
    assert(primitive.attributes.POSITION !== undefined && primitive.attributes.NORMAL !== undefined, `Missing mesh attributes ${url}`);
    const accessor = gltf.accessors[primitive.attributes.POSITION];
    assert([...accessor.min, ...accessor.max].every(Number.isFinite), `Invalid coordinates ${url}`);
  }
  const positions = gltf.meshes.flatMap((mesh) => mesh.primitives.map((item) => gltf.accessors[item.attributes.POSITION]));
  const depth = Math.max(...positions.map((item) => item.max[2])) - Math.min(...positions.map((item) => item.min[2]));
  assert(depth > .25, `Garment must have real volume ${url}`);
  return buffer.length;
}
const db = new PrismaClient();
try {
  const specs = JSON.parse(fs.readFileSync("apps/web/content/collection-designs.json", "utf8"));
  assert(specs.length === 60, "Expected exactly 60 original AI design specifications");
  const hashes = new Set();
  const counts = {};
  let modelBytes = 0;
  for (const spec of specs) {
    const file = fileFor(spec.image);
    const hash = createHash("sha256").update(fs.readFileSync(file)).digest("hex");
    assert(!hashes.has(hash), `Duplicate AI image ${spec.slug}`); hashes.add(hash);
    const metadata = await sharp(file).metadata();
    assert(metadata.width >= 1000 && Math.abs(metadata.width / metadata.height - 2) < .03, `Invalid two-view plate ${spec.slug}`);
    assert(!/[�]|Thi\?t|ch\?t|Cotton \?/.test(spec.description + spec.material), `Invalid Vietnamese text ${spec.slug}`);
    counts[spec.kind] = (counts[spec.kind] || 0) + 1;
    modelBytes += validateGlb(`/collection-3d/${spec.slug}.glb`);
  }
  for (const kind of ["tee", "jacket", "bomber", "hoodie"]) assert(counts[kind] === 15, `Expected 15 ${kind} designs`);
  const products = await db.product.findMany({ where: { active: true }, include: { images: true, variants: true } });
  const ai = products.filter((item) => item.design?.source === "ai");
  assert(ai.length >= 60, "Database is missing AI collection products");
  const imageUrls = new Set(), modelUrls = new Set();
  for (const product of products) {
    assert(product.images.some((entry) => entry.view === "front") && product.images.some((entry) => entry.view === "back"), `Missing front/back gallery ${product.slug}`);
    assert(product.design?.modelUrl, `Missing 360 design ${product.slug}`);
    for (const image of product.images) { fileFor(image.url); imageUrls.add(image.url); }
    const urls = Object.values(product.design.modelsByColor || { default: product.design.modelUrl });
    for (const url of urls) if (!modelUrls.has(url)) { validateGlb(url); modelUrls.add(url); }
    if (product.design.source === "3d") for (const variant of product.variants) {
      assert(product.design.modelsByColor[variant.colorHex], `Missing selected-colour model ${variant.sku}`);
      assert(product.images.some((entry) => entry.color === variant.color && entry.view === "front"), `Missing selected-colour image ${variant.sku}`);
    }
    if (product.design.source === "ai" && !product.design.brandVersion) assert(product.variants.every((variant) => variant.colorHex === product.design.colorHex), `AI colour mismatch ${product.slug}`);
  }
  let preserved = null;
  const beforePath = path.resolve(".local/collection-upgrade/before.private.json");
  if (process.argv.includes("--check-original-data") && fs.existsSync(beforePath)) {
    const before = JSON.parse(fs.readFileSync(beforePath, "utf8"));
    const stocks = new Map((await db.inventory.findMany()).map((item) => [item.id, item]));
    const variants = new Map((await db.productVariant.findMany()).map((item) => [item.id, item]));
    for (const item of before.stock) {
      const current = stocks.get(item.id);
      assert(current && current.variantId === item.variantId && current.onHand === item.onHand && current.reserved === item.reserved, `Original stock changed ${item.id}`);
    }
    for (const item of before.variants) {
      const current = variants.get(item.id);
      assert(current && ["sku", "productId", "color", "size"].every((key) => current[key] === item[key]), `Original variant changed ${item.id}`);
    }
    for (const item of before.orders) {
      const current = await db.order.findUnique({ where: { id: item.id } });
      assert(current && current.total === item.total && current.method === item.method, `Original order changed ${item.id}`);
    }
    assert(await db.user.count() >= before.users, "Original users were lost");
    preserved = { stock: before.stock.length, variants: before.variants.length, orders: before.orders.length, usersAtLeast: before.users };
  }
  const report = { at: new Date().toISOString(), products: products.length, aiProducts: ai.length, uniqueAiImages: hashes.size, designCounts: counts, galleryEntries: imageUrls.size, uniqueGlbs: modelUrls.size, aiModelMiB: +(modelBytes / 1024 / 1024).toFixed(2), originalDataPreserved: preserved, result: "PASS" };
  fs.mkdirSync(path.resolve(".local/collection-upgrade"), { recursive: true });
  fs.writeFileSync(path.resolve(".local/collection-upgrade/verification.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { await db.$disconnect(); }
