// Runtime display mask only; original product assets are never rewritten.
export type GarmentMask={pixels:Uint8Array;base:[number,number,number];coverage:number};
const luma=(r:number,g:number,b:number)=>r*.2126+g*.7152+b*.0722;
export function garmentPhotoMask(data:Uint8ClampedArray,width:number,height:number,sourceHex:string,back=false,patterned=false,contrastHex?:string):GarmentMask {
  const size=width*height,background=new Uint8Array(size),queue=new Int32Array(size);
  const sample=(x:number,y:number)=>{const i=(y*width+x)*4;return [data[i],data[i+1],data[i+2]];};
  // Atlas cell edges may contain a thin white divider. Sample and seed just
  // inside it; otherwise the divider can block every flood-fill seed.
  const edge=Math.max(1,Math.min(Math.floor(Math.min(width,height)/8),Math.max(3,Math.round(Math.min(width,height)*.012))));
  const corners=[sample(edge,edge),sample(width-edge-1,edge),sample(edge,height-edge-1),sample(width-edge-1,height-edge-1)];
  const baseHex=[1,3,5].map(i=>parseInt(sourceHex.slice(i,i+2),16));
  const tolerance=luma(baseHex[0],baseHex[1],baseHex[2])>190?9:20;
  function isBackground(index:number){
    const x=index%width/(width-1),y=Math.floor(index/width)/(height-1),p=index*4;
    if(data[p+3]<15)return true;
    let distance=0;
    for(let c=0;c<3;c++){const expected=(corners[0][c]*(1-x)+corners[1][c]*x)*(1-y)+(corners[2][c]*(1-x)+corners[3][c]*x)*y;distance+=(data[p+c]-expected)**2;}
    return distance<tolerance*tolerance;
  }
  let head=0,tail=0;
  const addBackground=(i:number)=>{if(i>=0&&i<size&&!background[i]&&isBackground(i)){background[i]=1;queue[tail++]=i;}};
  for(let x=0;x<width;x++){addBackground(x);addBackground((height-1)*width+x);}
  for(let y=1;y<height-1;y++){addBackground(y*width);addBackground(y*width+width-1);}
  for(let x=edge;x<width-edge;x++){addBackground(edge*width+x);addBackground((height-edge-1)*width+x);}
  for(let y=edge;y<height-edge;y++){addBackground(y*width+edge);addBackground(y*width+width-edge-1);}
  while(head<tail){const i=queue[head++],x=i%width;addBackground(i-width);addBackground(i+width);if(x)addBackground(i-1);if(x<width-1)addBackground(i+1);}
  const visited=new Uint8Array(size);let best:number[]=[];
  // A garment is the connected foreground at the body, not floor shadows.
  for(const [x,y]of [[.47,.56],[.53,.56],[.5,.7],[.4,.5]]){
    const seed=Math.floor(y*height)*width+Math.floor(x*width);if(background[seed]||visited[seed])continue;
    const component:number[]=[];head=0;tail=0;queue[tail++]=seed;visited[seed]=1;
    while(head<tail){const i=queue[head++],px=i%width;component.push(i);for(const n of [i-width,i+width,...(px?[i-1]:[]),...(px<width-1?[i+1]:[])])if(n>=0&&n<size&&!background[n]&&!visited[n]){visited[n]=1;queue[tail++]=n;}}
    if(component.length>best.length)best=component;
  }
  const body=new Uint8Array(size);for(const i of best)body[i]=1;
  const samples:[number[],number[],number[]]=[[],[],[]];
  for(let y=Math.floor(height*.47);y<height*.72;y+=3)for(let x=Math.floor(width*.35);x<width*.65;x+=3){const i=y*width+x;if(body[i])for(let c=0;c<3;c++)samples[c].push(data[i*4+c]);}
  // The dominant material can change from body to contrast sleeve in profile.
  // A patterned design must keep one source palette across every viewpoint.
  const base=(patterned?baseHex.map(v=>v/255):samples.map((values,c)=>values.length?values.sort((a,b)=>a-b)[Math.floor(values.length/2)]/255:baseHex[c]/255)) as [number,number,number];
  const baseLum=luma(...base),pixels=new Uint8Array(size*4);
  const accent=(contrastHex?[1,3,5].map(i=>parseInt(contrastHex.slice(i,i+2),16)/255):baseLum>.5?[.14,.16,.12]:[.96,.93,.87]) as [number,number,number];
  const normalise=(rgb:number[])=>{const sum=Math.max(.001,rgb[0]+rgb[1]+rgb[2]);return rgb.map(v=>v/sum);};
  const baseChroma=normalise(base),accentChroma=normalise(accent),separation=Math.hypot(...baseChroma.map((v,c)=>v-accentChroma[c]));
  const accentLum=luma(...accent);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=y*width+x,p=i*4;if(!body[i])continue;
    let neighbours=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(x+dx>=0&&x+dx<width&&y+dy>=0&&y+dy<height)neighbours+=body[(y+dy)*width+x+dx];
    pixels[p]=Math.round(255*(.7+.3*neighbours/9));pixels[p+3]=255;
    const nx=x/width,ny=y/height,lum=luma(data[p],data[p+1],data[p+2])/255;
    const logoRegion=back?nx>.19&&nx<.81&&ny>.22&&ny<.55:nx>.35&&nx<.83&&ny>.2&&ny<.52;
    if(patterned){
      // Stripes and contrast panels continue beyond the chest. Treat them
      // consistently across the entire garment rather than as isolated logos.
      let amount:number;
      if(separation>.04){
        const chroma=normalise([data[p],data[p+1],data[p+2]]),toBase=Math.hypot(...chroma.map((v,c)=>v-baseChroma[c])),toAccent=Math.hypot(...chroma.map((v,c)=>v-accentChroma[c]));
        amount=.5+(toBase-toAccent)/separation;
        // Desaturated dark folds are not the light contrast material.
        if(Math.max(...chroma)-Math.min(...chroma)<.03&&lum<Math.min(baseLum,accentLum)*.85)amount=0;
      }else amount=(lum-baseLum)/(accentLum-baseLum||.001);
      // Soft palette weights retain antialiasing and fabric folds.
      pixels[p+1]=Math.round(Math.max(0,Math.min(1,(amount-.2)/.6))*255);
      // A varsity can have purple body, cream sleeves AND black lettering.
      // Keep that third ink distinct from both fabric materials.
      if(logoRegion&&lum<Math.min(baseLum,accentLum)-.25){
        const sharp=[[Math.max(0,x-6),y],[Math.min(width-1,x+6),y],[x,Math.max(0,y-6)],[x,Math.min(height-1,y+6)]].some(([xx,yy])=>{const q=(yy*width+xx)*4;return Math.abs(lum-luma(data[q],data[q+1],data[q+2])/255)>.13;});
        if(sharp)pixels[p+2]=255;
      }
      continue;
    }
    if(logoRegion&&Math.abs(lum-baseLum)>.18){
      const contrast=[[Math.max(0,x-6),y],[Math.min(width-1,x+6),y],[x,Math.max(0,y-6)],[x,Math.min(height-1,y+6)]].some(([xx,yy])=>{const q=(yy*width+xx)*4;return Math.abs(lum-luma(data[q],data[q+1],data[q+2])/255)>.13;});
      if(contrast)pixels[p+1]=255;
    }
  }
  // Piping/cuffs can have the same contrast as embroidery. They cross the
  // chest-region boundary; disconnected ML/wordmark strokes stay inside it.
  const inkChannel=patterned?2:1,inkVisited=new Uint8Array(size),limits=back?[.19,.81,.22,.55]:[.35,.83,.2,.52];
  const [minX,maxX,minY,maxY]=[limits[0]*width,limits[1]*width,limits[2]*height,limits[3]*height];
  for(let seed=0;seed<size;seed++){
    if(!pixels[seed*4+inkChannel]||inkVisited[seed])continue;
    const component:number[]=[];let boundary=false;head=0;tail=0;queue[tail++]=seed;inkVisited[seed]=1;
    while(head<tail){const i=queue[head++],x=i%width,y=Math.floor(i/width);component.push(i);if(x<=minX+2||x>=maxX-2||y<=minY+2||y>=maxY-2)boundary=true;
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=x+dx,yy=y+dy,n=yy*width+xx;if(xx>=0&&xx<width&&yy>=0&&yy<height&&!inkVisited[n]&&pixels[n*4+inkChannel]){inkVisited[n]=1;queue[tail++]=n;}}
    }
    if(boundary||component.length>(maxX-minX)*(maxY-minY)*.25)for(const i of component)pixels[i*4+inkChannel]=0;
  }
  return {pixels,base,coverage:best.length/size};
}

