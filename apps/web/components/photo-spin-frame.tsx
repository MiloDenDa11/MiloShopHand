import {spinFrame,type PhotoSpin} from "../lib/photo-spin";
import "../app/photo-spin-frame.css";

// Uniformly aligned adjacent photos blend while Three.js damping settles.
export function PhotoSpinFrame({spin,frame,bounds,zoom=1,name}:{spin:PhotoSpin;frame:number;bounds:{width:number;height:number};zoom?:number;name:string}) {
  const first=Math.floor(frame),mix=frame-first;
  const width=Math.min(bounds.width,bounds.height*.8),height=width/.8;
  const widest=Math.max(...spin.atlases.flatMap(a=>a.frames?.map(b=>b.width/b.height)||[.9]));
  function layer(index:number,blend:boolean){
  const {atlas,column,row,bounds:garment}=spinFrame(spin,index);
  const cellWidth=atlas.width/atlas.columns,cellHeight=atlas.height/atlas.rows;
  const box=garment||{x:cellWidth*.06,y:cellHeight*.05,width:cellWidth*.88,height:cellHeight*.9};
  const garmentHeight=Math.min(height*.88,width*.94/widest),scale=garmentHeight/box.height;
  const left=width/2-(box.x+box.width/2)*scale,top=(height+garmentHeight)/2-(box.y+box.height)*scale;
  const inset=(atlas.inset||2)*scale,padding=Math.max(4,Math.min(cellWidth,cellHeight)*.015);
  const cropLeft=Math.max(inset,(box.x-padding)*scale),cropTop=Math.max(inset,(box.y-padding)*scale);
  const cropRight=Math.max(inset,(cellWidth-box.x-box.width-padding)*scale),cropBottom=Math.max(inset,(cellHeight-box.y-box.height-padding)*scale);
  return <div className="photo-spin-placement" aria-hidden={blend?true:undefined} style={{left,top,width:cellWidth*scale,height:cellHeight*scale,opacity:blend?mix:1}}><div className="photo-spin-crop" style={{left:cropLeft,top:cropTop,right:cropRight,bottom:cropBottom}}><div className={blend?"photo-spin-blend-sheet":"photo-spin-sheet"} style={{width:atlas.width*scale,height:atlas.height*scale,left:-column*cellWidth*scale-cropLeft,top:-row*cellHeight*scale-cropTop,backgroundImage:`url("${photoSpinImageSource(atlas.src)}")`}}/></div></div>;
  }
  return <div className="photo-spin-frame" role="img" aria-label={`${name} — góc ảnh ${first+1}/${spin.frameCount}`} style={{width,height,transform:`scale(${zoom})`}}>{layer(first,false)}{mix>.001&&layer((first+1)%spin.frameCount,true)}</div>;
}

export const photoSpinImageSource=(src:string)=>`/_next/image?url=${encodeURIComponent(src)}&w=1920&q=75`;
