import fs from "node:fs";
import path from "node:path";
import {createHash} from "node:crypto";
import sharp from "sharp";
const originals=JSON.parse(fs.readFileSync("apps/web/content/collection-designs.json","utf8")),legacy=JSON.parse(fs.readFileSync("apps/web/content/legacy-photo-designs.json","utf8"));
const specifications=[...originals,...legacy];
// Human-reviewed provenance is promoted explicitly, never inferred from a
// directory containing a partial generation job.
const approved=JSON.parse(fs.readFileSync("docs/photo-spin/approved.json","utf8"));
const result=[];
for(const entry of approved){
  const spec=specifications.find(s=>s.slug===entry.slug);if(!spec)throw new Error(`Unknown design ${entry.slug}`);
  const provenance=JSON.parse(fs.readFileSync(entry.provenance,"utf8"));
  if((provenance.product||provenance.slug)!==entry.slug||provenance.parts.length!==4)throw new Error(`Incomplete provenance ${entry.slug}`);
  const atlases=[];
  for(const [index,part]of provenance.parts.entries()){
    const url=part.url||part.src||"/"+part.assetPath.replaceAll("\\","/").replace(/^apps\/web\/public\//,"");
    const file=path.resolve("apps/web/public",url.replace(/^\//,""));
    if(!url.startsWith(`/collection-spin/${entry.slug}/`)||!fs.existsSync(file))throw new Error(`Missing atlas ${url}`);
    const info=await sharp(file).metadata();
    if(info.width/3<450||info.height/2<450||part.startFrame!==index*6||part.frames?.length!==6)throw new Error(`Invalid six-frame atlas ${url}`);
    const hash=createHash("sha256").update(fs.readFileSync(file)).digest("hex").slice(0,12);
    atlases.push({src:`${url}?v=${hash}`,width:info.width,height:info.height,columns:3,rows:2,firstFrame:index*6,count:6,inset:2,frames:part.frames.map(({x,y,width,height})=>({x,y,width,height}))});
  }
  result.push({slug:entry.slug,...(entry.preferSpinFront?{preferSpinFront:true}:{}),spin:{status:"ready",verified:true,axis:"y",frameCount:24,colorHex:entry.colorHex||spec.colorHex,atlases}});
}
fs.writeFileSync("apps/web/content/photo-spins.json",JSON.stringify(result,null,2)+"\n");
const missing=specs=>specs.filter(spec=>!result.some(entry=>entry.slug===spec.slug&&entry.spin.colorHex.toLowerCase()===spec.colorHex.toLowerCase())).map(({slug,kind,colorHex})=>({slug,kind,colorHex}));
fs.writeFileSync("docs/photo-spin/remaining-originals.json",JSON.stringify(missing(originals),null,2)+"\n");
fs.writeFileSync("docs/photo-spin/remaining-legacy.json",JSON.stringify(missing(legacy),null,2)+"\n");
console.log(`${result.length} verified product/colour photo spins, ${result.length*24} viewpoints.`);
