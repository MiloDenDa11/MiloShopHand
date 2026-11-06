// Read-only HTTP audit of the public gallery for every paginated product.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const base=process.env.SMOKE_URL||'http://localhost:3100';
const products=[];
for(let page=1,pages=1;page<=pages;page++){
  const response=await fetch(`${base}/api/v1/products?limit=48&page=${page}`);
  assert(response.ok,`Catalog HTTP ${response.status}`);
  const catalog=await response.json();pages=catalog.pages;products.push(...catalog.items);
}
const urls=[...new Set(products.flatMap(p=>p.images.map(i=>i.url)).filter(url=>url.startsWith('/')).map(src=>{
  const url=new URL(src,base);
  for(const key of ['view','cols','rows','frame','ar'])url.searchParams.delete(key);
  return url.href;
}))];
const failures=[];
for(let index=0;index<urls.length;index+=4){
  const checked=await Promise.allSettled(urls.slice(index,index+4).map(async url=>{
    const response=await fetch(url,{method:'HEAD',signal:AbortSignal.timeout(10000)});
    assert(response.ok,`${response.status} ${url}`);
    assert(response.headers.get('content-type')?.startsWith('image/'),`Not an image ${url}`);
  }));
  for(const result of checked)if(result.status==='rejected')failures.push(result.reason.message);
}
const report={at:new Date().toISOString(),base,products:products.length,uniqueLocalImages:urls.length,failures,result:failures.length?'FAIL':'PASS'};
fs.mkdirSync('.local/photo-spin/production',{recursive:true});
fs.writeFileSync(path.resolve('.local/photo-spin/production/gallery-http.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));if(failures.length)process.exitCode=1;
