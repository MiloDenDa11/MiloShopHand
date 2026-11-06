import "dotenv/config";
import { spawn } from "node:child_process";
import pg from "pg";
const url = new URL(process.env.DATABASE_URL);
url.pathname = "/milo_integration_test";
const redisUrl = new URL(process.env.REDIS_URL || "redis://localhost:6379");
redisUrl.pathname = "/1";
const testEnv = {
  ...process.env,
  DATABASE_URL: url.toString(),
  REDIS_URL: redisUrl.toString(),
  API_PORT: "4001",
  TEST_API_URL: "http://localhost:4001/api/v1",
  PAYMENT_PROVIDER: "mock",
  SHIPPING_PROVIDER: "mock",
  EMAIL_PROVIDER: "file",
  SKIP_BREACH_CHECK: "true",
  NODE_ENV: "development",
};
const adminUrl = new URL(process.env.DATABASE_URL);
adminUrl.pathname = "/postgres";
const c = new pg.Client({ connectionString: adminUrl.toString() });
await c.connect();
const exists = await c.query(
  "SELECT 1 FROM pg_database WHERE datname='milo_integration_test'",
);
if (!exists.rowCount)
  await c.query(
    "CREATE DATABASE milo_integration_test ENCODING 'UTF8' TEMPLATE template0 LC_COLLATE 'C' LC_CTYPE 'C'",
  );
await c.end();
function command(bin, args, env = testEnv) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [bin, ...args], {
      env,
      stdio: "inherit",
    });
    p.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`Command failed: ${args.join(" ")}`)),
    );
  });
}
let api;
try {
  await command("node_modules/prisma/build/index.js", ["migrate", "deploy"]);
  await command("node_modules/tsx/dist/cli.mjs", ["prisma/seed.ts"]);
  api = spawn(
    process.execPath,
    [
      "node_modules/tsx/dist/cli.mjs",
      "--tsconfig",
      "apps/api/tsconfig.json",
      "apps/api/src/main.ts",
    ],
    { env: testEnv, stdio: ["ignore", "pipe", "pipe"] },
  );
  api.stdout.on("data", (b) => process.stdout.write(b));
  api.stderr.on("data", (b) => process.stderr.write(b));
  let ready = false;
  for (let n = 0; n < 150; n++) {
    try {
      const r = await fetch(testEnv.TEST_API_URL + "/config");
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  if (!ready) throw new Error("Test API did not start");
  await command("node_modules/tsx/dist/cli.mjs", [
    "--tsconfig",
    "apps/api/tsconfig.json",
    "--test",
    "--test-concurrency=1",
    "tests/integration.test.ts",
    "tests/catalog.integration.test.ts",
  ]);
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  api?.kill();
}
