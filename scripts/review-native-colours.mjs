// Stage contact sheets and explicitly reviewed native colour sets; no image API calls.
import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";
import sharp from "sharp";

const base=path.resolve(".local/native-colours"),mode=process.argv[2]||"--report";
const plan=JSON.parse(fs.readFileSync(path.join(base,"plan.json"),"utf8"));
const completed=[];
for(const job of plan){
 const files=[0,1,2,3].map(part=>path.join(base,"generated",job.id,`part-${part}.json`));
 if(!files.every(file=>fs.existsSync(file)))continue;
 const parts=files.map(file=>JSON.parse(fs.readFileSync(file,"utf8")));
 for(const [index,part]of parts.entries()){
  if(part.id!==job.id||part.slug!==job.slug||part.colorHex!==job.colorHex||part.part!==index||!fs.existsSync(part.sourcePath)||!part.prompt)throw new Error(`Invalid generation checkpoint ${job.id}/${index}`);
 }
 completed.push({job,parts});
}
if(mode==="--prepare-unreviewed"){
 const limit=Number(process.argv[3]||8);
 if(!Number.isInteger(limit)||limit<1||limit>32)throw new Error("Review batch limit must be 1..32");
 const registry=JSON.parse(fs.readFileSync("docs/photo-spin/approved.json","utf8"));
 const batch=completed.filter(({job})=>!registry.some(entry=>entry.provenance===`docs/photo-spin/${job.slug}-${job.colorKey}.json`)).slice(0,limit);
 const output=[];
 for(const {job,parts}of batch){
  const composites=[];
  for(const [index,part]of parts.entries())composites.push({input:await sharp(part.sourcePath).resize(768,512,{fit:"contain",background:"#fff6e8"}).toBuffer(),left:index%2*768,top:Math.floor(index/2)*512});
  const target=path.join(base,`${job.id}-review.jpg`);
  await sharp({create:{width:1536,height:1024,channels:3,background:"#fff6e8"}}).composite(composites).jpeg({quality:92}).toFile(target);
  output.push({id:job.id,file:target});
 }
 fs.writeFileSync(path.join(base,"review-batch.json"),JSON.stringify(output,null,2)+"\n");
 console.log(JSON.stringify(output));
}else if(mode==="--prepare"){
 const requested=process.argv.slice(3);
 for(const {job,parts}of completed.filter(({job})=>!requested.length||requested.includes(job.id))){
  const composites=[];
  for(const [index,part]of parts.entries())composites.push({input:await sharp(part.sourcePath).resize(768,512,{fit:"contain",background:"#fff6e8"}).toBuffer(),left:index%2*768,top:Math.floor(index/2)*512});
  const target=path.join(base,`${job.id}-review.png`);
  await sharp({create:{width:1536,height:1024,channels:3,background:"#fff6e8"}}).composite(composites).png().toFile(target);
  console.log(target);
 }
}else if(mode==="--approve"){
 const file=process.argv[3];if(!file)throw new Error("Pass an explicit review JSON file; image existence is not visual approval.");
 const reviews=JSON.parse(fs.readFileSync(file,"utf8"));
 const registryFile="docs/photo-spin/approved.json",registry=JSON.parse(fs.readFileSync(registryFile,"utf8"));
 for(const review of reviews){
  const record=completed.find(({job})=>job.id===review.id);
  if(!record||typeof review.visualReview!=="string"||review.visualReview.length<60)throw new Error(`Missing complete images or explicit visual review: ${review.id}`);
  const {job,parts}=record,jobFile=path.join(base,`${job.id}.json`);
  fs.writeFileSync(jobFile,JSON.stringify({...job,visualReview:review.visualReview,parts:parts.map(({part,prompt,sourcePath})=>({part,prompt,sourcePath}))},null,2)+"\n");
  const result=spawnSync(process.execPath,["scripts/register-photo-spin-color.mjs",jobFile],{encoding:"utf8",windowsHide:true});
  if(result.status!==0)throw new Error(result.stderr||result.stdout);
  console.log(result.stdout.trim());
  const provenance=`docs/photo-spin/${job.slug}-${job.colorKey}.json`;
  const existing=registry.find(entry=>entry.slug===job.slug&&entry.colorHex?.toLowerCase()===job.colorHex);
  if(existing&&existing.provenance!==provenance)throw new Error(`An approved native set already exists for ${job.id}`);
  if(!registry.some(entry=>entry.provenance===provenance))registry.push({slug:job.slug,colorHex:job.colorHex,provenance});
 }
 fs.writeFileSync(registryFile,JSON.stringify(registry,null,2)+"\n");
}else if(mode!=="--report")throw new Error("Use --prepare [ids], --prepare-unreviewed [limit], --approve <reviews.json>, or --report");
console.log(JSON.stringify({plannedMissingColours:plan.length,completeStagedColours:completed.length,stagedViews:completed.length*24,partial:plan.filter(job=>fs.existsSync(path.join(base,"generated",job.id))&&!completed.some(record=>record.job.id===job.id)).map(job=>job.id)}));