export const srgbToLinear=(v:number)=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4;
const linearToSrgb=(v:number)=>v<=.0031308?v*12.92:1.055*Math.max(0,v)**(1/2.4)-.055;
const linearSamples=Float64Array.from({length:256},(_,value)=>srgbToLinear(value/255));
export function paintGarmentFallback(source:ImageData,mask:GarmentMask,targetHex:string,sourceAccentHex?:string){
  const output=new Uint8ClampedArray(source.data),target=[1,3,5].map(i=>srgbToLinear(parseInt(targetHex.slice(i,i+2),16)/255));
  const baseLum=Math.max(.006,luma(...mask.base.map(srgbToLinear) as [number,number,number]));
  const bright=luma(...target as [number,number,number])>.35,ink=bright?[.015,.02,.012]:[.91,.86,.74];
  const accentLum=sourceAccentHex?Math.max(.006,luma(...[1,3,5].map(offset=>srgbToLinear(parseInt(sourceAccentHex.slice(offset,offset+2),16)/255)) as [number,number,number])):1;
  const inkBright=!bright;
  for(let i=0;i<output.length;i+=4){
    const strength=mask.pixels[i]/255;if(!strength)continue;
    const r=linearSamples[source.data[i]],g=linearSamples[source.data[i+1]],b=linearSamples[source.data[i+2]],lum=luma(r,g,b);
    const ratio=Math.max(.06,Math.min(2.8,lum/baseLum)),shade=(bright?.87:1)+(ratio-1)*(bright?.2:.55);
    const contrastRatio=Math.max(.06,Math.min(2.8,lum/accentLum)),contrastShade=(inkBright?.87:1)+(contrastRatio-1)*(inkBright?.2:.55),contrastAmount=mask.pixels[i+1]/255;
    for(let c=0;c<3;c++){
      const cloth=Math.min(1,target[c]*shade+Math.max(0,ratio-1)*(bright?0:.018));
      const contrast=sourceAccentHex?Math.min(1,ink[c]*contrastShade+Math.max(0,contrastRatio-1)*(inkBright?0:.018)):ink[c];
      const dyed=mask.pixels[i+2]?ink[c]:sourceAccentHex?cloth*(1-contrastAmount)+contrast*contrastAmount:mask.pixels[i+1]?ink[c]:cloth;
      const original=c===0?r:c===1?g:b;
      output[i+c]=Math.round(Math.max(0,Math.min(1,linearToSrgb(original*(1-strength)+dyed*strength)))*255);
    }
  }
  return new ImageData(output,source.width,source.height);
}
