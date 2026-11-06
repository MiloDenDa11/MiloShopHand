// Production benchmark. Never writes store data; browser carts remain local.
import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const base = process.env.BENCHMARK_URL || "http://localhost:3200";
const label = process.argv[2] || "latest";
const output = path.resolve(process.env.BENCHMARK_OUTPUT || ".local/performance", `${label}.json`);
const passes = Number(process.env.BENCHMARK_PASSES || 3);
const routes = [
  ["home", "/", ".product-card"],
  ["catalog", "/san-pham", ".product-card"],
  ["search", "/san-pham?q=Everyday%20Essential", ".product-card"],
  ["detail", "/san-pham/everyday-essential-tee", ".detail-copy h1"],
  ["cart", "/gio-hang", "main h1"],
];
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const [device, viewport] of [["desktop", { width: 1440, height: 1000 }], ["mobile", { width: 390, height: 844 }]]) {
    for (const [name, route, readySelector] of routes) {
      const context = await browser.newContext({ viewport, reducedMotion: "reduce", serviceWorkers: "block" });
      const page = await context.newPage();
      await page.addInitScript(() => {
        window.__bench = { lcp: 0, cls: 0 };
        new PerformanceObserver((list) => { for (const entry of list.getEntries()) window.__bench.lcp = entry.startTime; }).observe({ type: "largest-contentful-paint", buffered: true });
        new PerformanceObserver((list) => { for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__bench.cls += entry.value; }).observe({ type: "layout-shift", buffered: true });
      });
      for (let pass = 0; pass < passes; pass++) {
        const requests = [];
        const errors = [];
        const receive = (response) => { if (response.url().includes("/api/v1/")) requests.push({ path: new URL(response.url()).pathname + new URL(response.url()).search, status: response.status() }); };
        const error = (exception) => errors.push(exception.message);
        page.on("response", receive);
        page.on("pageerror", error);
        const start = performance.now();
        await page.goto(base + route, { waitUntil: "domcontentloaded", timeout: 30000 });
        await page.locator(readySelector).first().waitFor({ state: "visible", timeout: 20000 });
        await page.evaluate(() => document.fonts.ready);
        const usableMs = performance.now() - start;
        // A fixed observation window is applied identically before and after.
        await page.waitForTimeout(700);
        const metrics = await page.evaluate(() => {
          const navigation = performance.getEntriesByType("navigation")[0];
          const resources = performance.getEntriesByType("resource");
          return {
            ttfbMs: navigation.responseStart - navigation.requestStart,
            domContentLoadedMs: navigation.domContentLoadedEventEnd,
            lcpMs: window.__bench.lcp,
            cls: window.__bench.cls,
            resourceCount: resources.length,
            transferBytes: resources.reduce((sum, r) => sum + r.transferSize, 0),
            jsTransferBytes: resources.filter(r => r.initiatorType === "script").reduce((sum, r) => sum + r.transferSize, 0),
            loadedProductImages: [...document.querySelectorAll(".product-card img, .detail-gallery img")].filter(i => i.complete && i.naturalWidth > 0).length,
          };
        });
        const counts = requests.reduce((map, request) => { map[request.path] = (map[request.path] || 0) + 1; return map; }, {});
        // Keep the original 700ms metrics unchanged for the before/after
        // comparison. Additional fields distinguish visible SSR content from
        // complete imagery and a working product option after hydration.
        const extra = {};
        const visibleImagesReady = await page.waitForFunction(() => [...document.images].filter(image => { const bounds = image.getBoundingClientRect(); return bounds.width > 100 && bounds.height > 100 && bounds.top < innerHeight && bounds.bottom > 0; }).every(image => image.complete && image.naturalWidth > 0), undefined, { timeout: 10000 }).then(() => true).catch(() => false);
        extra.visibleImagesReady = visibleImagesReady;
        extra.imagesSettledMs = performance.now() - start;
        extra.settledLcpMs = await page.evaluate(() => window.__bench.lcp);
        if (name === "detail") {
          const option = page.locator('#size-options button:not([disabled])').first();
          await page.evaluate(() => {
            const button = document.querySelector('#size-options button:not([disabled])');
            window.__bench.optionResponseMs = null;
            button.addEventListener("click", () => {
              const started = performance.now();
              const finish = () => { if (button.getAttribute("aria-pressed") === "true") requestAnimationFrame(() => requestAnimationFrame(() => { window.__bench.optionResponseMs = performance.now() - started; })); };
              const observer = new MutationObserver(() => { if (button.getAttribute("aria-pressed") === "true") { observer.disconnect(); finish(); } });
              observer.observe(button, { attributes: true, attributeFilter: ["aria-pressed"] });
              finish();
            }, { once: true });
          });
          await option.click();
          await page.waitForFunction(() => window.__bench.optionResponseMs !== null);
          extra.optionResponseMs = await page.evaluate(() => window.__bench.optionResponseMs);
        }
        results.push({ device, page: name, pass, cache: pass === 0 ? "cold-browser" : "warm-browser", usableMs, ...metrics, ...extra, apiRequests: requests, duplicateApiRequests: Object.entries(counts).filter(([, count]) => count > 1), errors });
        page.off("response", receive);
        page.off("pageerror", error);
        if (pass === 0) {
          await fs.mkdir(path.dirname(output), { recursive: true });
          await page.screenshot({ path: path.join(path.dirname(output), `${label}-${device}-${name}.png`), fullPage: false });
        }
      }
      await context.close();
    }
  }
  // Measure real client-side navigation separately from full document loads.
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(base, { waitUntil: "networkidle" });
  const start = performance.now();
  await page.locator('.desktop-nav a[href="/san-pham"]').first().click();
  await page.waitForURL("**/san-pham");
  await page.locator(".catalog-grid .product-card").first().waitFor();
  const clientNavigationMs = performance.now() - start;
  const report = { label, timestamp: new Date().toISOString(), conditions: { base, production: true, browser: "Chromium headless", platform: process.platform, cpu: os.cpus()[0].model, logicalCpuCount: os.cpus().length, passes, network: "local loopback; unthrottled", cpuThrottling: "none", reducedMotion: true, observationWindowMs: 700, usableDefinition: "time until route content and document fonts are visible; not a browser INP measurement", optionResponseDefinition: "product-size click event until two animation frames after the selected state commits; additional metric with no historical baseline", database: "same local Docker PostgreSQL and Redis" }, clientNavigationMs, results };
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, JSON.stringify(report, null, 2));
  const median = values => { const sorted = [...values].sort((a,b) => a-b); const middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2; };
  console.log(JSON.stringify({ output, clientNavigationMs: Math.round(clientNavigationMs), pages: routes.map(([name]) => ({ page: name, medianUsableMs: Math.round(median(results.filter(r => r.page === name).map(r => r.usableMs))), medianLcpMs: Math.round(median(results.filter(r => r.page === name).map(r => r.lcpMs))), medianTtfbMs: Math.round(median(results.filter(r => r.page === name).map(r => r.ttfbMs))) })) }, null, 2));
} finally {
  await browser.close();
}
