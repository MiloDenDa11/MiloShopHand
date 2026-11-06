// Decode every delivery asset and compare its visible content to the preserved source.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import sources from '../apps/web/content/prepared-media.json';
import {preparedPhoto,preparedSpinSource} from '../apps/web/lib/prepared-media';

async function main(){
const root=path.resolve('apps/web/public'),checked=new Set<string>();
let sourceBytes=0,deliveredBytes=0;
for(const [url,entry]of Object.entries(sources)){
  const [hash,width,height,kind]=entry as [string,number,number,string];
  const bytes=await fs.readFile(path.join(root,url.slice(1)));sourceBytes+=bytes.length;
  assert.equal(createHash('sha256').update(bytes).digest('hex').slice(0,12),hash,`Changed source ${url}`);
  const actual=await sharp(bytes).metadata();assert.equal(actual.width,width);assert.equal(actual.height,height);
  const check=async(src:string,expectedWidth:number,crop?:sharp.Region)=>{
    if(checked.has(src))return;
    const file=path.join(root,src.slice(1));
    const delivered=await fs.readFile(file),meta=await sharp(delivered).metadata();
    assert.equal(meta.format,'webp');assert.equal(meta.width,expectedWidth,src);
    const sw=crop?.width||width,sh=crop?.height||height;
    assert(Math.abs(meta.height!-expectedWidth*sh/sw)<=1,`Wrong aspect ratio ${src}`);
    let reference=sharp(bytes);if(crop)reference=reference.extract(crop);
    // Compare at the delivered resolution: direct 32px sampling aliases narrow
    // stripes differently from the two-stage browser thumbnail pipeline.
    const a=await reference.resize({width:expectedWidth,withoutEnlargement:true}).removeAlpha().raw().toBuffer();
    const b=await sharp(delivered).removeAlpha().raw().toBuffer();
    assert.equal(a.length,b.length);
    const error=a.reduce((sum,v,i)=>sum+Math.abs(v-b[i]),0)/a.length;
    assert(error<6,`Wrong view/colour or damaged content ${src}: ${error}`);
    checked.add(src);deliveredBytes+=delivered.length;
  };
  for(const view of kind==='p'?['front','back']: /\/part-[02]\.png$/.test(url)?['cell']:[]){
    const media=kind==='p'?{src:url,view}:{src:url,view:null,atlas:{columns:3,rows:2,frame:0,aspect:width/3/(height/2)}};
    const photo=preparedPhoto(media)!;assert(photo,`No derivative ${url}/${view}`);
    const crop=kind==='p'?{left:view==='back'?Math.floor(width/2):0,top:0,width:Math.floor(width/2),height}:{left:0,top:0,width:Math.round(width/3),height:Math.round(height/2)};
    for(const variant of photo.srcSet.split(', ')){
      const [src,w]=variant.split(' ');await check(src,Number(w.slice(0,-1)),crop);
    }
  }
  if(kind==='a')for(const profile of ['card','detail'] as const){
    const src=preparedSpinSource(`${url}?v=${hash}`,profile)!;assert(src);
    await check(src,Math.min(width,profile==='card'?960:1536));
  }
}
const report={at:new Date().toISOString(),sources:Object.keys(sources).length,decodedDerivatives:checked.size,sourceBytes,deliveredBytes,result:'PASS',check:'source SHA256, WebP decoding, dimensions, aspect ratio, pixel comparison with correct source crop'};
await fs.mkdir('.local/performance',{recursive:true});
await fs.writeFile('.local/performance/media-verification.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
