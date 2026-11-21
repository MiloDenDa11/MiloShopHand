// Read-only browser QA against an already running shop; never seeds or buys.
import fs from 'node:fs';
import {chromium,expect} from '@playwright/test';
const base=process.env.PLAYWRIGHT_BASE_URL||'http://localhost:3000';
const designs=JSON.parse(fs.readFileSync('apps/web/content/polo-designs.json','utf8'));
const manifest=JSON.parse(fs.readFileSync('apps/web/content/photo-spins.json','utf8'));
const output='.local/polo-spin-20261121';fs.mkdirSync(output,{recursive:true});
const report={at:new Date().toISOString(),base,products:0,colours:0,detailPoses:0,cardPoses:0,touchGestures:0,detailTouchGestures:0,fullCycleFrames:0,keyboardWrap:false,zoomReset:false,errors:[],failedAssets:[],screenshots:[]};
const source=(slug,hex,quarter,profile)=>{
 const entry=manifest.find(e=>e.slug===slug&&e.spin.colorHex===hex);
 if(!entry)throw Error(`Missing approved spin ${slug}/${hex}`);
 return `/product-media/${new URL(entry.spin.atlases[quarter].src,'https://milo.local').searchParams.get('v')}-v1-spin-${profile}.webp`;
};
const browser=await chromium.launch({headless:true});
try{
 for(const mobile of [false,true]){
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1050},hasTouch:mobile,isMobile:mobile,reducedMotion:'reduce'});
  const page=await context.newPage();
  await page.route(/\/api\/v1\/me(?:[/?]|$)/,route=>route.fulfill({status:401,contentType:'application/json',body:'{}'}));
  page.on('pageerror',error=>report.errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error'&&!message.text().includes('401'))report.errors.push(message.text());});
  page.on('response',response=>{if(response.status()>=400&&/(?:\/product-media\/|\/collection-spin\/|\/_next\/image(?:\?|\/))/.test(response.url()))report.failedAssets.push({url:response.url(),status:response.status()});});
  const catalog=await(await page.request.get(`${base}/api/v1/products?category=ao-polo&limit=12`)).json();
  expect(catalog.total).toBe(10);expect(catalog.items.length).toBe(10);
  const productsBySlug=new Map(catalog.items.map(product=>[product.slug,product]));
  for(const product of catalog.items){
   expect(product.cost).toBeUndefined();expect(new Set(product.variants.map(v=>v.colorHex)).size).toBe(4);
   expect(['preview','active']).toContain(product.design.commercialStatus);
   if(product.design.commercialStatus==='preview')expect(product.variants.every(v=>v.available===0)).toBe(true);
   else expect(product.variants.every(v=>v.size!=='Chưa chốt'&&v.available>=0)).toBe(true);
   expect(Object.keys(product.design.photoSpins).length).toBe(4);
  }
  await page.goto(`${base}/san-pham?category=ao-polo`);
  await expect(page.locator('#main .product-card')).toHaveCount(10);
  const cdp=mobile?await context.newCDPSession(page):null;
  for(const design of designs){
   const card=page.locator('#main .product-card').filter({has:page.locator(`.product-name[href^="/san-pham/${design.slug}"]`)});
   if(productsBySlug.get(design.slug).design.commercialStatus==='preview'){
    await expect(card).toContainText('MẪU TRƯNG BÀY');await expect(card).toContainText('Dự kiến');
   }else{
    await expect(card).not.toContainText('MẪU TRƯNG BÀY');await expect(card).not.toContainText('Dự kiến');
   }
   await expect(card.locator('.product-try-on-link')).toHaveCount(0);
   for(const color of design.colors){
    await card.getByRole('button',{name:`Xem màu ${color.name}`,exact:true}).click();
    const preview=card.locator('.product-card-preview');await preview.scrollIntoViewIfNeeded();
    await expect(preview).toHaveAttribute('data-card-spin','true');
    if(mobile){
     const box=await preview.boundingBox(),x=box.x+box.width*.75,y=box.y+box.height*.45;
     await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
     for(let i=1;i<=6;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-i*12,y}]});
     await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
     await expect(preview).toHaveAttribute('data-spin-status','ready');
     await expect(preview).not.toHaveAttribute('data-target-frame','0');report.touchGestures++;
    }else await preview.hover();
    await expect(preview).toHaveAttribute('data-spin-status','ready');
    await preview.focus();await preview.press('Home');
    for(let quarter=0;quarter<4;quarter++){
     if(quarter)for(let i=0;i<6;i++)await preview.press('ArrowRight');
     await expect(preview).toHaveAttribute('data-frame',String(quarter*6));
     await expect(preview.locator('.product-card-spin-stage')).toHaveAttribute('data-native-color',color.hex);
     await expect(preview.locator('.photo-spin-sheet')).toHaveAttribute('style',new RegExp(source(design.slug,color.hex,quarter,'card').replaceAll('.','\\.')));
     report.cardPoses++;
    }
    await preview.blur();
   }
  }
  for(const [index,design]of designs.entries()){
   await page.goto(`${base}/san-pham/${design.slug}`);
   await expect(page.getByRole('heading',{name:design.name,exact:true})).toBeVisible();
   const isPreview=productsBySlug.get(design.slug).design.commercialStatus==='preview';
   if(isPreview){
    await expect(page.getByRole('button',{name:'Chưa mở bán',exact:true})).toBeDisabled();
    await expect(page.locator('.size-choices button,#size-guide')).toHaveCount(0);
   }else{
    await expect(page.getByRole('button',{name:'Chưa mở bán',exact:true})).toHaveCount(0);
    expect(await page.locator('.size-choices button').count()).toBeGreaterThan(0);
    await expect(page.getByRole('button',{name:'Thêm vào giỏ hàng',exact:true})).toBeVisible();
   }
   await expect(page.locator('.product-try-on-detail')).toHaveCount(0);
   const structured=await page.locator('script[type="application/ld+json"]').allTextContents();
   expect(structured.some(text=>{const data=JSON.parse(text);return data['@type']==='Product'&&(isPreview?!data.offers:data.offers?.['@type']==='Offer');})).toBe(true);
   await page.getByRole('button',{name:'Khám phá thiết kế 360°',exact:true}).click();
   // Streaming can temporarily retain a hidden server dialog. Exercise the
   // interactive modal rather than a hidden pending segment with the same ID.
   const dialog=page.locator('.product-360-dialog[open]');await expect(dialog).toBeVisible();
   for(const color of design.colors){
    await dialog.locator('.product-360-colors').getByRole('button',{name:color.name,exact:true}).click();
    const viewer=dialog.locator('.photo-spin-viewer'),stage=viewer.locator('.photo-spin-stage');
    await expect(viewer).toHaveAttribute('data-native-color',color.hex);
    await expect(viewer).toHaveAttribute('data-viewer-status','ready');await expect(viewer).toHaveAttribute('data-axis','y');
    if(mobile){
     await stage.scrollIntoViewIfNeeded();const box=await stage.boundingBox(),x=box.x+box.width*.75,y=box.y+box.height*.4;
     const before=await stage.getAttribute('data-target-frame');
     await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
     for(let i=1;i<=6;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-i*12,y}]});
     await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
     await expect(stage).not.toHaveAttribute('data-target-frame',before);report.detailTouchGestures++;
    }
    await stage.focus();await stage.press('Home');
    for(let quarter=0;quarter<4;quarter++){
     if(quarter)for(let i=0;i<6;i++)await stage.press('ArrowRight');
     await expect(stage).toHaveAttribute('data-frame',String(quarter*6));
     await expect(stage.locator('.photo-spin-sheet')).toHaveAttribute('style',new RegExp(source(design.slug,color.hex,quarter,'detail').replaceAll('.','\\.')));
     report.detailPoses++;
    }
    if(index===0&&color===design.colors[0]){
     await stage.press('Home');for(let frame=0;frame<24;frame++){
      if(frame)await stage.press('ArrowRight');await expect(stage).toHaveAttribute('data-frame',String(frame));report.fullCycleFrames++;
     }
     await stage.press('Home');await stage.press('ArrowLeft');await expect(stage).toHaveAttribute('data-frame','23');
     await stage.press('ArrowRight');await expect(stage).toHaveAttribute('data-frame','0');report.keyboardWrap=true;
     await viewer.getByRole('button',{name:'Phóng to ảnh',exact:true}).click();await expect(stage).toHaveAttribute('data-zoom','1.2');
     await viewer.getByRole('button',{name:'Đặt lại góc nhìn',exact:true}).click();await expect(stage).toHaveAttribute('data-zoom','1');report.zoomReset=true;
    }
   }
   if(index===0){
    const shot=`docs/polo-spin-20261121/previews/rotation-${mobile?'mobile':'desktop'}.png`;
    fs.mkdirSync('docs/polo-spin-20261121/previews',{recursive:true});await dialog.screenshot({path:shot,caret:'initial'});report.screenshots.push(shot);
   }
   await dialog.getByRole('button',{name:'Đóng chế độ 360°',exact:true}).click();
   await expect(dialog).not.toBeVisible();
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  // Existing saleable Tee still uses its normal sizes and purchase controls.
  await page.goto(`${base}/san-pham/ml-tee-everyday-crew`);
  expect(await page.locator('.size-choices button').count()).toBeGreaterThan(0);
  await expect(page.getByRole('button',{name:'Chưa mở bán',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Khám phá thiết kế 360°',exact:true})).toBeVisible();
  await context.close();
 }
 report.products=10;report.colours=40;
 expect(report.errors).toEqual([]);expect(report.failedAssets).toEqual([]);report.result='PASS';
}catch(error){report.result='FAIL';report.failure=String(error);throw error;}
finally{fs.writeFileSync(`${output}/browser-rotation.json`,JSON.stringify(report,null,2)+'\n');await browser.close();console.log(JSON.stringify(report));}
