import { test } from "node:test";
import assert from "node:assert/strict";
import { isRealPhoto, productPhotoSource, realProductImages, productImagesForColor } from "../apps/web/components/product-media";
import { designPhotoUrl } from "../packages/shared/src/design-photo";
import { miloDesignText } from "../apps/web/lib/milo-design";
import { garmentPhotoMask } from "../apps/web/lib/garment-photo-mask";

test("catalog displays valid illustrations and AI mockups without allowing executable URLs", () => {
  assert.equal(isRealPhoto({ url: "/products/tee.svg", alt: "Minh họa thiết kế" }), true);
  assert.equal(isRealPhoto({ url: "/collection-ai/tee.webp?view=front", alt: "Thiết kế / mockup AI" }), true);
  for (const url of ["javascript:alert(1)", "data:text/html,hello", "//external.test/photo.png", "http://external.test/photo.png"]) assert.equal(isRealPhoto(url), false);
  assert.equal(realProductImages({ images: [{ url: "/products/tee.svg" }, { url: "javascript:alert(1)" }] }).length, 1);
});

test("gallery, cart and order thumbnails crop one atlas cell and preserve cache identity",()=>{
  assert.deepEqual(productPhotoSource("/collection-spin/tee/black/part-2.png?v=abcdef&cols=3&rows=2&frame=0&ar=0.8"),{
    src:"/collection-spin/tee/black/part-2.png?v=abcdef",view:null,atlas:{columns:3,rows:2,frame:0,aspect:.8},
  });
  for(const query of ["cols=0&rows=2&frame=0&ar=.8","cols=3&rows=2&frame=6&ar=.8","cols=3&rows=2&frame=-1&ar=.8"]){
    assert.equal(productPhotoSource(`/collection-spin/tee/part-0.png?${query}`).atlas,undefined);
  }
});

test("exact colour images take priority over generic references without mixing colours",()=>{
  const black={url:"/collection-spin/tee/black/part-0.png",color:"Đen"};
  const white={url:"/collection-ai/tee.png?view=front",color:"Trắng"};
  const generic={url:"/collection-ai/tee.png?view=back",color:null};
  assert.deepEqual(productImagesForColor({images:[generic,white,black]},"Đen"),[black]);
  assert.deepEqual(productImagesForColor({images:[generic,white,black]},"Đỏ mận"),[generic]);
  assert.deepEqual(productImagesForColor({images:[white,black]},"Đỏ mận"),[white]);
});

test("front and back plate views share a source URL while preserving view identity", () => {
  assert.deepEqual(productPhotoSource("/collection-ai/tee.webp"), { src: "/collection-ai/tee.webp", view: "front" });
  assert.deepEqual(productPhotoSource("/collection-ai/tee.webp?view=front"), { src: "/collection-ai/tee.webp", view: "front" });
  assert.deepEqual(productPhotoSource("/collection-ai/tee.webp?view=back"), { src: "/collection-ai/tee.webp", view: "back" });
  assert.deepEqual(productPhotoSource("/collection-ai/tee.webp?view=front&v=2"), { src: "/collection-ai/tee.webp?v=2", view: "front" });
  assert.deepEqual(productPhotoSource("https://assets.example.test/product.webp?signature=keep"), { src: "https://assets.example.test/product.webp?signature=keep", view: null });
});

test("missing colour photos carry a reversible display recipe, exact photos retain identity",()=>{
  const image={url:"/collection-ai/tee.png?view=back&v=ab12",color:"Kem"};
  const design={mediaPresentation:"photo",photoReferenceColorHex:"#eee7d7"};
  const url=designPhotoUrl(image,{color:"Đỏ mận",colorHex:"#722f37"},design);
  const parsed=productPhotoSource(url);
  assert.equal(parsed.src,"/collection-ai/tee.png?v=ab12");assert.equal(parsed.view,"back");
  assert.deepEqual(parsed.colorPreview,{sourceHex:"#eee7d7",targetHex:"#722f37"});
  assert.equal(designPhotoUrl(image,{color:"Kem",colorHex:"#eee7d7"},design),image.url);
  assert.equal(designPhotoUrl({...image,url:"https://example.test/photo.png"},{color:"Đỏ",colorHex:"#722f37"},design),"https://example.test/photo.png");
  assert.equal(productPhotoSource("/collection-ai/tee.png?miloColor=javascript&baseColor=eeeeee").colorPreview,undefined);
  const displayed=productImagesForColor({name:"Milo",design,images:[{...image,alt:"Milo — Kem"}],variants:[{color:"Đỏ mận",colorHex:"#722f37"}]},"Đỏ mận")[0];
  assert.equal(displayed.color,"Đỏ mận");assert.equal(displayed.alt,"Milo — Đỏ mận");
});

test("runtime mask keeps the paper background unchanged and separates contrast embroidery",()=>{
  const width=80,height=100,pixels=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*4;const body=x>15&&x<65&&y>12&&y<90;const logo=x>50&&x<56&&y>29&&y<37,piping=x>=60&&x<=62&&y>12&&y<85;const rgb=logo||piping?[240,235,221]:body?[69,79,58]:[249,246,239];pixels.set([...rgb,255],i);}
  const mask=garmentPhotoMask(pixels,width,height,"#454f3a");
  assert(mask.coverage>.4&&mask.coverage<.6);assert.equal(mask.pixels[(5*width+5)*4],0);
  assert(mask.pixels[(60*width+40)*4]>200);assert.equal(mask.pixels[(33*width+53)*4+1],255);
  assert.equal(mask.pixels[(30*width+61)*4+1],0,"contrast piping must not turn into a logo-colour stripe");
});

test("Milo Design replaces visible attribution without changing Vietnamese pronouns",()=>{
  assert.equal(miloDesignText("Thiết kế / mockup AI"),"Milo Design");
  assert.equal(miloDesignText("ML Atelier — thiết kế AI"),"Milo Design");
  assert.equal(miloDesignText("Thiết kế mockup AI MiloShopHand: Cotton"),"Milo Design: Cotton");
  assert.equal(miloDesignText("Không cần giống ai."),"Không cần giống ai.");
});
