import { Controller, Get, Post, Put, Body, Param, Query, Req, UseGuards, Inject } from '@nestjs/common';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { Db, AppRequest, AdminGuard, parse, fail, transaction, audit, reauth } from './core';
export const measurementFields = ['chest','length','shoulder','sleeve','waist','hip','inseam'] as const;
const cm = z.number().positive().max(300).optional();
export const sizeGuideSchema = z.object({ expectedRevision: z.number().int().nonnegative(), kind: z.enum(['TOP','BOTTOM']), note: z.string().trim().max(1500), published: z.boolean(), rows: z.array(z.object({ size: z.string().trim().min(1).max(20), chest: cm, length: cm, shoulder: cm, sleeve: cm, waist: cm, hip: cm, inseam: cm }).strict().refine(row => measurementFields.some(key => row[key] !== undefined), 'Nhập ít nhất một số đo thực tế.')).min(1).max(20), model: z.object({ height: z.number().min(100).max(230), size: z.string().min(1).max(20), note: z.string().max(300).optional() }).strict().nullable() }).strict().refine(data => new Set(data.rows.map(row => row.size)).size === data.rows.length, 'Size không được lặp.');
export const eventNames = ['VIEW_PRODUCT','SELECT_VARIANT','ADD_TO_CART','BEGIN_CHECKOUT'] as const;
export const vietnamDay = (now = new Date()) => new Date(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now) + 'T00:00:00Z');
export async function recordCommerceEvent(tx: Prisma.TransactionClient, key: string, event: 'ORDER_CREATED' | 'PAYMENT_CONFIRMED') {
  if ((await tx.experienceEvent.createMany({ data: [{ key, event, source: 'SERVER' }], skipDuplicates: true })).count) await tx.experienceDaily.upsert({ where: { day_event_source: { day: vietnamDay(), event, source: 'SERVER' } }, create: { day: vietnamDay(), event, source: 'SERVER', count: 1 }, update: { count: { increment: 1 } } });
}
@Controller('experience')
export class ExperienceController {
  constructor(@Inject(Db) private db: Db) {}
  @Get('size-guides/:id') async guide(@Param('id') productId: string) {
    const guide = await this.db.productSizeGuide.findFirst({ where: { productId, published: true, product: { active: true } }, select: { kind: true, rows: true, model: true, note: true, updatedAt: true } });
    return { guide };
  }
  @Post('events') async events(@Body() body: unknown, @Req() r: AppRequest) {
    if (r.headers.dnt === '1' || r.headers['sec-gpc'] === '1') return { accepted: false };
    const input = parse(z.object({ consent: z.literal(true), events: z.array(z.object({ id: z.string().uuid(), event: z.enum(eventNames), productId: z.string().min(1).max(100).optional() }).strict()).min(1).max(10) }).strict(), body);
    const ids = [...new Set(input.events.flatMap(row => row.productId ? [row.productId] : []))];
    const valid = new Set((await this.db.product.findMany({ where: { id: { in: ids }, active: true }, select: { id: true } })).map(row => row.id));
    await transaction(this.db, async tx => { for (const row of input.events) {
      if (row.productId && !valid.has(row.productId)) continue;
      if ((await tx.experienceEvent.createMany({ data: [{ key: row.id, event: row.event, source: 'BROWSER', productId: row.productId }], skipDuplicates: true })).count) await tx.experienceDaily.upsert({ where: { day_event_source: { day: vietnamDay(), event: row.event, source: 'BROWSER' } }, create: { day: vietnamDay(), event: row.event, source: 'BROWSER', count: 1 }, update: { count: { increment: 1 } } });
    } }); return { accepted: true };
  }
  @Post('performance') async performance(@Body() body: unknown, @Req() r: AppRequest) {
    if (r.headers.dnt === '1' || r.headers['sec-gpc'] === '1') return { accepted: false };
    const input = parse(z.object({ consent: z.literal(true), id: z.string().uuid(), metric: z.enum(['LCP','INP','CLS']), page: z.enum(['HOME','CATALOG','PRODUCT','CHECKOUT','OTHER']), rating: z.enum(['good','needs-improvement','poor']) }).strict(), body);
    await transaction(this.db, async tx => {
      if (!(await tx.experienceEvent.createMany({ data: [{ key: input.id, event: `PERFORMANCE_${input.metric}`, source: 'BROWSER' }], skipDuplicates: true })).count) return;
      const field = input.rating === 'needs-improvement' ? 'needsImprovement' : input.rating;
      await tx.performanceDaily.upsert({ where: { day_page_metric: { day: vietnamDay(), page: input.page, metric: input.metric } }, create: { day: vietnamDay(), page: input.page, metric: input.metric, [field]: 1 }, update: { [field]: { increment: 1 } } });
    }); return { accepted: true };
  }
}
@UseGuards(AdminGuard)
@Controller('admin/experience')
export class ExperienceAdminController {
  constructor(@Inject(Db) private db: Db) {}
  @Get('size-guides/:id') guide(@Param('id') productId: string) { return this.db.productSizeGuide.findUnique({ where: { productId } }); }
  @Put('size-guides/:id') async save(@Param('id') productId: string, @Body() body: unknown, @Req() r: AppRequest) {
    reauth(r); const input = parse(sizeGuideSchema, body);
    return transaction(this.db, async tx => {
      await tx.$queryRaw`SELECT id FROM "Product" WHERE id=${productId} FOR UPDATE`;
      const product = await tx.product.findUnique({ where: { id: productId }, include: { variants: { select: { size: true, active: true } } } });
      if (!product) fail('NOT_FOUND','Không tìm thấy sản phẩm.',404);
      const current = await tx.productSizeGuide.findUnique({ where: { productId } });
      if ((current?.revision || 0) !== input.expectedRevision) fail('SIZE_GUIDE_CHANGED','Bảng size vừa thay đổi. Hãy tải lại.',409);
      const sizes = new Set(product.variants.filter(row => row.active).map(row => row.size));
      if (input.rows.some(row => !sizes.has(row.size)) || input.published && [...sizes].some(size => !input.rows.some(row => row.size === size)) || input.model && !sizes.has(input.model.size)) fail('SIZE_GUIDE_MISMATCH','Bảng công bố cần đủ size đang bán; thông tin người mẫu phải dùng size của sản phẩm.',422);
      const { expectedRevision, model, ...data } = input;
      const saved = await tx.productSizeGuide.upsert({ where: { productId }, create: { productId, ...data, ...(model ? { model } : {}), revision: 1 }, update: { ...data, model: model || (await import('@prisma/client')).Prisma.DbNull, revision: { increment: 1 } } });
      await audit(tx,r.actor!.id,'PRODUCT_SIZE_GUIDE','Product',productId,{ revision:saved.revision,published:saved.published }); return saved;
    });
  }
  @Get('metrics') async metrics(@Query() query: unknown) {
    const input = parse(z.object({ days: z.coerce.number().int().min(1).max(90).default(30) }).strict(),query), since = new Date(vietnamDay().getTime() - (input.days - 1)*86400000);
    return { days: input.days, counts: await this.db.experienceDaily.findMany({ where: { day:{gte:since} }, orderBy:{day:'asc'} }), performance: await this.db.performanceDaily.findMany({ where:{day:{gte:since}},orderBy:{day:'asc'} }), note:'Số sự kiện đã đồng ý đo, không phải số khách duy nhất. Sự kiện trình duyệt và đơn/thanh toán phía server được thống kê riêng; chỉ PAYMENT_CONFIRMED là xác nhận thanh toán.' };
  }
}
