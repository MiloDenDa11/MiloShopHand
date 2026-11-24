import { test, expect, type Page } from '@playwright/test';
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { sellerTransitions } from '../../packages/shared/src';
test.skip(!process.env.TRY_ON_FIXTURES, 'Use the isolated browser fixture runner');
test.beforeEach(async ({ context, page, baseURL }) => {
  const errors: string[] = []; (page as any).fixtureErrors = errors;
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (/hydration|TypeError|ReferenceError|Invalid src prop|cannot contain|cannot be a descendant/i.test(message.text())) errors.push(message.text()); });
  await context.route('**/*', route => new URL(route.request().url()).origin === new URL(baseURL!).origin ? route.continue() : route.abort());
});
test.afterEach(async ({ page }) => expect((page as any).fixtureErrors).toEqual([]));
async function fixture(page: Page, options: { role?: string; cloudinary?: boolean; expired?: boolean; expiryCode?: string; operations?: boolean; mfaLogin?: boolean } = {}) {
  let checked = 0, packingRevision = 0;
  const state = { uploads: 0, deletes: 0, patches: [] as any[], sellerReads: 0, refreshes: 0, cancellation: null as any, expired: !!options.expired };
  const actor: any = { id: 'synthetic-owner', name: 'Khách Giả Lập', email: 'fixture@example.test', phone: '0901234567', role: options.role || 'USER', verifiedAt: '2026-11-23T00:00:00Z', avatarUrl: null, preferences: [], marketingConsent: false };
  const employees = [{ id: actor.id, name: actor.name, role: actor.role }, { id: 'synthetic-colleague', name: 'Nhân viên khác', role: 'SELLER' }];
  const policy = { enabled: !!options.operations, pendingMinutes: 30, packingMinutes: 240 };
  let mfaEnabled = false, loggedIn = !options.mfaLogin;
  const order: any = { id: 'synthetic-order', code: 'ML-FIXTURE-001', userId: actor.id, status: 'PENDING_CONFIRMATION', method: 'COD', address: { recipient: 'Người Nhận Giả Lập', phone: '0901234567', text: '123 Đường Kiểm Thử, Hồ Chí Minh', detail: '', instructions: 'Gọi trước' }, buyer: { name: actor.name, email: actor.email }, items: [{ id: 'synthetic-line', name: 'Synthetic Polo', image: '/hero-shirt.svg', color: 'Xanh olive', size: 'M', quantity: 1, price: 550000, discount: 0 }], subtotal: 550000, discount: 0, shippingFee: 30000, shippingDiscount: 0, tax: 0, total: 580000, createdAt: '2026-11-23T00:00:00Z', updatedAt: '2026-11-23T00:00:00Z', history: [{ id: 'h1', to: 'PENDING_CONFIRMATION', reason: 'Tạo đơn hàng', createdAt: '2026-11-23T00:00:00Z' }], payment: { status: 'UNPAID', amount: 580000, received: 0, refunded: 0 }, shipment: { status: 'NOT_CREATED', trackingCode: null }, returns: [] };
  await page.context().addCookies([{ name: 'milo_csrf', value: 'a'.repeat(64) + '.' + 'b'.repeat(64), url: 'http://localhost:3100' }]);
  await page.route('**/api/v1/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname.replace('/api/v1', '');
    const json = (body: any, status = 200) => route.fulfill({ status, json: body });
    if (path === '/auth/refresh') { state.refreshes++; state.expired = false; return json({ accessExpiresIn: 900 }, 201); }
    if (state.expired) return json({ code: options.expiryCode || 'ACCESS_TOKEN_EXPIRED', message: 'Fixture expiry' }, 401);
    if (path === '/me') return options.role === 'GUEST' || !loggedIn ? json({ message: 'Guest fixture' }, 401) : json(actor);
    if (path === '/auth/mfa/status') return json({ available: ['ADMIN', 'SELLER'].includes(actor.role), enabled: mfaEnabled, recoveryRemaining: mfaEnabled ? 2 : 0 });
    if (path === '/auth/mfa/setup') return json({ setupId: 'synthetic-setup', secret: 'JBSWY3DPEHPK3PXP', uri: 'otpauth://totp/MiloShopHand:fixture?secret=JBSWY3DPEHPK3PXP&issuer=MiloShopHand' }, 201);
    if (path === '/auth/mfa/enable') { mfaEnabled = true; return json({ enabled: true, recoveryCodes: ['11111111-22222222-33333333-44444444', '55555555-66666666-77777777-88888888'] }, 201); }
    if (path === '/auth/mfa' && request.method() === 'DELETE') { mfaEnabled = false; return json({ enabled: false }); }
    if (path === '/auth/login' && options.mfaLogin) { if (request.postDataJSON().otp !== '123456') return json({ code: 'MFA_REQUIRED', message: 'Nhập mã 2FA để tiếp tục.' }, 401); loggedIn = true; return json({ user: actor }, 201); }
    if (path === '/cart') return json({ items: [] });
    if (path === '/me/wishlist') return json([]);
    if (path === '/config') return json({ returnDays: 14 });
    if (path === '/me/avatar/config') return json({ enabled: options.cloudinary !== false, maxBytes: 5 * 1024 * 1024 });
    if (path === '/me/avatar') {
      if (request.method() === 'DELETE') { state.deletes++; actor.avatarUrl = null; return json({ avatarUrl: null }); }
      expect(request.headers()['x-csrf-token']).toContain('.'); expect(request.postDataBuffer()!.toString()).toContain('name="file"');
      state.uploads++; actor.avatarUrl = '/favicon-512.png'; return json({ avatarUrl: actor.avatarUrl }, 201);
    }
    if (path.endsWith('/packing')) {
      if (request.method() === 'POST') { checked++; packingRevision++; }
      return json({ orderId: order.id, status: order.status, revision: packingRevision, needsReset: false, complete: checked === 1, checkedTotal: checked, expectedTotal: 1, items: [{ ...order.items[0], sku: 'SYNTHETIC-POLO-OLIVE-M', checked }] });
    }
    if (path.startsWith('/seller/')) {
      state.sellerReads++;
      const detail = () => ({ ...order, assignment: order.assignment || { assigneeId: null, assignee: null, revision: 0 }, deadline: options.operations && ['PENDING_CONFIRMATION', 'CONFIRMED', 'PACKING'].includes(order.status) ? { phase: 'approval', dueAt: '2026-11-23T00:30:00Z', overdue: true, minutesOverdue: 10 } : null, allowedActions: sellerTransitions[order.status] || [] });
      if (path.endsWith('/overview')) return json({ counts: { [order.status]: 1 }, mine: order.assignment?.assigneeId === actor.id ? 1 : 0, unassigned: order.assignment?.assigneeId ? 0 : 1, overdue: options.operations ? 1 : 0, policy });
      if (path === '/seller/staff') return json(employees);
      if (path === '/seller/settings') { Object.assign(policy, request.postDataJSON()); return json(policy); }
      if (path.endsWith('/assignment')) { const input = request.postDataJSON(); order.assignment = { assigneeId: input.assigneeId, revision: (order.assignment?.revision || 0) + 1, assignee: input.assigneeId ? employees.find(employee => employee.id === input.assigneeId) : null }; return json(detail()); }
      if (path === '/seller/orders') { const params = new URL(request.url()).searchParams; const show = params.get('assignee') === 'mine' ? order.assignment?.assigneeId === actor.id : params.get('assignee') === 'unassigned' ? !order.assignment?.assigneeId : true; return json({ items: show ? [detail()] : [], total: show ? 1 : 0, page: 1, pages: 1 }); }
      if (path.endsWith('/shipment')) { order.shipment = { status: 'CREATED', trackingCode: 'SYNTHETIC-TRACKING' }; return json({ message: 'Đã tạo vận đơn giả lập.' }, 201); }
      if (request.method() === 'PATCH') {
        const body = request.postDataJSON(); state.patches.push(body);
        if (body.from !== order.status) return json({ message: 'Đơn đã thay đổi.' }, 409);
        order.status = body.status; order.history.push({ id: `h${order.history.length + 1}`, to: body.status, reason: body.reason, createdAt: '2026-11-23T00:10:00Z' });
      }
      return json(detail());
    }
    if (path === '/orders/synthetic-order/cancel') {
      state.cancellation = request.postDataJSON(); order.status = 'CANCELLED'; order.history.push({ id: 'cancel', to: 'CANCELLED', reason: 'Đặt trùng đơn', createdAt: '2026-11-23T00:10:00Z' }); return json(order, 201);
    }
    if (path === '/orders/synthetic-order') return json(order);
    return json([]);
  });
  return { state, actor, order };
}
test('ảnh đại diện chặn quá 5 MB trước upload, xem trước rồi lưu/xóa bằng CSRF', async ({ page }) => {
  const { state } = await fixture(page); await page.goto('/tai-khoan');
  const input = page.getByLabel('Chọn ảnh đại diện', { exact: true }); await expect(input).toBeEnabled();
  await input.setInputFiles({ name: 'large.png', mimeType: 'image/png', buffer: Buffer.alloc(5 * 1024 * 1024 + 1) });
  await expect(page.getByText('Ảnh đại diện không được vượt quá 5 MB.', { exact: true })).toBeVisible(); expect(state.uploads).toBe(0);
  const image = await sharp({ create: { width: 640, height: 640, channels: 3, background: '#8a9371' } }).png().toBuffer();
  await input.setInputFiles({ name: 'synthetic-avatar.png', mimeType: 'image/png', buffer: image });
  await expect(page.getByAltText('Xem trước ảnh đại diện')).toBeVisible(); expect(state.uploads).toBe(0);
  await page.getByRole('button', { name: 'Lưu ảnh đại diện', exact: true }).click(); await expect(page.getByText('Đã cập nhật ảnh đại diện.', { exact: true })).toBeVisible(); expect(state.uploads).toBe(1);
  await expect(page.locator('.account-avatar img')).toHaveCount(1); await expect(page.locator('.header-avatar')).toHaveCount(1);
  await page.getByRole('button', { name: 'Xóa ảnh', exact: true }).click(); await expect(page.locator('.account-avatar img')).toHaveCount(0); expect(state.deletes).toBe(1);
});
test('Cloudinary chưa cấu hình hiển thị rõ và khóa tải ảnh', async ({ page }) => {
  const { state } = await fixture(page, { cloudinary: false }); await page.goto('/tai-khoan');
  await expect(page.getByText(/Chưa kết nối Cloudinary/)).toBeVisible(); await expect(page.getByLabel('Chọn ảnh đại diện', { exact: true })).toBeDisabled(); expect(state.uploads).toBe(0);
});
for (const expiryCode of ['ACCESS_TOKEN_EXPIRED', 'ACCESS_TOKEN_REVOKED']) test(`JWT ${expiryCode} được làm mới một lần, không lưu token vào localStorage`, async ({ page }) => {
  const { state } = await fixture(page, { expired: true, expiryCode }); await page.goto('/tai-khoan');
  await expect(page.getByRole('heading', { name: 'Xin chào, Lập.' })).toBeVisible(); expect(state.refreshes).toBe(1);
  expect(await page.evaluate(() => Object.entries(localStorage).some(([key, value]) => /jwt|access.?token|refresh.?token/i.test(key) || value.startsWith('eyJ')))).toBe(false);
});
test('khách và USER không gọi API khu vực Người bán', async ({ page }) => {
  const { state } = await fixture(page, { role: 'USER' }); await page.goto('/nguoi-ban'); await expect(page.getByRole('heading', { name: 'Bạn chưa được cấp quyền Người bán.' })).toBeVisible(); expect(state.sellerReads).toBe(0);
});
test('Người bán xem khách/đơn và xử lý duyệt, đóng gói, vận đơn, bàn giao', async ({ page }) => {
  const { state } = await fixture(page, { role: 'SELLER' }); await page.goto('/nguoi-ban?order=synthetic-order');
  await expect(page.getByRole('heading', { name: 'ML-FIXTURE-001' })).toBeVisible(); await expect(page.getByText('Tài khoản đặt:', { exact: false })).toContainText('fixture@example.test');
  for (const action of ['Duyệt đơn', 'Bắt đầu đóng gói', 'Đóng gói xong']) {
    if (action === 'Đóng gói xong') { await page.getByLabel('Mã SKU cần kiểm').fill('SYNTHETIC-POLO-OLIVE-M'); await page.getByRole('button', { name: 'Xác nhận 1 sản phẩm' }).click(); }
    await page.getByRole('button', { name: action, exact: true }).click();
    const dialog = page.getByRole('dialog'); await expect(dialog).toBeVisible(); await dialog.getByRole('button', { name: `Xác nhận ${action.toLowerCase()}`, exact: true }).click(); await expect(dialog).toHaveCount(0);
  }
  await expect(page.getByRole('button', { name: 'Đã bàn giao vận chuyển', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Tạo vận đơn', exact: true }).click(); await expect(page.getByText('SYNTHETIC-TRACKING', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Đã bàn giao vận chuyển', exact: true }).click(); const dialog = page.getByRole('dialog'); await dialog.getByRole('checkbox').check(); await dialog.getByRole('button', { name: 'Xác nhận đã bàn giao vận chuyển', exact: true }).click();
  await expect(dialog).toHaveCount(0); expect(state.patches.map(value => value.status)).toEqual(['CONFIRMED', 'PACKING', 'READY_TO_SHIP', 'SHIPPED']);
  await page.evaluate(() => { (document.activeElement as HTMLElement)?.blur(); window.scrollTo({ top: 0, behavior: 'instant' }); });
  mkdirSync('.local/commerce-upgrade', { recursive: true }); await page.screenshot({ path: '.local/commerce-upgrade/seller-desktop.png', fullPage: true, caret: 'initial' });
});
test('người mua chọn lý do hủy; sau duyệt không còn nút hủy', async ({ page }) => {
  const { state, order } = await fixture(page); await page.goto('/don-hang/synthetic-order');
  await page.getByRole('button', { name: 'Hủy đơn hàng', exact: true }).click(); const dialog = page.getByRole('dialog');
  await dialog.locator('select[name="reasonCode"]').selectOption('DUPLICATE', { force: true }); await dialog.getByRole('button', { name: 'Xác nhận hủy đơn', exact: true }).click();
  await expect(dialog).toHaveCount(0); expect(state.cancellation).toEqual({ reasonCode: 'DUPLICATE', detail: '' });
  order.status = 'CONFIRMED'; await page.reload(); await expect(page.getByText(/Đơn đã được người bán duyệt nên không thể tự hủy/)).toBeVisible(); await expect(page.getByRole('button', { name: 'Hủy đơn hàng', exact: true })).toHaveCount(0);
});
test('Người bán trên mobile 360px không tràn ngang', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 }); await fixture(page, { role: 'SELLER' }); await page.goto('/nguoi-ban?order=synthetic-order');
  await expect(page.getByRole('heading', { name: 'ML-FIXTURE-001' })).toBeVisible(); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.getByRole('button', { name: /ML-FIXTURE-001/ }).click(); await expect(page.getByRole('heading', { name: 'ML-FIXTURE-001' })).toBeVisible();
  await page.evaluate(() => { (document.activeElement as HTMLElement)?.blur(); window.scrollTo({ top: 0, behavior: 'instant' }); });
  mkdirSync('.local/commerce-upgrade', { recursive: true }); await page.screenshot({ path: '.local/commerce-upgrade/seller-mobile.png', fullPage: true });
});
test('nhân viên nhận/bỏ phụ trách và lọc đơn của tôi', async ({ page }) => {
  await fixture(page, { role: 'SELLER', operations: true }); await page.goto('/nguoi-ban?order=synthetic-order');
  await page.getByRole('button', { name: 'Nhận phụ trách', exact: true }).click(); await expect(page.getByRole('button', { name: 'Bỏ phụ trách', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Đơn của tôi \(1\)/ }).click(); await expect(page.getByRole('heading', { name: 'ML-FIXTURE-001' })).toBeVisible();
  await expect(page.getByText(/Quá mốc nội bộ/)).toBeVisible(); await page.getByRole('button', { name: 'Bỏ phụ trách', exact: true }).click();
  await expect(page.getByText('Chưa có đơn hàng phù hợp.', { exact: true })).toBeVisible();
});
test('Admin giao nhân viên khác, thay mốc nhắc; nhân viên khác thấy nút xử lý bị khóa', async ({ page }) => {
  const { order, actor } = await fixture(page, { role: 'ADMIN', operations: true }); await page.goto('/nguoi-ban?order=synthetic-order');
  await page.locator('select[name="assigneeId"]').selectOption('synthetic-colleague', { force: true }); await page.getByRole('button', { name: 'Lưu phân công', exact: true }).click();
  await expect(page.locator('.seller-assignment')).toContainText('Nhân viên khác');
  await page.evaluate(() => { (document.activeElement as HTMLElement)?.blur(); window.scrollTo({ top: 0, behavior: 'instant' }); });
  mkdirSync('.local/seller-operations', { recursive: true }); await page.screenshot({ path: '.local/seller-operations/assignment-desktop.png', fullPage: true, caret: 'initial' });
  await page.getByText('Cấu hình nhắc việc nội bộ', { exact: true }).click(); await page.getByLabel('Chờ duyệt tối đa (phút)').fill('45'); await page.getByRole('button', { name: 'Lưu mốc nhắc việc', exact: true }).click();
  await expect(page.getByText(/Nhắc nội bộ: chờ duyệt 45 phút/)).toBeVisible();
  order.assignment = { assigneeId: 'synthetic-colleague', revision: 2, assignee: { name: 'Nhân viên khác', active: true } };
  actor.role = 'SELLER'; await page.reload(); await expect(page.getByRole('button', { name: 'Duyệt đơn', exact: true })).toBeDisabled(); await expect(page.getByText('Cấu hình nhắc việc nội bộ', { exact: true })).toHaveCount(0);
  await page.setViewportSize({ width: 360, height: 800 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' })); await page.screenshot({ path: '.local/seller-operations/assignment-mobile.png', fullPage: true, caret: 'initial' });
});
test('2FA tùy chọn hiển thị QR, mã khôi phục và cho tắt bằng mã', async ({ page }) => {
  await fixture(page, { role: 'SELLER' }); await page.goto('/tai-khoan'); await page.getByRole('button', { name: 'Bảo mật', exact: true }).click();
  await page.getByRole('button', { name: 'Thiết lập 2FA', exact: true }).click(); await expect(page.getByText('Quét QR bằng ứng dụng Authenticator, rồi nhập mã 6 số để xác nhận.', { exact: false })).toBeVisible();
  await page.getByLabel('Mã xác thực để bật 2FA', { exact: true }).fill('123456'); await page.getByRole('button', { name: 'Xác nhận bật 2FA', exact: true }).click();
  await expect(page.getByLabel('Các mã khôi phục 2FA')).toBeVisible(); await expect(page.locator('.two-factor-setup')).toHaveCount(0);
  await page.getByRole('button', { name: 'Tôi đã lưu mã', exact: true }).click(); await page.getByText('Tắt xác thực 2 bước', { exact: true }).click();
  await page.getByLabel('Mã 2FA hoặc mã khôi phục', { exact: true }).fill('123456'); await page.getByRole('button', { name: 'Xác nhận tắt 2FA', exact: true }).click(); await expect(page.getByText('Chưa bật 2FA.', { exact: true })).toBeVisible();
});
test('đăng nhập hiện ô 2FA khi tài khoản yêu cầu; sau mã đúng vào tài khoản', async ({ page }) => {
  await fixture(page, { role: 'SELLER', mfaLogin: true }); await page.goto('/dang-nhap');
  await page.getByLabel('Email', { exact: true }).fill('fixture@example.test'); await page.getByLabel('Mật khẩu', { exact: true }).fill('Synthetic password for browser');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click(); await page.getByLabel('Mã 2FA hoặc mã khôi phục', { exact: true }).fill('123456'); await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Xin chào, Lập.' })).toBeVisible();
});
