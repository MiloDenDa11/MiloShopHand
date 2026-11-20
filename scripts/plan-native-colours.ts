import "dotenv/config";
import {PrismaClient} from "@prisma/client";
import {readFileSync,writeFileSync,mkdirSync,existsSync} from "node:fs";
import {resolve} from "node:path";
import {photoSpinFor,isPhotoSpin,type PhotoSpin} from "../apps/web/lib/photo-spin";
const db=new PrismaClient();
async function main(){
 const specs=[...JSON.parse(readFileSync("apps/web/content/collection-designs.json","utf8")),...JSON.parse(readFileSync("apps/web/content/legacy-photo-designs.json","utf8"))];
 const products=await db.product.findMany({where:{active:true},include:{variants:{where:{active:true}}},orderBy:{slug:"asc"}});
 const jobs:any[]=[],coverage:any[]=[];
 for(const product of products){
  const design=product.design as any,spec=specs.find(s=>s.slug===product.slug);
  const original=design?.photoSpins?.[design.photoReferenceColorHex?.toLowerCase()] as PhotoSpin;
  if(!isPhotoSpin(original)||!spec)throw new Error(`No reviewed source for ${product.slug}`);
  const colours=[...new Map(product.variants.map(v=>[v.colorHex.toLowerCase(),v])).values()];
  for(const colour of colours){
   const native=!!photoSpinFor(product,colour.colorHex);coverage.push({slug:product.slug,color:colour.color,colorHex:colour.colorHex,native});
   if(native)continue;
   const refs=original.atlases.map(a=>resolve("apps/web/public",a.src.split("?")[0].slice(1)));
   if(refs.some(ref=>!existsSync(ref)))throw new Error(`Missing source ${product.slug}`);
   const hex=colour.colorHex.toLowerCase(),colorKey=`native-${hex.slice(1)}-v1`;
   jobs.push({id:`${product.slug}--${hex.slice(1)}`,slug:product.slug,name:product.name,kind:design.kind,color:colour.color,colorHex:hex,colorKey,sourceHex:original.colorHex,referencePath:resolve("apps/web/public",(spec.image ?? original.atlases[0].src).split("?")[0].slice(1)),sourceAtlases:refs,geometry:design.geometry,material:product.material});
  }
 }
 const priority=(j:any)=>j.colorHex==="#722f37"&&j.kind==="tee"?(j.slug==="everyday-essential-tee"?0:j.slug==="airy-cotton-tee"?1:2):3;
 jobs.sort((a,b)=>priority(a)-priority(b)||a.slug.localeCompare(b.slug)||a.colorHex.localeCompare(b.colorHex));
 mkdirSync(".local/native-colours",{recursive:true});mkdirSync("docs/colour-assets",{recursive:true});
 writeFileSync(".local/native-colours/plan.json",JSON.stringify(jobs,null,2)+"\n");
 const report={at:new Date().toISOString(),products:products.length,colours:coverage.length,nativeColours:coverage.filter(c=>c.native).length,missingColours:jobs.length,remainingPNGAtlases:jobs.length*4,remainingViews:jobs.length*24,remaining:coverage.filter(c=>!c.native)};
 writeFileSync("docs/colour-assets/coverage.json",JSON.stringify(report,null,2)+"\n");
 console.log(JSON.stringify({...report,remaining:undefined,first:jobs.slice(0,5).map(j=>({id:j.id,color:j.color,source:j.sourceAtlases[0]}))},null,2));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>db.$disconnect());
