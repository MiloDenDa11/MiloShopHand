// Deterministic delivery derivatives only. Preserve the approved source artwork.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const publicRoot=path.join(root,'apps/web/public');
const output=path.join(publicRoot,'product-media');
const read=name=>fs.readFile(path.join(root,`apps/web/content/${name}.json`),'utf8').then(JSON.parse);
const [designs,legacy,spins]=await Promise.all([read('collection-designs'),read('legacy-photo-designs'),read('photo-spins')]);
const inputs=new Map();
for(const spec of [...designs,...legacy])if(spec.image)inputs.set(spec.image,'plate');
for(const entry of spins)for(const atlas of entry.spin.atlases)inputs.set(atlas.src.split('?')[0],'atlas');
await fs.mkdir(output,{recursive:true});
const manifest={};let created=0;
// Bound image work so local builds do not saturate every CPU or exhaust memory.
sharp.concurrency(2);
for(const [url,kind]of [...inputs].sort(([a],[b])=>a.localeCompare(b))){
  if(!/^\/collection-(ai|spin)\/[a-z0-9/_-]+\.png$/.test(url))throw new Error(`Unexpected source ${url}`);
  const source=await fs.readFile(path.join(publicRoot,url.slice(1)));
  const hash=createHash('sha256').update(source).digest('hex').slice(0,12);
  const {width,height}=await sharp(source).metadata();
  manifest[url]=[hash,width,height,kind==='plate'?'p':'a'];
  const write=async(name,options)=>{
    const file=path.join(output,`${hash}-v1-${name}.webp`);
    if(await fs.access(file).then(()=>true,()=>false))return;
    const pipeline=sharp(source);
    if(options.crop)pipeline.extract(options.crop);
    await pipeline.resize({width:options.width,withoutEnlargement:true}).webp({quality:80,effort:4}).toFile(file);
    created++;
  };
  const photos=kind==='plate'?['front','back']: /\/part-[02]\.png$/.test(url)?['cell']:[];
  for(const view of photos){
    const crop=kind==='plate'?{left:view==='back'?Math.floor(width/2):0,top:0,width:Math.floor(width/2),height}:{left:0,top:0,width:Math.round(width/3),height:Math.round(height/2)};
    const widths=[...new Set([256,512,768].filter(w=>w<crop.width).concat(Math.min(768,crop.width)))];
    for(const size of widths)await write(`${view}-${size}`,{crop,width:size});
  }
  if(kind==='atlas')for(const [profile,size]of [['card',960],['detail',1536]])await write(`spin-${profile}`,{width:Math.min(size,width)});
}
const destination=path.join(root,'apps/web/content/prepared-media.json');
const json=JSON.stringify(manifest)+'\n';
if(await fs.readFile(destination,'utf8').catch(()=>'')!==json)await fs.writeFile(destination,json);
console.log(`Prepared media: ${inputs.size} unchanged sources, ${created} new WebP derivatives.`);
