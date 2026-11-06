import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { chromium } from "@playwright/test";

// Deterministic render of native 3D assets. AI bitmap originals are never edited.
const root = process.cwd();
const publicRoot = path.resolve("apps/web/public");
const threeRoot = path.resolve("node_modules/three");
const legacy = JSON.parse(fs.readFileSync("apps/web/content/legacy-designs.json", "utf8"));
fs.mkdirSync(path.join(publicRoot, "collection-legacy"), { recursive: true });
const html = `<!doctype html><html><head><style>html,body{margin:0;background:#f0ece4}canvas{display:block}</style><script type="importmap">{"imports":{"three":"/vendor/three/build/three.module.js"}}</script></head><body><script type="module">
import * as THREE from 'three';import{GLTFLoader}from'/vendor/three/examples/jsm/loaders/GLTFLoader.js';
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(36,720/960,.1,40),renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
renderer.setSize(720,960);renderer.setPixelRatio(1);renderer.setClearColor(0xf0ece4,1);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.35;document.body.appendChild(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xfffaf0,0x51493c,3));for(const[p,i]of[[[2,4,4],3.3],[[-3,1,-3],2],[[1,2,-4],1.2]]){const light=new THREE.DirectionalLight(0xfffaf0,i);light.position.set(...p);scene.add(light);}
let current;window.loadGarment=async(url,angle)=>{if(current){scene.remove(current);current.traverse(m=>{if(m.isMesh){m.geometry.dispose();for(const material of Array.isArray(m.material)?m.material:[m.material]){for(const value of Object.values(material))if(value?.isTexture)value.dispose();material.dispose();}}});}current=(await new GLTFLoader().loadAsync(url)).scene;scene.add(current);const box=new THREE.Box3().setFromObject(current),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());const d=Math.max(size.y/(2*Math.tan(Math.PI/10)),size.x/(2*Math.tan(Math.PI/10)*.75))*1.16;camera.position.set(Math.sin(angle)*d,center.y+.03,Math.cos(angle)*d);camera.lookAt(center);renderer.render(scene,camera);await new Promise(requestAnimationFrame);renderer.render(scene,camera);return{size:size.toArray(),triangles:renderer.info.render.triangles};};window.ready=true;
</script></body></html>`;
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  if (pathname === "/") { response.setHeader("Content-Type", "text/html; charset=utf-8"); response.end(html); return; }
  const vendor = pathname.startsWith("/vendor/three/");
  const allowedRoot = vendor ? threeRoot : publicRoot;
  const target = path.resolve(allowedRoot, vendor ? pathname.slice("/vendor/three/".length) : `.${pathname}`);
  if (!target.startsWith(allowedRoot + path.sep)) { response.writeHead(403).end(); return; }
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) { response.writeHead(404).end(); return; }
  response.setHeader("Content-Type", target.endsWith(".js") ? "text/javascript" : target.endsWith(".glb") ? "model/gltf-binary" : "application/octet-stream");
  fs.createReadStream(target).pipe(response);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true, args: ["--enable-unsafe-swiftshader"] });
  const page = await browser.newPage({ viewport: { width: 720, height: 960 } });
  page.on("pageerror", (error) => console.error("Render error:", error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.waitForFunction(() => window.ready === true);
  const images = legacy.flatMap((product) => product.images);
  let completed = 0;
  for (const image of images) {
    await page.evaluate(async ({ url, back }) => window.loadGarment(url, back ? Math.PI : 0), { url: image.modelUrl, back: image.view === "back" });
    await page.locator("canvas").screenshot({ path: path.join(publicRoot, image.url), animations: "disabled" });
    completed++;
    if (completed % 20 === 0) console.log(`Rendered ${completed}/${images.length} native 3D front/back catalog images.`);
  }
  const previews = JSON.parse(fs.readFileSync("apps/web/content/collection-designs.json", "utf8")).filter((_, i) => [0, 15, 30, 45].includes(i));
  const previewRoot = path.resolve(".local/collection-upgrade/model-previews"); fs.mkdirSync(previewRoot, { recursive: true });
  for (const design of previews) for (const view of ["front", "back"]) {
    await page.evaluate(async ({ url, back }) => window.loadGarment(url, back ? Math.PI : 0), { url: `/collection-3d/${design.slug}.glb`, back: view === "back" });
    await page.locator("canvas").screenshot({ path: path.join(previewRoot, `${design.kind}-${view}.png`) });
  }
  console.log(`Completed ${images.length} legacy product images and eight GLB QA previews.`);
} finally { await browser?.close(); await new Promise((resolve) => server.close(resolve)); }
