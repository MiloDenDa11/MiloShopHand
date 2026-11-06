// Copy native ImageGen outputs unchanged and analyse alignment read-only.
// Promotion into the storefront remains an explicit approved.json review.
import fs from "node:fs";
import path from "node:path";
import {createHash} from "node:crypto";
import sharp from "sharp";
const job=JSON.parse(fs.readFileSync(process.argv[2],"utf8"));
if(!/^[a-z0-9-]+$/.test(job.slug)||!/^[a-z0-9-]+$/.test(job.colorKey)||!/^#[a-f0-9]{6}$/i.test(job.colorHex)||job.parts.length!==4)throw new Error("Invalid colour job");
const lightFabric=[1,3,5].reduce((sum,offset,c)=>sum+parseInt(job.colorHex.slice(offset,offset+2),16)*[.2126,.7152,.0722][c],0)>190;
const report={slug:job.slug,colorKey:job.colorKey,colorHex:job.colorHex,mode:"built-in image_gen",status:"ready-for-review",axis:"y",camera:"fixed-level",frameCount:24,nominalAngles:true,generatedAt:new Date().toISOString(),parts:[],qa:{visual:job.visualReview||"Root visual review required before promotion.",alignmentAnalysis:"Read-only pixel analysis; largest continuous garment row band excludes adjacent-cell fragments. No bitmap editing."}};
for(const [index,part]of job.parts.entries()){
  if(part.part!==index)throw new Error("Colour parts must cover all four quarters in order");
  const source=fs.readFileSync(part.sourcePath),meta=await sharp(source).metadata();
  const width=meta.width,height=meta.height,cw=width/3,ch=height/2;
  if(cw<450||ch<450)throw new Error("Insufficient native per-view resolution");
  const src=`/collection-spin/${job.slug}/${job.colorKey}/part-${index}.png`,file=path.resolve("apps/web/public",src.slice(1));
  fs.mkdirSync(path.dirname(file),{recursive:true});
  if(fs.existsSync(file)&&!fs.readFileSync(file).equals(source))throw new Error(`Existing atlas retained: ${file}`);
  if(!fs.existsSync(file))fs.copyFileSync(part.sourcePath,file);
  const {data,info}=await sharp(source).removeAlpha().raw().toBuffer({resolveWithObject:true});
  const frames=[];
  for(let f=0;f<6;f++){
    const ox=f%3*cw,oy=Math.floor(f/3)*ch;
    const pixels=[];
    for(const x of [ox+5,ox+cw-6])for(const y of [oy+5,oy+ch-6]){const p=(Math.floor(y)*info.width+Math.floor(x))*3;pixels.push([data[p],data[p+1],data[p+2]]);}
    const bg=[0,1,2].map(c=>pixels.map(p=>p[c]).sort((a,b)=>a-b)[2]);
    const rows=[];
    for(let y=Math.ceil(oy+3);y<oy+ch-3;y++){
      let left=Infinity,right=-Infinity,count=0;
      for(let x=Math.ceil(ox+3);x<ox+cw-3;x++){
        const p=(y*info.width+x)*3,r=data[p],g=data[p+1],b=data[p+2];
        const foreground=lightFabric?(r-bg[0])**2+(g-bg[1])**2+(b-bg[2])**2>225:Math.max(r,g,b)<210;
        if(foreground){left=Math.min(left,x);right=Math.max(right,x);count++;}
      }
      rows.push({y,left,right,on:count>=Math.max(5,cw*.012)});
    }
    const bands=[];let band=[];
    for(const row of rows){if(row.on)band.push(row);else if(band.length){bands.push(band);band=[];}}
    if(band.length)bands.push(band);
    const main=bands.sort((a,b)=>b.length-a.length)[0];
    if(!main||main.length<ch*.5)throw new Error(`Unreliable garment bounds ${src} frame${f}; inspect manually`);
    const left=Math.min(...main.map(r=>r.left)),right=Math.max(...main.map(r=>r.right));
    frames.push({x:left-ox,y:main[0].y-oy,width:right-left+1,height:main.at(-1).y-main[0].y+1});
  }
  report.parts.push({startFrame:index*6,count:6,src,sourcePath:part.sourcePath,prompt:part.prompt,width,height,columns:3,rows:2,bytes:source.length,sha256:createHash("sha256").update(source).digest("hex"),frames});
}
const destination=`docs/photo-spin/${job.slug}-${job.colorKey}.json`;
fs.writeFileSync(destination,JSON.stringify(report,null,2)+"\n");
console.log(`${job.slug}/${job.colorKey}: staged24views,4nativePNGs; ${destination}. Review before promotion.`);
