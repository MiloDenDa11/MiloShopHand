import {test,expect} from "@playwright/test";
import {spinDelivery} from './spin-assets';

const dropPath="/san-pham?q=Drop%20Shoulder%20Hood";
const preview=(page:any)=>page.locator("#main .product-card-preview").first();

test("bấm chấm màu đổi ngay ảnh tĩnh đúng màu trước khi rê chuột vào áo",async({page})=>{
  await page.goto("/san-pham?q=Everyday%20Crew");
  const card=page.locator("#main .product-card").first();
  const product=await (await page.request.get("/api/v1/products/ml-tee-everyday-crew")).json();
  const sources=new Set<string>();
  for(const color of ["Đen","Trắng","Đỏ mận"]){
    await card.getByRole("button",{name:`Xem màu ${color}`,exact:true}).click();
    await expect(card).toHaveAttribute("data-selected-color",color);
    await expect(card).toHaveAttribute("data-color-photo-status","ready");
    const photo=product.images.find((image:any)=>image.color===color&&image.view==="front");
    const hash=new URL(photo.url,"https://milo.test").searchParams.get("v")!;
    const image=card.locator(".product-photo-primary img");
    await expect(image).toHaveAttribute("src",new RegExp(hash));
    await expect.poll(()=>image.evaluate((element:HTMLImageElement)=>element.complete&&element.naturalWidth>0)).toBe(true);
    sources.add((await image.getAttribute("src"))!);
    await expect(card.locator(".product-card-spin-stage,.product-card-color-pending")).toHaveCount(0);
    await expect(card.locator(".product-card-selected-color")).toHaveText(`Màu: ${color}`);
  }
  expect(sources.size).toBe(3);
});

test("màu chưa có ảnh phản hồi rõ tại vùng ảnh, không giữ áo màu cũ và không tràn ở 360px",async({page})=>{
  await page.setViewportSize({width:360,height:800});
  await page.goto("/san-pham?q=Minimal%20No%20Pocket");
  const card=page.locator("#main .product-card").first(),visual=card.locator(".product-visual");
  const originalHeight=(await visual.boundingBox())!.height;
  const button=card.getByRole("button",{name:"Xem màu Trắng",exact:true});
  await expect(button).toBeEnabled();
  await button.focus();await button.press("Space");
  await expect(button).toHaveAttribute("aria-pressed","true");
  await expect(card).toHaveAttribute("data-color-photo-status","pending");
  const pending=visual.getByRole("status");
  await expect(pending).toContainText("Màu Trắng");
  await expect(pending).toContainText("Ảnh màu này đang cập nhật");
  await expect(visual.locator("img,canvas,.photo-spin-sheet")).toHaveCount(0);
  expect((await visual.boundingBox())!.height).toBeCloseTo(originalHeight,0);
  expect(await pending.evaluate(element=>element.scrollHeight<=element.clientHeight)).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await visual.screenshot({path:".local/colour-switch/pending-mobile.png"});
  await card.getByRole("button",{name:"Xem ảnh mẫu ban đầu",exact:true}).click();
  await expect(card).toHaveAttribute("data-color-photo-status","ready");
  await expect(visual.locator(".product-photo-primary img")).toBeVisible();
  await expect(pending).toHaveCount(0);
  await button.click();
  await card.getByRole("link",{name:/Xem chi tiết/}).click();
  await expect(page).toHaveURL(url=>url.pathname==="/san-pham/ml-hoodie-minimal-no-pocket"&&url.searchParams.get("color")==="Trắng");
});

test("di chuột ngay trên thẻ áo xoay đủ24 ảnh quanh Oy, tải theo nhu cầu và bấm mở chi tiết",async({page})=>{
  await page.emulateMedia({reducedMotion:"reduce"});
  const requests:string[]=[],errors:string[]=[];
  page.on("request",r=>{if(/\/product-media\/.*-spin-card\.webp$/.test(r.url()))requests.push(r.url());});
  page.on("pageerror",e=>errors.push(e.message));
  await page.goto(dropPath);
  const image=preview(page);
  await expect(image).toHaveAttribute("data-card-spin","true");
  expect(new Set(requests).size).toBeLessThan(4);
  await image.scrollIntoViewIfNeeded();
  const before=(await image.boundingBox())!;
  await image.hover();
  await expect(image).toHaveAttribute("data-spin-status","ready");
  await expect(image).toHaveAttribute("data-axis","y");
  const box=(await image.boundingBox())!;
  const frames=new Set<string>(),atlases=new Set<string>();
  for(let frame=0;frame<24;frame++){
    await page.mouse.move(box.x+(frame+.2)/24*box.width,box.y+box.height*.5);
    await expect(image).toHaveAttribute("data-spin-active","true");
    await expect(image).toHaveAttribute("data-frame",String(frame));
    frames.add((await image.locator(".photo-spin-sheet").getAttribute("style"))!);
    atlases.add(await image.locator(".photo-spin-sheet").evaluate(el=>getComputedStyle(el).backgroundImage));
  }
  expect(frames.size).toBe(24);expect(atlases.size).toBe(4);
  expect(new Set(requests).size).toBe(4);
  expect((await image.boundingBox())!.height).toBeCloseTo(before.height,0);
  await expect(page.locator("dialog[open],canvas")).toHaveCount(0);
  await page.mouse.move(box.x+box.width+12,box.y);
  await expect(image.locator(".product-card-spin-stage")).toHaveCount(0);
  await image.focus();await image.press("Home");await image.press("ArrowRight");
  await expect(image).toHaveAttribute("data-frame","1");
  await image.press("Enter");await expect(page).toHaveURL(url=>url.pathname==="/san-pham/ml-hoodie-drop-shoulder-hood");
  expect(errors).toEqual([]);
});

