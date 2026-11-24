import { test, expect, type Page } from '@playwright/test';
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { polos } from '../fixtures/try-on-catalog.mjs';

test.skip(!process.env.TRY_ON_FIXTURES, 'Run npm run test:try-on with the read-only fixture catalog.');
const product = polos[0];
const stage = (page: Page) => page.locator('.try-on-main');
const runtime = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page, context, baseURL }) => {
  const errors: string[] = []; runtime.set(page, errors);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (/hydration|TypeError|ReferenceError|cannot contain|cannot be a descendant/i.test(message.text())) errors.push(message.text()); });
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin !== new URL(baseURL!).origin) { errors.push('Unexpected external request'); return route.abort(); }
    return route.continue();
  });
});
test.afterEach(async ({ page }) => expect(runtime.get(page)).toEqual([]));
async function fixture(page: Page, options: { enabled?: boolean; guest?: boolean; verified?: boolean; requireVerifiedEmail?: boolean; remaining?: number; lostResponse?: boolean; failed?: boolean } = {}) {
  const state = { posts: [] as { body: string; key: string | undefined }[], job: null as any, remaining: options.remaining ?? 2, polls: 0 };
  const bytes = await sharp({ create: { width: 640, height: 960, channels: 3, background: '#aaa99a' } }).webp().toBuffer();
  await page.context().addCookies([{ name: 'milo_csrf', value: 'a'.repeat(64) + '.' + 'b'.repeat(64), url: 'http://localhost:3100' }]);
  await page.route('**/api/v1/me', route => route.fulfill({ status: options.guest ? 401 : 200, json: options.guest ? { message: 'Guest fixture' } : { id: 'fixture-owner', name: 'Khách kiểm thử', email: 'fixture@example.test', role: 'USER', verifiedAt: options.verified === false ? null : '2026-11-21T00:00:00Z' } }));
  await page.route('**/api/v1/wishlist', route => route.fulfill({ json: [] }));
  await page.route('**/api/v1/try-on/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (path.endsWith('/config')) return route.fulfill({ json: { enabled: options.enabled !== false, requireVerifiedEmail: options.requireVerifiedEmail === true, imagesPerRequest: 2, dailyImages: 2, retentionHours: 24 } });
    if (path.endsWith('/quota')) return route.fulfill({ json: { remaining: state.remaining, used: 2 - state.remaining, resetsAt: '2026-11-21T17:00:00Z', latestJob: state.job } });
    if (path.endsWith('/jobs') && request.method() === 'POST') {
      state.posts.push({ body: request.postDataBuffer()!.toString('utf8'), key: request.headers()['idempotency-key'] });
      expect(request.headers()['x-csrf-token']).toContain('.');
      state.remaining = 0;
      const body = state.posts.at(-1)!.body;
      const color = product.images.find((image: any) => body.includes(`\r\n${image.color}\r\n`))!.color;
      state.job = { id: 'fixture-job', productSlug: product.slug, productName: product.name, color, status: 'queued', images: [], quotaCharged: true, expiresAt: '2030-11-22T00:00:00Z' };
      if (options.lostResponse) return route.fulfill({ status: 503, json: { message: 'Fixture lost submit response' } });
      return route.fulfill({ status: 201, json: state.job });
    }
    if (path.includes('/images/')) return route.fulfill({ contentType: 'image/webp', body: bytes });
    if (request.method() === 'DELETE') { state.job = { ...state.job, status: 'deleted', images: [] }; return route.fulfill({ json: { deleted: true } }); }
    state.polls++;
    state.job = { ...state.job, status: options.failed ? 'failed' : 'succeeded', errorCode: options.failed ? 'TRY_ON_PROVIDER_UNCERTAIN' : undefined, images: options.failed ? [] : ['/api/v1/try-on/jobs/fixture-job/images/0', '/api/v1/try-on/jobs/fixture-job/images/1'] };
    return route.fulfill({ json: state.job });
  });
  return { state, bytes };
}
async function prepare(page: Page, bytes: Buffer, color = product.images[0].color) {
  await page.goto(`/dung-thu/${product.slug}?${new URLSearchParams({ color, size: 'M' })}`);
  await expect(page.getByRole('button', { name: 'Thử đồ AI tại Milo', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await stage(page).getByLabel('Chọn ảnh của bạn', { exact: true }).setInputFiles({ name: 'synthetic-person.webp', mimeType: 'image/webp', buffer: bytes });
  await stage(page).getByRole('button', { name: 'Tiếp tục', exact: true }).click();
}
test('AI trực tiếp: chỉ gửi sau consent, đúng sản phẩm/màu/size; bấm đôi vẫn 1 request tạo hai ảnh', async ({ page }) => {
  const { state, bytes } = await fixture(page);
  const color = product.images[1].color;
  await prepare(page, bytes, color);
  const generate = page.getByRole('button', { name: 'Tạo 2 ảnh thử đồ', exact: true });
  await expect(generate).toBeDisabled(); expect(state.posts).toHaveLength(0);
  await page.getByRole('checkbox').check();
  await expect(generate).toBeEnabled();
  await generate.evaluate((element: HTMLButtonElement) => { element.click(); element.click(); });
  await expect(page.getByRole('heading', { name: 'Diện mạo mới của bạn.', exact: true })).toBeVisible();
  await expect(page.locator('.try-on-ai-images img')).toHaveCount(2);
  expect(state.posts).toHaveLength(1); expect(state.posts[0].key).toMatch(/^[a-f0-9-]{36}$/);
  expect(state.posts[0].body).toContain(product.slug); expect(state.posts[0].body).toContain(color);
  expect(state.posts[0].body).not.toContain('name="n"'); expect(state.posts[0].body).not.toContain('name="prompt"'); expect(state.posts[0].body).not.toContain('name="imageUrl"');
  await expect(page.getByRole('button', { name: 'Size M', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText(/Còn 0 \/ 2 ảnh hôm nay/)).toBeVisible();
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  mkdirSync('.local/try-on-api', { recursive: true });
  await page.screenshot({ path: '.local/try-on-api/desktop-result.png', fullPage: true, caret: 'initial' });
});
test('reload đọc lại kết quả, xóa ảnh không đặt lại hạn mức đã sử dụng', async ({ page }) => {
  const { state, bytes } = await fixture(page);
  await prepare(page, bytes); await page.getByRole('checkbox').check(); await page.getByRole('button', { name: 'Tạo 2 ảnh thử đồ', exact: true }).click();
  await expect(page.locator('.try-on-ai-images img')).toHaveCount(2);
  await page.reload();
  await page.getByRole('button', { name: 'Xem lượt thử đang có', exact: true }).click();
  await expect(page.locator('.try-on-ai-images img')).toHaveCount(2); expect(state.posts).toHaveLength(1);
  await page.getByRole('button', { name: 'Xóa ảnh và kết quả', exact: true }).click();
  await expect(page.locator('.try-on-ai-images img')).toHaveCount(0);
  await expect(page.getByText(/Còn 0 \/ 2 ảnh hôm nay/)).toBeVisible();
  expect(await page.evaluate(() => Object.entries(localStorage).some(([key, value]) => /photo|try.?on/i.test(key) || value.includes('synthetic-person')))).toBe(false);
});
test('hạn mức được đặt lại từ server: cùng ảnh và màu có thể tạo lượt mới với mã mới', async ({ page }) => {
  const { state, bytes } = await fixture(page);
  await prepare(page, bytes); await page.getByRole('checkbox').check(); await page.getByRole('button', { name: 'Tạo 2 ảnh thử đồ', exact: true }).click();
  await expect(page.locator('.try-on-ai-images img')).toHaveCount(2);
  const firstKey = state.posts[0].key;
  state.remaining = 2;
  await page.getByRole('button', { name: 'Đổi ảnh hoặc lựa chọn', exact: true }).click();
  await page.getByRole('button', { name: 'Kiểm tra lại hạn mức', exact: true }).click();
  await expect(page.getByText(/Còn 2 \/ 2 ảnh hôm nay/)).toBeVisible();
  await stage(page).getByRole('button', { name: 'Tiếp tục', exact: true }).click();
  await page.getByRole('checkbox').check(); await page.getByRole('button', { name: 'Tạo 2 ảnh thử đồ', exact: true }).click();
  await expect(page.locator('.try-on-ai-images img')).toHaveCount(2);
  expect(state.posts).toHaveLength(2); expect(state.posts[1].key).not.toBe(firstKey);
});
test('tạm bỏ xác minh email: tài khoản chưa xác minh vẫn tạo được hai ảnh sau consent', async ({ page }) => {
  const { state, bytes } = await fixture(page, { verified: false, requireVerifiedEmail: false });
  await prepare(page, bytes);
  const generate = page.getByRole('button', { name: 'Tạo 2 ảnh thử đồ', exact: true });
  await expect(generate).toBeDisabled();
  await expect(page.locator('.try-on-generation-block')).toHaveAttribute('data-reason', 'consent');
  await expect(page.getByRole('link', { name: /Xác minh email trong tài khoản/ })).toHaveCount(0);
  await page.getByRole('checkbox').check();
  await expect(generate).toBeEnabled(); await generate.click();
  await expect(page.locator('.try-on-ai-images img')).toHaveCount(2);
  expect(state.posts).toHaveLength(1);
  await expect(page.getByText(/Còn 0 \/ 2 ảnh hôm nay/)).toBeVisible();
});
test('tạm bỏ xác minh email vẫn yêu cầu đăng nhập và không tự gửi ảnh', async ({ page }) => {
  const { state, bytes } = await fixture(page, { guest: true, requireVerifiedEmail: false });
  await prepare(page, bytes); await page.getByRole('checkbox').check();
  await expect(page.getByRole('button', { name: 'Tạo 2 ảnh thử đồ', exact: true })).toBeDisabled();
  await expect(page.locator('.try-on-generation-block')).toHaveAttribute('data-reason', 'login');
  await expect(page.locator('.try-on-ai-quota')).toContainText('Đăng nhập tài khoản Milo để dùng thử AI.');
  expect(state.posts).toHaveLength(0);
});
test('khi bật lại xác minh: khách chưa đăng nhập hoặc chưa xác minh email không gửi được ảnh', async ({ page }) => {
  for (const guest of [true, false]) {
    await page.unroute('**/api/v1/me'); await page.unroute('**/api/v1/try-on/**');
    const { state, bytes } = await fixture(page, { guest, verified: false, requireVerifiedEmail: true });
    await prepare(page, bytes); await page.getByRole('checkbox').check();
    await expect(page.getByRole('button', { name: 'Tạo 2 ảnh thử đồ', exact: true })).toBeDisabled();
    await expect(page.locator('.try-on-generation-block')).toHaveAttribute('data-reason', guest ? 'login' : 'verification');
    await expect(page.locator('.try-on-generation-block')).toContainText(guest ? 'Bạn cần đăng nhập' : 'email tài khoản chưa được xác minh');
    expect(state.posts).toHaveLength(0);
    await expect(page.getByRole('link', { name: guest ? 'Đăng nhập' : /Xác minh email trong tài khoản/, exact: true }).first()).toBeVisible();
  }
});
test('hiển thị lý do khóa cạnh nút; gửi lại xác minh và cập nhật tài khoản mà không tạo ảnh', async ({ page }) => {
  const options = { verified: false, requireVerifiedEmail: true };
  const { state, bytes } = await fixture(page, options);
  let resendCount = 0;
  await page.route('**/api/v1/auth/verify/resend', route => {
    resendCount++;
    return route.fulfill({ json: { delivery: 'local', message: 'Môi trường phát triển đang lưu thư tại .local/mail, chưa gửi email ra ngoài.' } });
  });
  await prepare(page, bytes); await page.getByRole('checkbox').check();
  const button = page.getByRole('button', { name: 'Tạo 2 ảnh thử đồ', exact: true });
  await expect(button).toBeDisabled();
  await expect(page.locator('.try-on-generation-block')).toContainText('Bạn đã đồng ý sử dụng ảnh, nhưng email tài khoản chưa được xác minh');
  await expect(button).toHaveAttribute('aria-describedby', /generate-block$/);
  await page.getByRole('button', { name: 'Gửi lại email xác minh', exact: true }).click();
  await expect(page.getByText(/Môi trường phát triển đang lưu thư tại/)).toBeVisible();
  expect(resendCount).toBe(1); expect(state.posts).toHaveLength(0);
  await page.getByRole('button', { name: 'Đã xác minh, kiểm tra lại', exact: true }).click();
  await expect(page.getByText(/Email vẫn chưa được xác minh/)).toBeVisible(); await expect(button).toBeDisabled();
  options.verified = true;
  await page.getByRole('button', { name: 'Đã xác minh, kiểm tra lại', exact: true }).click();
  await expect(button).toBeEnabled();
  await expect(page.locator('.try-on-generation-block')).toHaveCount(0);
  expect(state.posts).toHaveLength(0);
  mkdirSync('.local/try-on-api', { recursive: true });
  await page.screenshot({ path: '.local/try-on-api/verified-generate-ready.png', fullPage: true, caret: 'initial' });
});
test('hết hạn mức không tạo lượt mới khi đổi màu, vẫn có chế độ thủ công', async ({ page }) => {
  const { state, bytes } = await fixture(page, { remaining: 0, verified: false });
  await prepare(page, bytes, product.images[2].color); await page.getByRole('checkbox').check();
  await expect(page.getByRole('button', { name: 'Tạo 2 ảnh thử đồ', exact: true })).toBeDisabled();
  await expect(page.locator('.try-on-generation-block')).toHaveAttribute('data-reason', 'quota-exhausted');
  expect(state.posts).toHaveLength(0);
  await page.getByRole('button', { name: 'Tự dùng ChatGPT', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Tự dùng ChatGPT', exact: true })).toHaveAttribute('aria-pressed', 'true');
});
test('chưa có key/config: AI trực tiếp bị khóa, không phát sinh upload', async ({ page }) => {
  const { state } = await fixture(page, { enabled: false });
  await page.goto(`/dung-thu/${product.slug}`);
  await expect(page.getByRole('button', { name: 'Thử đồ AI tại Milo', exact: true })).toBeDisabled();
  await expect(page.getByText('Thử đồ AI tại Milo hiện chưa khả dụng.', { exact: true })).toBeVisible();
  expect(state.posts).toHaveLength(0);
});
test('mất phản hồi POST khôi phục job qua quota, không tự gửi thêm request tạo ảnh', async ({ page }) => {
  const { state, bytes } = await fixture(page, { lostResponse: true });
  await prepare(page, bytes); await page.getByRole('checkbox').check(); await page.getByRole('button', { name: 'Tạo 2 ảnh thử đồ', exact: true }).click();
  await expect(page.locator('.try-on-ai-images img')).toHaveCount(2);
  expect(state.posts).toHaveLength(1);
});
test('POST mới thất bại không dùng kết quả của lượt cũ để báo thành công', async ({ page }) => {
  const { state, bytes } = await fixture(page);
  await prepare(page, bytes); await page.getByRole('checkbox').check(); await page.getByRole('button', { name: 'Tạo 2 ảnh thử đồ', exact: true }).click();
  await expect(page.locator('.try-on-ai-images img')).toHaveCount(2);
  state.remaining = 2;
  await page.getByRole('button', { name: 'Đổi ảnh hoặc lựa chọn', exact: true }).click();
  await page.getByRole('button', { name: 'Kiểm tra lại hạn mức', exact: true }).click();
  await expect(page.getByText(/Còn 2 \/ 2 ảnh hôm nay/)).toBeVisible();
  await page.route('**/api/v1/try-on/jobs', route => route.fulfill({ status: 503, json: { message: 'Fixture new request rejected' } }));
  await stage(page).getByRole('button', { name: 'Tiếp tục', exact: true }).click();
  await page.getByRole('checkbox').check(); await page.getByRole('button', { name: 'Tạo 2 ảnh thử đồ', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Fixture new request rejected' })).toBeVisible();
  await expect(stage(page).getByRole('heading', { name: 'Đúng bạn. Đúng thiết kế.', exact: true })).toBeVisible();
});
test('lỗi provider không tự tạo bù; kiểm tra tiến độ chỉ đọc lượt đã có', async ({ page }) => {
  const { state, bytes } = await fixture(page, { failed: true });
  await prepare(page, bytes); await page.getByRole('checkbox').check(); await page.getByRole('button', { name: 'Tạo 2 ảnh thử đồ', exact: true }).click();
  await expect(page.getByText(/Milo không tự gửi lại/)).toBeVisible();
  await page.getByRole('button', { name: 'Kiểm tra tiến độ & hạn mức', exact: true }).click();
  await expect(page.getByText(/Còn 0 \/ 2 ảnh hôm nay/)).toBeVisible(); expect(state.posts).toHaveLength(1);
});
test('mobile 360px hiển thị hai ảnh tại website, không tràn ngang', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  const { bytes } = await fixture(page);
  await prepare(page, bytes); await page.getByRole('checkbox').check(); await page.getByRole('button', { name: 'Tạo 2 ảnh thử đồ', exact: true }).click();
  await expect(page.locator('.try-on-ai-images img')).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  mkdirSync('.local/try-on-api', { recursive: true });
  await page.screenshot({ path: '.local/try-on-api/mobile-result.png', fullPage: true, caret: 'initial' });
});
