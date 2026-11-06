import { test, expect } from "@playwright/test";

test("editorial Vietnamese uses the local italic face for all accented glyphs", async ({ page }) => {
  await page.goto("/bo-suu-tap");
  // Streamed HTML may temporarily retain hidden copies outside the live main.
  const title = page.locator("#main .editorial-title");
  await expect(title).toHaveCount(1);
  await expect(title).toContainText("Mùa nào.");
  await expect(title.locator("em")).toHaveText("Chất riêng ấy.");
  await page.evaluate(() => document.fonts.ready);
  const session = await page.context().newCDPSession(page);
  await session.send("DOM.enable");
  await session.send("CSS.enable");
  const { root } = await session.send("DOM.getDocument");
  const { nodeId } = await session.send("DOM.querySelector", { nodeId: root.nodeId, selector: "#main .editorial-title em" });
  const { fonts } = await session.send("CSS.getPlatformFontsForNode", { nodeId });
  expect(fonts.length).toBeGreaterThan(0);
  expect(fonts.every(font => font.isCustomFont && /MiloEditorial/i.test(font.familyName))).toBe(true);
  for (const width of [360, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const metrics = await title.evaluate(element => ({ spacing: parseFloat(getComputedStyle(element).letterSpacing), size: parseFloat(getComputedStyle(element).fontSize), line: parseFloat(getComputedStyle(element).lineHeight) }));
    expect(metrics.spacing / metrics.size).toBeGreaterThanOrEqual(-0.025);
    expect(metrics.line / metrics.size).toBeGreaterThanOrEqual(1.14);
  }
});

test("catalog media renders instead of being silently filtered; dimensions stay stable", async ({ page }) => {
  await page.goto("/san-pham");
  const card = page.locator(".product-card").first();
  await expect(card).toBeVisible();
  const frame = card.locator(".product-photo-frame").first();
  const image = frame.locator("img");
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
  const before = await frame.boundingBox();
  expect(before).not.toBeNull();
  expect(before!.height / before!.width).toBeCloseTo(4 / 3, 1);
  const source = await image.getAttribute("src");
  expect(source).toBeTruthy();
  expect(await image.getAttribute("width")).toBeTruthy();
  expect(await image.getAttribute("height")).toBeTruthy();
  if ((source || "").includes("collection-ai")) {
    const aspect = await image.evaluate(element => { const bounds = element.getBoundingClientRect(); return bounds.width / bounds.height; });
    expect(aspect).toBeCloseTo(2, 1);
  }
});
