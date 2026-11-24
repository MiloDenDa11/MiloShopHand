import { z } from 'zod';
import type { Prisma, OrderStatus } from '@prisma/client';
import { Db, audit, fail, transaction } from './core';

export const sellerPolicyKey = 'seller-operations:v1';
export const sellerPolicySchema = z.object({ enabled: z.boolean(), pendingMinutes: z.number().int().min(5).max(10080), packingMinutes: z.number().int().min(5).max(10080) }).strict();
export type SellerPolicy = z.infer<typeof sellerPolicySchema>;
export const defaultSellerPolicy: SellerPolicy = { enabled: false, pendingMinutes: 30, packingMinutes: 240 };
export const openAssignmentStates: OrderStatus[] = ['PENDING_PAYMENT', 'PENDING_CONFIRMATION', 'CONFIRMED', 'PACKING', 'READY_TO_SHIP'];
export const sellerAssignmentInclude = { assignee: { select: { id: true, name: true, role: true, disabled: true } } };
export async function sellerPolicy(db: Pick<Db, 'storeSetting'>): Promise<SellerPolicy> {
  const saved = await db.storeSetting.findUnique({ where: { key: sellerPolicyKey } });
  const parsed = sellerPolicySchema.safeParse(saved?.value);
  return parsed.success ? parsed.data : defaultSellerPolicy;
}
type TimedOrder = { status: string; createdAt: Date | string; history: { to: string; createdAt: Date | string }[] };
export function sellerDeadline(order: TimedOrder, policy: SellerPolicy, now = new Date()) {
  const phase = order.status === 'PENDING_CONFIRMATION' ? 'approval' : ['CONFIRMED', 'PACKING'].includes(order.status) ? 'packing' : null;
  if (!policy.enabled || !phase) return null;
  const state = phase === 'approval' ? 'PENDING_CONFIRMATION' : 'CONFIRMED';
  const entered = order.history.filter(entry => entry.to === state).map(entry => new Date(entry.createdAt).getTime()).sort((a, b) => b - a)[0] ?? new Date(order.createdAt).getTime();
  const dueAt = new Date(entered + (phase === 'approval' ? policy.pendingMinutes : policy.packingMinutes) * 60000);
  return { phase, since: new Date(entered).toISOString(), dueAt: dueAt.toISOString(), overdue: now >= dueAt, minutesOverdue: Math.max(0, Math.floor((now.getTime() - dueAt.getTime()) / 60000)) };
}
export function sellerOverdueWhere(policy: SellerPolicy, now = new Date()): Prisma.OrderWhereInput {
  if (!policy.enabled) return { id: { in: [] } };
  return { OR: [
    { status: 'PENDING_CONFIRMATION', OR: [{ history: { some: { to: 'PENDING_CONFIRMATION', createdAt: { lte: new Date(now.getTime() - policy.pendingMinutes * 60000) } } } }, { history: { none: { to: 'PENDING_CONFIRMATION' } }, createdAt: { lte: new Date(now.getTime() - policy.pendingMinutes * 60000) } }] },
    { status: { in: ['CONFIRMED', 'PACKING'] }, OR: [{ history: { some: { to: 'CONFIRMED', createdAt: { lte: new Date(now.getTime() - policy.packingMinutes * 60000) } } } }, { history: { none: { to: 'CONFIRMED' } }, createdAt: { lte: new Date(now.getTime() - policy.packingMinutes * 60000) } }] },
  ] };
}
export async function checkAssignee(tx: Prisma.TransactionClient, orderId: string, actorId: string, role: string) {
  const assignment = await tx.orderAssignment.findUnique({ where: { orderId } });
  if (role !== 'ADMIN' && assignment?.assigneeId && assignment.assigneeId !== actorId)
    fail('ORDER_ASSIGNED', 'Đơn đang do nhân viên khác phụ trách. Liên hệ Admin để phân công lại.', 403);
}
export class SellerOperations {
  private cursor: string | undefined;
  constructor(private db: Db) {}
  async assign(orderId: string, actorId: string, input: { assigneeId: string | null; expectedRevision: number; reason: string }) {
    return transaction(this.db, async tx => {
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${orderId} FOR UPDATE`;
      const [order, actor] = await Promise.all([tx.order.findUnique({ where: { id: orderId } }), tx.user.findUnique({ where: { id: actorId } })]);
      if (!order) fail('NOT_FOUND', 'Không tìm thấy đơn.', 404);
      if (!actor || actor.disabled || !['ADMIN', 'SELLER'].includes(actor.role)) fail('FORBIDDEN', 'Bạn không có quyền phân công đơn.', 403);
      if (!openAssignmentStates.includes(order.status)) fail('ORDER_CLOSED', 'Đơn đã bàn giao hoặc kết thúc; không thay đổi người phụ trách.', 409);
      const previous = await tx.orderAssignment.findUnique({ where: { orderId } });
      if ((previous?.revision || 0) !== input.expectedRevision) fail('ASSIGNMENT_CHANGED', 'Phân công vừa thay đổi. Vui lòng tải lại.', 409);
      if (actor.role !== 'ADMIN' && ((input.assigneeId && input.assigneeId !== actorId) || (previous?.assigneeId && previous.assigneeId !== actorId)))
        fail('FORBIDDEN', 'Bạn chỉ có thể nhận đơn chưa phân công hoặc bỏ phụ trách đơn của mình.', 403);
      if (input.assigneeId) {
        const staff = await tx.user.findUnique({ where: { id: input.assigneeId } });
        if (!staff || staff.disabled || !['ADMIN', 'SELLER'].includes(staff.role)) fail('INVALID_ASSIGNEE', 'Chỉ giao đơn cho Admin hoặc Người bán đang hoạt động.', 422);
      }
      const saved = await tx.orderAssignment.upsert({ where: { orderId }, create: { orderId, assigneeId: input.assigneeId, assignedAt: input.assigneeId ? new Date() : null, revision: 1 }, update: { assigneeId: input.assigneeId, assignedAt: input.assigneeId ? new Date() : null, revision: { increment: 1 } }, include: sellerAssignmentInclude });
      await audit(tx, actorId, 'ORDER_ASSIGNMENT', 'Order', orderId, { from: previous?.assigneeId || null, to: input.assigneeId, reason: input.reason, revision: saved.revision });
      if (input.assigneeId && input.assigneeId !== actorId) await tx.notification.create({ data: { userId: input.assigneeId, key: `assignment:${orderId}:${saved.revision}`, title: `Bạn được giao đơn ${order.code}`, body: 'Mở bàn Người bán để xem thông tin và xử lý đơn.', href: `/nguoi-ban?order=${encodeURIComponent(orderId)}` } });
      return saved;
    });
  }
  async reminders(now = new Date()) {
    const policy = await sellerPolicy(this.db);
    if (!policy.enabled) return 0;
    const candidates = await this.db.order.findMany({ where: sellerOverdueWhere(policy, now), select: { id: true }, orderBy: { id: 'asc' }, take: 100, ...(this.cursor ? { cursor: { id: this.cursor }, skip: 1 } : {}) });
    this.cursor = candidates.length === 100 ? candidates.at(-1)!.id : undefined;
    let created = 0;
    for (const candidate of candidates) created += await transaction(this.db, async tx => {
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${candidate.id} FOR UPDATE`;
      const order = await tx.order.findUnique({ where: { id: candidate.id }, include: { history: true, assignment: true } });
      if (!order) return 0;
      const currentPolicy = await sellerPolicy(tx as any);
      const clock = sellerDeadline(order, currentPolicy, now);
      if (!clock?.overdue) return 0;
      const staff = await tx.user.findMany({ where: { disabled: false, OR: [{ role: 'ADMIN' }, ...(order.assignment?.assigneeId ? [{ id: order.assignment.assigneeId, role: { in: ['ADMIN', 'SELLER'] as ('ADMIN' | 'SELLER')[] } }] : [{ role: 'SELLER' as const }])] }, select: { id: true } });
      if (!staff.length) return 0;
      const result = await tx.notification.createMany({ data: staff.map(user => ({ userId: user.id, key: `seller-reminder:${order.id}:${clock.phase}:${clock.since}:${user.id}`, title: `Cần xử lý đơn ${order.code}`, body: clock.phase === 'approval' ? 'Đơn đã vượt mốc nhắc duyệt nội bộ.' : 'Đơn đã vượt mốc nhắc đóng gói nội bộ.', href: `/nguoi-ban?order=${encodeURIComponent(order.id)}` })), skipDuplicates: true });
      return result.count;
    });
    return created;
  }
}
