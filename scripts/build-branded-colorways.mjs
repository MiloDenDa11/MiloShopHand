import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import sharp from "sharp";
import { chromium } from "@playwright/test";
import { createGarment, packGlb } from "./garment-model.mjs";
import { CORE_GARMENT_COLORS, GARMENT_BRAND_VERSION, applyGarmentPalette, garmentPalette } from "../packages/shared/src/garment-palette.mjs";

// Read-only database access. Gallery posters and the viewer share one real mesh
// and palette per design. Existing AI bitmap originals are retained untouched.
const publicRoot = path.resolve("apps/web/public");
const preview = process.argv.includes("--preview");
const logo = fs.readFileSync(path.join(publicRoot, "brand/floral-miloshophand-white-v2.png"));
const revision = createHash("sha256").update(logo).update(fs.readFileSync("scripts/garment-model.mjs")).update(fs.readFileSync("scripts/build-branded-colorways.mjs")).update(fs.readFileSync("packages/shared/src/garment-palette.mjs")).digest("hex").slice(0, 12);
const prefix = `/collection-v2/${revision}`;
const output = path.join(publicRoot, prefix);
fs.mkdirSync(path.join(output, "models"), { recursive: true });
fs.mkdirSync(path.join(output, "posters"), { recursive: true });
const artwork = [await sharp(path.join(publicRoot, "brand/ml-monogram.svg")).png().toBuffer(), logo];
const db = new PrismaClient();
const report = [];
try {
  const products = await db.product.findMany({ include: { category: true, variants: { orderBy: { id: "asc" } } }, orderBy: { slug: "asc" } });
  for (const product of products) {
    const kind = ({ "ao-phong": "tee", "ao-khoac": "jacket", "ao-bomber": "bomber", "ao-hoodie": "hoodie" })[product.category.slug];
    if (!kind) continue;
    const design = product.design || {};
    const colors = [...new Map(product.variants.map((v) => [v.color, { name: v.color, hex: v.colorHex }])).values()];
    for (const core of CORE_GARMENT_COLORS) {
      const existing = colors.find((v) => v.name === core.name);
      if (existing) existing.key = core.key;
      else colors.push({ name: core.name, hex: core.hex, key: core.key });
    }
    const spec = { slug: product.slug, name: product.name, kind, fit: product.fit, colorHex: colors[0].hex, accentHex: design.accentHex || "#e8dfcd", brandVersion: GARMENT_BRAND_VERSION,
      geometry: design.geometry || { collar: kind === "hoodie" ? "hood" : kind === "jacket" ? "stand" : kind === "bomber" ? "rib" : "crew", sleeve: kind === "tee" ? "short" : "long", pockets: kind === "hoodie" ? "kangaroo" : kind === "tee" ? "none" : "welt", zipper: ["jacket", "bomber"].includes(kind), panel: "none", stripe: false, hem: ["hoodie", "bomber"].includes(kind) ? "rib" : "straight" } };
    const group = createGarment(spec);
    applyGarmentPalette(group, spec.colorHex, spec.accentHex);
    const modelUrl = `${prefix}/models/${product.slug}.glb`;
    fs.writeFileSync(path.join(publicRoot, modelUrl), packGlb(group, artwork));
    group.traverse((m) => { if (m.isMesh) { m.geometry.dispose(); m.material.dispose(); } });
    report.push({ slug: product.slug, name: product.name, kind, brandVersion: GARMENT_BRAND_VERSION, meshVersion: group.userData.meshVersion, modelUrl, geometry: spec.geometry, accentHex: spec.accentHex,
      colorways: colors.map((color) => ({ ...color, inkHex: garmentPalette(color.hex, spec.accentHex).ink, contrast: garmentPalette(color.hex, spec.accentHex).contrast,
        frontUrl: `${prefix}/posters/${product.slug}-${color.hex.slice(1)}-front.webp`, backUrl: `${prefix}/posters/${product.slug}-${color.hex.slice(1)}-back.webp` })) });
  }
} finally { await db.$disconnect(); }
console.log(`Built ${report.length} branded GLBs; ${preview ? "rendering selected geometry previews only" : `rendering ${report.reduce((n, p) => n + p.colorways.length * 2, 0)} front/back posters`}.`);

