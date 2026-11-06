import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const base = process.env.SMOKE_URL || "http://localhost:3000";
const designs = JSON.parse(fs.readFileSync("apps/web/content/collection-designs.json", "utf8"));
const output = path.resolve("docs/collection-upgrade/previews"); fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ["--enable-unsafe-swiftshader"] });
const report = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error" && !/401/.test(message.text())) errors.push(message.text()); });
  page.on("response", (response) => { if (response.status() >= 400 && !(response.status() === 401 && response.url().endsWith("/me"))) errors.push(`${response.status()} ${response.url()}`); });
  for (const kind of ["tee", "jacket", "bomber", "hoodie"]) {
    const design = designs.find((item) => item.kind === kind);
    await page.goto(`${base}/san-pham/${design.slug}`);
    await page.locator("main .detail-main img").first().waitFor({ state: "visible" });
    await page.evaluate(() => document.fonts.ready);
    if (await page.locator("canvas").count()) throw new Error("3D initialized before opening viewer");
    await page.locator("main .product-360 > button").first().click();
    await page.locator('.garment-viewer[data-viewer-status="ready"]').waitFor();
    const stage = page.locator(".garment-viewer-stage");
    await stage.evaluate((element) => scrollTo(0, element.getBoundingClientRect().top + scrollY - 160));
    await stage.screenshot({ path: path.join(output, `${kind}-front-360.png`) });
    await page.locator(".garment-viewer-controls button").nth(2).click();
    await page.waitForFunction(() => document.querySelector(".garment-viewer-stage")?.dataset.angle === "180");
    await stage.screenshot({ path: path.join(output, `${kind}-back-360.png`) });
    await page.getByRole("button", { name: "Đóng chế độ 360°", exact: true }).click();
    if (await page.locator("canvas").count()) throw new Error("3D context remains after closing");
    report.push({ kind, slug: design.slug, model: "loaded", frontBack: "PASS", onDemand: "PASS", disposal: "PASS" });
  }
  await page.goto(base + "/bo-suu-tap"); await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(output, "vietnamese-font-desktop.png"), fullPage: false });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.screenshot({ path: path.join(output, "vietnamese-font-mobile.png"), fullPage: false });
  await page.goto(base + "/san-pham");
  await page.locator(".catalog-grid .product-card").first().waitFor({ state: "visible" });
  await page.waitForFunction(() => { const image = document.querySelector(".catalog-grid .product-card img"); return image?.complete && image.naturalWidth > 0; });
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error("Production catalog overflows 360px");
  await page.screenshot({ path: path.join(output, "catalog-mobile.png"), fullPage: false });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(base);
  await page.locator(".product-card").first().waitFor({ state: "visible" });
  await page.waitForFunction(() => { const image = document.querySelector(".edition-hero-photo img"); return image?.complete && image.naturalWidth > 0; });
  await page.screenshot({ path: path.join(output, "home-desktop.png"), fullPage: false });
  if (errors.length) throw new Error(errors.join("\n"));
  const result = { at: new Date().toISOString(), base, result: "PASS", productKinds: report, errors };
  fs.writeFileSync(".local/collection-upgrade/production-smoke.json", JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally { await browser.close(); }
