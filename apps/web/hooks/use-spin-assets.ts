"use client";
import {useEffect,useState} from "react";
import type {DisplaySpin} from "../lib/display-spin";
import {preparedSpinSource} from "../lib/prepared-media";

type Assets={status:"idle"|"loading"|"ready"|"error";sources:Record<string,string>};
export const spinImageSource=(src:string,profile:"card"|"detail"="detail")=>preparedSpinSource(src,profile)||`/_next/image?url=${encodeURIComponent(src)}&w=1920&q=75`;
function imageAt(src:string){return new Promise<void>((resolve,reject)=>{const image=new Image();image.onload=()=>resolve();image.onerror=()=>reject(new Error("spin-image-unavailable"));image.src=src;});}
export function useSpinAssets(spin:DisplaySpin|null,profile:"card"|"detail",attempt:number):Assets {
  const [loaded,setLoaded]=useState<{spin:DisplaySpin|null;profile:string;attempt:number;assets:Assets}>({spin:null,profile,attempt:0,assets:{status:"idle",sources:{}}});
  const assets=loaded.spin===spin&&loaded.profile===profile&&loaded.attempt===attempt?loaded.assets:{status:(!spin||!attempt?"idle":"loading") as Assets["status"],sources:{}};
  useEffect(()=>{
    if(!spin||!attempt)return;
    let live=true;
    const update=(assets:Assets)=>{if(live)setLoaded({spin,profile,attempt,assets});};
    update({status:"loading",sources:{}});
    Promise.all(spin.atlases.map(async atlas=>{const src=spinImageSource(atlas.src,profile);await imageAt(src);return [atlas.src,src];}))
      .then(pairs=>update({status:"ready",sources:Object.fromEntries(pairs)}))
      .catch(()=>update({status:"error",sources:{}}));
    // Ignore late loads after switching colour or closing the viewer.
    return()=>{live=false;};
  },[spin,profile,attempt]);
  return assets;
}
