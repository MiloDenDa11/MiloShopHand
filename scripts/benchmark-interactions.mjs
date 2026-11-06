// Read-only browser measurements; run against an isolated production preview.
import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
const base=process.env.BENCHMARK_URL||'http://localhost:3100';
const label=process.argv[2]||'latest';
const browser=await chromium.launch();
const report={label,base,at:new Date().toISOString(),conditions:'production; local loopback; Chromium; desktop 1440x1000; no CPU/network throttle; fresh browser per route',routes:[],filters:[]};
try{
  for(const route of ['/','/san-pham','/gio-hang']){
    const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
    const page=await context.newPage();
    await page.goto(base+route,{waitUntil:'networkidle'});
    report.routes.push({route,resources:await page.evaluate(()=>performance.getEntriesByType('resource').map(r=>({url:r.name,bytes:r.encodedBodySize,transfer:r.transferSize,ms:r.duration,type:r.initiatorType})).sort((a,b)=>b.bytes-a.bytes))});
    await context.close();
  }
  const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  await page.goto(base+'/san-pham',{waitUntil:'networkidle'});
  for(const sort of ['price-asc','price-desc','bestseller','rating','newest']){
    const requests=[];
    const record=request=>{if(request.url().includes('_rsc=')||request.url().includes('/api/v1/products'))requests.push(request.url());};
    page.on('request',record);
    await page.evaluate(()=>window.__filterStart=performance.now());
    await page.locator('.catalog-toolbar select').selectOption(sort);
    await page.waitForURL(url=>url.searchParams.get('sort')===sort);
    const urlMs=await page.evaluate(()=>performance.now()-window.__filterStart);
    await page.locator('.catalog-grid .product-card').first().waitFor();
    const resultsMs=await page.evaluate(()=>performance.now()-window.__filterStart);
    report.filters.push({sort,urlMs,resultsMs,requests});
    page.off('request',record);
  }
}finally{await browser.close();}
await fs.mkdir('.local/performance',{recursive:true});
await fs.writeFile(`.local/performance/${label}-interactions.json`,JSON.stringify(report,null,2));
console.log(JSON.stringify({filters:report.filters,routes:report.routes.map(r=>({route:r.route,total:r.resources.reduce((n,x)=>n+x.bytes,0),largest:r.resources.slice(0,8)}))},null,2));
