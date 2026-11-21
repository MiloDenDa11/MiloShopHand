import { test, expect, type Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  // These are read-only storefront checks; avoid adding anonymous auth audit rows.
  await page.route(/\/api\/v1\/me(?:[/?]|$)/, route => route.fulfill({ status: 401, contentType: "application/json", body: '{"code":"UNAUTHORIZED"}' }));
});

async function imagesReady(page: Page, selector: string) {
  const images = page.locator(selector);
  for (let i = 0; i < await images.count(); i++) {
    const image = images.nth(i);
    await image.scrollIntoViewIfNeeded();
    await expect(image).toHaveAttribute("alt", /\S+/);
    await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
  }
}
async function noOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test("style and journal cards have distinct local editorial photographs and retain their destinations", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const cover = page.locator(".edition-hero-photo > .milo-editorial-photo");
  await expect.poll(() => cover.evaluate(element => { const bounds = element.getBoundingClientRect(); return Math.abs(bounds.width / bounds.height - 2 / 3); })).toBeLessThan(.01);
  const styles = page.locator(".editorial-style-card");
  await expect(styles).toHaveCount(4);
  const destinations = ["/san-pham?style=minimal", "/san-pham?category=ao-bomber", "/san-pham?fit=Oversized", "/san-pham?style=streetwear"];
  for (let i = 0; i < 4; i++) await expect(styles.nth(i)).toHaveAttribute("href", destinations[i]);
  await imagesReady(page, ".editorial-style-card img, .editorial-journal-card img");
  expect(new Set(await styles.locator("[data-editorial-photo]").evaluateAll(elements => elements.map(e => e.getAttribute("data-editorial-photo")))).size).toBe(4);
  await expect(page.locator(".editorial-journal-card")).toHaveCount(3);
  for (const id of ["everyday", "vintage", "care"]) await expect(page.locator(`.editorial-journal-card[href='/phong-cach#${id}'] img`)).toHaveCount(1);
  await noOverflow(page);
  await page.locator(".edition-styles").screenshot({ path: "docs/vintage-editorial/previews/styles-1440.png" });
  await page.locator(".edition-journal-band").screenshot({ path: "docs/vintage-editorial/previews/journal-cards-1440.png" });
  await styles.first().click();
  await expect(page).toHaveURL(/\/san-pham\?style=minimal/);
  expect(errors).toEqual([]);
});

for (const width of [360, 768, 1024, 1440]) {
  test(`customer care tabs, policy fidelity, contextual photographs and responsive layout at ${width}px`, async ({ page }) => {
    const errors: string[] = [], failedImages: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("response", response => { if (response.status() >= 400 && (response.url().includes("/editorial/") || response.url().includes("/_next/image"))) failedImages.push(response.url()); });
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const configResponse = await page.request.get("/api/v1/config");
    expect(configResponse.ok()).toBe(true);
    const config = await configResponse.json();
    await page.goto("/chinh-sach");
    const tabs = [
      { id: "giao-hang", label: "Giao hàng & thanh toán", photo: "order-packaging", policy: "shipping", text: config.shippingPolicy },
      { id: "doi-tra", label: "Đổi trả & chọn size", photo: "size-measurement", policy: "returns", text: config.returnPolicy },
      { id: "bao-mat", label: "Quyền riêng tư", photo: "privacy-still-life", policy: "privacy", text: config.privacyPolicy },
      { id: "faq", label: "Câu hỏi thường gặp", photo: "customer-service" },
      { id: "lien-he", label: "Liên hệ", photo: "boutique-atmosphere" },
    ];
    const visualPhotos: string[] = [];
    for (const tab of tabs) {
      await page.getByRole("navigation", { name: "Chăm sóc khách hàng", exact: true }).getByRole("link", { name: tab.label, exact: true }).click();
      await expect(page.locator(".care-content")).toHaveAttribute("data-care-tab", tab.id);
      await expect(page.locator(".care-nav [aria-current='page']")).toHaveText(tab.label);
      await expect(page.locator(".care-visuals")).toHaveAttribute("data-care-visual-tab", tab.id);
      await expect(page.locator(".care-cover [data-editorial-photo]")).toHaveAttribute("data-editorial-photo", tab.photo);
      if (tab.policy && tab.text) await expect(page.locator(`[data-policy='${tab.policy}'] > p`)).toHaveText(tab.text);
      await imagesReady(page, ".care-cover img, .care-visual-card img");
      visualPhotos.push((await page.locator(".care-visual-card [data-editorial-photo]").first().getAttribute("data-editorial-photo"))!);
      await noOverflow(page);
      if (width === 1440) {
        const boxes = await page.locator(".care-sidebar,.care-content,.care-visuals").evaluateAll(elements => elements.map(e => { const b = e.getBoundingClientRect(); return { x: b.x, right: b.right }; }));
        expect(boxes[1].x).toBeGreaterThan(boxes[0].right);
        expect(boxes[2].x).toBeGreaterThan(boxes[1].right);
      }
      if ((width === 1440 || width === 360) && ["giao-hang", "doi-tra", "faq", "lien-he"].includes(tab.id)) {
        await page.evaluate(() => { (document.activeElement as HTMLElement)?.blur(); window.scrollTo({top:0,behavior:"instant"}); });
        await page.screenshot({ path: `docs/vintage-editorial/previews/${tab.id}-${width}.png`, fullPage: true });
      }
    }
    expect(new Set(visualPhotos).size).toBeGreaterThanOrEqual(4);
    expect(errors).toEqual([]); expect(failedImages).toEqual([]);
    if (config.contactEmail?.endsWith(".local")) await expect(page.locator("#main a[href^='mailto:']")).toHaveCount(0);
    await page.reload();
    await expect(page.locator(".care-content")).toHaveCount(1);
    await expect(page.locator(".care-content")).toHaveAttribute("data-care-tab", "lien-he");
    await page.goBack();
    await expect(page.locator(".care-content")).toHaveCount(1);
    await expect(page.locator(".care-content")).toHaveAttribute("data-care-tab", "faq");
  });
}

