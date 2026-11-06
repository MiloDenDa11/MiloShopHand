import {test,expect} from "@playwright/test";

const productPath="/san-pham/ml-tee-everyday-crew";
const viewer=(page:any)=>page.locator(".photo-spin-viewer");
const stage=(page:any)=>page.locator(".photo-spin-stage");
async function open(page:any){
  await page.goto(productPath);
  await page.locator("#main .detail-image-zoom").click();
  await expect(viewer(page)).toHaveAttribute("data-viewer-status","ready");
}

test("catalog phân trang vừa màn hình 360px và mở được trang cuối",async({page,request})=>{
  await page.setViewportSize({width:360,height:900});
  const catalog=await(await request.get("/api/v1/products?limit=12")).json();
  await page.goto("/san-pham");
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.getByRole("button",{name:`Trang ${catalog.pages}`,exact:true}).click();
  await expect(page).toHaveURL(new RegExp(`[?&]page=${catalog.pages}(?:&|$)`));
  await expect(page.locator(".catalog-grid .product-card")).toHaveCount(catalog.total-(catalog.pages-1)*12);
});

test("bấm ảnh mở 24 góc thật, chỉ kéo ngang quanh Oy và không tải GLB/canvas",async({page})=>{
  const models:string[]=[],atlases:string[]=[],errors:string[]=[];
  page.on("request",r=>{
    if(r.url().includes(".glb"))models.push(r.url());
    if(r.url().includes("/_next/image")&&new URL(r.url()).searchParams.get("w")==="1920"&&decodeURIComponent(r.url()).includes("/collection-spin/"))atlases.push(r.url());
  });
  page.on("pageerror",e=>errors.push(e.message));
  await page.goto(productPath);
  // The front/back gallery can share two optimized atlas files with 360.
  // The complete four-atlas set must wait for the explicit open action.
  expect(new Set(atlases).size).toBeLessThan(4);
  await page.locator("#main .detail-image-zoom").click();
  await expect(viewer(page)).toHaveAttribute("data-viewer-status","ready");
  await expect(viewer(page)).toHaveAttribute("data-axis","y");
  await expect(page.locator("canvas")).toHaveCount(0);
  expect(new Set(atlases).size).toBe(4);
  expect(models).toHaveLength(0);
  await stage(page).focus();
  const frames=new Set<string>();
  for(let n=0;n<24;n++){
    frames.add((await stage(page).getAttribute("data-frame"))!);
    await page.keyboard.press("ArrowRight");
    await expect(stage(page)).toHaveAttribute("data-frame",String((n+1)%24));
  }
  expect(frames.size).toBe(24);
  const box=(await stage(page).boundingBox())!;
  await page.mouse.move(box.x+box.width*.5,box.y+box.height*.4);
  await page.mouse.down();
  await page.mouse.move(box.x+box.width*.5,box.y+box.height*.7,{steps:8});
  await page.mouse.up();
  await expect(stage(page)).toHaveAttribute("data-frame","0");
  await page.mouse.move(box.x+box.width*.4,box.y+box.height*.5);
  await page.mouse.down();
  await page.mouse.move(box.x+box.width*.8,box.y+box.height*.5,{steps:8});
  await page.mouse.up();
  await expect(stage(page)).not.toHaveAttribute("data-frame","0");
  await page.getByRole("button",{name:"Mặt sau",exact:true}).click();
  await expect(stage(page)).toHaveAttribute("data-frame","12");
  await viewer(page).screenshot({path:".local/photo-spin/verified-tee-back.png"});
  await page.getByRole("button",{name:"Phóng to ảnh",exact:true}).click();
  await expect(stage(page)).toHaveAttribute("data-zoom","1.2");
  await page.getByRole("button",{name:"Đặt lại góc nhìn",exact:true}).click();
  await expect(stage(page)).toHaveAttribute("data-frame","0");
  await expect(stage(page)).toHaveAttribute("data-zoom","1");
  await page.keyboard.press("Escape");
  await expect(viewer(page)).toHaveCount(0);
  await expect(page.locator("#main .detail-image-zoom")).toBeFocused();
  expect(errors).toEqual([]);
});

test("360px, vuốt cảm ứng, reduced motion và WebGL tắt vẫn xoay ảnh, thêm giỏ",async({page})=>{
  await page.setViewportSize({width:360,height:800});
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.addInitScript(()=>{
    const original=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(type:any,...args:any[]){
      if(String(type).startsWith("webgl"))return null;
      return original.call(this,type,...args as any);
    } as any;
  });
  await open(page);
  const box=(await stage(page).boundingBox())!;
  const cdp=await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x:box.x+box.width*.8,y:box.y+box.height*.5}]});
  for(let n=1;n<=5;n++)await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:box.x+box.width*(.8-n*.08),y:box.y+box.height*.5}]});
  await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
  await expect(stage(page)).not.toHaveAttribute("data-frame","0");
  await expect.poll(()=>page.getByRole("dialog").evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await viewer(page).screenshot({path:".local/photo-spin/verified-mobile.png"});
  await page.keyboard.press("Escape");
  await page.getByRole("button",{name:"M",exact:true}).click();
  await page.getByRole("button",{name:"Thêm vào giỏ hàng",exact:true}).click();
  await expect(page.getByRole("dialog",{name:"Giỏ hàng",exact:true})).toBeVisible();
  await expect.poll(()=>page.locator(".cart-line img").first().evaluate((el:HTMLImageElement)=>el.complete&&el.naturalWidth>0)).toBe(true);
});

