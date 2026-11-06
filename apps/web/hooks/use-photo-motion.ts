"use client";
import {useEffect,useRef,useState} from "react";
import {damp} from "three/src/math/MathUtils.js";
import {normalizedFrame} from "../lib/photo-spin";

// Three.js exponential damping, only while a pointer/key changes the target.
// No permanent render loop, and no added movement under reduced motion.
export function usePhotoMotion(target:number,count:number,enabled:boolean){
  const [display,setDisplay]=useState(target),[reduced,setReduced]=useState(false);
  const position=useRef(target);
  useEffect(()=>{const media=matchMedia("(prefers-reduced-motion: reduce)");const update=()=>setReduced(media.matches);update();media.addEventListener("change",update);return()=>media.removeEventListener("change",update);},[]);
  useEffect(()=>{
    if(!enabled||reduced){position.current=target;setDisplay(target);return;}
    let frame=0,last=performance.now();
    const difference=normalizedFrame(target-position.current+count/2,count)-count/2;
    const goal=position.current+difference;
    const tick=(now:number)=>{
      if(document.hidden)return;
      const dt=Math.min(.05,(now-last)/1000);last=now;
      position.current=damp(position.current,goal,20,dt);
      if(Math.abs(position.current-goal)<.008){position.current=goal;setDisplay(normalizedFrame(target,count));return;}
      setDisplay(normalizedFrame(position.current,count));frame=requestAnimationFrame(tick);
    };
    const visibility=()=>{cancelAnimationFrame(frame);if(!document.hidden){last=performance.now();frame=requestAnimationFrame(tick);}};
    document.addEventListener("visibilitychange",visibility);frame=requestAnimationFrame(tick);
    return()=>{cancelAnimationFrame(frame);document.removeEventListener("visibilitychange",visibility);};
  },[target,count,enabled,reduced]);
  return !enabled||reduced?target:display;
}
