// Read-only browser audit, including every configured colour. No checkout or
// database writes. Run against the isolated QA preview after media seeding.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
const base=process.env.SMOKE_URL||'http://localhost:3100';
const slugs=[...new Set(JSON.parse(fs.readFileSync('apps/web/content/photo-spins.json','utf8')).map(entry=>entry.slug))];
const selected=process.env.SMOKE_SLUGS?.split(',').filter(Boolean);
const approvedOnly=process.argv.includes('--approved-only');
const output='.local/spin-completion/browser';fs.mkdirSync(output,{recursive:true});
const report={at:new Date().toISOString(),base,scope:approvedOnly?'approved-native-subset':'every-configured-colour',products:[],errors:[],pageErrors:[]};
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:360,height:800},reducedMotion:'reduce'});
 page.on('pageerror',error=>report.pageErrors.push(error.message));
 page.on('request',request=>{if(request.url().includes('.glb'))report.errors.push({unexpectedModel:request.url()});});
 const captured=new Set();
 for(const slug of slugs.filter(slug=>!selected||selected.includes(slug))){
  const row={slug,colors:[],pendingColours:[]};report.products.push(row);
  try{
   const response=await page.request.get(`${base}/api/v1/products/${slug}`);assert(response.ok(),`API ${response.status()}`);
   const product=await response.json(),colors=[...new Map(product.variants.map(v=>[v.colorHex.toLowerCase(),v])).values()];
   await page.goto(`${base}/san-pham/${slug}`,{waitUntil:'domcontentloaded'});
   await page.getByRole('button',{name:'Khám phá thiết kế 360°',exact:true}).click();
   const viewer=page.locator('.photo-spin-viewer'),dialog=page.getByRole('dialog'),stage=viewer.locator('.photo-spin-stage');
   const candidates=approvedOnly?colors.filter(variant=>product.design?.photoSpins?.[variant.colorHex.toLowerCase()]):colors;
   row.pendingColours=colors.filter(variant=>!product.design?.photoSpins?.[variant.colorHex.toLowerCase()]).map(variant=>({name:variant.color,hex:variant.colorHex}));
   for(const variant of candidates){
    const started=performance.now();
    await dialog.getByRole('button',{name:variant.color,exact:true}).click();
    await page.waitForFunction(()=>['ready','error'].includes(document.querySelector('.photo-spin-viewer')?.dataset.viewerStatus));
    assert.equal(await viewer.getAttribute('data-viewer-status'),'ready',`${variant.color}: native images unavailable`);
    const native=product.design?.photoSpins?.[variant.colorHex.toLowerCase()];assert(native,`Missing native set: ${slug}/${variant.color}`);
    assert.equal(await viewer.getAttribute('data-native-color'),variant.colorHex.toLowerCase());
    assert(!(await viewer.innerText()).includes('Phối màu xem trước'));
    assert.equal(await dialog.locator('canvas').count(),0);
    const placements=new Set(),sheets=new Set();
    for(const frame of [0,6,12,18]){
     await dialog.getByRole('button',{name:'Mặt trước',exact:true}).click();
     if(frame)await stage.evaluate((element,count)=>{for(let i=0;i<count;i++)element.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));},frame);
     await page.waitForFunction(frame=>document.querySelector('.photo-spin-stage')?.dataset.frame===String(frame),frame);
     const sheet=viewer.locator('.photo-spin-sheet');placements.add(await sheet.getAttribute('style'));
     const image=await sheet.evaluate(element=>getComputedStyle(element).backgroundImage);sheets.add(image);
     assert(image.includes('spin-detail.webp')&&!image.includes('blob:'));
    }
    assert.equal(placements.size,4);assert.equal(sheets.size,4);
    assert(await dialog.evaluate(element=>element.scrollWidth<=element.clientWidth));
    const kind=product.design?.kind||'garment';
    if(!captured.has(kind)){await dialog.getByRole('button',{name:'Mặt trước',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.photo-spin-stage')?.dataset.frame==='0');await viewer.screenshot({path:`${output}/${kind}-${slug}-preview.png`});captured.add(kind);}
    row.colors.push({name:variant.color,hex:variant.colorHex,mode:'native',views:24,cardinalViewsChecked:4,readyMs:Math.round(performance.now()-started)});
   }
   if(approvedOnly){
    for(const variant of row.pendingColours){
     await dialog.getByRole('button',{name:variant.name,exact:true}).click();
     await page.waitForFunction(()=>!document.querySelector('.photo-spin-viewer'));
     assert((await dialog.innerText()).includes(`Ảnh 360° cho màu ${variant.name} đang được bổ sung.`));
     assert.equal(await dialog.locator('canvas').count(),0);
    }
   }
   await page.keyboard.press('Escape');console.log(`PASS ${slug}: ${row.colors.length} native colours; ${row.pendingColours.length} pending`);
  }catch(error){report.errors.push({slug,message:error.message});await page.screenshot({path:`${output}/${slug}-failure.png`}).catch(()=>{});console.error(`FAIL ${slug}: ${error.message}`);}
 }
 assert.equal(report.errors.length,0);assert.equal(report.pageErrors.length,0);
 report.result=approvedOnly?'PASS_APPROVED_SUBSET':'PASS';
}catch(error){report.result='FAIL';report.failure=error.message;process.exitCode=1;}
finally{await browser.close();fs.writeFileSync(`${output}/report.json`,JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({result:report.result,scope:report.scope,products:report.products.length,colours:report.products.reduce((n,p)=>n+p.colors.length,0),pendingColours:report.products.reduce((n,p)=>n+p.pendingColours.length,0),errors:report.errors,pageErrors:report.pageErrors.length,report:`${output}/report.json`}));