test("FAQ search handles Vietnamese without accents, category filtering, keyboard expansion and empty results", async ({ page }) => {
  await page.goto("/chinh-sach?tab=faq");
  const search = page.getByRole("searchbox", { name: "Tìm câu hỏi", exact: true });
  await search.fill("chuyen khoan");
  await expect(page.locator(".care-faq-list details")).toHaveCount(1);
  const question = page.locator(".care-faq-list summary").first();
  await question.focus(); await question.press("Enter");
  await expect(page.locator(".care-faq-list details")).toHaveAttribute("open", "");
  await expect(page.locator(".care-faq-answer")).toContainText("Không chuyển lần nữa");
  await question.press("Enter");
  await expect(page.locator(".care-faq-list details")).not.toHaveAttribute("open");
  await search.fill("");
  await page.getByRole("button", { name: "Đổi trả & size", exact: true }).click();
  await expect(page.locator(".care-faq-list")).toContainText("Tôi nên chọn size thế nào?");
  await expect(page.locator(".care-faq-list")).not.toContainText("Làm sao đặt hàng?");
  await search.fill("khong-co-cau-hoi-nay");
  await expect(page.locator(".care-faq-empty")).toBeVisible();
  await page.getByRole("button", { name: "Xem tất cả câu hỏi", exact: true }).click();
  await expect(search).toHaveValue("");
  await expect(page.locator(".care-faq-list details")).toHaveCount(9);
});

test("size deep link uses the existing sample values and matches product detail", async ({ page }) => {
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.goto("/chinh-sach?tab=doi-tra#size-guide");
    await expect(page.locator("#size-guide")).toHaveCount(1);
    await expect(page.locator("#size-guide")).toBeInViewport();
    await page.reload();
    await expect(page.locator("#size-guide")).toHaveCount(1);
    await expect(page.locator("#size-guide")).toBeInViewport();
  }
  const values = await page.locator(".care-size-table tbody tr").allTextContents();
  await page.goto("/san-pham/airy-cotton-tee");
  await page.locator("#size-guide summary").click();
  expect(await page.locator("#size-guide tbody tr").allTextContents()).toEqual(values);
});

test("journal reading cards retain anchors, link destinations and reduced-motion behaviour", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/phong-cach#care");
  await expect(page.locator("#care")).toBeInViewport();
  await page.reload();
  await expect(page.locator("#care")).toHaveCount(1);
  await expect(page.locator("#care")).toBeInViewport();
  await imagesReady(page, ".editorial-reading-article img");
  await expect(page.locator(".editorial-reading-article")).toHaveCount(3);
  await expect(page.locator("#care a.text-link")).toHaveAttribute("href", "/chinh-sach?tab=doi-tra");
  for (const width of [360, 768, 1440]) { await page.setViewportSize({ width, height: 1000 }); await noOverflow(page); }
  await page.evaluate(() => { (document.activeElement as HTMLElement)?.blur(); window.scrollTo({top:0,behavior:"instant"}); });
  await page.screenshot({ path: "docs/vintage-editorial/previews/journal-reading-1440.png", fullPage: true });
  await page.goto("/chinh-sach?tab=faq");
  expect(await page.locator(".care-content").evaluate(e => getComputedStyle(e).animationName)).toBe("none");
});

test("home editorial cards remain readable at mobile, tablet and laptop widths", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  for (const width of [360, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await imagesReady(page, ".editorial-style-card img, .editorial-journal-card img");
    await noOverflow(page);
    const expectedColumns = width <= 560 ? 1 : width <= 1100 ? 2 : 4;
    expect(await page.locator(".edition-style-grid").evaluate(e => getComputedStyle(e).gridTemplateColumns.split(" ").length)).toBe(expectedColumns);
  }
  await page.setViewportSize({ width: 360, height: 1000 });
  await page.locator(".edition-styles").screenshot({ path: "docs/vintage-editorial/previews/styles-360.png" });
});

test("subtle image hover respects the reduced motion preference", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  const card = page.locator(".editorial-style-card").first(), image = card.locator("img");
  await card.scrollIntoViewIfNeeded();
  await card.hover();
  await expect.poll(() => image.evaluate(element => Number(getComputedStyle(element).transform.match(/matrix\(([^,]+)/)?.[1] || 1))).toBeGreaterThan(1.03);
  const scale = await image.evaluate(element => Number(getComputedStyle(element).transform.match(/matrix\(([^,]+)/)?.[1] || 1));
  expect(scale).toBeLessThanOrEqual(1.06);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(() => image.evaluate(element => getComputedStyle(element).transform)).toBe("none");
});
