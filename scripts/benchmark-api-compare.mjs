import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";

const [countArgument = "90", sampleArgument = "15", detailSlug = "downtown-bomber"] = process.argv.slice(2);
const expectedCount = Number(countArgument), samples = Number(sampleArgument);
if (!Number.isInteger(expectedCount) || !Number.isInteger(samples) || samples < 3 || samples > 25) {
  throw new Error("Usage: node scripts/benchmark-api-compare.mjs <product-count> [3..25 samples] [detail-slug]");
}
const variants = [
  { label: `before-${expectedCount}`, base: "http://localhost:4200/api/v1", compiled: ".local/performance/api-before/apps/api/src/catalog.js" },
  { label: `after-${expectedCount}`, base: "http://localhost:4201/api/v1", compiled: "apps/api/dist/apps/api/src/catalog.js" },
];
for (const variant of variants) {
  const response = await fetch(`${variant.base}/products?limit=1`);
  if (!response.ok) throw new Error(`${variant.label}: ${response.status}`);
  const data = await response.json();
  if (data.total !== expectedCount) throw new Error(`${variant.label}: expected ${expectedCount} products, found ${data.total}; no benchmark files changed.`);
}
const routes = [
  "/config", "/catalog", "/products?limit=12", "/products?q=ao&stock=true&size=M&limit=12",
  "/products?sort=bestseller&limit=12", "/products?sort=rating&limit=12", `/products/${encodeURIComponent(detailSlug)}`,
];
const reports = variants.map((variant) => ({
  label: variant.label, at: new Date().toISOString(), base: variant.base, samples, productCount: expectedCount, detailSlug,
  compiledCatalogSha256: createHash("sha256").update(fs.readFileSync(variant.compiled)).digest("hex"),
  conditions: "Paired loopback requests alternate A/B and B/A; one warmup per endpoint; no CPU/network throttle; guest; compiled Node API with development providers; same database, separate Redis DB 6/7; includes response body download.",
  results: [],
}));
async function request(variant, route) {
  const start = performance.now();
  const response = await fetch(variant.base + route);
  const body = await response.text();
  if (!response.ok) throw new Error(`${variant.label} ${route}: ${response.status}`);
  return { elapsed: performance.now() - start, bytes: Buffer.byteLength(body) };
}
for (const route of routes) {
  const measurements = variants.map(() => []), bytes = [0, 0], coldMs = [];
  for (let index = 0; index < variants.length; index++) coldMs[index] = (await request(variants[index], route)).elapsed;
  for (let iteration = 0; iteration < samples; iteration++) {
    for (const index of iteration % 2 ? [1, 0] : [0, 1]) {
      const result = await request(variants[index], route);
      measurements[index].push(result.elapsed);
      bytes[index] = result.bytes;
    }
  }
  for (let index = 0; index < variants.length; index++) {
    const sorted = measurements[index].sort((a, b) => a - b);
    const percentile = (p) => Number(sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)].toFixed(2));
    reports[index].results.push({ route, coldMs: Number(coldMs[index].toFixed(2)), medianMs: percentile(0.5), p95Ms: percentile(0.95), minMs: Number(sorted[0].toFixed(2)), bytes: bytes[index] });
  }
}
const directory = path.resolve(".local/performance");
fs.mkdirSync(directory, { recursive: true });
for (const report of reports) fs.writeFileSync(path.join(directory, `api-${report.label}.json`), JSON.stringify(report, null, 2));
console.log(JSON.stringify(reports.map(({ label, productCount, samples, results }) => ({ label, productCount, samples, results })), null, 2));
