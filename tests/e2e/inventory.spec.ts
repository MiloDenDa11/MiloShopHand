import "dotenv/config";
import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";

const db = new PrismaClient();
test.afterAll(async () => db.$disconnect());
const messages = new WeakMap<Page, string[]>();
const expectedConflict = new WeakSet<Page>();
test.beforeEach(async ({ page }) => {
  const errors: string[] = []; messages.set(page, errors);
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error" && !/401|Unauthorized/i.test(m.text()) && !(expectedConflict.has(page) && /409/.test(m.text()))) errors.push(m.text()); });
});
test.afterEach(async ({ page }) => expect(messages.get(page)).toEqual([]));

async function fixture(page: Page) {
  if (!new URL(process.env.DATABASE_URL || "").pathname.endsWith("_test")) throw new Error("Inventory fixtures require an isolated _test database.");
  const id = randomBytes(8).toString("hex");
  const user = await db.user.create({ data: { email: `inventory-${id}@example.test`, name: "Admin Stock QA", role: "ADMIN", passwordHash: "not-for-login", verifiedAt: new Date() } });
  const raw = randomBytes(32).toString("hex"), nonce = randomBytes(32).toString("hex");
  const csrf = `${nonce}.${createHmac("sha256", process.env.SESSION_SECRET!).update(nonce).digest("hex")}`;
  await db.session.create({ data: { id: createHash("sha256").update(raw).digest("hex"), userId: user.id, csrf, expiresAt: new Date(Date.now() + 3600000), agent: "Inventory browser regression" } });
  await page.context().addCookies([{ name: "milo_sid", value: raw, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }, { name: "milo_csrf", value: csrf, domain: "localhost", path: "/", sameSite: "Lax" }]);
  const category = await db.category.findFirstOrThrow();
  const image = await db.productImage.findFirstOrThrow({ where: { product: { active: true } } });
  const product = await db.product.create({ data: {
    name: `Áo Vintage Kho ${id}`, slug: `inventory-${id}`, searchText: `ao vintage kho ${id}`, categoryId: category.id,
    description: "Áo dùng riêng cho kiểm thử quản lý kho", material: "Cotton", fit: "Regular", care: "Giặt nhẹ", price: 250000, cost: 100000,
    images: { create: { url: image.url, alt: "Ảnh sản phẩm kiểm thử kho" } },
    variants: { create: [
      ...["S", "M", "L", "XL", "XXL"].map((size, i) => ({ sku: `QA-${id}-${size}`, color: "Đen", colorHex: "#222222", size, inventories: { create: { onHand: [0, 8, 2, 14, 5][i], reserved: size === "M" ? 2 : 0, lowThreshold: 3 } } })),
      { sku: `QA-${id}-WHITE-M`, color: "Trắng", colorHex: "#ffffff", size: "M", inventories: { create: { onHand: 4, lowThreshold: 3 } } },
    ] },
  }, include: { variants: { include: { inventories: true } } } });
  await page.goto("/admin");
  await page.locator(".admin-sidebar").getByRole("button", { name: "Tồn kho", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Mọi size, trong tầm mắt." })).toBeVisible();
  await page.getByRole("searchbox", { name: "Tìm tên sản phẩm hoặc SKU trong kho" }).fill(product.name);
  await expect(page.locator(".inventory-product-row")).toHaveCount(1);
  await expect(page.locator(".inventory-product-toggle")).toContainText(product.name);
  await expect(page.getByRole("tabpanel", { name: "Tồn kho theo size" })).toHaveAttribute("aria-busy", "false");
  return product;
}
async function choose(page: Page, name: string, option: string) {
  await page.getByRole("combobox", { name, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}
async function capture(page: Page, name: string) {
  mkdirSync(".local/inventory/screenshots", { recursive: true });
  await page.evaluate(async () => { await document.fonts.ready; (document.activeElement as HTMLElement)?.blur(); scrollTo({ top: 0, behavior: "instant" }); await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))); });
  await page.screenshot({ path: `.local/inventory/screenshots/${name}.png`, fullPage: true, animations: "disabled" });
}

test("kho: mở từng size, nhập/xuất/chỉnh sửa có xác nhận, lưu DB và lịch sử đúng", async ({ page }) => {
  const p = await fixture(page), target = p.variants.find(v => v.color === "Đen" && v.size === "M")!, inv = target.inventories[0];
  const other = p.variants.find(v => v.color === "Trắng")!;
  await page.locator(".inventory-product-toggle").click();
  await expect(page.locator(".inventory-variants tbody tr")).toHaveCount(6);
  const row = page.locator(`[data-inventory-id="${inv.id}"]`);
  await expect(row).toContainText(target.sku);
  await expect(page.locator(".inventory-size-chips")).toContainText("XXL");
  const initialTotal = (await db.inventory.aggregate({ where: { warehouse: "MAIN" }, _sum: { onHand: true } }))._sum.onHand!;
  async function change(action: string, amount: number, before: number, after: number, reason: string) {
    await row.getByRole("button", { name: `${action} ${target.sku}`, exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("spinbutton", { name: "Số lượng giao dịch kho", exact: true }).fill(String(amount));
    await dialog.getByRole("textbox", { name: "Lý do giao dịch kho", exact: true }).fill(reason);
    await dialog.getByRole("button", { name: "Kiểm tra và lưu", exact: true }).click();
    await expect(dialog.getByRole("heading", { name: "Xác nhận thay đổi tồn kho" })).toBeVisible();
    expect((await db.inventory.findUniqueOrThrow({ where: { id: inv.id } })).onHand).toBe(before);
    await dialog.getByRole("button", { name: "Xác nhận lưu", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect.poll(async () => (await db.inventory.findUniqueOrThrow({ where: { id: inv.id } })).onHand).toBe(after);
    await expect(row.locator(".inventory-quantity")).toHaveText(String(after));
    await expect(page.getByRole("tabpanel", { name: "Tồn kho theo size" })).toHaveAttribute("aria-busy", "false");
  }
  await change("Nhập", 3, 8, 11, "Nhập bổ sung từ nhà cung cấp QA");
  await change("Xuất", 2, 11, 9, "Xuất hàng mẫu kiểm tra chất lượng");
  await change("Chỉnh sửa", 10, 9, 10, "Kiểm kê thực tế và điều chỉnh chênh lệch");
  expect((await db.inventory.findUniqueOrThrow({ where: { id: other.inventories[0].id } })).onHand).toBe(4);
  expect((await db.inventory.findUniqueOrThrow({ where: { id: inv.id } })).reserved).toBe(2);
  await expect(page.locator(".inventory-stat").nth(1).locator("strong")).toHaveText((initialTotal + 2).toLocaleString("vi-VN"));
  await row.getByRole("button", { name: `Chỉnh sửa ${target.sku}`, exact: true }).click();
  await page.getByRole("dialog").getByRole("spinbutton").fill("99");
  await page.getByRole("button", { name: "Hủy", exact: true }).click();
  expect((await db.inventory.findUniqueOrThrow({ where: { id: inv.id } })).onHand).toBe(10);
  await row.getByRole("button", { name: `Xuất ${target.sku}`, exact: true }).click();
  await page.getByRole("dialog").getByRole("spinbutton").fill("9");
  await page.getByRole("textbox", { name: "Lý do giao dịch kho" }).fill("Không lấy hàng đang giữ cho đơn");
  await page.getByRole("button", { name: "Kiểm tra và lưu", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("Không thể giảm quá 8");
  await expect(page.getByRole("button", { name: "Xác nhận lưu", exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await capture(page, "inventory-expanded-desktop");
  await page.getByRole("button", { name: `Lịch sử kho ${p.name}`, exact: true }).click();
  await expect(page.locator(".inventory-history-table tbody tr")).toHaveCount(3);
  await expect(page.locator(".inventory-history-table")).toContainText("Admin Stock QA");
  await choose(page, "Loại giao dịch kho", "Nhập kho");
  await expect(page.locator(".inventory-history-table tbody tr")).toHaveCount(1);
  const entry = page.locator(".inventory-history-table tbody tr");
  await expect(entry).toContainText("Nhập bổ sung từ nhà cung cấp QA");
  await expect(entry.locator("td").nth(5)).toHaveText("8");
  await expect(entry.locator("td").nth(6)).toHaveText("11");
  await capture(page, "inventory-history-desktop");
  const movements = await db.stockMovement.findMany({ where: { inventoryId: inv.id }, orderBy: { createdAt: "asc" } });
  expect(movements.map(m => [m.kind, m.delta, m.onHandBefore, m.onHandAfter])).toEqual([["RECEIPT",3,8,11],["ISSUE",-2,11,9],["ADJUSTMENT",1,9,10]]);
});

test("kho: tìm SKU, lọc size/trạng thái, phân trang và mobile không tràn", async ({ page }) => {
  const p = await fixture(page), target = p.variants.find(v => v.size === "S")!;
  await page.getByRole("searchbox", { name: "Tìm tên sản phẩm hoặc SKU trong kho" }).fill(target.sku);
  await choose(page, "Lọc size kho", "S");
  await choose(page, "Lọc trạng thái tồn kho", "Hết hàng");
  await expect(page.locator(".inventory-product-row")).toHaveCount(1);
  await page.locator(".inventory-product-toggle").click();
  await expect(page.locator(`[data-inventory-id="${target.inventories[0].id}"] .stock-badge`)).toHaveText("Hết hàng");
  await expect(page.locator(".inventory-variants tbody tr")).toHaveCount(6);
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const width of [1440,768,360]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await capture(page, `inventory-expanded-${width}`);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await choose(page, "Lọc trạng thái tồn kho", "Còn hàng");
  await expect(page.getByRole("heading", { name: "Chưa tìm thấy sản phẩm phù hợp" })).toBeVisible();
  await page.getByRole("button", { name: "Xóa bộ lọc", exact: true }).click();
  await expect(page.locator(".inventory-product-row")).toHaveCount(10);
  const first = await page.locator(".inventory-product-toggle").allTextContents();
  await page.getByRole("button", { name: "Trang kho sau", exact: true }).click();
  await expect(page.locator(".inventory-pagination")).toContainText("Trang 2");
  const second = await page.locator(".inventory-product-toggle").allTextContents();
  expect(second.every(name => !first.includes(name))).toBe(true);
  await choose(page, "Sắp xếp tồn kho", "Tồn kho tăng dần");
  await expect(page.locator(".inventory-pagination")).toContainText("Trang 1");
  const stocks = (await page.locator(".inventory-product-row > td:nth-child(5) .inventory-quantity").allTextContents()).map(t => Number(t.replace(/\D/g,"")));
  expect(stocks).toEqual([...stocks].sort((a,b) => a-b));
});

test("kho: chọn sản phẩm/size từ thanh công cụ và xử lý tồn vừa thay đổi", async ({ page }) => {
  const p = await fixture(page), target = p.variants.find(v => v.color === "Đen" && v.size === "M")!, inv = target.inventories[0];
  await page.getByRole("button", { name: "Nhập kho", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await page.getByRole("combobox", { name: "Sản phẩm giao dịch kho", exact: true }).click();
  await page.getByRole("searchbox", { name: "Tìm trong Sản phẩm giao dịch kho", exact: true }).fill(p.name);
  await page.getByRole("option", { name: p.name, exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Biến thể giao dịch kho", exact: true })).toBeEnabled();
  await choose(page, "Biến thể giao dịch kho", `Đen / M · ${target.sku}`);
  await dialog.getByRole("spinbutton").fill("2");
  await dialog.getByRole("button", { name: "Tăng số lượng kho", exact: true }).click();
  await expect(dialog.getByRole("spinbutton")).toHaveValue("3");
  await dialog.getByRole("button", { name: "Giảm số lượng kho", exact: true }).click();
  await dialog.getByRole("textbox", { name: "Lý do giao dịch kho" }).fill("Nhập hàng qua thanh công cụ");
  await dialog.getByRole("button", { name: "Kiểm tra và lưu", exact: true }).click();
  const csrf = (await page.context().cookies()).find(c => c.name === "milo_csrf")!.value;
  const other = await page.request.post(`/api/v1/admin/inventory/${inv.id}/movements`, {
    headers: { Origin: process.env.PLAYWRIGHT_BASE_URL!, "X-CSRF-Token": decodeURIComponent(csrf) },
    data: { operation: "RECEIPT", quantity: 1, expectedOnHand: 8, reason: "Một giao dịch khác vừa nhập kho", key: randomBytes(20).toString("hex") },
  });
  expect(other.ok()).toBe(true);
  expectedConflict.add(page);
  const conflict = page.waitForResponse(r => r.request().method() === "POST" && r.url().endsWith(`/inventory/${inv.id}/movements`));
  await dialog.getByRole("button", { name: "Xác nhận lưu", exact: true }).click();
  expect((await conflict).status()).toBe(409);
  await expect(dialog.getByRole("alert")).toContainText("Tồn kho đã thay đổi");
  await expect(dialog.locator(".inventory-editor-balance span").first()).toContainText("9");
  await dialog.getByRole("button", { name: "Kiểm tra và lưu", exact: true }).click();
  await capture(page, "inventory-confirmation");
  await dialog.getByRole("button", { name: "Xác nhận lưu", exact: true }).click();
  await expect(dialog).toBeHidden();
  expect((await db.inventory.findUniqueOrThrow({ where: { id: inv.id } })).onHand).toBe(11);
  const journal = await db.stockMovement.findMany({ where: { inventoryId: inv.id }, orderBy: { createdAt: "asc" } });
  expect(journal.map(m => m.delta)).toEqual([1, 2]);
});
