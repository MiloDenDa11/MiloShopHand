import {test,expect,type Page} from '@playwright/test';

async function injectAttribute(page:Page,target:'body'|'#main',attribute:string){
  await page.addInitScript(({target,attribute})=>{
    const apply=()=>{const element=document.querySelector(target);if(!element)return false;element.setAttribute(attribute,'true');return true;};
    if(!apply()){
      const observer=new MutationObserver(()=>{if(apply())observer.disconnect();});
      observer.observe(document,{childList:true,subtree:true});
    }
  },{target,attribute});
}

test.beforeEach(async({page})=>{
  // Guest identity only; catalogue and application HTML remain real.
  await page.route(/\/api\/v1\/me(?:[/?]|$)/,route=>route.fulfill({status:401,contentType:'application/json',body:'{}'}));
});

test('HTML sạch và thuộc tính do tiện ích thêm vào body đều hydrate bình thường',async({page})=>{
  const warnings:string[]=[],errors:string[]=[];
  page.on('console',message=>{if(/hydrat|server rendered|didn.t match/i.test(message.text()))warnings.push(message.text());});
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');await page.waitForLoadState('networkidle');
  await expect(page.locator('#main')).toBeVisible();expect(warnings).toEqual([]);expect(errors).toEqual([]);
  const attribute='__processed_0aedecb7-0bb9-4eda-87a5-48f2b47586f3__';
  await injectAttribute(page,'body',attribute);
  await page.reload();await page.waitForLoadState('networkidle');
  await expect(page.locator('body')).toHaveAttribute(attribute,'true');
  await expect(page.locator('#main')).toBeVisible();expect(warnings).toEqual([]);expect(errors).toEqual([]);
});

test('sai lệch ở nội dung trang vẫn được React cảnh báo',async({page})=>{
  const warnings:string[]=[];
  page.on('console',message=>{if(/hydrat|server rendered|didn.t match/i.test(message.text()))warnings.push(message.text());});
  await injectAttribute(page,'#main','data-milo-hydration-probe');
  await page.goto('/');await page.waitForLoadState('networkidle');
  await expect(page.locator('#main')).toHaveAttribute('data-milo-hydration-probe','true');
  expect(warnings.length).toBeGreaterThan(0);
});
