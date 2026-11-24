import "dotenv/config";
import { spawn, spawnSync } from "node:child_process";
import pg from "pg";
const databaseName = process.argv.find(value => value.startsWith('--database='))?.slice('--database='.length) || 'milo_integration_test';
if (!/^milo_integration(?:_[a-z0-9]+)*_test$/.test(databaseName)) throw new Error('Use an isolated milo_integration_*_test database');
const url = new URL(process.env.DATABASE_URL);
url.pathname = `/${databaseName}`;
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
  TRY_ON_ENABLED: 'false',
  OPENAI_API_KEY: '',
  CLOUDINARY_CLOUD_NAME: '',
  CLOUDINARY_API_KEY: '',
  CLOUDINARY_API_SECRET: '',
  CLOUDINARY_URL: '',
  GOOGLE_CLIENT_ID: '',
  GOOGLE_CLIENT_SECRET: '',
  SMTP_HOST: '',
  SMTP_USER: '',
  SMTP_PASSWORD: '',
  SKIP_BREACH_CHECK: "true",
  NODE_ENV: "development",
  API_HOST: '127.0.0.1',
  TRUST_PROXY: '',
  UPLOAD_DIR: '.local/test-storage/integration/uploads',
  RETURN_UPLOAD_DIR: '.local/test-storage/integration/return-images',
};
const adminUrl = new URL(process.env.DATABASE_URL);
adminUrl.pathname = "/postgres";
const c = new pg.Client({ connectionString: adminUrl.toString() });
await c.connect();
const exists = await c.query(
  "SELECT 1 FROM pg_database WHERE datname=$1", [databaseName],
);
if (!exists.rowCount)
  await c.query(
    `CREATE DATABASE "${databaseName}" ENCODING 'UTF8' TEMPLATE template0 LC_COLLATE 'C' LC_CTYPE 'C'`,
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
const testFiles = ['tests/integration.test.ts', 'tests/catalog.integration.test.ts', 'tests/inventory.integration.test.ts', 'tests/security.integration.test.ts'];
const selectedTest = process.argv.find(value => value.startsWith('--test-file='))?.slice('--test-file='.length);
if (selectedTest && !testFiles.includes(selectedTest)) throw new Error('Unknown integration test file');
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
  // Cold Windows/OneDrive TypeScript imports can take longer than 30 seconds.
  // Keep the health probe bounded and surface an actual process exit promptly.
  const readinessDeadline = Date.now() + 90_000;
  while (Date.now() < readinessDeadline) {
    if (api.exitCode !== null) throw new Error(`Test API exited ${api.exitCode} before readiness`);
    try {
      const r = await fetch(testEnv.TEST_API_URL + "/config", {signal: AbortSignal.timeout(2000)});
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
    ...process.argv.slice(2).filter(value => value.startsWith('--test-name-pattern=')),
    ...(selectedTest ? [selectedTest] : testFiles),
  ]);
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  if (api?.pid && api.exitCode === null) {
    if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(api.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    else api.kill();
  }
}
