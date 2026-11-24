import { Controller, Get, Patch, Post, Query, Param, Body, Req, UseGuards, Inject } from '@nestjs/common';
import { z } from 'zod';
import { Db, AppRequest, SellerGuard, AdminGuard, parse, fail, audit, transaction, reauth } from './core';
import { CommerceService, orderDto, userOrderInclude } from './commerce';
import { sellerTransitions } from '../../../packages/shared/src';
import { SellerOperations, sellerPolicy, sellerPolicyKey, sellerPolicySchema, sellerAssignmentInclude, sellerDeadline, sellerOverdueWhere, defaultSellerPolicy, openAssignmentStates, type SellerPolicy } from './seller-operations';

const statuses = ['PENDING_PAYMENT', 'PENDING_CONFIRMATION', 'CONFIRMED', 'PACKING', 'READY_TO_SHIP', 'SHIPPED', 'DELIVERED', 'COMPLETED', 'CANCELLED'] as const;
const sellerInclude = { ...userOrderInclude, guestContact: {select:{email:true}}, user: { select: { name: true, email: true } }, assignment: { include: sellerAssignmentInclude } };
export function sellerOrderDto(order: any, policy: SellerPolicy = defaultSellerPolicy) {
  const safe = orderDto(order);
  return {
    id: safe.id, code: safe.code, status: safe.status, method: safe.method, address: safe.address,
    buyer: order.user ? { name: order.user.name, email: order.user.email } : order.guestContact ? {name:(order.address as any).recipient,email:order.guestContact.email} : null,
    items: safe.items, subtotal: safe.subtotal, discount: safe.discount, shippingFee: safe.shippingFee,
    shippingDiscount: safe.shippingDiscount, tax: safe.tax, total: safe.total, createdAt: safe.createdAt, updatedAt: safe.updatedAt,
    history: safe.history,
    payment: order.payment ? { status: order.payment.status, amount: order.payment.amount, received: order.payment.received, refunded: order.payment.refunded } : null,
    shipment: order.shipment ? { status: order.shipment.status, trackingCode: order.shipment.trackingCode, provider: order.shipment.provider } : null,
    allowedActions: sellerTransitions[order.status] || [],
    assignment: order.assignment ? { assigneeId: order.assignment.assigneeId, assignedAt: order.assignment.assignedAt, revision: order.assignment.revision, assignee: order.assignment.assignee ? { id: order.assignment.assignee.id, name: order.assignment.assignee.name, active: !order.assignment.assignee.disabled && ['ADMIN', 'SELLER'].includes(order.assignment.assignee.role) } : null } : { assigneeId: null, assignedAt: null, revision: 0, assignee: null },
    deadline: sellerDeadline(order, policy),
  };
}
@UseGuards(SellerGuard)
@Controller('seller')
export class SellerController {
  constructor(@Inject(Db) private db: Db, @Inject(CommerceService) private commerce: CommerceService) {}
  @Get('overview') async overview(@Req() r: AppRequest) {
    const policy = await sellerPolicy(this.db);
    const [counts, mine, unassigned, overdue, lowStock] = await Promise.all([
      this.db.order.groupBy({ by: ['status'], _count: { _all: true } }),
      this.db.order.count({ where: { status: { in: ['PENDING_PAYMENT', 'PENDING_CONFIRMATION', 'CONFIRMED', 'PACKING', 'READY_TO_SHIP'] }, assignment: { is: { assigneeId: r.actor!.id } } } }),
      this.db.order.count({ where: { status: { in: ['PENDING_PAYMENT', 'PENDING_CONFIRMATION', 'CONFIRMED', 'PACKING', 'READY_TO_SHIP'] }, OR: [{ assignment: { is: null } }, { assignment: { is: { assigneeId: null } } }] } }),
      this.db.order.count({ where: sellerOverdueWhere(policy) }),
      this.db.$queryRaw<{id:string;sku:string;name:string;color:string;size:string;available:number;threshold:number}[]>`SELECT i.id,v.sku,p.name,v.color,v.size,(i."onHand"-i.reserved)::int AS available,i."lowThreshold" AS threshold FROM "Inventory" i JOIN "ProductVariant" v ON v.id=i."variantId" JOIN "Product" p ON p.id=v."productId" WHERE p.active AND v.active AND i."onHand"-i.reserved<=i."lowThreshold" ORDER BY i."onHand"-i.reserved,i.id LIMIT 100`,
    ]);
    return { counts: Object.fromEntries(counts.map(row => [row.status, row._count._all])), mine, unassigned, overdue, policy, lowStock };
  }
  @Get('orders') async orders(@Query() query: unknown, @Req() r: AppRequest) {
    const input = parse(z.object({ status: z.enum(statuses).optional(), q: z.string().trim().max(100).optional(), assignee: z.enum(['all', 'mine', 'unassigned']).default('all'), overdue: z.enum(['true', 'false']).default('false'), page: z.coerce.number().int().min(1).max(10000).default(1) }).strict(), query);
    const policy = await sellerPolicy(this.db);
    const where = { AND: [
      ...(input.status ? [{ status: input.status }] : []),
      ...(input.q ? [{ OR: [{ code: { contains: input.q, mode: 'insensitive' as const } }, { user: { name: { contains: input.q, mode: 'insensitive' as const } } }] }] : []),
      ...(input.assignee === 'mine' ? [{ assignment: { is: { assigneeId: r.actor!.id } } }] : input.assignee === 'unassigned' ? [{ OR: [{ assignment: { is: null } }, { assignment: { is: { assigneeId: null } } }] }] : []),
      ...(input.assignee !== 'all' && !input.status ? [{ status: { in: openAssignmentStates } }] : []),
      ...(input.overdue === 'true' ? [sellerOverdueWhere(policy)] : []),
    ] };
    const [orders, total] = await Promise.all([
      this.db.order.findMany({ where, include: sellerInclude, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 30, skip: (input.page - 1) * 30 }),
      this.db.order.count({ where }),
    ]);
    return { items: orders.map(order => sellerOrderDto(order, policy)), total, page: input.page, pages: Math.ceil(total / 30) };
  }
  @Get('orders/:id') async order(@Param('id') id: string) {
    const order = await this.db.order.findUnique({ where: { id }, include: sellerInclude });
    if (!order) fail('NOT_FOUND', 'Không tìm thấy đơn hàng.', 404);
    return sellerOrderDto(order, await sellerPolicy(this.db));
  }
  @Patch('orders/:id/status') async status(@Param('id') id: string, @Body() body: unknown, @Req() r: AppRequest) {
    const input = parse(z.object({ from: z.enum(statuses), status: z.enum(['CONFIRMED', 'PACKING', 'READY_TO_SHIP', 'SHIPPED', 'CANCELLED']), reason: z.string().trim().min(5).max(500) }).strict(), body);
    await this.commerce.transition(id, input.status, r.actor!.id, input.reason, false, { seller: true, expectedFrom: input.from });
    return this.order(id);
  }
  @Post('orders/:id/shipment') shipment(@Param('id') id: string, @Body() body: unknown, @Req() r: AppRequest) {
    parse(z.object({}).strict(), body);
    return this.commerce.requestShipment(id, r.actor!.id);
  }
  @Get('staff') async staff(@Req() r: AppRequest) {
    return this.db.user.findMany({ where: { disabled: false, role: { in: ['ADMIN', 'SELLER'] }, ...(r.actor!.role === 'ADMIN' ? {} : { id: r.actor!.id }) }, select: { id: true, name: true, role: true }, orderBy: [{ name: 'asc' }, { id: 'asc' }] });
  }
  @Patch('orders/:id/assignment') async assign(@Param('id') id: string, @Req() r: AppRequest, @Body() body: unknown) {
    const input = parse(z.object({ assigneeId: z.string().min(1).max(100).nullable(), expectedRevision: z.number().int().nonnegative(), reason: z.string().trim().min(5).max(300) }).strict(), body);
    await new SellerOperations(this.db).assign(id, r.actor!.id, input);
    return this.order(id);
  }
  @UseGuards(AdminGuard)
  @Patch('settings') async settings(@Req() r: AppRequest, @Body() body: unknown) {
    reauth(r); const policy = parse(sellerPolicySchema, body);
    await transaction(this.db, async tx => {
      await tx.storeSetting.upsert({ where: { key: sellerPolicyKey }, create: { key: sellerPolicyKey, value: policy }, update: { value: policy } });
      await audit(tx, r.actor!.id, 'SELLER_REMINDER_POLICY', 'StoreSetting', sellerPolicyKey, policy);
    });
    return policy;
  }
}
