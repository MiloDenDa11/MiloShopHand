import {PrismaClient} from "@prisma/client";
import {readFileSync,existsSync} from "node:fs";
import {resolve} from "node:path";
import {isDeepStrictEqual} from "node:util";
import {isPhotoSpin,type PhotoSpin} from "../apps/web/lib/photo-spin";

const root=resolve(__dirname,"..");
type Entry={slug:string;spin:PhotoSpin;preferSpinFront?:boolean};
export async function applyPhotoPresentation(db:PrismaClient){
  if(process.env.NODE_ENV==="production")throw new Error("Photo catalog seeding is development-only");
  const specifications:any[]=[...JSON.parse(readFileSync(resolve(root,"apps/web/content/collection-designs.json"),"utf8")),...JSON.parse(readFileSync(resolve(root,"apps/web/content/legacy-photo-designs.json"),"utf8"))];
  const spins:Entry[]=JSON.parse(readFileSync(resolve(root,"apps/web/content/photo-spins.json"),"utf8"));
  for(const entry of spins){
    if(!isPhotoSpin(entry.spin))throw new Error(`Incomplete photo spin ${entry.slug}`);
    for(const atlas of entry.spin.atlases)if(!existsSync(resolve(root,"apps/web/public",atlas.src.replace(/^\//,"").split("?")[0])))throw new Error(`Missing spin atlas ${atlas.src}`);
  }
  for(const spec of specifications)if(spec.image&&!existsSync(resolve(root,"apps/web/public",spec.image.replace(/^\//,""))))throw new Error(`Missing original design plate ${spec.slug}`);
  const products=await db.product.findMany({include:{images:true,variants:{orderBy:{id:"asc"}}}});
  let restored=0;
  for(const product of products){
    const current=product.design as any;if(current?.managedBy!=="milo-collection-v1")continue;
    const spec=specifications.find(s=>s.slug===product.slug);
    const entries=spins.filter(e=>e.slug===product.slug);
    const photoSpins=Object.fromEntries(entries.map(e=>[e.spin.colorHex.toLowerCase(),e.spin]));
    const desired:{url:string;alt:string;color:string|null;position:number;view:string;crop:string|null}[]=[];
    if(spec){
      if(spec.image&&!entries.some(e=>e.spin.colorHex.toLowerCase()===spec.colorHex.toLowerCase()))for(const [index,view]of ["front","back"].entries())desired.push({url:`${spec.image}?view=${view}`,alt:`${product.name} — ${view==="front"?"mặt trước, logo ML":"mặt sau, chữ MiloShopHand"} — Milo Design`,color:null,position:-30+index,view,crop:view==="front"?"left":"right"});
      for(const entry of entries){
        const color=product.variants.find(v=>v.colorHex.toLowerCase()===entry.spin.colorHex.toLowerCase());if(!color)continue;
        for(const [index,view]of ["front","back"].entries()){
          const target=view==="front"?0:Math.floor(entry.spin.frameCount/2),atlas=entry.spin.atlases.find(a=>target>=a.firstFrame&&target<a.firstFrame+a.count)!;
          const url=view==="front"&&spec.image&&!entry.preferSpinFront&&entry.spin.colorHex.toLowerCase()===spec.colorHex.toLowerCase()?`${spec.image}?view=front`:`${atlas.src}&cols=${atlas.columns}&rows=${atlas.rows}&frame=${target-atlas.firstFrame}&ar=${atlas.width/atlas.columns/(atlas.height/atlas.rows)}`;
          desired.push({url,alt:`${product.name} — ${color.color}, ${view==="front"?"mặt trước, logo ML":"mặt sau, logo hoa MiloShopHand"} — Milo Design`,color:color.color,position:-30+desired.length,view,crop:url.startsWith("/collection-ai/")?"left":null});
        }
      }
    }else{
      // The older sample catalog originally used these scalable illustrations.
      const colors=[...new Map(product.variants.map(v=>[v.color,v])).values()];
      for(const [index,color]of colors.entries()){
        const original=`/products/${product.slug}-${index}.svg`;
        if(existsSync(resolve(root,"apps/web/public",original.replace(/^\//,""))))desired.push({url:original,alt:`${product.name} — minh họa thiết kế gốc, ${color.color}`,color:color.color,position:-30+index,view:"front",crop:null});
      }
    }
    if(!desired.length)continue;
    const metadata={...current,mediaPresentation:"photo",renderedMedia:false,photoSpins,photoReferenceColorHex:spec?.colorHex||product.variants[0]?.colorHex,
      frontUrl:desired[0].url,backUrl:desired.find(i=>i.view==="back")?.url||null};
    const changed=desired.filter(d=>{const image=product.images.find(i=>i.url===d.url);return !image||!Object.entries(d).every(([k,v])=>(image as any)[k]===v);});
    const keep=desired.map(d=>d.url);
    const removed=product.images.filter(i=>(["/collection-v2/","/collection-legacy/","/collection-ai/","/collection-spin/"].some(prefix=>i.url.startsWith(prefix))||[0,1].some(index=>i.url===`/products/${product.slug}-${index}.svg`))&&!keep.includes(i.url));
    if(!isDeepStrictEqual(current,metadata)||changed.length||removed.length)await db.$transaction(async tx=>{
      if(!isDeepStrictEqual(current,metadata))await tx.product.update({where:{id:product.id},data:{design:metadata}});
      for(const data of changed){const old=product.images.find(i=>i.url===data.url);if(old)await tx.productImage.update({where:{id:old.id},data});else await tx.productImage.create({data:{productId:product.id,...data}});}
      if(removed.length)await tx.productImage.deleteMany({where:{id:{in:removed.map(i=>i.id)}}});
    });
    restored++;
  }
  console.log(`Original photo presentation: ${restored} products; ${spins.length} verified colour-specific photo spins. Prices, variants and stock unchanged.`);
}
if(process.argv[1]?.replaceAll("\\","/").endsWith("/prisma/photo-presentation.ts")){
  const db=new PrismaClient();applyPhotoPresentation(db).catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>db.$disconnect());
}
