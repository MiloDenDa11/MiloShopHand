import {test,expect} from '@playwright/test';

test('home renders fresh product data on the server without fetching it again on hydration',async({page,request})=>{
  const response=await request.get('/api/v1/products?sort=newest&limit=4');
  const fresh=await response.json(),requests:string[]=[];
  page.on('request',r=>{if(new URL(r.url()).pathname==='/api/v1/products')requests.push(r.url());});
  const document=await page.goto('/');
  expect(await document!.text()).toContain(fresh.items[0].name);
  await expect(page.locator('#main .edition-hero-photo')).toBeVisible();
  const products=page.locator('#main #new-arrivals .product-card');
  await expect(products).toHaveCount(4);
  await expect(products.first().locator('.prices b')).toHaveText(new Intl.NumberFormat('vi-VN',{style:'currency',currency:'VND'}).format(fresh.items[0].price));
  await page.waitForLoadState('networkidle');
  expect(requests).toHaveLength(0);
});

test('filters update locally, request fresh data once, and support back and reload',async({page})=>{
  await page.goto('/san-pham');
  await expect(page.locator('.catalog-grid .product-card').first()).toBeVisible();
  await page.locator('#main .catalog-toolbar select').selectOption('newest');
  await expect(page.locator('.catalog-layout > section')).toHaveAttribute('aria-busy','false');
  const requests:string[]=[];
  page.on('request',r=>{const url=new URL(r.url());if(url.pathname==='/san-pham'||url.pathname==='/api/v1/products')requests.push(r.url());});
  let release!:()=>void;const pending=new Promise<void>(resolve=>release=resolve);
  await page.route('**/api/v1/products?**',async route=>{
    if(new URL(route.request().url()).searchParams.get('sort')==='price-asc')await pending;
    await route.continue();
  });
  await page.locator('#main .catalog-toolbar select').selectOption('price-asc');
  await expect(page).toHaveURL(/sort=price-asc/);
  await expect(page.locator('.catalog-layout > section')).toHaveAttribute('aria-busy','true');
  await expect(page.locator('#main .catalog-toolbar select')).toBeEnabled();
  release();
  await expect(page.locator('.catalog-layout > section')).toHaveAttribute('aria-busy','false');
  const prices=await page.locator('.catalog-grid .prices b').allTextContents();
  const numbers=prices.map(p=>Number(p.replace(/\D/g,'')));
  expect(numbers).toEqual([...numbers].sort((a,b)=>a-b));
  expect(requests.filter(url=>new URL(url).pathname==='/api/v1/products')).toHaveLength(1);
  expect(requests.filter(url=>new URL(url).pathname==='/san-pham')).toHaveLength(0);
  await page.goBack();
  await expect(page.locator('#main .catalog-toolbar select')).toHaveValue('newest');
  await expect(page.locator('.catalog-layout > section')).toHaveAttribute('aria-busy','false');
  await page.goForward();
  await expect(page.locator('#main .catalog-toolbar select')).toHaveValue('price-asc');
  await expect(page.locator('.catalog-layout > section')).toHaveAttribute('aria-busy','false');
  await page.reload();
  await expect(page.locator('#main .catalog-toolbar select')).toHaveValue('price-asc');
  await expect(page.locator('.catalog-grid .prices b')).toHaveText(prices);
});

test('a slow earlier filter cannot replace the latest result',async({page})=>{
  await page.goto('/san-pham');
  await expect(page.locator('.catalog-grid .product-card').first()).toBeVisible();
  await page.route('**/api/v1/products?**',async route=>{
    if(new URL(route.request().url()).searchParams.get('sort')==='price-asc')await new Promise(resolve=>setTimeout(resolve,450));
    await route.continue().catch(()=>{});
  });
  await page.locator('#main .catalog-toolbar select').selectOption('price-asc');
  await expect(page.locator('.catalog-layout > section')).toHaveAttribute('aria-busy','true');
  await page.locator('#main .catalog-toolbar select').selectOption('price-desc');
  await expect(page.locator('.catalog-layout > section')).toHaveAttribute('aria-busy','false');
  await page.waitForTimeout(500);
  const prices=(await page.locator('.catalog-grid .prices b').allTextContents()).map(p=>Number(p.replace(/\D/g,'')));
  expect(prices.length).toBeGreaterThan(1);
  expect(prices).toEqual([...prices].sort((a,b)=>b-a));
  await expect(page).toHaveURL(/sort=price-desc/);
});

test('catalog photos load single views and hover loads only card-sized 360 sheets',async({page})=>{
  const requests:string[]=[];page.on('request',r=>requests.push(r.url()));
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/san-pham?q=ML%20Cloud%20Pullover');
  const card=page.locator('.catalog-grid .product-card').first();
  await expect(card).toBeVisible();
  const photo=card.locator('.product-photo-primary img');
  await expect(photo).toBeVisible();
  await expect.poll(()=>photo.evaluate((i:HTMLImageElement)=>i.complete&&i.naturalWidth>0)).toBe(true);
  expect(await photo.getAttribute('src')).toMatch(/^\/product-media\/.*-(front|cell)-\d+\.webp$/);
  expect(requests.some(url=>/-spin-(card|detail)\.webp/.test(url))).toBe(false);
  const link=card.locator('.product-card-preview');
  await link.hover({position:{x:50,y:100}});
  await expect(link).toHaveAttribute('data-spin-status','ready');
  expect(new Set(requests.filter(url=>/-spin-card\.webp/.test(url))).size).toBe(4);
  expect(requests.some(url=>/-spin-detail\.webp|\.glb(?:\?|$)/.test(url))).toBe(false);
  await link.hover({position:{x:200,y:100}});
  await expect.poll(()=>link.getAttribute('data-target-frame')).not.toBe('0');
  await expect(page).toHaveURL(/\/san-pham\?q=/);
});
