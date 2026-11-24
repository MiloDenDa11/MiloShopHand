import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sizeGuideSchema,vietnamDay} from '../apps/api/src/experience';
import {receiptSchema} from '../apps/api/src/purchasing';
import {productStructuredData} from '../apps/web/lib/product-seo';
import {Readable} from 'node:stream';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
test('size guide validation refuses empty, repeated, fake or invalid measurements without inventing defaults',()=>{
 const input={expectedRevision:0,kind:'TOP',note:'Actual fixture measurements only',published:false,model:null,rows:[{size:'M',chest:108,length:70}]};assert.equal(sizeGuideSchema.safeParse(input).success,true);
 for(const patch of [{rows:[]},{rows:[{size:'M'}]},{rows:[{size:'M',chest:-1}]},{rows:[{size:'M',chest:108},{size:'M',chest:110}]},{rows:[{size:'M',chest:108,admin:true}]}])assert.equal(sizeGuideSchema.safeParse({...input,...patch}).success,false);
});
test('analytics day uses Vietnam midnight and does not depend on execution host time zone',()=>{assert.equal(vietnamDay(new Date('2026-11-23T17:00:00Z')).toISOString(),'2026-11-24T00:00:00.000Z');assert.equal(vietnamDay(new Date('2026-11-23T16:59:59Z')).toISOString(),'2026-11-23T00:00:00.000Z');});
test('variant SEO uses each SKU price, size, colour and availability; drafts cannot advertise an offer',()=>{
 const p={id:'p',slug:'polo',name:'Polo',description:'Fixture',price:500000,category:{name:'Polo',slug:'polo'},images:[{url:'/products/fixture.png'},{url:'/products/olive.png',color:'Olive'},{url:'/products/ivory.png',color:'Ivory'},{url:'javascript:alert(1)',color:'Olive'}],variants:[{sku:'OLIVE-M',color:'Olive',size:'M',price:550000,available:2},{sku:'IVORY-L',color:'Ivory',size:'L',price:580000,available:0}]};
 const data=productStructuredData(p,'Milo','https://milo.example.test');const variants=(data['@graph'][0] as any).hasVariant;assert.equal(variants[0].offers.price,550000);assert.equal(variants[1].offers.price,580000);assert.match(variants[1].offers.availability,/OutOfStock$/);assert.match(variants[0].url,/color=Olive/);assert.equal(variants[0].size,'M');assert.ok(variants[0].image.some((url:string)=>url.endsWith('/olive.png')));assert.ok(!variants[0].image.some((url:string)=>url.endsWith('/ivory.png')||url.startsWith('javascript:')));
 assert.ok((productStructuredData(p,'Milo','https://milo.example.test',true)['@graph'][0] as any).hasVariant.every((row:any)=>!row.offers));assert.equal(JSON.stringify(data).includes('returnFees'),false);
});
test('purchase receipt strict input blocks duplicate SKU, negative quantities, hidden role and edited status',()=>{const input={key:randomUUID(),supplierId:'supplier',reference:'fixture',note:'',lines:[{inventoryId:'inv',quantity:2,unitCost:225000}]};assert.equal(receiptSchema.safeParse(input).success,true);for(const patch of [{status:'CONFIRMED'},{role:'ADMIN'},{lines:[...input.lines,...input.lines]},{lines:[{inventoryId:'inv',quantity:-1,unitCost:1}]}])assert.equal(receiptSchema.safeParse({...input,...patch}).success,false);});
test('backup encryption and restore preserve an existing output and reject a wrong key',async()=>{
 const {encryptBackupStream,decryptBackup}=await import('../scripts/managed-backup.mjs'),dir=await mkdtemp(join(tmpdir(),'milo-backup-existing-'));try{const key=randomBytes(32),source=join(dir,'source.milobak'),existing=join(dir,'existing.dump');await encryptBackupStream(Readable.from([Buffer.from('synthetic dump')]),source,key);await writeFile(existing,'preserve me');await assert.rejects(decryptBackup(source,existing,key));assert.equal(await readFile(existing,'utf8'),'preserve me');await assert.rejects(encryptBackupStream(Readable.from(['overwrite']),existing,key));assert.equal(await readFile(existing,'utf8'),'preserve me');await assert.rejects(decryptBackup(source,join(dir,'wrong-key.dump'),randomBytes(32)));await assert.rejects(readFile(join(dir,'wrong-key.dump')));}finally{await rm(dir,{recursive:true,force:true});}
});
test('backup encryption round trips and rejects modified ciphertext without leaving a plaintext file',async()=>{
 const {encryptBackupStream,decryptBackup}=await import('../scripts/managed-backup.mjs');const dir=await mkdtemp(join(tmpdir(),'milo-backup-test-'));try{const key=randomBytes(32),payload=Buffer.from('Synthetic PostgreSQL dump only'),encrypted=join(dir,'sample.milobak'),plain=join(dir,'sample.dump');await encryptBackupStream(Readable.from([payload]),encrypted,key);assert.equal((await readFile(encrypted)).includes(payload),false);await decryptBackup(encrypted,plain,key);assert.deepEqual(await readFile(plain),payload);const bytes=await readFile(encrypted);bytes[23]^=1;await writeFile(encrypted,bytes);await assert.rejects(decryptBackup(encrypted,join(dir,'tampered.dump'),key));await assert.rejects(readFile(join(dir,'tampered.dump')));}finally{await rm(dir,{recursive:true,force:true});}
});