const html = `<!doctype html><html><head><style>html,body{margin:0}canvas{display:block}</style><script type="importmap">{"imports":{"three":"/vendor/three/build/three.module.js"}}</script></head><body><script type="module">
import * as THREE from 'three';import{GLTFLoader}from'/vendor/three/examples/jsm/loaders/GLTFLoader.js';import{applyGarmentPalette}from'/palette.mjs';
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(36,720/960,.1,40),renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
renderer.setSize(720,960);renderer.setPixelRatio(1);renderer.setClearColor(0xf0ece4,1);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.35;document.body.appendChild(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xfffaf0,0x51493c,3));for(const[p,i]of[[[2,4,4],3.3],[[-3,1,-3],2],[[1,2,-4],1.2]]){const light=new THREE.DirectionalLight(0xffffff,i);light.position.set(...p);scene.add(light);}
let current,center,d;window.loadGarment=async(url)=>{if(current){scene.remove(current);current.traverse(m=>{if(m.isMesh){m.geometry.dispose();for(const material of Array.isArray(m.material)?m.material:[m.material]){for(const value of Object.values(material))if(value?.isTexture)value.dispose();material.dispose();}}});}current=(await new GLTFLoader().loadAsync(url)).scene;scene.add(current);current.traverse(m=>{if(m.isMesh&&m.material.name.startsWith('Brand'))m.material.alphaTest=.04;});const box=new THREE.Box3().setFromObject(current),size=box.getSize(new THREE.Vector3());center=box.getCenter(new THREE.Vector3());d=Math.max(size.y/(2*Math.tan(Math.PI/10)),size.x/(2*Math.tan(Math.PI/10)*.75))*1.13;};
window.renderColor=async(hex,accent,back)=>{const palette=applyGarmentPalette(current,hex,accent);const angle=typeof back==='number'?back:back?Math.PI:0;camera.position.set(Math.sin(angle)*d,center.y+.03,Math.cos(angle)*d);camera.lookAt(center);renderer.render(scene,camera);await new Promise(requestAnimationFrame);renderer.render(scene,camera);return{image:renderer.domElement.toDataURL('image/png'),contrast:palette.contrast};};window.ready=true;
</script></body></html>`;
const server = http.createServer((req, res) => {
  const name = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  if (name === "/") { res.setHeader("Content-Type", "text/html; charset=utf-8"); res.end(html); return; }
  if (name === "/palette.mjs") { res.setHeader("Content-Type", "text/javascript"); res.end(fs.readFileSync("packages/shared/src/garment-palette.mjs")); return; }
  const vendor = name.startsWith("/vendor/three/");
  const root = vendor ? path.resolve("node_modules/three") : publicRoot;
  const target = path.resolve(root, vendor ? name.slice(14) : `.${name}`);
  if (!target.startsWith(root + path.sep) || !fs.existsSync(target)) { res.writeHead(404).end(); return; }
  res.setHeader("Content-Type", /\.m?js$/.test(target) ? "text/javascript" : target.endsWith(".glb") ? "model/gltf-binary" : "application/octet-stream");
  fs.createReadStream(target).pipe(res);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true, args: ["--enable-unsafe-swiftshader"] });
  const page = await browser.newPage({ viewport: { width: 720, height: 960 } });
  page.on("pageerror", (error) => { throw error; });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.waitForFunction(() => window.ready === true);
  let count = 0;
  if (preview) {
    const slugs = ["ml-tee-everyday-crew", "ml-jacket-field-four", "ml-bomber-flight-ma1", "ml-hoodie-cloud-pullover", "ml-hoodie-double-hood", "ml-hoodie-drop-shoulder-hood"];
    const directory = path.resolve(".local/garment-repair/previews"); fs.mkdirSync(directory,{recursive:true});
    for (const product of report.filter(p=>slugs.includes(p.slug))) {
      await page.evaluate(url=>window.loadGarment(url),product.modelUrl);
      for (const [view,angle] of [["front",0],["quarter",Math.PI/4],["side",Math.PI/2],["back",Math.PI]]) {
        const rendered = await page.evaluate(({hex,accent,angle})=>window.renderColor(hex,accent,angle),{hex:"#f8f7f2",accent:product.accentHex,angle});
        fs.writeFileSync(path.join(directory,`${product.slug}-${view}.png`),Buffer.from(rendered.image.split(",")[1],"base64"));
      }
    }
    console.log(`Preview only: ${directory}. Product manifest and database unchanged.`);
  } else {
  for (const product of report) {
    await page.evaluate((url) => window.loadGarment(url), product.modelUrl);
    for (const color of product.colorways) for (const back of [false, true]) {
      const file = path.join(publicRoot, back ? color.backUrl : color.frontUrl);
      if (fs.existsSync(file)) continue;
      const rendered = await page.evaluate(({ hex, accent, back }) => window.renderColor(hex, accent, back), { hex: color.hex, accent: product.accentHex, back });
      if (rendered.contrast < 4.5) throw new Error(`Insufficient logo contrast: ${product.slug} ${color.name}`);
      await sharp(Buffer.from(rendered.image.split(",")[1], "base64")).webp({ quality: 88 }).toFile(file);
    }
    if (++count % 10 === 0) console.log(`Rendered ${count}/${report.length} products.`);
  }
  fs.writeFileSync("apps/web/content/branded-colorways.json", JSON.stringify(report, null, 2) + "\n");
  console.log(`Ready: ${report.length} designs, ${report.reduce((n,p)=>n+p.colorways.length,0)} colourways. Database unchanged.`);
  }
} finally { await browser?.close(); await new Promise((resolve) => server.close(resolve)); }
