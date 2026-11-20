import 'dotenv/config';
import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { randomBytes, createHash, createHmac } from 'node:crypto';
import argon2 from 'argon2';

const db = new PrismaClient();
const fixtureProducts: string[] = [];
test.afterAll(async () => {
  if (fixtureProducts.length) await db.product.updateMany({ where: { id: { in: fixtureProducts } }, data: { active: false } });
  await db.$disconnect();
});
test('SEC-XSS: product JSON-LD cannot escape its script element', async ({ page }) => {
  if (!new URL(process.env.DATABASE_URL || '').pathname.endsWith('_test')) throw Error('Security browser fixture requires an isolated test database');
  const suffix = randomBytes(8).toString('hex');
  const category = await db.category.findFirstOrThrow();
  const description = 'Cotton audit </script><script>globalThis.__miloSecurityXss=1</script><script type="application/ld+json">';
  const product = await db.product.create({ data: { name: `Security XSS ${suffix}`, slug: `security-xss-${suffix}`, categoryId: category.id, description, searchText: 'security xss', material: 'Cotton', fit: 'Regular', care: 'Wash gently', price: 180000, cost: 81234, variants: { create: { sku: `XSS-${suffix}`, color: 'Đen', colorHex: '#151515', size: 'M', inventories: { create: { onHand: 5 } } } } } });
  fixtureProducts.push(product.id);
  await page.goto(`/san-pham/${product.slug}`);
  await expect(page.getByRole('heading', { name: product.name, exact: true })).toBeVisible();
  expect(await page.evaluate(() => (globalThis as any).__miloSecurityXss)).toBeUndefined();
  const structuredData = page.locator('script[type="application/ld+json"]');
  await expect(structuredData).toHaveCount(1);
  expect(JSON.parse(await structuredData.textContent() || '{}').description).toBe(description);
});
test('SEC-CSP: per-request script nonces block injected inline code without breaking hydration', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  // Inject into HTML before parsing, matching an actual markup-injection threat.
  // DevTools page.evaluate runs trusted code and cannot test CSP enforcement.
  await page.route(new RegExp('^' + process.env.PLAYWRIGHT_BASE_URL!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/$'), async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()).replace('</body>', '<script>globalThis.__miloInjectedInline=1</script></body>') });
  }, { times: 1 });
  const response = await page.goto('/');
  const csp = response?.headers()['content-security-policy'] || '';
  expect(csp).toMatch(/script-src[^;]*'nonce-[^']+'/);
  expect(csp.match(/script-src[^;]*/)?.[0]).not.toContain("'unsafe-inline'");
  const nonce = csp.match(/'nonce-([^']+)'/)![1];
  expect(await page.locator('script[src*="/_next/"]').first().evaluate((node: HTMLScriptElement) => node.nonce)).toBe(nonce);
  expect(await page.evaluate(() => (globalThis as any).__miloInjectedInline)).toBeUndefined();
  const second = await page.request.get('/');
  expect(second.headers()['content-security-policy']).not.toContain(`'nonce-${nonce}'`);
  expect(response?.headers()['x-powered-by']).toBeUndefined();
  expect(errors).toEqual([]);
});
test('SEC-REDIRECT: a backslash next parameter cannot navigate a logged-in customer off-site', async ({ page }) => {
  if (!new URL(process.env.DATABASE_URL || '').pathname.endsWith('_test')) throw Error('Security login fixture requires an isolated test database');
  const password = 'Security browser ' + randomBytes(24).toString('hex');
  const user = await db.user.create({ data: { email: `redirect-${randomBytes(10).toString('hex')}@example.test`, name: 'Security Redirect', passwordHash: await argon2.hash(password, { type: argon2.argon2id }), verifiedAt: new Date() } });
  await page.goto('/dang-nhap?' + new URLSearchParams({ next: '/\\evil.invalid' }));
  const form = page.locator('.auth-form:visible');
  await expect(form).toHaveCount(1);
  await form.getByLabel('Email', { exact: true }).fill(user.email);
  await form.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await form.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page).toHaveURL(process.env.PLAYWRIGHT_BASE_URL + '/tai-khoan');
});
test('SEC-CART: a stale authenticated cart response cannot erase a later mutation', async ({ page }) => {
  if (!new URL(process.env.DATABASE_URL || '').pathname.endsWith('_test')) throw Error('Security cart fixture requires an isolated test database');
  const user = await db.user.create({ data: { email: `cart-race-${randomBytes(10).toString('hex')}@example.test`, name: 'Security Cart Race', passwordHash: 'not-for-login', verifiedAt: new Date() } });
  const raw = randomBytes(32).toString('hex'), nonce = randomBytes(32).toString('hex');
  const csrf = `${nonce}.${createHmac('sha256', process.env.SESSION_SECRET!).update(nonce).digest('hex')}`;
  await db.session.create({ data: { id: createHash('sha256').update(raw).digest('hex'), userId: user.id, csrf, expiresAt: new Date(Date.now() + 3600000), agent: 'Security cart race fixture' } });
  await page.context().addCookies([{ name: 'milo_sid', value: raw, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }, { name: 'milo_csrf', value: csrf, domain: 'localhost', path: '/', sameSite: 'Lax' }]);
  let release!: () => void, started!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const waiting = new Promise<void>(resolve => { started = resolve; });
  let delayed = false;
  await page.route('**/api/v1/cart', async route => {
    if (route.request().method() !== 'GET' || delayed) return route.continue();
    delayed = true;
    const response = await route.fetch(); started(); await gate;
    await route.fulfill({ response });
  });
  try {
    await page.goto('/san-pham/milo-signature-tee'); await waiting;
    await page.getByRole('button', { name: 'M', exact: true }).click();
    await page.getByRole('button', { name: 'Thêm vào giỏ hàng', exact: true }).click();
    await expect(page.getByRole('dialog').locator('.cart-line')).toHaveCount(1);
    const late = page.waitForResponse(response => response.url().endsWith('/api/v1/cart') && response.request().method() === 'GET');
    release(); await (await late).finished();
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(page.getByRole('dialog').locator('.cart-line')).toHaveCount(1);
    expect(await db.cartItem.count({ where: { cart: { userId: user.id } } })).toBe(1);
  } finally { release(); }
});
