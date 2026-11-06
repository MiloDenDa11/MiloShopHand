import {test,expect} from "@playwright/test";
import sharp from "sharp";

async function garmentTone(element:any){
  const buffer=await element.screenshot(),image=sharp(buffer),meta=await image.metadata();
  const w=meta.width!,h=meta.height!;
  const {data,info}=await image.extract({left:Math.floor(w*.4),top:Math.floor(h*.45),width:Math.floor(w*.2),height:Math.floor(h*.18)}).raw().toBuffer({resolveWithObject:true});
  const rgb=[0,0,0];for(let i=0;i<data.length;i+=info.channels)for(let c=0;c<3;c++)rgb[c]+=data[i+c];
  return rgb.map(v=>v/(info.width*info.height));
}

test("Milo Design, nút bo tròn và nền hoa lá hiển thị đúng ở desktop/mobile",async({page,request})=>{
  await page.goto("/san-pham?q=ML");
  await expect(page.locator("#main .product-card").first()).toContainText("Milo Design");
  expect(await page.locator("#main").evaluate(el=>getComputedStyle(el).backgroundImage)).toContain("milo-garden.svg");
  expect((await request.get("/brand/milo-garden.svg")).ok()).toBe(true);
  await expect(page.locator('#main select[name="collection"] option').filter({hasText:"Milo Design"})).toHaveCount(1);
  const square=await page.locator('button:visible,a.button:visible').evaluateAll(nodes=>nodes.filter(el=>parseFloat(getComputedStyle(el).borderTopLeftRadius)<1).map(el=>el.textContent));
  expect(square).toEqual([]);
  for(const width of [360,768,1440]){await page.setViewportSize({width,height:950});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
  await page.goto("/san-pham/ml-tee-heavy-box");
  await expect(page.locator("#main .product-design-label").first()).toHaveText("Milo Design");
  expect(await page.locator("#main").innerText()).not.toMatch(/mockup AI|thiết kế AI|ý tưởng AI/i);
});

test("chọn trắng/đen/đỏ mận nhuộm đúng phần áo bằng Three.js và giữ giỏ đúng màu",async({page})=>{
  await page.setViewportSize({width:1440,height:1000});
  await page.goto("/san-pham/ml-tee-heavy-box");await expect(page.locator("canvas")).toHaveCount(0);
  const tones:Record<string,number[]>={};
  for(const [name,hex]of [["Trắng","#f8f7f2"],["Đen","#151515"],["Đỏ mận","#722f37"]]){
    await page.locator("#main .color-choices").getByRole("button",{name,exact:true}).click();
    const preview=page.locator("#main .detail-main .color-photo-stage");
    await expect(preview).toHaveAttribute("data-state","ready");await expect(preview).toHaveAttribute("data-color",hex);
    await expect(preview).toHaveAttribute("data-engine","three");await expect(preview).toHaveAttribute("data-progress","1");
    tones[name]=await garmentTone(preview);
  }
  expect(tones["Trắng"][0]).toBeGreaterThan(tones["Đen"][0]+70);
  expect(tones["Đỏ mận"][0]).toBeGreaterThan(tones["Đỏ mận"][1]*1.3);
  await page.getByRole("button",{name:"M",exact:true}).click();await page.getByRole("button",{name:"Thêm vào giỏ hàng",exact:true}).click();
  await expect(page.locator(".cart-line").first()).toContainText("Đỏ mận");
  await expect(page.locator(".cart-line .color-photo-stage").first()).toHaveAttribute("data-color","#722f37");
});

test("WebGL tắt vẫn đổi màu áo bằng bản dự phòng, reduced motion được tôn trọng",async({page})=>{
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type:any,...args:any[]){if(String(type).startsWith("webgl"))return null;return original.call(this,type,...args as any);}as any;});
  await page.goto("/san-pham/ml-hoodie-zip-pocket-hood");
  const colors=[];
  for(const name of ["Trắng","Đỏ mận"]){
    await page.locator("#main .color-choices").getByRole("button",{name,exact:true}).click();
    const preview=page.locator("#main .detail-main .color-photo-stage");
    await expect(preview).toHaveAttribute("data-state","ready");await expect(preview).toHaveAttribute("data-engine","canvas-fallback");colors.push(await garmentTone(preview));
  }
  expect(colors[0][0]).toBeGreaterThan(colors[1][0]+40);
});

test("damping Three.js làm xoay mượt, dừng ở góc đã chọn và reduced motion bỏ nội suy",async({page})=>{
  await page.setViewportSize({width:1440,height:1000});await page.goto("/san-pham?q=Drop%20Shoulder%20Hood");
  const image=page.locator("#main .product-card-preview").first();await image.hover();await expect(image).toHaveAttribute("data-spin-status","ready");
  const box=(await image.boundingBox())!;await page.mouse.move(box.x+box.width*.77,box.y+box.height*.5);
  await expect(image).toHaveAttribute("data-target-frame","18");await expect(image).toHaveAttribute("data-frame","18");
  await expect.poll(()=>image.locator(".photo-spin-blend-sheet").count()).toBe(0);
  await page.emulateMedia({reducedMotion:"reduce"});await page.mouse.move(box.x+box.width*.14,box.y+box.height*.5);
  await expect(image).toHaveAttribute("data-frame","3");await expect(image.locator(".photo-spin-blend-sheet")).toHaveCount(0);
});
