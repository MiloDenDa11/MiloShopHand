import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";

const [label = "after", base = "http://localhost:4000/api/v1", samplesArgument = "12"] = process.argv.slice(2);
const samples = Number(samplesArgument);
if (!/^[a-z0-9-]+$/i.test(label) || !Number.isInteger(samples) || samples < 3 || samples > 25) {
  throw new Error("Usage: node scripts/benchmark-api.mjs <label> <api-base-url> [3..25 samples]");
}
const catalog = await fetch(`${base}/products?limit=1`).then((response) => response.json());
const slug = catalog.items?.[0]?.slug;
if (!slug) throw new Error("Benchmark requires an active product.");
const routes = [
  "/config", "/catalog", "/products?limit=12", "/products?q=ao&stock=true&size=M&limit=12",
  "/products?sort=bestseller&limit=12", "/products?sort=rating&limit=12", `/products/${encodeURIComponent(slug)}`,
];
const results = [];
for (const route of routes) {
  const timings = [];
  let bytes = 0;
  for (let index = 0; index <= samples; index++) {
    const start = performance.now();
    const response = await fetch(base + route);
    const body = await response.text();
    if (!response.ok) throw new Error(`${route}: ${response.status}`);
    bytes = Buffer.byteLength(body);
    if (index > 0) timings.push(performance.now() - start);
  }
  timings.sort((a, b) => a - b);
  const percentile = (p) => Number(timings[Math.min(timings.length - 1, Math.ceil(p * timings.length) - 1)].toFixed(2));
  results.push({ route, medianMs: percentile(0.5), p95Ms: percentile(0.95), minMs: Number(timings[0].toFixed(2)), bytes });
}
const report = {
  label, at: new Date().toISOString(), base, samples, productCount: catalog.total,
  conditions: "Sequential loopback requests; one warmup per endpoint; no throttling; guest session; Node fetch includes body download.",
  results,
};
const directory = path.resolve(".local/performance");
fs.mkdirSync(directory, { recursive: true });
fs.writeFileSync(path.join(directory, `api-${label}.json`), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