test("ảnh tải lỗi có thông báo, gallery còn dùng được và thử lại thành công",async({page})=>{
  let fail=true;
  await page.route("**/_next/image?**",route=>{
    const url=new URL(route.request().url());
    return fail&&url.searchParams.get("w")==="1920"&&url.searchParams.get("url")?.startsWith("/collection-spin/")?route.fulfill({status:503,body:"unavailable"}):route.continue();
  });
  await page.goto(productPath);
  await page.getByRole("button",{name:"Khám phá thiết kế 360°",exact:true}).click();
  await expect(viewer(page)).toHaveAttribute("data-viewer-status","error");
  await expect(viewer(page)).toContainText("thư viện");
  fail=false;
  await viewer(page).getByRole("button",{name:"Thử lại",exact:true}).click();
  await expect(viewer(page)).toHaveAttribute("data-viewer-status","ready");
  await page.keyboard.press("Escape");
  await expect.poll(()=>page.locator(".detail-main img").evaluate((el:HTMLImageElement)=>el.complete&&el.naturalWidth>0)).toBe(true);
});

test("đổi màu giữ góc sau, đúng bộ ảnh trắng/đen và giỏ đúng màu đen",async({page})=>{
  await open(page);
  const dialog=page.getByRole("dialog");
  await dialog.getByRole("button",{name:"Mặt sau",exact:true}).click();
  await dialog.getByRole("button",{name:"Đen",exact:true}).click();
  await expect(viewer(page)).toHaveAttribute("data-viewer-status","ready");
  await expect(stage(page)).toHaveAttribute("data-frame","12");
  await expect(page.locator(".photo-spin-sheet")).toHaveAttribute("style",/black/);
  await dialog.getByRole("button",{name:"Trắng",exact:true}).click();
  await expect(viewer(page)).toHaveAttribute("data-viewer-status","ready");
  await expect(stage(page)).toHaveAttribute("data-frame","12");
  await expect(page.locator(".photo-spin-sheet")).toHaveAttribute("style",/white/);
  await dialog.getByRole("button",{name:"Đen",exact:true}).click();
  await expect(viewer(page)).toHaveAttribute("data-viewer-status","ready");
  await page.keyboard.press("Escape");
  await expect(page.locator(".detail-main img")).toHaveAttribute("src",/black/);
  await page.getByRole("button",{name:"M",exact:true}).click();
  await page.getByRole("button",{name:"Thêm vào giỏ hàng",exact:true}).click();
  await expect(page.locator(".cart-line").first()).toContainText("Đen");
  await expect(page.locator(".cart-line img").first()).toHaveAttribute("src",/black/);
});

test("màu chưa có ảnh không mượn bộ 360 của màu khác",async({page})=>{
  await page.goto("/san-pham/ml-tee-heavy-box");
  await page.locator("#main .detail-image-zoom").click();
  await expect(viewer(page)).toHaveAttribute("data-viewer-status","ready");
  const dialog=page.getByRole("dialog");
  await dialog.getByRole("button",{name:"Trắng",exact:true}).click();
  await expect(viewer(page)).toHaveCount(0);
  await expect(dialog).toContainText("màu Trắng đang được bổ sung");
});

test("bấm ảnh sau mở đúng mặt sau, bốn loại áo có đủ ảnh 360",async({page})=>{
  await page.goto(productPath);
  await page.locator(".thumbnails button").nth(1).click();
  await page.locator("#main .detail-image-zoom").click();
  await expect(viewer(page)).toHaveAttribute("data-viewer-status","ready");
  await expect(stage(page)).toHaveAttribute("data-frame","12");
  await page.keyboard.press("Escape");
  for(const slug of ["ml-hoodie-cloud-pullover","ml-jacket-field-four","ml-bomber-flight-ma1"]){
    await page.goto(`/san-pham/${slug}`);
    await page.locator("#main .detail-image-zoom").click();
    await expect(viewer(page)).toHaveAttribute("data-viewer-status","ready");
    await page.getByRole("button",{name:"Mặt sau",exact:true}).click();
    await expect(stage(page)).toHaveAttribute("data-frame","12");
    await viewer(page).screenshot({path:`.local/photo-spin/verified-${slug}-back.png`});
    await page.keyboard.press("Escape");
  }
});
