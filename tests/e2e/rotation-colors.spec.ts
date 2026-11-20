import {test,expect,type Locator} from "@playwright/test";

async function sheetTone(sheet:Locator){
  return sheet.evaluate(async element=>{
    const src=getComputedStyle(element).backgroundImage.slice(5,-2),image=new Image();image.src=src;await image.decode();
    const canvas=document.createElement("canvas");canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
    const context=canvas.getContext("2d")!;context.drawImage(image,0,0);
    const cw=image.naturalWidth/3,ch=image.naturalHeight/2;
    const average=(x:number,y:number,w:number,h:number)=>{const pixels=context.getImageData(x,y,w,h).data,total=[0,0,0];for(let p=0;p<pixels.length;p+=4)for(let c=0;c<3;c++)total[c]+=pixels[p+c];return total.map(v=>v/(pixels.length/4));};
    return {body:average(Math.floor(cw*.44),Math.floor(ch*.61),Math.floor(cw*.12),Math.floor(ch*.07)),sleeve:average(Math.floor(cw*.19),Math.floor(ch*.61),Math.floor(cw*.06),Math.floor(ch*.07)),paper:average(4,4,8,8)};
  });
}
test("ảnh riêng theo màu trắng/đỏ mận giữ 24 góc và nền giấy khi WebGL tắt",async({page})=>{
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type:any,...args:any[]){return String(type).startsWith("webgl")?null:original.call(this,type,...args as any);} as any;});
  await page.goto("/san-pham/everyday-essential-tee");
  await page.getByRole("button",{name:"Khám phá thiết kế 360°",exact:true}).click();
  const viewer=page.locator(".photo-spin-viewer"),dialog=page.getByRole("dialog"),stage=viewer.locator(".photo-spin-stage");
  const tones=[];
  for(const [name,hex] of [["Trắng","#f8f7f2"],["Đỏ mận","#722f37"]]){
    await dialog.getByRole("button",{name,exact:true}).click();
    await expect(viewer).toHaveAttribute("data-viewer-status","ready");
    await expect(viewer).toHaveAttribute("data-native-color",hex);
    await dialog.getByRole("button",{name:"Mặt trước",exact:true}).click();
    tones.push(await sheetTone(viewer.locator(".photo-spin-sheet")));
    await stage.focus();const views=new Set<string>();
    for(let frame=0;frame<24;frame++){
      await expect(stage).toHaveAttribute("data-frame",String(frame));
      views.add((await viewer.locator(".photo-spin-sheet").getAttribute("style"))!);
      await stage.press("ArrowRight");
    }
    expect(views.size).toBe(24);
    await expect(viewer).toContainText("Bộ ảnh thiết kế riêng theo màu");
    await expect(viewer.locator(".photo-spin-sheet")).not.toHaveAttribute("style",/blob:/);
  }
  expect(Math.min(...tones[0].body)).toBeGreaterThan(160);
  expect(tones[1].body[0]).toBeGreaterThan(tones[1].body[1]*1.2);
  expect(tones[0].paper.every((v,i)=>Math.abs(v-tones[1].paper[i])<15)).toBe(true);
  await expect(dialog.locator("canvas")).toHaveCount(0);
});
test("đổi màu liên tiếp không hiển thị kết quả ảnh riêng theo màu cũ",async({page})=>{
  await page.goto("/san-pham/everyday-essential-tee");
  await page.getByRole("button",{name:"Khám phá thiết kế 360°",exact:true}).click();
  const dialog=page.getByRole("dialog"),viewer=page.locator(".photo-spin-viewer");
  await expect(viewer).toHaveAttribute("data-viewer-status","ready");
  await dialog.getByRole("button",{name:"Trắng",exact:true}).click();
  await dialog.getByRole("button",{name:"Đen",exact:true}).click();
  await expect(viewer).toHaveAttribute("data-viewer-status","ready");
  await expect(viewer).toHaveAttribute("data-native-color","#242426");
  await dialog.getByRole("button",{name:"Mặt trước",exact:true}).click();
  const tone=await sheetTone(viewer.locator(".photo-spin-sheet"));expect(Math.max(...tone.body)).toBeLessThan(100);
  await dialog.getByRole("button",{name:"Mặt sau",exact:true}).click();
  await expect(viewer.locator(".photo-spin-stage")).toHaveAttribute("data-frame","12");
  await page.keyboard.press("Escape");
  await page.getByRole("button",{name:"M",exact:true}).click();
  await page.getByRole("button",{name:"Thêm vào giỏ hàng",exact:true}).click();
  await expect(page.locator(".cart-line").first()).toContainText("Đen");
});
test("ảnh riêng theo màu tải lỗi không hiện áo sai màu và có thể thử lại",async({page})=>{
  let fail=true;
  await page.route("**/product-media/*-spin-detail.webp",route=>fail?route.fulfill({status:503,body:"unavailable"}):route.continue());
  await page.goto("/san-pham/everyday-essential-tee?color=Tr%E1%BA%AFng");
  await page.getByRole("button",{name:"Khám phá thiết kế 360°",exact:true}).click();
  const viewer=page.locator(".photo-spin-viewer");
  await expect(viewer).toHaveAttribute("data-viewer-status","error");
  await expect(viewer.locator(".photo-spin-sheet")).toHaveCount(0);
  fail=false;await viewer.getByRole("button",{name:"Thử lại",exact:true}).click();
  await expect(viewer).toHaveAttribute("data-viewer-status","ready");
  await expect(viewer).toHaveAttribute("data-native-color","#f8f7f2");
});
test("bomber hai màu giữ tay tương phản khi xoay từ trước sang nghiêng",async({page})=>{
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.goto("/san-pham/varsity-club-bomber?color=%C4%90en");
  await page.getByRole("button",{name:"Khám phá thiết kế 360°",exact:true}).click();
  const viewer=page.locator(".photo-spin-viewer"),stage=viewer.locator(".photo-spin-stage");
  await expect(viewer).toHaveAttribute("data-viewer-status","ready");
  await expect(viewer).toHaveAttribute("data-native-color","#151515");
  const front=await sheetTone(viewer.locator(".photo-spin-sheet"));
  expect(Math.max(...front.body)).toBeLessThan(100);
  expect(Math.min(...front.sleeve)).toBeGreaterThan(140);
  await viewer.screenshot({path:".local/spin-completion/browser/varsity-final-front.png"});
  await stage.focus();for(let i=0;i<6;i++)await stage.press("ArrowRight");
  await expect(stage).toHaveAttribute("data-frame","6");
  const side=await sheetTone(viewer.locator(".photo-spin-sheet"));
  expect(Math.min(...side.body)).toBeGreaterThan(140);
  await viewer.screenshot({path:".local/spin-completion/browser/varsity-final-side.png"});
  await page.getByRole("button",{name:"Mặt sau",exact:true}).click();
  await expect(stage).toHaveAttribute("data-frame","12");
  await viewer.screenshot({path:".local/spin-completion/browser/varsity-final-back.png"});
});
