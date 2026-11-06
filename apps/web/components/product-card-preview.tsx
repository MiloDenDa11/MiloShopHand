"use client";
import {useEffect,useId,useRef,useState,type ReactNode,type PointerEvent} from "react";
import Link from "next/link";
import {normalizedFrame,type PhotoSpin} from "../lib/photo-spin";
import {PhotoSpinFrame,photoSpinImageSource} from "./photo-spin-frame";
import {usePhotoMotion} from "../hooks/use-photo-motion";

export function ProductCardPreview({href,name,spin,children}:{href:string;name:string;spin:PhotoSpin|null;children:ReactNode}) {
  const link=useRef<HTMLAnchorElement>(null),hint=useId();
  const [active,setActive]=useState(false),[frame,setFrame]=useState(0),[attempt,setAttempt]=useState(0);
  const [status,setStatus]=useState<"idle"|"loading"|"ready"|"error">("idle");
  const [bounds,setBounds]=useState({width:320,height:400});
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const suppressClickUntil=useRef(0);
  const gesture=useRef<{id:number;x:number;y:number;frame:number;horizontal:boolean}|null>(null);
  const displayFrame=usePhotoMotion(frame,spin?.frameCount||24,active&&status==="ready");
  function cancelIntent(){if(timer.current){clearTimeout(timer.current);timer.current=null;}}
  function activate(){setActive(true);if(status==="idle"||status==="error")setAttempt(n=>n+1);}
  function mouseFrame(event:PointerEvent<HTMLAnchorElement>){
    if(!spin)return;
    const box=event.currentTarget.getBoundingClientRect();
    const ratio=Math.max(0,Math.min(.999999,(event.clientX-box.left)/box.width));
    setFrame(Math.floor(ratio*spin.frameCount));
  }
  useEffect(()=>()=>cancelIntent(),[]);
  useEffect(()=>{
    if(!spin||!attempt||status==="ready")return;
    let live=true;const images:HTMLImageElement[]=[];setStatus("loading");
    Promise.all(spin.atlases.map(atlas=>new Promise<void>((resolve,reject)=>{
      const image=new Image();images.push(image);image.onload=()=>resolve();image.onerror=()=>reject(new Error("image-unavailable"));image.src=photoSpinImageSource(atlas.src);
    }))).then(()=>{if(live)setStatus("ready");}).catch(()=>{if(live)setStatus("error");});
    return()=>{live=false;for(const image of images){image.onload=null;image.onerror=null;}};
    // A colour change remounts this component. Retry only on a new intent.
  },[attempt,spin]);
  useEffect(()=>{
    const element=link.current;if(!active||!element)return;
    const resize=new ResizeObserver(([entry])=>setBounds({width:entry.contentRect.width,height:entry.contentRect.height}));resize.observe(element);
    const visibility=new IntersectionObserver(([entry])=>{if(!entry.isIntersecting){cancelIntent();setActive(false);gesture.current=null;}});visibility.observe(element);
    return()=>{resize.disconnect();visibility.disconnect();};
  },[active]);
  return <Link ref={link} href={href} className="product-card-preview" aria-label={`Xem ${name}`} aria-describedby={spin?hint:undefined} data-card-spin={!!spin} data-spin-status={status} data-spin-active={active&&status==="ready"} data-frame={Math.floor(displayFrame)} data-target-frame={frame} data-axis={spin?"y":undefined}
    onPointerEnter={spin?event=>{if(event.pointerType==="touch")return;mouseFrame(event);cancelIntent();timer.current=setTimeout(activate,120);}:undefined}
    onPointerLeave={spin?event=>{if(event.pointerType==="touch"||gesture.current)return;cancelIntent();setActive(false);setFrame(0);}:undefined}
    onFocus={spin?activate:undefined} onBlur={()=>{cancelIntent();setActive(false);setFrame(0);}}
    onPointerDown={spin?event=>{if(event.pointerType==="mouse")return;cancelIntent();gesture.current={id:event.pointerId,x:event.clientX,y:event.clientY,frame,horizontal:false};activate();}:undefined}
    onPointerMove={spin?event=>{
      if(event.pointerType==="mouse"){mouseFrame(event);return;}
      const current=gesture.current;if(!current||current.id!==event.pointerId)return;
      const dx=event.clientX-current.x,dy=event.clientY-current.y;
      if(!current.horizontal&&Math.abs(dx)>8&&Math.abs(dx)>Math.abs(dy)){current.horizontal=true;event.currentTarget.setPointerCapture(event.pointerId);}
      if(!current.horizontal)return;
      suppressClickUntil.current=Date.now()+500;
      setFrame(normalizedFrame(current.frame-Math.round(dx/event.currentTarget.clientWidth*spin.frameCount),spin.frameCount));
    }:undefined}
    onPointerUp={event=>{if(gesture.current?.horizontal)suppressClickUntil.current=Date.now()+500;gesture.current=null;if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);}}
    onPointerCancel={()=>{gesture.current=null;setActive(false);cancelIntent();}}
    onClickCapture={event=>{if(Date.now()<suppressClickUntil.current){event.preventDefault();event.stopPropagation();}}}
    onKeyDown={spin?event=>{if(!["ArrowLeft","ArrowRight","Home"].includes(event.key))return;event.preventDefault();activate();setFrame(current=>event.key==="Home"?0:normalizedFrame(current+(event.key==="ArrowRight"?1:-1),spin.frameCount));}:undefined}>
    <div className="product-card-static" aria-hidden={active&&status==="ready"?true:undefined}>{children}</div>
    {spin&&active&&status==="ready"&&<div className="product-card-spin-stage"><PhotoSpinFrame spin={spin} frame={displayFrame} bounds={bounds} name={name}/></div>}
    <span className="product-card-spin-hint" role={active&&status!=="ready"?"status":undefined}>{spin?(active&&status==="loading"?"Đang tải ảnh xoay…":active&&status==="error"?"Chưa tải được · Rê chuột lại để thử":"360° · Di chuột / vuốt ngang") : "Ảnh xoay đang cập nhật"}</span>
    {spin&&<span id={hint} className="sr-only">Di chuột ngang hoặc vuốt để xoay áo. Dùng phím mũi tên trái/phải để xoay, Home để xem trước, Enter để mở chi tiết.</span>}
  </Link>;
}