test("thẻ xoay dùng ảnh riêng theo màu, không nhuộm ảnh bằng blob",async({page})=>{
  await page.goto("/san-pham?q=Everyday%20Crew");
  const card=page.locator("#main .product-card").first();
  for(const [color,hex] of [["Đen","#151515"],["Trắng","#f8f7f2"],["Đỏ mận","#722f37"]]){
    await card.getByRole("button",{name:`Xem màu ${color}`,exact:true}).click();
    const image=card.locator(".product-card-preview");await image.hover();
    await expect(image).toHaveAttribute("data-spin-status","ready");
    const box=(await image.boundingBox())!;
    await page.mouse.move(box.x+box.width*.52,box.y+box.height*.5);
    await expect(image).toHaveAttribute("data-frame","12");
    await expect(image.locator(".photo-spin-sheet")).toHaveAttribute("style",new RegExp(spinDelivery('ml-tee-everyday-crew',hex,2,'card').replaceAll('.','\\.')));
  }
  await page.goto("/san-pham?q=Heavy%20Box");
  const pending=page.locator("#main .product-card").first();
  await pending.getByRole("button",{name:"Xem màu Trắng",exact:true}).click();
  await pending.locator(".product-card-preview").hover();
  await expect(pending.locator(".product-card-preview")).toHaveAttribute("data-card-spin","true");
  await expect(pending.locator(".product-card-preview")).toHaveAttribute("data-spin-status","ready");
  await expect(pending.locator(".product-card-spin-stage")).toHaveAttribute("data-native-color","#f8f7f2");
  await expect(pending).not.toContainText("Phối màu xem trước");
  await expect(pending.locator(".photo-spin-sheet")).toHaveAttribute("style",/spin-card\.webp/);
  await expect(pending.locator(".photo-spin-sheet")).not.toHaveAttribute("style",/blob:/);
});

test("360px vuốt trên ảnh thẻ để xoay, giữ cuộn dọc và không mở nhầm trang",async({page})=>{
  await page.setViewportSize({width:360,height:800});
  await page.goto(dropPath);
  const image=preview(page);await image.scrollIntoViewIfNeeded();
  const box=(await image.boundingBox())!,cdp=await page.context().newCDPSession(page);
  const x=box.x+box.width*.75,y=box.y+box.height*.5;
  await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x,y}]});
  for(let step=1;step<=6;step++)await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:x-step*15,y}]});
  await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
  await expect(image).toHaveAttribute("data-spin-status","ready");
  await expect(image).not.toHaveAttribute("data-frame","0");
  await expect(page).toHaveURL(/\/san-pham\?q=/);
  expect(await image.evaluate(el=>getComputedStyle(el).touchAction)).toBe("pan-y");
  const before=await page.evaluate(()=>scrollY);
  await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x,y}]});
  for(let step=1;step<=6;step++)await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x,y:y-step*15}]});
  await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
  await expect.poll(()=>page.evaluate(()=>scrollY)).not.toBe(before);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test("lỗi ảnh xoay giữ ảnh tĩnh, rê chuột lại tải được",async({page})=>{
  let fail=true;
  await page.route("**/product-media/*-spin-card.webp",route=>{
    return fail?route.fulfill({status:503,body:"unavailable"}):route.continue();
  });
  await page.goto(dropPath);const image=preview(page);await image.hover();
  await expect(image).toHaveAttribute("data-spin-status","error");
  await expect(image.locator(".product-photo-primary")).toBeVisible();
  await expect(image.locator(".product-card-spin-stage")).toHaveCount(0);
  const box=(await image.boundingBox())!;await page.mouse.move(box.x+box.width+12,box.y);
  fail=false;await image.hover();await expect(image).toHaveAttribute("data-spin-status","ready");
});
