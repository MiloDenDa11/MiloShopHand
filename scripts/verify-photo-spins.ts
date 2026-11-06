// Read-only verification. Does not seed, change stock, or touch Redis.
import "dotenv/config";
import {readFileSync,existsSync} from "node:fs";
import {resolve,sep} from "node:path";
import {createHash} from "node:crypto";
import {PrismaClient} from "@prisma/client";
import sharp from "sharp";
import {isPhotoSpin} from "../apps/web/lib/photo-spin";
import {productPhotoSource} from "../apps/web/components/product-media";

async function main(){
const root=resolve("apps/web/public");
const specs=JSON.parse(readFileSync("apps/web/content/collection-designs.json","utf8"));
const legacyPhotos=JSON.parse(readFileSync("apps/web/content/legacy-photo-designs.json","utf8"));
const entries=JSON.parse(readFileSync("apps/web/content/photo-spins.json","utf8"));
const failures:string[]=[];
const known=new Set<string>(),assets=new Set<string>();
const check=(condition:unknown,message:string)=>{if(!condition)failures.push(message);};
for(const {slug,spin} of entries){
  check([...specs,...legacyPhotos].some((s:any)=>s.slug===slug),`Unknown design ${slug}`);
  check(isPhotoSpin(spin),`Invalid spin ${slug}`);
  const key=`${slug}:${spin.colorHex.toLowerCase()}`;
  check(!known.has(key),`Duplicate colour ${key}`);known.add(key);
  const hashes=new Set<string>();
  for(const atlas of spin.atlases){
    const url=new URL(atlas.src,"https://milo.local");
    const file=resolve(root,url.pathname.slice(1));
    check(file.startsWith(root+sep)&&existsSync(file),`Missing ${atlas.src}`);
    if(!existsSync(file))continue;
    const bytes=readFileSync(file),hash=createHash("sha256").update(bytes).digest("hex");
    check(url.searchParams.get("v")===hash.slice(0,12),`Stale content hash ${atlas.src}`);
    const meta=await sharp(bytes).metadata();
    check(meta.width===atlas.width&&meta.height===atlas.height,`Wrong atlas dimensions ${atlas.src}`);
    check(atlas.frames?.length===atlas.count,`Missing per-view alignment ${atlas.src}`);
    // Detect exact repeated images, without altering generated assets.
    for(let local=0;local<atlas.count;local++){
      const cw=atlas.width/atlas.columns,ch=atlas.height/atlas.rows;
      const left=Math.ceil((local%atlas.columns)*cw+3),top=Math.ceil(Math.floor(local/atlas.columns)*ch+3);
      const cell=await sharp(bytes).extract({left,top,width:Math.floor(cw-6),height:Math.floor(ch-6)}).raw().toBuffer();
      const cellHash=createHash("sha256").update(cell).digest("hex");
      check(!hashes.has(cellHash),`Repeated viewpoint ${key}:${atlas.firstFrame+local}`);hashes.add(cellHash);
    }
    assets.add(file);
  }
}
if(!process.argv.includes("--files-only")){
  const db=new PrismaClient();
  try{
    const products=await db.product.findMany({include:{images:true,variants:true}});
    const managed=products.filter(p=>(p.design as any)?.managedBy==="milo-collection-v1");
    for(const product of managed){
      const design=product.design as any;
      check(design.mediaPresentation==="photo",`Not in photo mode: ${product.slug}`);
      for(const entry of entries.filter((e:any)=>e.slug===product.slug)){
        check(isPhotoSpin(design.photoSpins?.[entry.spin.colorHex.toLowerCase()]),`Spin not integrated ${product.slug}`);
        const variant=product.variants.find(v=>v.colorHex.toLowerCase()===entry.spin.colorHex.toLowerCase());
        check(variant,`No matching colour ${product.slug}`);
        for(const view of ["front","back"])check(product.images.some(i=>i.color===variant?.color&&i.view===view),`Missing ${view} ${product.slug}/${variant?.color}`);
      }
      for(const image of product.images){
        if(!image.url.startsWith("/"))continue;
        const file=resolve(root,new URL(productPhotoSource(image.url).src,"https://milo.local").pathname.slice(1));
        check(file.startsWith(root+sep)&&existsSync(file),`Product image 404 ${product.slug}: ${image.url}`);
      }
    }
    console.log(`DB: ${managed.length} managed products, ${managed.reduce((n,p)=>n+p.variants.length,0)} SKUs; ${new Set(entries.map((e:any)=>e.slug)).size} products with approved spins.`);
  }finally{await db.$disconnect();}
}
const pending=specs.filter((s:any)=>!known.has(`${s.slug}:${s.colorHex.toLowerCase()}`));
if(process.argv.includes("--require-all"))check(pending.length===0,`${pending.length} original-colour AI designs still need 24-view photos`);
console.log(`${entries.length} approved colour spins, ${entries.length*24} views, ${assets.size} native PNG atlases. Pending original AI designs: ${pending.length}/${specs.length}.`);
if(failures.length){console.error(failures.join("\n"));process.exitCode=1;}
else console.log("All currently approved spins and product image paths passed. Coverage is reported separately; this does not certify ungenerated designs.");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
