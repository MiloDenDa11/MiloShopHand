import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";

const base = process.env.SMOKE_URL || "http://localhost:3000";
const manifest = JSON.parse(fs.readFileSync("apps/web/content/branded-colorways.json", "utf8"));
const source = JSON.parse(fs.readFileSync("apps/web/content/collection-designs.json", "utf8"));
const output = path.resolve("docs/brand-v2/previews"); fs.mkdirSync(output,{recursive:true});
const browser = await chromium.launch({headless:true,args:["--enable-unsafe-swiftshader"]});
const errors = [], result = [];
try {
  const context = await browser.newContext({viewport:{width:360,height:800},hasTouch:true,isMobile:true,reducedMotion:"reduce"});
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  page.on("pageerror",e=>errors.push(e.message));
  page.on("console",m=>{if(m.type()==="error"&&!/401/.test(m.text()))errors.push(m.text());});
  for (const kind of ["tee","jacket","bomber","hoodie"]) {
    const spec = source.find(p=>p.kind===kind);
    const product = manifest.find(p=>p.slug===spec.slug);
    let modelRequests=0;
    const count = r=>{if(r.url().includes(".glb"))modelRequests++;}; page.on("request",count);
    await page.goto(`${base}/san-pham/${spec.slug}`);
    await page.locator(".detail-image-zoom:visible").waitFor();
    assert.equal(modelRequests,0);
    await page.locator(".detail-image-zoom:visible").click();
    await page.locator('.garment-viewer[data-viewer-status="ready"]').waitFor();
    const stage=page.locator(".garment-viewer-stage:visible"), dialog=page.locator(".product-360-dialog[open]");
    await page.getByRole("button",{name:"Mặt sau",exact:true}).click();
    for(const name of ["Đen","Trắng","Đỏ mận"]){
      await dialog.getByRole("button",{name,exact:true}).click();
      const expected=product.colorways.find(c=>c.name===name);
      await page.waitForFunction(hex=>document.querySelector('.garment-viewer-stage')?.dataset.modelColor===hex,expected.hex);
      assert.equal(await stage.getAttribute("data-angle"),"180");
      assert(Number(await stage.getAttribute("data-logo-contrast"))>=4.5);
      assert.equal(modelRequests,1,"Colour change must not refetch the model");
      await stage.screenshot({path:path.join(output,`${kind}-${expected.key.toLowerCase()}-back-mobile.png`)});
    }
    // Real touch events on a mobile browser context, rather than a mouse drag.
    await page.getByRole("button",{name:"Mặt trước",exact:true}).click();
    const box=await stage.boundingBox(), x=box.x+box.width*.35, y=box.y+box.height*.5;
    await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x,y,id:0}]});
    for(let step=1;step<=6;step++)await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:x+step*20,y,id:0}]});
    await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
    assert.notEqual(await stage.getAttribute("data-angle"),"0",`${kind} touch rotation failed`);
    assert(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth),"Mobile modal overflow");
    await page.getByRole("button",{name:"Đóng chế độ 360°",exact:true}).click();
    assert.equal(await page.locator("canvas").count(),0);
    page.off("request",count);
    result.push({kind,colors:3,logoContrast:"PASS",singleModelRequest:true,touchRotation:"PASS",disposal:"PASS"});
  }
  const urls=[...new Set(manifest.flatMap(p=>[p.modelUrl,...p.colorways.flatMap(c=>[c.frontUrl,c.backUrl])]))];
  for(let i=0;i<urls.length;i+=12) await Promise.all(urls.slice(i,i+12).map(async url=>{
    const response=await fetch(base+url,{method:"HEAD"});assert(response.ok,`${response.status} ${url}`);
    assert(response.headers.get("content-type")?.includes(url.endsWith(".glb")?"model/gltf-binary":"image/webp"),`Wrong content type ${url}`);
  }));
  assert.deepEqual(errors,[]);
  const report={at:new Date().toISOString(),base,result:"PASS",products:result,httpAssetsChecked:urls.length,errors};
  fs.writeFileSync(".local/brand-v2/production-smoke.json",JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
} finally {await browser.close();}
