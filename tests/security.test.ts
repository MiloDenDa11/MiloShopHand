import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { serializeJsonLd, safeLocalRedirect } from '../packages/shared/src/security';
import { proxyTrust, validateRuntimeConfig, privilegedDatabaseRole } from '../apps/api/src/security-policy';
import { imageUpload, privateImagePath } from '../apps/api/src/upload-policy';
import { reauth } from '../apps/api/src/core';
import { securityEvent } from '../apps/api/src/request-security';

test('JSON-LD preserves values while escaping every HTML parser delimiter', () => {
  const input = { name: '</script><script>alert(1)</script>', value: '&<>\u2028\u2029' };
  const encoded = serializeJsonLd(input);
  assert(!/[<>&\u2028\u2029]/.test(encoded));
  assert.deepEqual(JSON.parse(encoded), input);
});
test('redirects reject scheme-relative, backslash, control and external targets', () => {
  for (const target of ['//evil.invalid', '/\\evil.invalid', '/\n/evil.invalid', 'javascript:alert(1)', 'https://evil.invalid', ' /admin', '']) assert.equal(safeLocalRedirect(target), '/tai-khoan');
  for (const target of ['/admin', '/san-pham?color=Tr%E1%BA%AFng', '/gio-hang#total']) assert.equal(safeLocalRedirect(target), target);
});
test('trusted proxies require explicit bounded addresses; numeric hops cannot be spoofed', () => {
  assert.equal(proxyTrust(), false);
  assert.deepEqual(proxyTrust('127.0.0.1,::1,172.28.0.2/32'), ['127.0.0.1', '::1', '172.28.0.2/32']);
  for (const input of ['1', 'true', '*', '0.0.0.0/0', '::/00', '127.0.0.1/33', '::1/129', 'proxy.invalid']) assert.throws(() => proxyTrust(input));
});
test('production cannot boot with mock providers, HTTP, missing mail or unsafe GHN endpoints', () => {
  const config = { NODE_ENV: 'production', APP_URL: 'https://shop.example.test', SESSION_SECRET: 'a'.repeat(64), MFA_ENCRYPTION_KEY: 'b'.repeat(64), DATABASE_URL: 'postgresql://runtime@localhost/shop', REDIS_URL: 'redis://localhost:6379', EMAIL_PROVIDER: 'smtp', SMTP_HOST: 'smtp.example.test', PAYMENT_PROVIDER: 'payos', SHIPPING_PROVIDER: 'ghn', PAYOS_CLIENT_ID: 'test', PAYOS_API_KEY: 'test', PAYOS_CHECKSUM_KEY: 'test', GHN_TOKEN: 'test', GHN_SHOP_ID: 'test', GHN_FROM_DISTRICT_ID: 'test', GHN_FROM_WARD_CODE: 'test', GHN_BASE_URL: 'https://online-gateway.ghn.vn/shiip/public-api' };
  assert.doesNotThrow(() => validateRuntimeConfig(config));
  for (const patch of [{ PAYMENT_PROVIDER: 'mock' }, { APP_URL: 'http://shop.example.test' }, { EMAIL_PROVIDER: 'file' }, { GHN_BASE_URL: 'http://169.254.169.254/' }, { GHN_BASE_URL: 'https://online-gateway.ghn.vn.evil.invalid/' }, { MFA_ENCRYPTION_KEY: 'z'.repeat(64) }]) assert.throws(() => validateRuntimeConfig({ ...config, ...patch }));
});
test('production rejects database superusers, owners and administrative roles', () => {
  const role = { rolsuper: false, rolcreatedb: false, rolcreaterole: false, rolbypassrls: false, ownsDatabase: false, ownsSchema: false };
  assert.equal(privilegedDatabaseRole(role), false);
  for (const field of Object.keys(role)) assert.equal(privilegedDatabaseRole({ ...role, [field]: true }), true);
});
test('reauthentication rejects missing, invalid, stale or future timestamps', () => {
  for (const value of [undefined, 'invalid', new Date(Date.now() - 11 * 60000), new Date(Date.now() + 60000)]) assert.throws(() => reauth({ session: { reauthenticatedAt: value } } as any));
  assert.doesNotThrow(() => reauth({ session: { reauthenticatedAt: new Date() } } as any));
});
test('uploads validate MIME against decoded content, reject SVG and strip embedded payloads', async () => {
  const png = await sharp({ create: { width: 16, height: 16, channels: 3, background: '#abcdef' } }).png().toBuffer();
  const buffer = await imageUpload({ buffer: Buffer.concat([png, Buffer.from('<script>malicious</script>')]), mimetype: 'image/png' }, 1600);
  assert.equal((await sharp(buffer).metadata()).format, 'webp');
  assert(!buffer.includes(Buffer.from('<script>')));
  await assert.rejects(() => imageUpload({ buffer: png, mimetype: 'image/jpeg' }, 1600));
  await assert.rejects(() => imageUpload({ buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), mimetype: 'image/png' }, 1600));
  await assert.rejects(() => imageUpload({ buffer: Buffer.alloc(5 * 1024 * 1024 + 1), mimetype: 'image/png' }, 1600));
});
test('private upload paths cannot traverse outside their configured directory', () => {
  for (const name of ['../.env', '..\\.env', '/etc/passwd', 'a.svg', 'a.webp']) assert.throws(() => privateImagePath('.local/return-images', name));
  assert(privateImagePath('.local/return-images', '00000000-0000-4000-8000-000000000000.webp').endsWith('.webp'));
});
test('security telemetry omits passwords, tokens, cookies, email and raw source IP', async () => {
  const records: unknown[] = [], consoleWarn = console.warn;
  console.warn = value => records.push(value);
  try {
    const db = { auditLog: { create: async (row: unknown) => records.push(row) } };
    await securityEvent(db as any, { ip: '203.0.113.41', requestId: 'test-redaction', actor: { id: 'test-user', email: 'private@example.test' }, body: { password: 'CANARY_PASSWORD', token: 'CANARY_TOKEN' }, headers: { cookie: 'CANARY_COOKIE' } } as any, 'REDACTION_TEST', { scope: 'test', password: 'CANARY_EXTRA' } as any);
  } finally { console.warn = consoleWarn; }
  const encoded = JSON.stringify(records);
  for (const secret of ['CANARY_', 'private@example.test', '203.0.113.41']) assert(!encoded.includes(secret));
  assert(encoded.includes('sourceHash'));
});
