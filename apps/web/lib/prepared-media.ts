import sources from '../content/prepared-media.json';

type Entry=[string,number,number,'p'|'a'];
const manifest=sources as unknown as Record<string,Entry>;
function sourceEntry(src:string):Entry|undefined{
  if(!src.startsWith('/')||src.startsWith('//'))return;
  const url=new URL(src,'https://milo.local');
  const entry=manifest[url.pathname];
  // A version we have not built must use the normal image pipeline.
  if(!entry||(url.searchParams.has('v')&&url.searchParams.get('v')!==entry[0]))return;
  return entry;
}
const href=(hash:string,part:string)=>`/product-media/${hash}-v1-${part}.webp`;
export function preparedPhoto(media:{src:string;view:string|null;atlas?:{columns:number;rows:number;frame:number;aspect:number}}){
  const entry=sourceEntry(media.src);if(!entry)return;
  const [hash,width,height,kind]=entry;
  let view:string,cropWidth:number,cropHeight:number;
  if(kind==='p'&&(media.view==='front'||media.view==='back')){
    view=media.view;cropWidth=Math.floor(width/2);cropHeight=height;
  }else if(kind==='a'&&media.atlas?.columns===3&&media.atlas.rows===2&&media.atlas.frame===0&&/\/part-[02]\.png(?:\?|$)/.test(media.src)){
    view='cell';cropWidth=Math.round(width/3);cropHeight=Math.round(height/2);
  }else return;
  const widths=[...new Set([256,512,768].filter(w=>w<cropWidth).concat(Math.min(768,cropWidth)))];
  return {src:href(hash,`${view}-${widths.at(-1)}`),srcSet:widths.map(w=>`${href(hash,`${view}-${w}`)} ${w}w`).join(', '),width:cropWidth,height:cropHeight,back:media.view==='back'||/\/part-2\.png(?:\?|$)/.test(media.src)};
}
export function preparedSpinSource(src:string,profile:'card'|'detail'='detail'){
  const entry=sourceEntry(src);
  return entry?.[3]==='a'?href(entry[0],`spin-${profile}`):undefined;
}
