// UI QA with a read-only local catalog stub. No application API, database,
// workers, OpenAI credentials, or billable provider calls are used.
import { createServer } from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import { products } from '../tests/fixtures/try-on-catalog.mjs';
import { prepareE2e } from './prepare-e2e.mjs';

const root = process.cwd();
const commerceUpgrade = process.argv.includes('--commerce-only');
const authUpgrade = process.argv.includes('--auth-only');
const fulfillment = process.argv.includes('--fulfillment-only');
const growth = process.argv.includes('--growth-only');
const nextEnvPath = resolve(root, 'apps/web/next-env.d.ts');
const nextEnvBefore = readFileSync(nextEnvPath);
const webPort = 3100;
const children = [];
const mutations = [];
let log = '';
const api = createServer((request, response) => {
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  const url = new URL(request.url, 'http://fixture.local');
  const send = (value, status = 200) => { response.statusCode = status; response.end(JSON.stringify(value)); };
  if (request.method !== 'GET') { mutations.push(`${request.method} ${url.pathname}`); return send({ message: 'Read-only fixture' }, 405); }
  if (url.pathname === '/api/v1/me') return send({ message: 'Guest fixture' }, 401);
  if (url.pathname === '/api/v1/config') return send({ brandName: 'MILOSHOPHAND', returnDays: 14 });
  if (url.pathname === '/api/v1/try-on/config') return send({ enabled: false, imagesPerRequest: 2, dailyImages: 2, retentionHours: 24 });
  if (url.pathname === '/api/v1/catalog') return send({ categories: [products[0].category], collections: [], styles: [] });
  if (url.pathname === '/api/v1/cart') return send({ items: [] });
  if (url.pathname === '/api/v1/products') {
    const items = products.filter(item => (!url.searchParams.get('q') || item.name.includes(url.searchParams.get('q'))) && (!url.searchParams.get('category') || item.category.slug === url.searchParams.get('category')));
    return send({ items, total: items.length, page: 1, pages: 1 });
  }
  const item = products.find(item => url.pathname === `/api/v1/products/${item.slug}`);
  return item ? send(item) : send({ message: 'Sản phẩm không còn khả dụng.' }, 404);
});
function launch(file, args, options) {
  const child = spawn(process.execPath, [resolve(root, file), ...args], { windowsHide: true, ...options });
  children.push(child);
  return child;
}
async function stop() {
  for (const child of children.toReversed()) {
    if (child.exitCode !== null) continue;
    if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    else child.kill('SIGTERM');
  }
  api.closeAllConnections();
  await new Promise(resolve => api.close(resolve));
  writeFileSync(nextEnvPath, nextEnvBefore);
}
try {
  const portCheck = createServer();
  await new Promise((resolve, reject) => { portCheck.once('error', reject); portCheck.listen(webPort, '127.0.0.1', resolve); });
  await new Promise(resolve => portCheck.close(resolve));
  await new Promise(resolve => api.listen(0, '127.0.0.1', resolve));
  const env = { ...process.env, TRY_ON_FIXTURES: '1', API_INTERNAL_URL: `http://127.0.0.1:${api.address().port}`, APP_URL: `http://localhost:${webPort}`, PLAYWRIGHT_BASE_URL: `http://localhost:${webPort}`, NEXT_BUILD_DIR: '.next-try-on-test', NEXT_TELEMETRY_DISABLED: '1', NEXT_PUBLIC_GOOGLE_MAPS_KEY: '', NEXT_PUBLIC_GOOGLE_MAPS_ID: '', OPENAI_API_KEY: '', NODE_ENV: 'development' };
  prepareE2e(root);
  const web = launch('node_modules/next/dist/bin/next', ['dev', '--turbopack', '--port', String(webPort)], { cwd: resolve(root, 'apps/web'), env, stdio: ['ignore', 'pipe', 'pipe'] });
  for (const stream of [web.stdout, web.stderr]) stream.on('data', chunk => { log = (log + chunk).slice(-16000); });
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (web.exitCode !== null) throw new Error(`QA web exited: ${web.exitCode}`);
    try { if ((await fetch(`${env.APP_URL}/dung-thu/${products[0].slug}`, { signal: AbortSignal.timeout(3000) })).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error('QA web did not start.');
  console.log('TRY-ON QA: local fixture catalog; no database or AI provider.');
  const specs = growth ? ['tests/e2e/shopping-growth.spec.ts'] : fulfillment ? ['tests/e2e/fulfillment.spec.ts'] : authUpgrade ? ['tests/e2e/auth-upgrade.spec.ts'] : commerceUpgrade ? ['tests/e2e/commerce-upgrade.spec.ts'] : process.argv.includes('--direct-only') ? ['tests/e2e/try-on-api.spec.ts'] : ['tests/e2e/try-on.spec.ts', 'tests/e2e/try-on-api.spec.ts'];
  const test = launch('node_modules/@playwright/test/cli.js', ['test', ...specs, ...process.argv.slice(2).filter(argument => !['--direct-only', '--commerce-only', '--auth-only', '--fulfillment-only', '--growth-only'].includes(argument))], { cwd: root, env, stdio: 'inherit' });
  const code = await new Promise((resolve, reject) => { test.once('error', reject); test.once('exit', resolve); });
  if (mutations.length) throw new Error(`Unexpected fixture writes: ${JSON.stringify(mutations)}`);
  if (code !== 0) throw new Error(`Try-on browser tests exited ${code}.`);
  console.log('PASS: no requests wrote to the catalog fixture.');
} catch (error) {
  console.error(error.message);
  console.error(log);
  process.exitCode = 1;
} finally {
  await stop();
}
