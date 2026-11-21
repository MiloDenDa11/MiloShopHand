// Opening-sale QA. Guest cart only; never places an order or reserves stock.
import fs from 'node:fs';
import {chromium,expect as playwrightExpect} from '@playwright/test';
const expect=playwrightExpect.configure({timeout:15000});
const base=process.env.PLAYWRIGHT_BASE_URL||'http://localhost:3000';
const designs=JSON.parse(fs.readFileSync('apps/web/content/polo-designs.json','utf8'));
const config=JSON.parse(fs.readFileSync('prisma/polo-sale.json','utf8'));
const output='.local/polo-sale-20261121/launch',shots='docs/polo-sale-20261121/previews';fs.mkdirSync(output,{recursive:true});fs.mkdirSync(shots,{recursive:true});
const report={at:new Date().toISOString(),base,products:10,colours:40,publicVariants:0,availableUnits:0,sizeChoicesChecked:0,cartProductsChecked:0,checkoutNavigation:false,consoleErrors:[],failedAssets:[],blockedCommerceWrites:[],screenshots:[]};
const browser=await chromium.launch({headless:true});
try{
 const api=await browser.newContext();const response=await api.request.get(`${base}/api/v1/products?category=ao-polo&limit=12`);expect(response.ok()).toBe(true);
 const catalog=await response.json();expect(catalog.total).toBe(10);expect(catalog.items.length).toBe(10);
 for(const design of designs){const product=catalog.items.find(p=>p.slug===design.slug);expect(product).toBeTruthy();expect(product.design.commercialStatus).toBe('active');expect(product.design.pricingStatus).toBe('published');
  expect(product.cost).toBeUndefined();expect(product.variants.length).toBe(4*config.sizes.length);expect(Object.keys(product.design.photoSpins).length).toBe(4);
  expect(product.description).not.toMatch(/Mẫu trưng bày:|Bản nháp:|chưa nhận đặt hàng/);
  for(const color of design.colors)for(const size of config.sizes){const variant=product.variants.find(v=>v.colorHex===color.hex&&v.size===size);expect(variant).toBeTruthy();expect(variant.available).toBe(config.stockPerColorSize);expect(variant.price).toBe(product.price);expect(variant.sku).not.toContain('DRAFT');report.publicVariants++;report.availableUnits+=variant.available;}
 }
 await api.close();
 for(const mobile of [false,true]){
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1050},hasTouch:mobile,isMobile:mobile,reducedMotion:'reduce'}),page=await context.newPage();
  await page.route(/\/api\/v1\/me(?:[/?]|$)/,route=>route.fulfill({status:401,contentType:'application/json',body:'{}'}));
  await page.route(/\/api\/v1\/(?:checkout|orders|payments)(?:[/?]|$)/,route=>{if(route.request().method()!=='GET'){report.blockedCommerceWrites.push(route.request().url());return route.abort();}return route.continue();});
  page.on('pageerror',error=>report.consoleErrors.push(error.message));page.on('console',message=>{if(message.type()==='error'&&!message.text().includes('401'))report.consoleErrors.push(message.text());});
  page.on('response',r=>{if(r.status()>=400&&/(?:\/product-media\/|\/collection-spin\/|\/_next\/image(?:\?|\/))/.test(r.url()))report.failedAssets.push({url:r.url(),status:r.status()});});
  await page.goto(`${base}/san-pham?category=ao-polo`);await expect(page.locator('#main .product-card')).toHaveCount(10);
  await expect(page.locator('#main')).not.toContainText('MẪU TRƯNG BÀY');await expect(page.locator('#main')).not.toContainText('Dự kiến');
  // Keep input styles intact while streamed/hidden boundaries hydrate.
  const catalogueShot=`${shots}/catalogue-${mobile?'mobile':'desktop'}.png`;await page.screenshot({path:catalogueShot,caret:'initial'});report.screenshots.push(catalogueShot);
  for(const [index,design]of designs.entries()){
   const product=catalog.items.find(p=>p.slug===design.slug);await page.goto(`${base}/san-pham/${design.slug}`);
   await expect(page.getByRole('heading',{name:design.name,exact:true})).toBeVisible();
   await expect(page.getByRole('button',{name:'Chưa mở bán',exact:true})).toHaveCount(0);
   await expect(page.locator('.detail-copy')).not.toContainText('Giá dự kiến');await expect(page.locator('.size-choices')).not.toContainText('Chưa chốt');
   const data=(await page.locator('script[type="application/ld+json"]').allTextContents()).map(JSON.parse).find(x=>x['@type']==='Product');expect(data.offers.price).toBe(product.price);expect(data.offers.availability).toBe('https://schema.org/InStock');
   for(const color of design.colors){
    await page.locator('.color-choices').getByRole('button',{name:color.name,exact:true}).click();
    await expect(page.locator('.size-choices button')).toHaveCount(config.sizes.length);
    for(const size of config.sizes){const button=page.locator('.size-choices').getByRole('button',{name:size,exact:true});await expect(button).toBeEnabled();await button.click();await expect(button).toHaveAttribute('aria-pressed','true');await expect(page.getByRole('button',{name:'Thêm vào giỏ hàng',exact:true})).toBeEnabled();await expect(page.getByRole('button',{name:'Mua ngay',exact:true})).toBeEnabled();report.sizeChoicesChecked++;}
   }
   await page.getByRole('button',{name:'Thêm vào giỏ hàng',exact:true}).click();
   const drawer=page.locator('.cart-dialog[open]');await expect(drawer).toBeVisible();await expect(drawer).toContainText(design.name);
   const variant=product.variants.find(v=>v.colorHex===design.colors.at(-1).hex&&v.size===config.sizes.at(-1));
   await expect.poll(async()=>page.evaluate(id=>JSON.parse(localStorage.getItem('milo-cart')||'[]').find(i=>i.variantId===id)||null,variant.id)).toEqual({variantId:variant.id,quantity:1,name:product.name,slug:product.slug,image:product.images.find(i=>i.color===variant.color&&i.view==='front').url,price:product.price,color:variant.color,size:variant.size});
   report.cartProductsChecked++;
   await drawer.getByRole('button',{name:'Đóng giỏ hàng',exact:true}).click();
   if(index===0){const detailShot=`${shots}/detail-${mobile?'mobile':'desktop'}.png`;await page.screenshot({path:detailShot,caret:'initial'});report.screenshots.push(detailShot);}
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  await page.getByRole('button',{name:'Mua ngay',exact:true}).click();await expect(page).toHaveURL(`${base}/thanh-toan`);report.checkoutNavigation=true;
  console.log(JSON.stringify({viewport:mobile?'mobile':'desktop',sizeChoicesChecked:report.sizeChoicesChecked,cartProductsChecked:report.cartProductsChecked}));
  await context.close();
 }
 expect(report.publicVariants).toBe(160);expect(report.availableUnits).toBe(3200);expect(report.sizeChoicesChecked).toBe(320);expect(report.cartProductsChecked).toBe(20);
 expect(report.consoleErrors).toEqual([]);expect(report.failedAssets).toEqual([]);expect(report.blockedCommerceWrites).toEqual([]);report.result='PASS';
}catch(error){report.result='FAIL';report.failure=String(error);throw error;}
finally{fs.writeFileSync(`${output}/browser-verification.json`,JSON.stringify(report,null,2)+'\n');await browser.close();console.log(JSON.stringify(report));}
