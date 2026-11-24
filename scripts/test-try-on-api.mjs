// A fresh isolated PostgreSQL cluster. Never reads or mutates the shop database.
import EmbeddedPostgres from 'embedded-postgres';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { mkdir, cp } from 'node:fs/promises';
import pgDriver from 'pg';
const root = process.cwd();
const authUpgrade = process.argv.includes('--auth-upgrade');
const fulfillment = process.argv.includes('--fulfillment');
const shoppingGrowth = process.argv.includes('--shopping-growth');
const sellerOperations = process.argv.includes('--seller-ops');
const commerceUpgrade = process.argv.includes('--commerce') || sellerOperations;
const data = resolve(root, '.local/try-on-api-test', randomUUID());
const probe = createServer();
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const password = randomBytes(24).toString('hex');
const pg = new EmbeddedPostgres({ databaseDir: data, port, user: 'tryon_test', password, persistent: true, createPostgresUser: false, autoRehydrateSymlinks: true, initdbFlags: ['--encoding=UTF8', '--locale=C'], postgresFlags: ['-h', '127.0.0.1'], onLog: () => {}, onError: () => {} });
// Graceful shutdown also stops PostgreSQL 18 io_worker children on Windows.
// The library's forceful taskkill can leave a child holding its stdio open.
if (process.platform === 'win32' && process.arch === 'x64') {
  let stopped = false;
  pg.stop = async () => {
    if (stopped) return;
    stopped = true;
    const child = spawn(resolve(root, 'node_modules/@embedded-postgres/windows-x64/native/bin/pg_ctl.exe'), ['-D', data, '-m', 'fast', '-w', '-t', '60', 'stop'], { stdio: 'ignore', windowsHide: true });
    const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
    if (code !== 0 && code !== 3) console.warn('Isolated PostgreSQL shutdown needs inspection.');
  };
}
const url = `postgresql://tryon_test:${password}@127.0.0.1:${port}/milo_try_on_test?schema=public`;
const testEnv = { ...process.env, DATABASE_URL: url, TRY_ON_TEST_DATABASE_URL: url, TRY_ON_PRIVATE_DIR: resolve(data, 'photos'), NODE_ENV: 'development', SESSION_SECRET: randomBytes(32).toString('hex'), MFA_ENCRYPTION_KEY: randomBytes(32).toString('hex'), TRY_ON_ENABLED: 'false', OPENAI_API_KEY: '', JWT_SECRET: '', CLOUDINARY_CLOUD_NAME: '', CLOUDINARY_API_KEY: '', CLOUDINARY_API_SECRET: '', CLOUDINARY_URL: '' };
Object.assign(testEnv, { PAYMENT_PROVIDER: 'mock', SHIPPING_PROVIDER: 'mock', EMAIL_PROVIDER: 'file', SKIP_BREACH_CHECK: 'true', GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '', SMTP_HOST: '', SMTP_USER: '', SMTP_PASSWORD: '' });
async function run(file, args) {
  const child = spawn(process.execPath, [resolve(root, file), ...args], { cwd: root, env: testEnv, stdio: 'inherit', windowsHide: true });
  const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
  if (code !== 0) throw new Error(`Isolated try-on test command exited ${code}.`);
}
try {
  console.log('Initializing a new isolated PostgreSQL cluster for try-on tests.');
  await pg.initialise(); await pg.start(); await pg.createDatabase('milo_try_on_test');
  if (commerceUpgrade) {
    await run('node_modules/tsx/dist/cli.mjs', ['--tsconfig', 'apps/api/tsconfig.json', '--test', 'tests/commerce-upgrade.test.ts']);
    if (sellerOperations) await run('node_modules/tsx/dist/cli.mjs', ['--tsconfig', 'apps/api/tsconfig.json', '--test', 'tests/seller-operations.test.ts']);
    const baseline = resolve(data, 'baseline/prisma');
    await mkdir(baseline, { recursive: true });
    await cp(resolve(root, 'prisma/schema.prisma'), resolve(baseline, 'schema.prisma'));
    await cp(resolve(root, 'prisma/migrations'), resolve(baseline, 'migrations'), { recursive: true, filter: source => !/20261123001[0-3]_|202611240014_/.test(source) });
    await run('node_modules/prisma/build/index.js', ['migrate', 'deploy', '--schema', resolve(baseline, 'schema.prisma')]);
    const client = new pgDriver.Client({ connectionString: url });
    await client.connect();
    try {
      await client.query(`INSERT INTO "User" (id,email,name,"passwordHash","verifiedAt",phone,preferences) VALUES ('migration-fixture','migration@example.test','Preserve me','fixture',now(),'0901234567',ARRAY['basic'])`);
      await client.query(`INSERT INTO "Notification" (id,"userId",key,title,body) VALUES ('migration-note','migration-fixture','migration-key','Existing note','Preserve this')`);
    } finally { await client.end(); }
  }
  await run('node_modules/prisma/build/index.js', ['migrate', 'deploy']);
  if (shoppingGrowth) {
    await run('node_modules/tsx/dist/cli.mjs', ['--tsconfig', 'apps/api/tsconfig.json', '--test', '--test-concurrency=1', 'tests/shopping-growth.test.ts', 'tests/shopping-growth.integration.test.ts']);
  } else if (fulfillment) {
    await run('node_modules/tsx/dist/cli.mjs', ['--tsconfig', 'apps/api/tsconfig.json', '--test', '--test-concurrency=1', 'tests/fulfillment.test.ts', 'tests/fulfillment.integration.test.ts']);
  } else if (authUpgrade) {
    await run('node_modules/tsx/dist/cli.mjs', ['--tsconfig', 'apps/api/tsconfig.json', '--test', '--test-concurrency=1', ...process.argv.slice(2).filter(value => value.startsWith('--test-name-pattern=')), 'tests/auth-upgrade.test.ts', 'tests/auth-upgrade.integration.test.ts']);
  } else {
  await run('node_modules/tsx/dist/cli.mjs', ['--tsconfig', 'apps/api/tsconfig.json', '--test', '--test-concurrency=1', commerceUpgrade ? 'tests/commerce-upgrade.integration.test.ts' : 'tests/try-on-jobs.integration.test.ts']);
  if (sellerOperations) await run('node_modules/tsx/dist/cli.mjs', ['--tsconfig', 'apps/api/tsconfig.json', '--test', '--test-concurrency=1', 'tests/seller-operations.integration.test.ts']);
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { await pg.stop().catch(() => {}); }
