import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {displaySpinFor} from "../apps/web/lib/display-spin";
import {garmentPhotoMask} from "../apps/web/lib/garment-photo-mask";
const [{spin}]=JSON.parse(readFileSync("apps/web/content/photo-spins.json","utf8"));
const product=()=>({design:{managedBy:"milo-collection-v1",mediaPresentation:"photo",photoReferenceColorHex:spin.colorHex,photoSpins:{[spin.colorHex.toLowerCase()]:spin}},variants:[{colorHex:spin.colorHex,active:true},{colorHex:"#722f37",active:true}]});
test("thin atlas dividers do not turn the entire paper cell into cloth",()=>{
  const width=100,height=120,data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const paper=[240,234,226],cloth=[195,180,154],divider=[255,255,255];
    const colour=x<2||y<2||x>=width-2||y>=height-2?divider:x>=30&&x<70&&y>=12&&y<108?cloth:paper;
    data.set([...colour,255],(y*width+x)*4);
  }
  const mask=garmentPhotoMask(data,width,height,"#dbd2bf");
  assert(mask.coverage>.2&&mask.coverage<.5);
  assert.equal(mask.pixels[(5*width+5)*4],0);
  assert(mask.pixels[(70*width+50)*4]>200);
});
test("contrast stripes keep the same ink across chest and hem",()=>{
  const width=100,height=120,data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const body=x>=20&&x<80&&y>=10&&y<110,stripe=y%16<4;
    data.set([...(body?(stripe?[25,28,23]:[218,208,186]):[250,246,238]),255],(y*width+x)*4);
  }
  const mask=garmentPhotoMask(data,width,height,"#dad0ba",false,true);
  for(const y of [32,64,96])assert.equal(mask.pixels[(y*width+50)*4+1],255);
  for(const y of [40,72,104])assert.equal(mask.pixels[(y*width+50)*4+1],0);
});
test("contrast sleeves keep their material identity when they dominate a side view",()=>{
  const width=100,height=120;
  for(const bodyShare of [.75,.25]){
    const data=new Uint8ClampedArray(width*height*4),split=20+Math.round(60*bodyShare);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const body=x>=20&&x<80&&y>=10&&y<110;
      data.set([...(body?(x<split?[182,164,212]:[232,223,205]):[250,246,238]),255],(y*width+x)*4);
    }
    const mask=garmentPhotoMask(data,width,height,"#b6a4d4",false,true,"#e8dfcd");
    assert(mask.pixels[(70*width+22)*4+1]<10,"purple body keeps the selected body colour");
    assert(mask.pixels[(70*width+78)*4+1]>245,"cream sleeve keeps its contrast across views");
  }
});
test("dark lettering stays separate from light sleeves and neutral fabric folds",()=>{
  const width=100,height=120,data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const body=x>=20&&x<80&&y>=10&&y<110,letter=x>=55&&x<60&&y>=35&&y<40,fold=x>=45&&x<60&&y>=70&&y<80;
    const rgb=!body?[250,246,238]:letter?[25,28,23]:fold?[90,90,90]:x<35?[232,223,205]:[182,164,212];
    data.set([...rgb,255],(y*width+x)*4);
  }
  const mask=garmentPhotoMask(data,width,height,"#b6a4d4",false,true,"#e8dfcd");
  assert.equal(mask.pixels[(37*width+57)*4+2],255);
  assert.equal(mask.pixels[(75*width+50)*4+1],0);
  assert(mask.pixels[(70*width+25)*4+1]>245);
});
test("only the selected native colour set is displayed; missing colours are never tinted",()=>{
  const p=product();assert.equal(displaySpinFor(p,spin.colorHex),spin);
  assert.equal(displaySpinFor(p,"#722F37"),null);
  const native={...spin,colorHex:"#722f37"};p.design.photoSpins["#722f37"]=native;
  assert.equal(displaySpinFor(p,"#722F37"),native);
  assert.equal((native as any).colorPreview,undefined);
});
test("missing and incomplete native colour sets cannot borrow the reference colour",()=>{
  assert.equal(displaySpinFor(product()),null);
  assert.equal(displaySpinFor(product(),"red"),null);
  assert.equal(displaySpinFor(product(),"#ffffff"),null);
  const inactive=product();inactive.variants[1].active=false;assert.equal(displaySpinFor(inactive,"#722f37"),null);
  const unmanaged=product();unmanaged.design.managedBy="merchant";assert.equal(displaySpinFor(unmanaged,"#722f37"),null);
  const missing=product();missing.design.photoReferenceColorHex="#111111";assert.equal(displaySpinFor(missing,"#722f37"),null);
  const incomplete=product();incomplete.design.photoSpins={[spin.colorHex.toLowerCase()]:{...spin,atlases:spin.atlases.slice(0,3)}};assert.equal(displaySpinFor(incomplete,"#722f37"),null);
});
