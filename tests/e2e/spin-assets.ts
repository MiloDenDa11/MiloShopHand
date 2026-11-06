import spins from '../../apps/web/content/photo-spins.json';

// Check the displayed bytes against the approved product/colour asset identity.
export function spinHash(slug:string,colorHex:string,index:number){
  const entry=spins.find(e=>e.slug===slug&&e.spin.colorHex.toLowerCase()===colorHex.toLowerCase());
  if(!entry)throw new Error(`No approved spin ${slug}/${colorHex}`);
  return new URL(entry.spin.atlases[index].src,'https://milo.local').searchParams.get('v')!;
}
export const spinDelivery=(slug:string,colorHex:string,index:number,profile:'card'|'detail')=>`/product-media/${spinHash(slug,colorHex,index)}-v1-spin-${profile}.webp`;
