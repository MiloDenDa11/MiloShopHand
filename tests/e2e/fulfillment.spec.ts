import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { sellerTransitions } from '../../packages/shared/src';
test.skip(!process.env.TRY_ON_FIXTURES, 'Use isolated fixture runner');
test.beforeEach(async ({ context, page, baseURL }) => {
  const errors: string[] = []; (page as any).fulfillmentErrors = errors;
  page.on('pageerror', error => errors.push(error.message)); page.on('console', message => { if (/hydration|TypeError|ReferenceError|cannot contain|cannot be a descendant/i.test(message.text())) errors.push(message.text()); });
  await context.route('**/*', route => new URL(route.request().url()).origin === new URL(baseURL!).origin ? route.continue() : route.abort());
  await context.addInitScript(() => {
    const sources: any[] = []; (window as any).__miloSources = sources;
    class Source extends EventTarget {
      closed = false; onerror: any = null;
      constructor(public url: string) { super(); sources.push(this); setTimeout(() => this.fire('ready', {}), 30); }
      close() { this.closed = true; }
      fire(name: string, data: any) { if (this.closed) return; if (name === 'error') this.onerror?.(new Event('error')); else this.dispatchEvent(new MessageEvent(name, { data: JSON.stringify(data) })); }
    }
    (window as any).EventSource = Source;
    (window as any).__miloEmit = (kind: string, orderId?: string) => sources.forEach(source => source.fire('change', { kind, orderId }));
    (window as any).__miloDisconnect = () => sources.forEach(source => source.fire('error', {}));
    window.print = () => { (window as any).__miloPrinted = true; };
  });
});
test.afterEach(async ({ page }) => expect((page as any).fulfillmentErrors).toEqual([]));
async function fixture(page: Page, options: { uncertain?: boolean; otherAssignee?: boolean; buyer?: boolean } = {}) {
  const actor: any = { id: 'synthetic-user', name: 'Khách Giả Lập', email: 'fixture@example.test', role: options.buyer ? 'USER' : 'SELLER', verifiedAt: '2026-11-23T00:00:00Z', preferences: [] };
  const state = { realtime: true, checked: 0, revision: 0, incoming: false, orderReads: 0, posts: [] as any[], seen: new Map<string, any>(), lostResponse: false, notifications: [{ id: 'note-1', title: 'Đơn hàng đang chờ xử lý', body: 'Mở đơn hàng để kiểm tra.', href: '/nguoi-ban?order=synthetic-order', createdAt: '2026-11-23T00:00:00Z', readAt: null as string | null }] };
  const order: any = { id: 'synthetic-order', code: 'ML-FULFILLMENT-001', status: 'PACKING', method: 'COD', userId: actor.id, address: { recipient: 'Khách Giả Lập', phone: '0901234567', text: '123 Đường Kiểm Thử, Hồ Chí Minh', instructions: '<script>display-as-text</script>' }, buyer: { name: actor.name, email: actor.email }, items: [{ id: 'line-1', variantId: 'variant-1', name: 'Milo Olive Polo', sku: 'MILO-POLO-OLIVE-M', color: 'Xanh olive', size: 'M', quantity: 2, price: 550000, discount: 0, image: '/hero-shirt.svg' }], subtotal: 1100000, discount: 0, shippingFee: 0, shippingDiscount: 0, tax: 0, total: 1100000, payment: { status: 'UNPAID', amount: 1100000, received: 0, refunded: 0 }, shipment: { status: 'NOT_CREATED', trackingCode: null }, returns: [], createdAt: '2026-11-23T00:00:00Z', updatedAt: '2026-11-23T00:00:00Z', history: [{ id: 'h1', to: 'PACKING', reason: 'Synthetic packing', createdAt: '2026-11-23T00:00:00Z' }], assignment: { assigneeId: options.otherAssignee ? 'another-staff' : actor.id, assignee: { id: actor.id, name: options.otherAssignee ? 'Nhân viên khác' : actor.name, active: true }, revision: 1 } };
  const progress = () => ({ orderId: order.id, status: order.status, revision: state.revision, complete: state.checked === 2, needsReset: false, checkedTotal: state.checked, expectedTotal: 2, items: order.items.map((line: any) => ({ ...line, checked: state.checked })) });
  const detail = () => ({ ...order, allowedActions: sellerTransitions[order.status] || [], deadline: null });
  await page.context().addCookies([{ name: 'milo_csrf', value: 'a'.repeat(64) + '.' + 'b'.repeat(64), url: 'http://localhost:3100' }]);
  await page.route('**/api/v1/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname.replace('/api/v1', ''), body = request.postData() ? request.postDataJSON() : null;
    const json = (data: any, status = 200) => route.fulfill({ status, json: data });
    if (path === '/me') return json(actor);
    if (path === '/me/realtime') return json({ enabled: state.realtime, role: actor.role });
    if (path === '/me/notifications') return json(state.notifications);
    if (path === '/me/notifications/summary') return json({ unread: state.notifications.filter(note => !note.readAt).length });
    if (path === '/me/notifications/read') { for (const note of state.notifications) if (body.all || body.ids.includes(note.id)) note.readAt = '2026-11-23T01:00:00Z'; return json({ unread: state.notifications.filter(note => !note.readAt).length }); }
    if (path === '/cart') return json({ items: [] });
    if (path === '/config') return json({ returnDays: 14 });
    if (path === '/auth/mfa/status') return json({ enabled: false, available: false, recoveryRemaining: 0 });
    if (path === '/seller/staff') return json([actor]);
    if (path === '/seller/overview') return json({ counts: { PACKING: state.incoming ? 2 : 1 }, mine: 1, unassigned: state.incoming ? 1 : 0, overdue: 0, policy: { enabled: false, pendingMinutes: 30, packingMinutes: 240 } });
    if (path === '/seller/orders') { state.orderReads++; return json({ items: [detail(), ...(state.incoming ? [{ ...detail(), id: 'new-order', code: 'ML-NEW-002' }] : [])], total: state.incoming ? 2 : 1, page: 1, pages: 1 }); }
    if (path === `/seller/orders/${order.id}` || path === `/orders/${order.id}`) return json(detail());
    if (path.endsWith('/packing-slip')) return json({ orderId: order.id, code: order.code, status: order.status, generatedAt: '2026-11-23T01:00:00Z', recipient: { name: order.address.recipient, phone: order.address.phone, address: order.address.text, instructions: order.address.instructions }, items: order.items.map(({ name, sku, color, size, quantity }: any) => ({ name, sku, color, size, quantity })), totalQuantity: 2 }, 201);
    if (path.endsWith('/packing')) {
      if (request.method() === 'GET') return json(progress());
      state.posts.push(body); expect(request.headers()['x-csrf-token']).toContain('.');
      if (state.seen.has(body.requestId)) return json(progress(), 201);
      if (body.expectedRevision !== state.revision) return json({ code: 'PACKING_CHANGED', message: 'Kết quả kiểm vừa thay đổi. Hãy tải lại.' }, 409);
      if (body.action !== 'RESET' && body.sku !== order.items[0].sku) return json({ code: 'PACKING_WRONG_SKU', message: 'SKU này không có trong đơn. Kiểm tra đúng mẫu, màu và size.' }, 422);
      if (body.action === 'SCAN' && state.checked === 2) return json({ code: 'PACKING_EXCESS', message: 'SKU này đã được kiểm đủ số lượng.' }, 409);
      state.checked = body.action === 'RESET' ? 0 : state.checked + (body.action === 'SCAN' ? 1 : -1); state.revision++; state.seen.set(body.requestId, body);
      if (options.uncertain && !state.lostResponse) { state.lostResponse = true; return route.abort('failed'); }
      return json(progress(), 201);
    }
    if (path.endsWith('/shipment')) return json({ message: 'Đang tạo vận đơn giả lập.' }, 201);
    if (path.endsWith('/status')) { order.status = body.status; return json(detail()); }
    return json([]);
  });
  return { state, order, actor };
}
async function emit(page: Page, kind: string, orderId?: string) { await page.evaluate(({ kind, orderId }) => (window as any).__miloEmit(kind, orderId), { kind, orderId }); }
test('SSE refreshes seller orders without waiting for polling; unread bell and read-all stay in sync', async ({ page }) => {
  const { state } = await fixture(page); await page.goto('/nguoi-ban?order=synthetic-order'); await expect(page.getByText('Đang nhận thay đổi trực tiếp', { exact: false })).toBeVisible();
  expect(await page.evaluate(() => (window as any).__miloSources.filter((source: any) => !source.closed).length)).toBe(1);
  state.incoming = true; await emit(page, 'seller', 'new-order'); await expect(page.getByText('ML-NEW-002', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Thông báo, 1 chưa đọc', exact: true }).click(); await expect(page.getByLabel('Âm báo')).not.toBeChecked();
  state.notifications.unshift({ ...state.notifications[0], id: 'note-2', title: 'Có đơn hàng mới' }); await emit(page, 'notifications'); await expect(page.getByRole('button', { name: 'Thông báo, 2 chưa đọc', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Đọc tất cả' }).click(); await expect(page.getByRole('button', { name: 'Thông báo', exact: true })).toBeVisible();
});
test('SKU validation gates ready action, rejects wrong/excess items and supports audited undo/reset', async ({ page }) => {
  const { state } = await fixture(page); await page.goto('/nguoi-ban?order=synthetic-order');
  const ready = page.getByRole('button', { name: 'Đóng gói xong', exact: true }), input = page.getByLabel('Mã SKU cần kiểm'); await expect(ready).toBeDisabled();
  await input.fill('WRONG-SIZE'); await input.press('Enter'); await expect(page.getByText('SKU này không có trong đơn. Kiểm tra đúng mẫu, màu và size.', { exact: true })).toBeVisible(); expect(state.checked).toBe(0);
  for (let index = 0; index < 2; index++) { await input.fill('MILO-POLO-OLIVE-M'); await input.press('Enter'); await expect(page.getByText(`${index + 1}/2 sản phẩm`, { exact: true })).toBeVisible(); }
  await expect(ready).toBeEnabled(); await input.fill('MILO-POLO-OLIVE-M'); await input.press('Enter'); await expect(page.getByText('SKU này đã được kiểm đủ số lượng.', { exact: true })).toBeVisible(); expect(state.checked).toBe(2);
  await page.getByRole('button', { name: 'Hoàn tác một MILO-POLO-OLIVE-M' }).click(); await expect(ready).toBeDisabled();
  await page.getByRole('button', { name: 'Bắt đầu kiểm lại', exact: true }).click(); await page.getByRole('dialog').getByRole('button', { name: 'Xác nhận kiểm lại' }).click(); await expect(page.getByText('0/2 sản phẩm', { exact: true })).toBeVisible();
  mkdirSync('.local/fulfillment', { recursive: true }); await page.screenshot({ path: '.local/fulfillment/seller-desktop.png', fullPage: true });
});
test('lost response preserves request ID and prevents accidental extra counting on retry', async ({ page }) => {
  const { state } = await fixture(page, { uncertain: true }); await page.goto('/nguoi-ban?order=synthetic-order'); const input = page.getByLabel('Mã SKU cần kiểm'); await input.fill('MILO-POLO-OLIVE-M'); await input.press('Enter');
  await page.getByRole('button', { name: 'Gửi lại thao tác chưa xác nhận' }).click(); await expect(page.getByText('1/2 sản phẩm', { exact: true })).toBeVisible(); expect(state.checked).toBe(1); expect(state.posts).toHaveLength(2); expect(state.posts[0].requestId).toBe(state.posts[1].requestId);
});
test('packing slip renders escaped recipient notes, correct SKU and a print-only surface', async ({ page }) => {
  await fixture(page); await page.goto('/nguoi-ban?order=synthetic-order'); await page.getByRole('button', { name: 'Phiếu đóng gói', exact: true }).click(); const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('MILO-POLO-OLIVE-M', { exact: true })).toBeVisible(); await expect(dialog.getByText('Ghi chú: <script>display-as-text</script>', { exact: true })).toBeVisible(); await expect(dialog).not.toContainText('550.000'); await expect(dialog).not.toContainText('225.000');
  await dialog.getByRole('button', { name: 'In phiếu đóng gói' }).click(); expect(await page.evaluate(() => (window as any).__miloPrinted)).toBe(true);
  await page.setViewportSize({ width: 470, height: 704 }); // Approximate A5 printable area with 12mm margins.
  await page.emulateMedia({ media: 'print' }); await expect(page.locator('.milo-print-root')).toBeVisible(); await expect(page.locator('.site-masthead')).toBeHidden();
  await expect(page.locator('.milo-print-root').getByText('Phiếu soạn hàng nội bộ · Không thay thế vận đơn.')).toBeVisible();
  mkdirSync('.local/fulfillment', { recursive: true }); await page.screenshot({ path: '.local/fulfillment/packing-print.png', fullPage: true });
  await page.emulateMedia({ media: 'screen' }); await dialog.getByRole('button', { name: 'Đóng', exact: true }).click(); await page.emulateMedia({ media: 'print' }); await expect(page.locator('main')).toBeVisible(); await expect(page.getByRole('heading', { name: 'Chăm chút từng đơn hàng.' })).toBeVisible();
});
test('mobile 360px, notification panel and SKU desk have no horizontal overflow; assignment blocks editing', async ({ page }) => {
  await fixture(page, { otherAssignee: true }); await page.setViewportSize({ width: 360, height: 800 }); await page.goto('/nguoi-ban?order=synthetic-order');
  await expect(page.getByLabel('Mã SKU cần kiểm')).toBeDisabled(); await page.getByRole('button', { name: 'Thông báo, 1 chưa đọc', exact: true }).click(); await expect(page.getByRole('region', { name: 'Thông báo của bạn' })).toBeVisible();
  const overflow = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, elements: [...document.querySelectorAll('body *')].filter(element => { const rect = element.getBoundingClientRect(); return rect.width > 0 && rect.right > innerWidth + 1; }).slice(0, 8).map(element => ({ tag: element.tagName, className: element.className })) }));
  expect(overflow.scroll, JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.width);
  mkdirSync('.local/fulfillment', { recursive: true }); await page.screenshot({ path: '.local/fulfillment/seller-mobile.png', fullPage: true });
});
test('disconnect switches to periodic fallback and manual refresh remains usable', async ({ page }) => {
  const { state } = await fixture(page); await page.goto('/nguoi-ban?order=synthetic-order'); await expect(page.getByText('Đang nhận thay đổi trực tiếp', { exact: false })).toBeVisible(); state.realtime = false;
  await page.evaluate(() => (window as any).__miloDisconnect()); await expect(page.getByText('Tự làm mới mỗi 15 giây', { exact: false })).toBeVisible(); state.incoming = true;
  await page.getByRole('button', { name: 'Làm mới', exact: true }).click(); await expect(page.getByText('ML-NEW-002', { exact: true })).toBeVisible();
});
test('buyer order status updates from own SSE event without reloading page', async ({ page }) => {
  const { order } = await fixture(page, { buyer: true }); await page.goto('/don-hang/synthetic-order');
  await expect(page.locator('.large-badge[data-status="PACKING"]')).toBeVisible();
  order.status = 'READY_TO_SHIP'; await emit(page, 'orders', order.id);
  await expect(page.locator('.large-badge[data-status="READY_TO_SHIP"]')).toBeVisible();
});
test('stream role invalidation refreshes account permissions and removes seller workspace', async ({ page }) => {
  const { actor } = await fixture(page); await page.goto('/nguoi-ban?order=synthetic-order'); await expect(page.getByText('Đang nhận thay đổi trực tiếp', { exact: false })).toBeVisible();
  actor.role = 'USER'; await page.evaluate(() => (window as any).__miloSources.forEach((source: any) => source.fire('authentication', {})));
  await expect(page.getByRole('heading', { name: 'Bạn chưa được cấp quyền Người bán.' })).toBeVisible(); await expect(page.getByLabel('Mã SKU cần kiểm')).toHaveCount(0);
});
test('bell opens notification tab when already on account page, including repeated same-URL navigation', async ({ page }) => {
  await fixture(page, { buyer: true }); await page.goto('/tai-khoan');
  for (let index = 0; index < 2; index++) {
    await page.getByRole('button', { name: 'Thông báo, 1 chưa đọc', exact: true }).click(); await page.getByRole('link', { name: 'Xem thông báo trong tài khoản →', exact: true }).click();
    await expect(page.locator('.account-content').getByText('Đơn hàng đang chờ xử lý', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Hồ sơ', exact: true }).click();
  }
});
test('asynchronous tracking result unlocks carrier handoff without a page refresh', async ({ page }) => {
  const { state, order } = await fixture(page); state.checked = 2; state.revision = 2; order.status = 'READY_TO_SHIP'; await page.goto('/nguoi-ban?order=synthetic-order');
  const handoff = page.getByRole('button', { name: 'Đã bàn giao vận chuyển', exact: true }); await expect(handoff).toBeDisabled();
  await page.getByRole('button', { name: 'Tạo vận đơn', exact: true }).click(); await expect(handoff).toBeDisabled();
  order.shipment = { status: 'CREATED', trackingCode: 'TRACKING-ASYNC-001' }; await emit(page, 'seller', order.id);
  await expect(page.getByText('TRACKING-ASYNC-001', { exact: true })).toBeVisible(); await expect(handoff).toBeEnabled();
});
