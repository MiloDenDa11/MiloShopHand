import {test,expect} from "@playwright/test";

const dropPath="/san-pham?q=Drop%20Shoulder%20Hood";
const preview=(page:any)=>page.locator("#main .product-card-preview").first();

test("di chuột ngay trên thẻ áo xoay đủ24 ảnh quanh Oy, tải theo nhu cầu và bấm mở chi tiết",async({page})=>{
  await page.emulateMedia({reducedMotion:"reduce"});
  const requests:string[]=[],errors:string[]=[];
  page.on("request",r=>{if(r.url().includes("/_next/image")&&new URL(r.url()).searchParams.get("w")==="1920"&&decodeURIComponent(r.url()).includes("/collection-spin/"))requests.push(r.url());});
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
  await image.press("Enter");await expect(page).toHaveURL(/\/san-pham\/ml-hoodie-drop-shoulder-hood$/);
  expect(errors).toEqual([]);
});

test("thẻ đổi đúng ảnh xoay theo màu, màu chưa có bộ riêng vẫn hiện ảnh tĩnh",async({page})=>{
  await page.goto("/san-pham?q=Everyday%20Crew");
  const card=page.locator("#main .product-card").first();
  for(const [color,key] of [["Đen","black"],["Trắng","white"],["Đỏ mận","burgundy"]]){
    await card.getByRole("button",{name:`Xem màu ${color}`,exact:true}).click();
    const image=card.locator(".product-card-preview");await image.hover();
    await expect(image).toHaveAttribute("data-spin-status","ready");
    const box=(await image.boundingBox())!;
    await page.mouse.move(box.x+box.width*.52,box.y+box.height*.5);
    await expect(image).toHaveAttribute("data-frame","12");
    await expect(image.locator(".photo-spin-sheet")).toHaveAttribute("style",new RegExp(key));
  }
  await page.goto("/san-pham?q=Heavy%20Box");
  const pending=page.locator("#main .product-card").first();
  await pending.getByRole("button",{name:"Xem màu Trắng",exact:true}).click();
  await pending.locator(".product-card-preview").hover();
  await expect(pending.locator(".product-card-preview")).toHaveAttribute("data-card-spin","false");
  await expect(pending.locator(".product-card-spin-stage")).toHaveCount(0);
  await expect(pending).toContainText("Ảnh xoay đang cập nhật");
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
  await page.route("**/_next/image?**",route=>{
    const url=new URL(route.request().url());
    return fail&&url.searchParams.get("w")==="1920"&&url.searchParams.get("url")?.includes("/collection-spin/")?route.fulfill({status:503,body:"unavailable"}):route.continue();
  });
  await page.goto(dropPath);const image=preview(page);await image.hover();
  await expect(image).toHaveAttribute("data-spin-status","error");
  await expect(image.locator(".product-photo-primary")).toBeVisible();
  await expect(image.locator(".product-card-spin-stage")).toHaveCount(0);
  const box=(await image.boundingBox())!;await page.mouse.move(box.x+box.width+12,box.y);
  fail=false;await image.hover();await expect(image).toHaveAttribute("data-spin-status","ready");
});
