// Runtime display mask only; original product assets are never rewritten.
export type GarmentMask={pixels:Uint8Array;base:[number,number,number];coverage:number};
const luma=(r:number,g:number,b:number)=>r*.2126+g*.7152+b*.0722;
export function garmentPhotoMask(data:Uint8ClampedArray,width:number,height:number,sourceHex:string,back=false):GarmentMask {
  const size=width*height,background=new Uint8Array(size),queue=new Int32Array(size);
  const sample=(x:number,y:number)=>{const i=(y*width+x)*4;return [data[i],data[i+1],data[i+2]];};
  const corners=[sample(2,2),sample(width-3,2),sample(2,height-3),sample(width-3,height-3)];
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
  const base=samples.map((values,c)=>values.length?values.sort((a,b)=>a-b)[Math.floor(values.length/2)]/255:baseHex[c]/255) as [number,number,number];
  const baseLum=luma(...base),pixels=new Uint8Array(size*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=y*width+x,p=i*4;if(!body[i])continue;
    let neighbours=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(x+dx>=0&&x+dx<width&&y+dy>=0&&y+dy<height)neighbours+=body[(y+dy)*width+x+dx];
    pixels[p]=Math.round(255*(.7+.3*neighbours/9));pixels[p+3]=255;
    const nx=x/width,ny=y/height,lum=luma(data[p],data[p+1],data[p+2])/255;
    const logoRegion=back?nx>.19&&nx<.81&&ny>.22&&ny<.55:nx>.35&&nx<.83&&ny>.2&&ny<.52;
    if(logoRegion&&Math.abs(lum-baseLum)>.18){
      const contrast=[[Math.max(0,x-6),y],[Math.min(width-1,x+6),y],[x,Math.max(0,y-6)],[x,Math.min(height-1,y+6)]].some(([xx,yy])=>{const q=(yy*width+xx)*4;return Math.abs(lum-luma(data[q],data[q+1],data[q+2])/255)>.13;});
      if(contrast)pixels[p+1]=255;
    }
  }
  // Piping/cuffs can have the same contrast as embroidery. They cross the
  // chest-region boundary; disconnected ML/wordmark strokes stay inside it.
  const inkVisited=new Uint8Array(size),limits=back?[.19,.81,.22,.55]:[.35,.83,.2,.52];
  const [minX,maxX,minY,maxY]=[limits[0]*width,limits[1]*width,limits[2]*height,limits[3]*height];
  for(let seed=0;seed<size;seed++){
    if(!pixels[seed*4+1]||inkVisited[seed])continue;
    const component:number[]=[];let boundary=false;head=0;tail=0;queue[tail++]=seed;inkVisited[seed]=1;
    while(head<tail){const i=queue[head++],x=i%width,y=Math.floor(i/width);component.push(i);if(x<=minX+2||x>=maxX-2||y<=minY+2||y>=maxY-2)boundary=true;
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=x+dx,yy=y+dy,n=yy*width+xx;if(xx>=0&&xx<width&&yy>=0&&yy<height&&!inkVisited[n]&&pixels[n*4+1]){inkVisited[n]=1;queue[tail++]=n;}}
    }
    if(boundary||component.length>(maxX-minX)*(maxY-minY)*.25)for(const i of component)pixels[i*4+1]=0;
  }
  return {pixels,base,coverage:best.length/size};
}

export const srgbToLinear=(v:number)=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4;
const linearToSrgb=(v:number)=>v<=.0031308?v*12.92:1.055*Math.max(0,v)**(1/2.4)-.055;
export function paintGarmentFallback(source:ImageData,mask:GarmentMask,targetHex:string){
  const output=new Uint8ClampedArray(source.data),target=[1,3,5].map(i=>srgbToLinear(parseInt(targetHex.slice(i,i+2),16)/255));
  const baseLum=Math.max(.006,luma(...mask.base.map(srgbToLinear) as [number,number,number]));
  const bright=luma(...target as [number,number,number])>.35,ink=bright?[.015,.02,.012]:[.91,.86,.74];
  for(let i=0;i<output.length;i+=4){const strength=mask.pixels[i]/255;if(!strength)continue;const rgb=[source.data[i],source.data[i+1],source.data[i+2]].map(v=>srgbToLinear(v/255));const ratio=Math.max(.06,Math.min(2.8,luma(...rgb as [number,number,number])/baseLum));for(let c=0;c<3;c++){const shade=(bright?.87:1)+(ratio-1)*(bright?.2:.55);const dyed=mask.pixels[i+1]?ink[c]:Math.min(1,target[c]*shade+Math.max(0,ratio-1)*(bright?0:.018));output[i+c]=Math.round(Math.max(0,Math.min(1,linearToSrgb(rgb[c]*(1-strength)+dyed*strength)))*255);}}
  return new ImageData(output,source.width,source.height);
}
