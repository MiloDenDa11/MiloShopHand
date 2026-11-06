"use client";
import {useEffect,useRef,useState} from "react";
import * as THREE from "three";
import {garmentPhotoMask,paintGarmentFallback,srgbToLinear} from "../lib/garment-photo-mask";

type Media={src:string;view:string|null;atlas?:{columns:number;rows:number;frame:number;aspect:number}};
export default function ColorPhoto({media,preview,name}:{media:Media;preview:{targetHex:string;sourceHex:string};name:string}){
  const host=useRef<HTMLSpanElement>(null);
  const [visible,setVisible]=useState(false),[state,setState]=useState("loading"),[engine,setEngine]=useState("");
  useEffect(()=>{const el=host.current;if(!el)return;const observer=new IntersectionObserver(([entry])=>setVisible(entry.isIntersecting));observer.observe(el);return()=>observer.disconnect();},[]);
  useEffect(()=>{
    const current=host.current;if(!current||!visible)return;const el=current;
    let disposed=false,animation=0,renderer:THREE.WebGLRenderer|undefined,resize:ResizeObserver|undefined;
    let geometry:THREE.PlaneGeometry|undefined,material:THREE.ShaderMaterial|undefined,texture:THREE.Texture|undefined,maskTexture:THREE.DataTexture|undefined;
    setState("loading");
    const image=new Image();image.crossOrigin="anonymous";
    const reduced=matchMedia("(prefers-reduced-motion: reduce)");
    async function load(){
      try{
        image.src=/\.svg(?:[?#]|$)/i.test(media.src)||!media.src.startsWith("/")?media.src:`/_next/image?url=${encodeURIComponent(media.src)}&w=1920&q=75`;
        await image.decode();if(disposed)return;
        let columns=1,rows=1,column=0,row=0;
        if(media.view){columns=2;column=media.view==="back"?1:0;}
        if(media.atlas){columns=media.atlas.columns;rows=media.atlas.rows;column=media.atlas.frame%columns;row=Math.floor(media.atlas.frame/columns);}
        const sw=image.naturalWidth/columns,sh=image.naturalHeight/rows,scale=Math.min(1,640/sw,800/sh);
        const crop=document.createElement("canvas");crop.width=Math.max(8,Math.round(sw*scale));crop.height=Math.max(8,Math.round(sh*scale));
        const context=crop.getContext("2d",{willReadFrequently:true});if(!context)throw new Error("canvas-unavailable");
        context.drawImage(image,column*sw,row*sh,sw,sh,0,0,crop.width,crop.height);
        const pixels=context.getImageData(0,0,crop.width,crop.height);
        const back=media.view==="back"||/part-2\.png|-[1]\.svg/.test(media.src);
        const mask=garmentPhotoMask(pixels.data,crop.width,crop.height,preview.sourceHex,back);
        if(mask.coverage<.025||mask.coverage>.92)throw new Error("mask-unavailable");
        const fallback=()=>{
          context.putImageData(paintGarmentFallback(pixels,mask,preview.targetHex),0,0);
          crop.setAttribute("role","img");crop.setAttribute("aria-label",name);el.appendChild(crop);setEngine("canvas-fallback");setState("ready");
        };
        // Tiny cart/thumbnail images use one static pass; large previews use Three.js.
        if(el.clientWidth<=100){fallback();return;}
        try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:"low-power"});}catch{fallback();return;}
        renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.setClearColor(0xfaf9f5,1);
        renderer.domElement.setAttribute("role","img");renderer.domElement.setAttribute("aria-label",name);el.appendChild(renderer.domElement);
        texture=new THREE.CanvasTexture(crop);texture.colorSpace=THREE.SRGBColorSpace;
        maskTexture=new THREE.DataTexture(mask.pixels,crop.width,crop.height,THREE.RGBAFormat);maskTexture.flipY=true;maskTexture.needsUpdate=true;
        const sourceColor=new THREE.Color().setRGB(...mask.base.map(srgbToLinear) as [number,number,number]);
        const target=new THREE.Color(preview.targetHex),ink=target.r*.2126+target.g*.7152+target.b*.0722>.35?new THREE.Color("#23291e"):new THREE.Color("#f5eedf");
        const sourceLum=Math.max(.006,sourceColor.r*.2126+sourceColor.g*.7152+sourceColor.b*.0722);
        material=new THREE.ShaderMaterial({uniforms:{photo:{value:texture},maskMap:{value:maskTexture},dye:{value:sourceColor.clone()},ink:{value:ink},sourceLum:{value:sourceLum},progress:{value:0}},vertexShader:"varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}",fragmentShader:`uniform sampler2D photo;uniform sampler2D maskMap;uniform vec3 dye;uniform vec3 ink;uniform float sourceLum;uniform float progress;varying vec2 vUv;
          void main(){vec4 original=texture2D(photo,vUv);vec4 mask=texture2D(maskMap,vUv);float lum=dot(original.rgb,vec3(.2126,.7152,.0722));float ratio=clamp(lum/sourceLum,.06,2.8);float bright=step(.35,dot(dye,vec3(.2126,.7152,.0722)));float shade=mix(1.,.87,bright)+(ratio-1.)*mix(.55,.2,bright);vec3 cloth=min(vec3(1.),dye*shade+max(0.,ratio-1.)*.018*(1.-bright));vec3 colored=mix(cloth,ink,mask.g);gl_FragColor=vec4(mix(original.rgb,colored,mask.r*progress),1.);
          #include <colorspace_fragment>
          }`,toneMapped:false});
        geometry=new THREE.PlaneGeometry(1,1);const mesh=new THREE.Mesh(geometry,material),scene=new THREE.Scene();scene.add(mesh);
        const camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,10);camera.position.z=2;
        const fit=()=>{if(!renderer)return;const w=el.clientWidth,h=el.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.left=-w/2;camera.right=w/2;camera.top=h/2;camera.bottom=-h/2;camera.updateProjectionMatrix();const fitScale=Math.min(w/crop.width,h/crop.height);mesh.scale.set(crop.width*fitScale,crop.height*fitScale,1);renderer.render(scene,camera);};
        resize=new ResizeObserver(fit);resize.observe(el);fit();setEngine("three");setState("ready");
        let progress=reduced.matches?1:0,last=performance.now();
        const tick=(time:number)=>{
          if(disposed||document.hidden)return;const dt=Math.min(.05,(time-last)/1000);last=time;
          progress=reduced.matches?1:THREE.MathUtils.damp(progress,1,12,dt);
          material!.uniforms.progress.value=progress;material!.uniforms.dye.value.copy(sourceColor).lerp(target,progress);renderer!.render(scene,camera);
          el.dataset.progress=progress.toFixed(3);if(progress<.998)animation=requestAnimationFrame(tick);else{material!.uniforms.progress.value=1;material!.uniforms.dye.value.copy(target);renderer!.render(scene,camera);el.dataset.progress="1";}
        };
        const resume=()=>{if(!document.hidden&&progress<.998){last=performance.now();animation=requestAnimationFrame(tick);}};
        document.addEventListener("visibilitychange",resume);visibilityCleanup=()=>document.removeEventListener("visibilitychange",resume);
        animation=requestAnimationFrame(tick);
      }catch{if(!disposed)setState("error");}
    }
    let visibilityCleanup=()=>{};void load();
    return()=>{disposed=true;cancelAnimationFrame(animation);resize?.disconnect();visibilityCleanup();texture?.dispose();maskTexture?.dispose();material?.dispose();geometry?.dispose();renderer?.dispose();renderer?.forceContextLoss();el.replaceChildren();};
  },[visible,media.src,media.view,preview.targetHex,preview.sourceHex]);
  return <span ref={host} className="color-photo-stage" data-state={state} data-color={preview.targetHex} data-engine={engine} aria-label={`Milo Design — phối màu ${preview.targetHex}`}>{state==="error"&&<span className="color-photo-error" role="status">Chưa tải được phối màu. Vui lòng chọn lại màu.</span>}</span>;
}
