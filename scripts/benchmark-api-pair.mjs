import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

// Read-only comparison of a saved compiled API and the current compiled API.
// The old snapshot is local QA state, deliberately excluded from source control.
const root = process.cwd();
const old = path.resolve(".local/performance/api-before/apps/api/src/main.js");
if (!fs.existsSync(old)) throw new Error("Saved before API build is not available on this machine.");
const children = [];
const streams = [];
const configurations = [
  { label: "before-90", file: old, port: 4200, redis: 6 },
  { label: "after-90", file: path.resolve("apps/api/dist/apps/api/src/main.js"), port: 4201, redis: 7 },
];
const run = (file, args, env = process.env) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [file, ...args], { cwd: root, env, stdio: "inherit", windowsHide: true });
  child.once("error", reject);
  child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`Benchmark exited ${code}`)));
});
try {
  for (const configuration of configurations) {
    const redis = new URL(process.env.REDIS_URL || "redis://localhost:6379"); redis.pathname = `/${configuration.redis}`;
    const log = fs.openSync(path.resolve(`.local/performance/api-${configuration.label}.log`), "a"); streams.push(log);
    const env = { ...process.env, API_PORT: String(configuration.port), REDIS_URL: redis.toString(), NODE_ENV: "development", NODE_PATH: [path.resolve("apps/api/node_modules"), process.env.NODE_PATH].filter(Boolean).join(path.delimiter) };
    const child = spawn(process.execPath, [configuration.file], { cwd: root, env, stdio: ["ignore", log, log], windowsHide: true });
    children.push(child);
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) throw new Error(`${configuration.label} failed; see its local log.`);
      try { if ((await fetch(`http://localhost:${configuration.port}/api/v1/config`, { signal: AbortSignal.timeout(1500) })).ok) { ready = true; break; } } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!ready) throw new Error(`${configuration.label} did not become ready.`);
  }
  for (const configuration of configurations) await run(path.resolve("scripts/benchmark-api.mjs"), [configuration.label, `http://localhost:${configuration.port}/api/v1`, "12"]);
} finally {
  for (const child of children) {
    if (child.exitCode !== null) continue;
    child.kill("SIGTERM");
    await new Promise((resolve) => child.once("exit", resolve));
  }
  for (const fd of streams) fs.closeSync(fd);
}
