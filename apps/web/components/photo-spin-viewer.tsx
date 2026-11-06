"use client";
import {useEffect,useRef,useState} from "react";
import {RotateCcw,RotateCw,ZoomIn,ZoomOut,RefreshCw} from "lucide-react";
import {normalizedFrame,type PhotoSpin} from "../lib/photo-spin";
import {PhotoSpinFrame,photoSpinImageSource} from "./photo-spin-frame";
import {usePhotoMotion} from "../hooks/use-photo-motion";

export default function PhotoSpinViewer({spin,name,initialView="front"}:{spin:PhotoSpin;name:string;initialView?:string}) {
  const initial = initialView === "back" ? Math.floor(spin.frameCount/2) : 0;
  const [frame,setFrame]=useState(initial),[zoom,setZoom]=useState(1),[status,setStatus]=useState<"loading"|"ready"|"error">("loading"),[retry,setRetry]=useState(0);
  const [bounds,setBounds]=useState({width:320,height:400});
  const stage=useRef<HTMLDivElement>(null);
  const pointers=useRef(new Map<number,{x:number;y:number}>());
  const gesture=useRef({x:0,remainder:0,pinch:0});
  const displayFrame=usePhotoMotion(frame,spin.frameCount,status==="ready");
  useEffect(()=>{
    let active=true;const images:HTMLImageElement[]=[];setStatus("loading");
    Promise.all(spin.atlases.map(atlas=>new Promise<void>((resolve,reject)=>{
      const img=new Image();images.push(img);img.onload=()=>resolve();img.onerror=()=>reject(new Error("image-unavailable"));img.src=photoSpinImageSource(atlas.src);
    }))).then(()=>{if(active)setStatus("ready");}).catch(()=>{if(active)setStatus("error");});
    return()=>{active=false;for(const img of images){img.onload=null;img.onerror=null;}pointers.current.clear();};
  },[spin,retry]);
  useEffect(()=>{setFrame(f=>normalizedFrame(f,spin.frameCount));},[spin.frameCount]);
  useEffect(()=>{
    const element=stage.current;if(!element)return;
    const observer=new ResizeObserver(([entry])=>setBounds({width:entry.contentRect.width,height:entry.contentRect.height}));observer.observe(element);
    return()=>observer.disconnect();
  },[]);
  const turn=(step:number)=>setFrame(f=>normalizedFrame(f+step,spin.frameCount));
  const magnify=(scale:number)=>setZoom(z=>Math.max(1,Math.min(2.5,z*scale)));
  const reset=()=>{setFrame(initial);setZoom(1);};
  return <div className="garment-viewer photo-spin-viewer" data-viewer-status={status} data-renderer="photos" data-axis="y">
    <div className="garment-viewer-stage photo-spin-stage" ref={stage} data-frame={Math.floor(displayFrame)} data-target-frame={frame} data-angle={Math.round(displayFrame*360/spin.frameCount)} data-zoom={zoom} tabIndex={0} aria-label="Ảnh xoay quanh trục Oy" onKeyDown={event=>{
      if(!["ArrowLeft","ArrowRight","+","-","Home"].includes(event.key))return;event.preventDefault();
      if(status!=="ready")return;
      if(event.key==="ArrowLeft")turn(-1);if(event.key==="ArrowRight")turn(1);if(event.key==="+")magnify(1.2);if(event.key==="-")magnify(1/1.2);if(event.key==="Home")reset();
    }} onPointerDown={event=>{
      if(status!=="ready")return;
      event.currentTarget.setPointerCapture(event.pointerId);pointers.current.set(event.pointerId,{x:event.clientX,y:event.clientY});gesture.current.x=event.clientX;gesture.current.remainder=0;
      if(pointers.current.size===2){const [a,b]=[...pointers.current.values()];gesture.current.pinch=Math.hypot(a.x-b.x,a.y-b.y);}
    }} onPointerMove={event=>{
      if(!pointers.current.has(event.pointerId)||status!=="ready")return;
      pointers.current.set(event.pointerId,{x:event.clientX,y:event.clientY});
      if(pointers.current.size===2){const [a,b]=[...pointers.current.values()],distance=Math.hypot(a.x-b.x,a.y-b.y);if(gesture.current.pinch)magnify(distance/gesture.current.pinch);gesture.current.pinch=distance;return;}
      const travel=event.clientX-gesture.current.x+gesture.current.remainder,threshold=Math.max(8,bounds.width/spin.frameCount),steps=Math.trunc(travel/threshold);
      if(steps)turn(-steps);gesture.current.remainder=travel-steps*threshold;gesture.current.x=event.clientX;
    }} onPointerUp={event=>{pointers.current.delete(event.pointerId);gesture.current.pinch=0;const remaining=[...pointers.current.values()][0];if(remaining)gesture.current.x=remaining.x;}} onPointerCancel={()=>{pointers.current.clear();gesture.current.pinch=0;}}>
      {status==="ready"&&<PhotoSpinFrame spin={spin} frame={displayFrame} bounds={bounds} zoom={zoom} name={name}/>}
    </div>
    {status==="loading"&&<p className="garment-viewer-message" role="status">Đang tải bộ ảnh {spin.frameCount} góc…</p>}
    {status==="error"&&<div className="garment-viewer-message" role="status"><p>Chưa tải được bộ ảnh. Bạn vẫn có thể xem ảnh trước/sau trong thư viện.</p><button className="text-link" onClick={()=>setRetry(n=>n+1)}>Thử lại</button></div>}
    <div className="garment-viewer-controls" role="group" aria-label="Điều khiển ảnh xoay">
      <button disabled={status!=="ready"} onClick={()=>turn(-1)} aria-label="Xoay sang trái"><RotateCcw size={18}/></button>
      <button disabled={status!=="ready"} onClick={()=>setFrame(0)}>Mặt trước</button>
      <button disabled={status!=="ready"} onClick={()=>setFrame(Math.floor(spin.frameCount/2))}>Mặt sau</button>
      <button disabled={status!=="ready"} onClick={()=>turn(1)} aria-label="Xoay sang phải"><RotateCw size={18}/></button>
      <button disabled={status!=="ready"} onClick={()=>magnify(1.2)} aria-label="Phóng to ảnh"><ZoomIn size={18}/></button>
      <button disabled={status!=="ready"} onClick={()=>magnify(1/1.2)} aria-label="Thu nhỏ ảnh"><ZoomOut size={18}/></button>
      <button disabled={status!=="ready"} onClick={reset} aria-label="Đặt lại góc nhìn"><RefreshCw size={18}/></button>
    </div>
    <p className="garment-viewer-hint">Kéo ngang hoặc vuốt để xoay · {frame+1}/{spin.frameCount} góc ảnh · Áo luôn thẳng đứng</p>
    <p className="garment-viewer-disclosure">Milo Design · Bộ ảnh xem trước thiết kế.</p>
  </div>;
}
