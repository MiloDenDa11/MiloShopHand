import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { TryOnError, tryOnConfig, tryOnDay, type TryOnPayload } from '../apps/api/src/try-on-policy';
import { openAIImageEditor } from '../apps/api/src/try-on-provider';
import { TryOnStorage, tryOnPerson } from '../apps/api/src/try-on-storage';

const job: TryOnPayload = { version: 1, userId: 'test-owner', productId: 'test-product', productSlug: 'test-polo', productName: 'Test Polo', color: 'Xanh navy', material: 'Cotton', fit: 'Regular fit', mode: 'upper-body', model: 'gpt-image-2.5-sunburst', fingerprint: 'test', consentVersion: 'test', consentAt: new Date().toISOString(), personFile: `${randomUUID()}.webp`, referenceFile: `${randomUUID()}.webp`, resultFiles: [], expiresAt: new Date().toISOString(), quotaCharged: true };
async function photo(width = 640, height = 960) { return sharp({ create: { width, height, channels: 3, background: '#aaaaaa' } }).webp().toBuffer(); }
test('AI mặc định tắt, cần cả opt-in và key; cấu hình sai không được gọi provider', () => {
  assert.equal(tryOnConfig({}).enabled, false);
  assert.equal(tryOnConfig({ OPENAI_API_KEY: 'fixture-only' }).enabled, false);
  assert.equal(tryOnConfig({ TRY_ON_ENABLED: 'true' }).enabled, false);
  assert.equal(tryOnConfig({ TRY_ON_ENABLED: 'true', OPENAI_API_KEY: 'fixture-only' }).enabled, true);
  for (const change of [{ TRY_ON_MODEL: 'unapproved-model' }, { TRY_ON_SHOP_DAILY_IMAGES: '0' }, { TRY_ON_TIMEOUT_MS: '-1' }, { TRY_ON_RETENTION_HOURS: 'Infinity' }]) assert.equal(tryOnConfig({ TRY_ON_ENABLED: 'true', OPENAI_API_KEY: 'fixture-only', ...change }).enabled, false);
});
test('xác minh email thử đồ tạm thời không bắt buộc và có thể bật lại riêng', () => {
  assert.equal(tryOnConfig({}).requireVerifiedEmail, false);
  assert.equal(tryOnConfig({ TRY_ON_REQUIRE_VERIFIED_EMAIL: 'false' }).requireVerifiedEmail, false);
  assert.equal(tryOnConfig({ TRY_ON_REQUIRE_VERIFIED_EMAIL: 'true' }).requireVerifiedEmail, true);
  assert.equal(tryOnConfig({ TRY_ON_REQUIRE_VERIFIED_EMAIL: 'invalid' }).requireVerifiedEmail, true);
});
test('hạn mức đổi ngày tại 00:00 Việt Nam, không phụ thuộc múi giờ hệ điều hành', () => {
  assert.equal(tryOnDay(new Date('2026-11-21T16:59:59Z')).start.toISOString(), '2026-11-20T17:00:00.000Z');
  assert.equal(tryOnDay(new Date('2026-11-21T17:00:00Z')).start.toISOString(), '2026-11-21T17:00:00.000Z');
  assert.equal(tryOnDay(new Date('2026-11-21T16:59:59Z')).end.toISOString(), '2026-11-21T17:00:00.000Z');
});
test('provider gửi đúng 1 request n=2 với hai ảnh nguồn, không dùng URL ảnh từ client', async () => {
  const bytes = await photo(); let calls = 0;
  const provider = openAIImageEditor((async (url: string, options: RequestInit) => {
    calls++; assert.equal(url, 'https://api.openai.com/v1/images/edits'); assert.equal(options.redirect, 'error');
    const form = options.body as FormData;
    assert.equal(form.get('n'), '2'); assert.equal(form.get('model'), job.model); assert.equal(form.getAll('image[]').length, 2);
    assert.equal(form.get('quality'), 'medium'); assert.equal(form.get('size'), '1024x1536');
    assert.match(String(form.get('prompt')), /Xanh navy/); assert.doesNotMatch(String(form.get('safety_identifier')), /test-owner/);
    return Response.json({ data: [{ b64_json: bytes.toString('base64') }, { b64_json: bytes.toString('base64') }], usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30, token: 'discard' } });
  }) as typeof fetch);
  const result = await provider({ job, person: bytes, garment: bytes, apiKey: 'fixture-only', timeoutMs: 30000 });
  assert.equal(calls, 1); assert.equal(result.images.length, 2);
  assert.deepEqual(result.usage, { input_tokens: 10, output_tokens: 20, total_tokens: 30 });
  assert.equal((await sharp(result.images[0]).metadata()).format, 'webp');
});
test('timeout, 429, phản hồi thiếu ảnh hoặc URL không tạo retry/fallback', async () => {
  const bytes = await photo();
  for (const response of ['network', 'quota', 'one', 'url', 'invalid']) {
    let calls = 0;
    const provider = openAIImageEditor((async () => {
      calls++;
      if (response === 'network') throw new Error('fixture network failure');
      if (response === 'quota') return Response.json({ error: { message: 'must not escape to client' } }, { status: 429 });
      if (response === 'one') return Response.json({ data: [{ b64_json: bytes.toString('base64') }] });
      if (response === 'url') return Response.json({ data: [{ url: 'https://untrusted.invalid/1.png' }, { url: 'https://untrusted.invalid/2.png' }] });
      return Response.json({ data: [{ b64_json: 'PHN2Zz4=' }, { b64_json: 'PHN2Zz4=' }] });
    }) as typeof fetch);
    await assert.rejects(provider({ job, person: bytes, garment: bytes, apiKey: 'fixture-only', timeoutMs: 30000 }), error => error instanceof TryOnError && !error.message.includes('must not escape'));
    assert.equal(calls, 1);
  }
});
test('xác thực nội dung ảnh, xóa metadata, chặn ảnh nhỏ và MIME giả', async () => {
  const bytes = await photo();
  const output = await tryOnPerson({ buffer: bytes, mimetype: 'image/webp' });
  const meta = await sharp(output).metadata(); assert.equal(meta.format, 'webp'); assert.equal(meta.exif, undefined);
  for (const file of [{ buffer: bytes, mimetype: 'image/png' }, { buffer: Buffer.from('<svg/>'), mimetype: 'image/png' }, { buffer: await photo(100, 100), mimetype: 'image/webp' }, { buffer: Buffer.alloc(8 * 1024 * 1024 + 1), mimetype: 'image/jpeg' }]) await assert.rejects(tryOnPerson(file), error => error instanceof TryOnError && error.code === 'TRY_ON_INVALID_IMAGE');
});
test('lưu ảnh ở khu vực riêng tư; đường dẫn client không thể đọc file khác', () => {
  assert.throws(() => new TryOnStorage('apps/web/public/private'));
  assert.throws(() => new TryOnStorage('uploads/private'));
  if (process.platform === 'win32') assert.throws(() => new TryOnStorage('apps/WEB/Public/private'));
  assert.doesNotThrow(() => new TryOnStorage('.local/test-storage/try-on-unit', ''));
  const storage = new TryOnStorage('.local/test-storage/try-on-unit');
  for (const name of ['../.env', 'test.webp', '/etc/passwd', '..\\secret.webp', 'https://example.invalid/x.webp']) assert.throws(() => storage.path(name));
});
