import { test, expect, type Page } from '@playwright/test';
test.skip(!process.env.TRY_ON_FIXTURES, 'Use isolated fixture runner');
test.beforeEach(async ({ context, page, baseURL }) => {
  const errors: string[] = []; (page as any).authErrors = errors;
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (/hydration|TypeError|ReferenceError|cannot contain|cannot be a descendant/i.test(message.text())) errors.push(message.text()); });
  await context.route('**/*', route => new URL(route.request().url()).origin === new URL(baseURL!).origin ? route.continue() : route.abort());
});
test.afterEach(async ({ page }) => expect((page as any).authErrors).toEqual([]));
async function fixture(page: Page, options: { google?: boolean; delivery?: string; mfa?: boolean; loggedIn?: boolean; linked?: boolean; passwordEnabled?: boolean } = {}) {
  const state = { calls: [] as { path: string; body: any }[], loggedIn: !!options.loggedIn, linked: !!options.linked };
  const actor = { id: 'synthetic-customer', name: 'Khách Giả Lập', email: 'fixture@gmail.com', role: 'USER', verifiedAt: '2026-11-23T00:00:00Z', preferences: [] };
  await page.context().addCookies([{ name: 'milo_csrf', value: 'a'.repeat(64) + '.' + 'b'.repeat(64), url: 'http://localhost:3100' }]);
  await page.route('**/api/v1/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname.replace('/api/v1', ''), body = request.postData() ? request.postDataJSON() : null;
    const json = (data: any, status = 200) => route.fulfill({ status, json: data });
    state.calls.push({ path, body });
    if (path === '/me') return state.loggedIn ? json(actor) : json({ message: 'Guest fixture' }, 401);
    if (path === '/config') return json({ returnDays: 14 });
    if (path === '/cart') return json({ items: [] });
    if (path === '/auth/google/config') return json({ enabled: !!options.google });
    if (path === '/auth/google/status') return json({ available: !!options.google, linked: state.linked, email: state.linked ? actor.email : null, passwordEnabled: options.passwordEnabled !== false });
    if (path === '/auth/google/start') return json({ url: 'https://accounts.google.com/o/oauth2/v2/auth?state=synthetic' }, 201);
    if (path === '/auth/google/complete') { if (options.mfa && body.otp !== '123456') return json({ code: 'MFA_REQUIRED', message: 'Nhập mã 2FA để tiếp tục.' }, 401); state.loggedIn = true; return json({ user: actor }, 201); }
    if (path === '/auth/google/link' && request.method() === 'DELETE') { state.linked = false; return json({ message: 'Đã bỏ liên kết.' }); }
    if (path === '/auth/recovery/config') return json({ delivery: options.delivery || 'email', expiresIn: 600, resendAfter: 60 });
    if (path === '/auth/recovery/request') return json({ challengeId: '11111111-2222-4333-8444-555555555555', delivery: options.delivery || 'email', expiresIn: 600, resendAfter: 60, message: 'Nếu địa chỉ hợp lệ, yêu cầu gửi mã đã được tiếp nhận.' }, 201);
    if (path === '/auth/recovery/verify') return body.code === '123456' ? json({ resetToken: 'b'.repeat(64), expiresIn: 300 }, 201) : json({ code: 'RECOVERY_CODE_INVALID', message: 'Mã không đúng, hết hạn hoặc đã dùng.' }, 400);
    if (path === '/auth/recovery/reset') return json({ message: 'Đã đặt lại mật khẩu và thu hồi các phiên đăng nhập. 2FA được giữ nguyên.' }, 201);
    if (path === '/auth/mfa/status') return json({ enabled: false, available: false, recoveryRemaining: 0 });
    return json([]);
  });
  return state;
}
test('Google buttons appear on login and registration, disabled when not configured', async ({ page }) => {
  await fixture(page); await page.goto('/dang-nhap'); await expect(page.getByRole('button', { name: /Tiếp tục với Google/ })).toBeDisabled();
  await expect(page.getByText('Đăng nhập Google đang chờ shop hoàn tất kết nối.')).toBeVisible();
  await page.goto('/dang-ky'); await expect(page.getByRole('button', { name: /Tiếp tục với Google/ })).toBeDisabled();
});
test('configured Google starts through CSRF-protected POST and redirects only to Google', async ({ page }) => {
  const state = await fixture(page, { google: true }); await page.route('https://accounts.google.com/**', route => route.fulfill({ contentType: 'text/html', body: '<p>Synthetic Google page; no provider call.</p>' }));
  await page.goto('/dang-nhap?next=%2Ftai-khoan'); await page.getByRole('button', { name: /Tiếp tục với Google/ }).click();
  await page.waitForURL('https://accounts.google.com/**'); expect(state.calls.find(call => call.path === '/auth/google/start')?.body).toEqual({ mode: 'login', next: '/tai-khoan' });
});
test('Google finish requests pending login once, asks staff MFA and then signs in', async ({ page }) => {
  const state = await fixture(page, { google: true, mfa: true }); await page.goto('/dang-nhap?google_step=verify&next=%2Ftai-khoan');
  await expect(page.getByRole('heading', { name: 'Xác nhận thêm một bước.' })).toBeVisible();
  expect(state.calls.filter(call => call.path === '/auth/google/complete')).toHaveLength(1);
  await page.getByLabel('Mã 2FA hoặc mã khôi phục').fill('123456'); await page.getByRole('button', { name: 'Xác nhận đăng nhập Google' }).click();
  await page.waitForURL('**/tai-khoan'); expect(state.calls.filter(call => call.path === '/auth/google/complete')).toHaveLength(2);
});
test('recovery email/code/password flow handles invalid codes, cooldown and password confirmation without persistent secrets', async ({ page }) => {
  const state = await fixture(page); await page.goto('/quen-mat-khau'); await page.getByLabel('Email tài khoản').fill('fixture@gmail.com'); await page.getByRole('button', { name: /Gửi mã khôi phục/ }).click();
  await expect(page.getByRole('button', { name: /Gửi lại sau/ })).toBeDisabled();
  await page.getByLabel('Mã xác nhận 6 số').fill('000000'); await page.getByRole('button', { name: 'Xác nhận mã' }).click(); await expect(page.getByText('Mã không đúng, hết hạn hoặc đã dùng.', { exact: true })).toBeVisible();
  await page.getByLabel('Mã xác nhận 6 số').fill('123456'); await page.getByRole('button', { name: 'Xác nhận mã' }).click();
  await page.getByLabel('Mật khẩu mới', { exact: true }).fill('Synthetic password for browser test!'); await page.getByLabel('Nhập lại mật khẩu mới').fill('Synthetic mismatched password!'); await page.getByRole('button', { name: 'Lưu mật khẩu mới' }).click();
  await expect(page.getByText('Hai mật khẩu chưa khớp.')).toBeVisible(); expect(state.calls.filter(call => call.path === '/auth/recovery/reset')).toHaveLength(0);
  await page.getByLabel('Nhập lại mật khẩu mới').fill('Synthetic password for browser test!'); await page.getByRole('button', { name: 'Lưu mật khẩu mới' }).click();
  await expect(page.getByRole('heading', { name: 'Sẵn sàng trở lại.' })).toBeVisible();
  const stored = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } })); expect(stored).not.toContain('b'.repeat(64)); expect(stored).not.toContain('Synthetic password'); expect(page.url()).not.toContain('token=');
});
test('recovery unavailable stops sending; mobile has no horizontal overflow', async ({ page }) => {
  const state = await fixture(page, { delivery: 'unavailable' }); await page.setViewportSize({ width: 360, height: 800 }); await page.goto('/quen-mat-khau');
  await expect(page.getByRole('button', { name: /Gửi mã khôi phục/ })).toBeDisabled(); await expect(page.getByText('Chức năng gửi mã đang chờ shop hoàn tất cấu hình email.')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); expect(state.calls.filter(call => call.path === '/auth/recovery/request')).toHaveLength(0);
});
test('existing-email collision gives safe linking instruction; account shows last-method protection', async ({ page }) => {
  await fixture(page, { loggedIn: true, google: true, linked: true, passwordEnabled: false }); await page.goto('/dang-nhap?google_error=GOOGLE_LINK_REQUIRED');
  await expect(page.getByText(/Email đã có tài khoản Milo/)).toBeVisible(); await page.goto('/tai-khoan'); await page.getByRole('button', { name: 'Bảo mật', exact: true }).click();
  await expect(page.getByText('Đã liên kết: fixture@gmail.com')).toBeVisible(); await expect(page.getByRole('button', { name: 'Bỏ liên kết Google' })).toBeDisabled(); await expect(page.getByRole('link', { name: 'Tạo mật khẩu bằng mã gửi email' })).toHaveAttribute('href', '/quen-mat-khau');
});
