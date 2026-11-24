import { Controller, Get, Post, Param, Body, Req, UseGuards, Inject } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { Db, AppRequest, SellerGuard, fail, hash, transaction, audit, parse } from './core';
import { checkAssignee } from './seller-operations';
type Line = { id: string; sku: string; name: string; color: string; size: string; quantity: number };
type Packing = { fingerprint: string; checked: unknown; revision: number; updatedAt?: Date } | null;
const checkedSchema = z.record(z.string(), z.number().int().min(0).max(100000));
export const packingFingerprint = (lines: Line[]) => hash(JSON.stringify([...lines].sort((a, b) => a.id.localeCompare(b.id)).map(({ id, sku, color, size, quantity }) => ({ id, sku, color, size, quantity }))));
export function packingProgress(lines: Line[], packing: Packing) {
  const stored = checkedSchema.safeParse(packing?.checked || {});
  const fingerprint = packingFingerprint(lines), changed = !!packing && (packing.fingerprint !== fingerprint || !stored.success);
  const checked = !changed && stored.success ? stored.data : {};
  const items = lines.map(line => ({ id: line.id, sku: line.sku, name: line.name, color: line.color, size: line.size, quantity: line.quantity, checked: Math.min(checked[line.id] || 0, line.quantity) }));
  const valid = !changed && Object.entries(checked).every(([id, count]) => { const line = lines.find(row => row.id === id); return !!line && count <= line.quantity; });
  return { revision: packing?.revision || 0, needsReset: changed || !valid, complete: !!packing && valid && items.length > 0 && items.every(line => line.checked === line.quantity), checkedTotal: items.reduce((sum, line) => sum + line.checked, 0), expectedTotal: items.reduce((sum, line) => sum + line.quantity, 0), updatedAt: packing?.updatedAt || null, items };
}
const common = { requestId: z.string().uuid(), expectedRevision: z.number().int().min(0).max(2147483646) };
export const packingAction = z.discriminatedUnion('action', [
  z.object({ ...common, action: z.literal('SCAN'), sku: z.string().trim().min(1).max(150) }).strict(),
  z.object({ ...common, action: z.literal('UNDO'), sku: z.string().trim().min(1).max(150), reason: z.string().trim().min(5).max(300) }).strict(),
  z.object({ ...common, action: z.literal('RESET'), reason: z.string().trim().min(5).max(300) }).strict(),
]);
export async function requirePacked(tx: Prisma.TransactionClient, orderId: string) {
  const [items, packing] = await Promise.all([tx.orderItem.findMany({ where: { orderId } }), tx.orderPacking.findUnique({ where: { orderId } })]);
  if (!packingProgress(items, packing).complete) fail('PACKING_INCOMPLETE', 'Cần kiểm đủ SKU và số lượng trước khi hoàn tất đóng gói.', 409);
}
export class PackingService {
  constructor(private db: Db) {}
  async get(orderId: string) {
    const order = await this.db.order.findUnique({ where: { id: orderId }, include: { items: true, packing: true } });
    if (!order) fail('NOT_FOUND', 'Không tìm thấy đơn hàng.', 404);
    return { orderId, status: order.status, ...packingProgress(order.items, order.packing) };
  }
  async change(orderId: string, actorId: string, input: z.infer<typeof packingAction>) {
    return transaction(this.db, async tx => {
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${orderId} FOR UPDATE`;
      const [order, actor] = await Promise.all([tx.order.findUnique({ where: { id: orderId }, include: { items: true, packing: true } }), tx.user.findUnique({ where: { id: actorId } })]);
      if (!order) fail('NOT_FOUND', 'Không tìm thấy đơn hàng.', 404);
      if (!actor || actor.disabled || !['ADMIN','SELLER'].includes(actor.role)) fail('FORBIDDEN', 'Bạn không có quyền kiểm hàng.', 403);
      await checkAssignee(tx, orderId, actorId, actor.role);
      const requestHash = hash(JSON.stringify({ actorId, action: input.action, sku: 'sku' in input ? input.sku : null, reason: 'reason' in input ? input.reason : null, expectedRevision: input.expectedRevision }));
      const prior = await tx.packingScan.findUnique({ where: { orderId_requestId: { orderId, requestId: input.requestId } } });
      if (prior) { if (prior.requestHash !== requestHash) fail('IDEMPOTENCY_CONFLICT', 'Mã thao tác đã dùng cho yêu cầu khác.', 409); return { orderId, status: order.status, ...packingProgress(order.items, order.packing) }; }
      if (order.status !== 'PACKING') fail('PACKING_STATE', 'Chỉ kiểm SKU khi đơn đang đóng gói.', 409);
      const progress = packingProgress(order.items, order.packing);
      if (input.expectedRevision !== progress.revision) fail('PACKING_CHANGED', 'Kết quả kiểm vừa thay đổi. Hãy tải lại trước khi tiếp tục.', 409);
      if (progress.needsReset && input.action !== 'RESET') fail('PACKING_CONTENT_CHANGED', 'Nội dung đơn đã đổi. Cần bắt đầu kiểm lại.', 409);
      const checked: Record<string, number> = input.action === 'RESET' ? {} : Object.fromEntries(progress.items.map(line => [line.id, line.checked]));
      let selected: Line | undefined;
      if (input.action !== 'RESET') {
        const same = order.items.filter(line => line.sku === input.sku);
        if (!same.length) fail('PACKING_WRONG_SKU', 'SKU này không có trong đơn. Kiểm tra đúng mẫu, màu và size.', 422);
        selected = input.action === 'SCAN' ? same.find(line => (checked[line.id] || 0) < line.quantity) : [...same].reverse().find(line => (checked[line.id] || 0) > 0);
        if (!selected) fail(input.action === 'SCAN' ? 'PACKING_EXCESS' : 'PACKING_NOT_CHECKED', input.action === 'SCAN' ? 'SKU này đã được kiểm đủ số lượng.' : 'SKU này chưa có số lượng để hoàn tác.', 409);
        checked[selected.id] = (checked[selected.id] || 0) + (input.action === 'SCAN' ? 1 : -1);
      }
      const fingerprint = packingFingerprint(order.items);
      const packing = await tx.orderPacking.upsert({ where: { orderId }, create: { orderId, fingerprint, checked, revision: 1 }, update: { fingerprint, checked, revision: { increment: 1 } } });
      await tx.packingScan.create({ data: { orderId, actorId, requestId: input.requestId, requestHash, action: input.action, sku: 'sku' in input ? input.sku : null } });
      await audit(tx, actorId, `PACKING_${input.action}`, 'Order', orderId, { itemId: selected?.id, revision: packing.revision, ...('reason' in input ? { reason: input.reason } : {}) });
      return { orderId, status: order.status, ...packingProgress(order.items, packing) };
    });
  }
  async slip(orderId: string, actorId: string) {
    return transaction(this.db, async tx => {
      const actor = await tx.user.findUnique({ where: { id: actorId } });
      if (!actor || actor.disabled || !['ADMIN','SELLER'].includes(actor.role)) fail('FORBIDDEN', 'Bạn không có quyền tạo phiếu đóng gói.', 403);
      const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } });
      if (!order) fail('NOT_FOUND', 'Không tìm thấy đơn.', 404);
      if (['PENDING_PAYMENT','PENDING_CONFIRMATION','CANCELLED'].includes(order.status)) fail('SLIP_STATE', 'Chỉ tạo phiếu đóng gói cho đơn đã được duyệt.', 409);
      await audit(tx, actorId, 'PACKING_SLIP_GENERATED', 'Order', orderId, { items: order.items.length });
      const address: any = order.address;
      return { orderId: order.id, code: order.code, status: order.status, createdAt: order.createdAt, generatedAt: new Date(), recipient: { name: address.recipient || '', phone: address.phone || '', address: [address.text,address.detail].filter(Boolean).join(' · '), instructions: address.instructions || '' }, items: order.items.map(({ name, sku, color, size, quantity }) => ({ name, sku, color, size, quantity })), totalQuantity: order.items.reduce((sum, line) => sum + line.quantity, 0) };
    });
  }
}
@UseGuards(SellerGuard)
@Controller('seller/orders')
export class PackingController {
  constructor(@Inject(Db) private db: Db) {}
  @Get(':id/packing') get(@Param('id') id: string) { return new PackingService(this.db).get(id); }
  @Post(':id/packing') change(@Param('id') id: string, @Req() r: AppRequest, @Body() body: unknown) { return new PackingService(this.db).change(id, r.actor!.id, parse(packingAction, body)); }
  @Post(':id/packing-slip') slip(@Param('id') id: string, @Req() r: AppRequest, @Body() body: unknown) { parse(z.object({}).strict(), body); return new PackingService(this.db).slip(id, r.actor!.id); }
}
