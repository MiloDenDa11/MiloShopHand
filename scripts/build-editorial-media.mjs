// Deterministic delivery compression only; original ImageGen PNGs remain intact.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
const root=path.resolve('apps/web/public');
const manifest=JSON.parse(await fs.readFile('docs/vintage-editorial/images.json','utf8'));
let bytes=0;
for(const image of manifest.images){
  const file=path.resolve(root,image.original.slice(1));
  if(!file.startsWith(root+path.sep))throw Error('Invalid original path');
  const source=await fs.readFile(file);
  if(createHash('sha256').update(source).digest('hex')!==image.sha256)throw Error('Original changed: '+image.id);
  const target=path.resolve(root,image.delivery.slice(1));
  if(!target.startsWith(root+path.sep))throw Error('Invalid delivery path');
  await sharp(source).resize({width:Math.min(1400,image.width),withoutEnlargement:true}).webp({quality:82,effort:5}).toFile(target);
  bytes+=(await fs.stat(target)).size;
}
console.log(JSON.stringify({editorialImages:manifest.images.length,deliveredWebPBytes:bytes,originals:'preserved unchanged'}));
