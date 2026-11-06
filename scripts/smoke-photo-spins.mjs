// Read-only production UI/asset check. The cart and checkout suites run separately on _test.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import {chromium} from "@playwright/test";

const base=process.env.SMOKE_URL||"http://localhost:3100";
const selected=process.env.SMOKE_SLUGS?.split(',').filter(Boolean);
const entries=JSON.parse(fs.readFileSync("apps/web/content/photo-spins.json","utf8")).filter(entry=>!selected||selected.includes(entry.slug));
const prepared=JSON.parse(fs.readFileSync('apps/web/content/prepared-media.json','utf8'));
const deliveredSource=src=>{
  const url=new URL(src,base),entry=prepared[url.pathname];
  return entry&&entry[0]===url.searchParams.get('v')?`/product-media/${entry[0]}-v1-spin-detail.webp`:`/_next/image?url=${encodeURIComponent(src)}&w=1920&q=75`;
};
if(selected?.some(slug=>!entries.some(entry=>entry.slug===slug)))throw new Error('Unknown smoke-test product selection');
const output=path.resolve(".local/photo-spin/production");fs.mkdirSync(output,{recursive:true});
const browser=await chromium.launch({headless:true});
const report={at:new Date().toISOString(),base,renderer:"24-view photographs; upright Y axis",products:[],errors:[],assetErrors:[]};
let page;
try{
  page=await browser.newPage({viewport:{width:360,height:800},reducedMotion:"reduce"});
  page.on("pageerror",e=>report.errors.push(e.message));
  for(const {slug,spin} of entries){
    report.current={slug,colorHex:spin.colorHex};
    const api=await page.request.get(`${base}/api/v1/products/${slug}`);
    assert(api.ok(),`Product API failed: ${slug}`);
    const product=await api.json();
    const variant=product.variants.find(v=>v.colorHex.toLowerCase()===spin.colorHex.toLowerCase());
    assert(variant,`No matching colour ${slug}/${spin.colorHex}`);
    const requests=[];
    // Recommendations can legitimately display another product's atlas as a
    // gallery thumbnail. Only this product's heavy frames belong to its viewer.
    const expectedSources=spin.atlases.map(a=>new URL(deliveredSource(a.src),base).href);
    const receive=r=>{if(r.url().includes(".glb")||expectedSources.includes(r.url()))requests.push(r.url());};
    page.on("request",receive);
    const response=await page.goto(`${base}/san-pham/${slug}`,{waitUntil:"domcontentloaded"});
    assert(response.ok(),`Product page HTTP ${response.status()}: ${slug}`);
    const image=page.locator("#main .detail-image-zoom");
    await image.waitFor();
    const readGallery=()=>page.locator("#main .detail-gallery img").evaluateAll(imgs=>imgs.flatMap(i=>[i.currentSrc,i.src,...i.srcset.split(',').map(s=>s.trim().split(/\s+/)[0])]).filter(Boolean).map(src=>new URL(src,document.baseURI).href));
    const initialGallery=await readGallery();
    await page.locator("#main .color-choices").getByRole("button",{name:variant.color,exact:true}).click();
    await page.waitForFunction(()=>{const i=document.querySelector("#main .detail-main img");return i?.complete&&i.naturalWidth>0;});
    // A colour gallery can use the first/back atlas at the same optimized
    // width. Those visible images are legitimate loads before opening 360.
    const gallerySources=[...initialGallery,...await readGallery()];
    assert(requests.every(url=>gallerySources.includes(url)),`Viewer-only resources loaded before opening: ${requests.filter(url=>!gallerySources.includes(url)).join(', ')}`);
    const started=performance.now();
    await image.click();
    const viewer=page.locator('.photo-spin-viewer[data-viewer-status="ready"]');await viewer.waitFor();
    const readyMs=performance.now()-started;
    assert.equal(await page.locator("canvas").count(),0);
    const stage=page.locator(".photo-spin-stage");
    assert.equal(await viewer.getAttribute("data-axis"),"y");
    const frames=new Set();await stage.focus();
    for(let n=0;n<24;n++){
      frames.add(await stage.getAttribute("data-frame"));
      const background=await viewer.locator(".photo-spin-sheet").evaluate(el=>getComputedStyle(el).backgroundImage);
      const displayed=new URL(background.match(/^url\(["']?(.+?)["']?\)$/)[1],base).href;
      assert.equal(displayed,expectedSources[Math.floor(n/6)],`Wrong colour/design/frame ${slug}/${variant.color}/${n}`);
      await page.keyboard.press("ArrowRight");
      await page.waitForFunction(n=>document.querySelector(".photo-spin-stage")?.dataset.frame===String(n),(n+1)%24);
    }
    assert.equal(frames.size,24);
    const key=`${slug}-${spin.colorHex.slice(1)}`;
    await viewer.screenshot({path:path.join(output,`${key}-front.png`)});
    await page.getByRole("button",{name:"Mặt sau",exact:true}).click();
    assert.equal(await stage.getAttribute("data-frame"),"12");
    await viewer.screenshot({path:path.join(output,`${key}-back.png`)});
    assert(await page.getByRole("dialog").evaluate(el=>el.scrollWidth<=el.clientWidth));
    const resources=await page.evaluate(sources=>performance.getEntriesByType("resource").filter(r=>sources.includes(r.name)).map(r=>({url:r.name,transferBytes:r.transferSize,encodedBytes:r.encodedBodySize,durationMs:r.duration})),expectedSources);
    await page.keyboard.press("Escape");
    assert.equal(await page.locator(".photo-spin-viewer").count(),0);
    assert(!requests.some(url=>url.includes(".glb")));
    report.products.push({slug,color:variant.color,colorHex:spin.colorHex,readyMs:Math.round(readyMs),views:frames.size,lazy:true,canvas:0,resources});
    console.log(`PASS ${slug}/${variant.color}: 24 views`);
    page.off("request",receive);
  }
  const urls=new Set(entries.flatMap(e=>e.spin.atlases.map(a=>a.src)));
  for(const url of urls){const response=await page.request.head(base+url);if(!response.ok())report.assetErrors.push(`${response.status()} ${url}`);}
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.assetErrors,[]);
  report.result="PASS";report.atlasesChecked=urls.size;report.uniqueProducts=new Set(entries.map(e=>e.slug)).size;
}catch(error){report.result="FAIL";report.failure=error.message;report.diagnostic=await page?.locator('#main').innerText().catch(()=>null);await page?.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});process.exitCode=1;}
finally{await browser.close();fs.writeFileSync(path.join(output,"report.json"),JSON.stringify(report,null,2));}
console.log(JSON.stringify({result:report.result,products:report.products.length,atlasesChecked:report.atlasesChecked,errors:report.errors,failure:report.failure,report:path.join(output,"report.json")},null,2));
