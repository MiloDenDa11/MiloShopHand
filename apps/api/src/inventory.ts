import { Body, Controller, Get, Inject, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { fold } from "../../../packages/shared/src";
import { AdminGuard, AppRequest, audit, Db, fail, hash, parse, transaction } from "./core";

const paging = {
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
};
const overviewQuery = z.object({
  ...paging, q: z.string().trim().max(100).default(""),
  size: z.string().max(20).default(""),
  productId: z.string().max(100).optional(),
  status: z.enum(["", "IN_STOCK", "LOW", "OUT"]).default(""),
  sort: z.enum(["name", "stock-asc", "stock-desc"]).default("name"),
}).strict();
const operation = z.enum(["RECEIPT", "ISSUE", "ADJUSTMENT"]);
const kinds = z.enum(["RECEIPT", "ISSUE", "ADJUSTMENT", "SALE", "RETURN", "EXCHANGE", "RESERVE", "RELEASE"]);
export const stockChangeSchema = z.object({
  operation,
  quantity: z.number().int().min(0).max(100000),
  expectedOnHand: z.number().int().nonnegative().max(2147483647),
  reason: z.string().trim().min(5).max(1000),
  key: z.string().min(16).max(100),
}).strict().refine(d => d.operation === "ADJUSTMENT" || d.quantity > 0, {
  path: ["quantity"], message: "Số lượng nhập/xuất phải lớn hơn 0.",
});

// Shared by the old delta endpoint and the new explicit receipt/issue/count UI.
// Row locks + Serializable retry prevent overselling or lost absolute counts.
export async function changeStock(db: Db, id: string, actorId: string, input: {
  key: string; reason: string; operation: "RECEIPT" | "ISSUE" | "ADJUSTMENT";
  quantity?: number; delta?: number; expectedOnHand?: number;
}) {
  const requestHash = hash(JSON.stringify({ id, actorId, ...input }));
  return transaction(db, async tx => {
    const previous = await tx.stockMovement.findUnique({ where: { reference: input.key } });
    if (previous) {
      const legacyReplay = !previous.requestHash && input.delta !== undefined &&
        previous.inventoryId === id && previous.delta === input.delta &&
        previous.actorId === actorId && previous.reason === input.reason;
      if (previous.requestHash !== requestHash && !legacyReplay)
        fail("IDEMPOTENCY_CONFLICT", "Mã giao dịch đã được dùng cho nội dung khác.", 409);
      return previous;
    }
    await tx.$queryRaw`SELECT id FROM "Inventory" WHERE id=${id} FOR UPDATE`;
    const inv = await tx.inventory.findUnique({ where: { id } });
    if (!inv) fail("NOT_FOUND", "Không tìm thấy biến thể trong kho.", 404);
    if (input.expectedOnHand !== undefined && input.expectedOnHand !== inv.onHand)
      fail("STOCK_CHANGED", "Tồn kho đã thay đổi. Hãy làm mới và kiểm tra lại trước khi lưu.", 409);
    const delta = input.delta ?? (input.operation === "ADJUSTMENT"
      ? input.quantity! - inv.onHand
      : input.quantity! * (input.operation === "ISSUE" ? -1 : 1));
    if (!delta) fail("NO_STOCK_CHANGE", "Số lượng tồn kho chưa thay đổi.", 422);
    const after = inv.onHand + delta;
    if (after < inv.reserved || after < 0 || after > 2147483647)
      fail("INVALID_STOCK", "Không thể giảm quá lượng có thể bán hoặc làm tồn kho âm. Hàng đang giữ cho đơn được bảo toàn.", 409);
    await tx.inventory.update({ where: { id }, data: { onHand: after } });
    const movement = await tx.stockMovement.create({ data: {
      inventoryId: id, delta, kind: input.operation, reason: input.reason,
      reference: input.key, actorId, requestHash,
      onHandBefore: inv.onHand, onHandAfter: after,
    } });
    await audit(tx, actorId, "STOCK_ADJUST", "Inventory", id, {
      ...input, delta, onHandBefore: inv.onHand, onHandAfter: after,
    });
    return movement;
  });
}

@ApiTags("admin")
@ApiCookieAuth()
@UseGuards(AdminGuard)
@Controller("admin/inventory")
export class InventoryController {
  constructor(@Inject(Db) private db: Db) {}

  @Get("options") options() {
    return this.db.product.findMany({
      where: { variants: { some: { inventories: { some: { warehouse: "MAIN" } } } } },
      select: { id: true, name: true }, orderBy: [{ name: "asc" }, { id: "asc" }],
    });
  }

  @Get("overview") async overview(@Query() query: unknown) {
    const q = parse(overviewQuery, query);
    const match: Prisma.Sql[] = [];
    for (const word of fold(q.q).split(/\s+/).filter(Boolean)) {
      const term = `%${word.replace(/[\\%_]/g, "\\$&")}%`;
      match.push(Prisma.sql`(p."searchText" ILIKE ${term} OR v.sku ILIKE ${term})`);
    }
    if (q.size) match.push(Prisma.sql`v.size=${q.size}`);
    if (q.productId) match.push(Prisma.sql`p.id=${q.productId}`);
    if (q.status === "OUT") match.push(Prisma.sql`i."onHand"-i.reserved=0`);
    if (q.status === "LOW") match.push(Prisma.sql`i."onHand"-i.reserved BETWEEN 1 AND i."lowThreshold"`);
    if (q.status === "IN_STOCK") match.push(Prisma.sql`i."onHand"-i.reserved>i."lowThreshold"`);
    const condition = match.length ? Prisma.join(match, " AND ") : Prisma.sql`TRUE`;
    const grouped = Prisma.sql`SELECT p.id, p.name, SUM(i."onHand") AS stock,
      SUM(i."onHand"-i.reserved) AS available,
      BOOL_OR(i."onHand"-i.reserved BETWEEN 1 AND i."lowThreshold") AS low,
      COUNT(*)::int AS variants, BOOL_OR(${condition}) AS matches
      FROM "Inventory" i JOIN "ProductVariant" v ON v.id=i."variantId"
      JOIN "Product" p ON p.id=v."productId" WHERE i.warehouse='MAIN' GROUP BY p.id`;
    const order = q.sort === "stock-asc" ? Prisma.sql`stock ASC, name ASC, id ASC`
      : q.sort === "stock-desc" ? Prisma.sql`stock DESC, name ASC, id ASC` : Prisma.sql`name ASC, id ASC`;
    return this.db.$transaction(async tx => {
      const [stats] = await tx.$queryRaw<any[]>(Prisma.sql`WITH grouped AS (${grouped})
        SELECT COUNT(*)::int AS "totalProducts", COALESCE(SUM(stock),0)::bigint::text AS "totalStock",
        COUNT(*) FILTER (WHERE low)::int AS "lowProducts", COUNT(*) FILTER (WHERE available=0)::int AS "outProducts",
        COALESCE(SUM(variants),0)::int AS "totalVariants", COUNT(*) FILTER (WHERE matches)::int AS total FROM grouped`);
      const ids = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`WITH grouped AS (${grouped})
        SELECT id FROM grouped WHERE matches ORDER BY ${order} LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}`);
      const products = await tx.product.findMany({ where: { id: { in: ids.map(p => p.id) } },
        select: { id: true, name: true, slug: true, active: true, category: { select: { name: true } },
          images: { orderBy: { position: "asc" }, select: { url: true, alt: true, color: true }, take: 1 },
          variants: { orderBy: [{ color: "asc" }, { size: "asc" }], select: {
            id: true, sku: true, size: true, color: true, colorHex: true, active: true,
            inventories: { where: { warehouse: "MAIN" }, select: { id: true, warehouse: true, onHand: true, reserved: true, lowThreshold: true } },
          } },
        },
      });
      const invIds = products.flatMap(p => p.variants.flatMap(v => v.inventories.map(i => i.id)));
      const sold = await tx.stockMovement.groupBy({ by: ["inventoryId"], where: { inventoryId: { in: invIds }, kind: "SALE" }, _sum: { delta: true } });
      const soldById = new Map(sold.map(s => [s.inventoryId, -(s._sum.delta || 0)]));
      const sizes = await tx.productVariant.findMany({ where: { inventories: { some: { warehouse: "MAIN" } } }, distinct: ["size"], select: { size: true }, orderBy: { size: "asc" } });
      const byId = new Map(products.map(p => [p.id, p]));
      return {
        items: ids.map(({ id }) => { const p = byId.get(id)!; return { ...p,
          variants: p.variants.flatMap(v => v.inventories.map(i => ({ ...i, variantId: v.id, sku: v.sku, color: v.color, colorHex: v.colorHex, size: v.size, active: v.active, available: i.onHand - i.reserved, sold: soldById.get(i.id) || 0 }))),
        }; }),
        summary: { ...stats, totalStock: Number(stats.totalStock) },
        total: stats.total, page: q.page, pageSize: q.pageSize, sizes: sizes.map(s => s.size),
      };
    }, { isolationLevel: "RepeatableRead" });
  }

  @Get("history") async history(@Query() query: unknown) {
    const q = parse(z.object({ ...paging, productId: z.string().max(100).optional(), inventoryId: z.string().max(100).optional(), kind: kinds.optional() }).strict(), query);
    const where: Prisma.StockMovementWhereInput = {
      ...(q.inventoryId ? { inventoryId: q.inventoryId } : {}),
      ...(q.kind ? { kind: q.kind } : {}),
      inventory: { warehouse: "MAIN", ...(q.productId ? { variant: { productId: q.productId } } : {}) },
    };
    return this.db.$transaction(async tx => {
      const total = await tx.stockMovement.count({ where });
      const rows = await tx.stockMovement.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (q.page - 1) * q.pageSize, take: q.pageSize,
        include: { inventory: { select: { variant: { select: { sku: true, size: true, color: true, product: { select: { id: true, name: true } } } } } } },
      });
      const actors = await tx.user.findMany({ where: { id: { in: rows.flatMap(r => r.actorId ? [r.actorId] : []) } }, select: { id: true, name: true } });
      const names = new Map(actors.map(u => [u.id, u.name]));
      return { items: rows.map(({ requestHash, ...r }) => ({ ...r, actorName: r.actorId ? names.get(r.actorId) || "Tài khoản đã lưu trữ" : "Hệ thống" })), total, page: q.page, pageSize: q.pageSize };
    }, { isolationLevel: "RepeatableRead" });
  }

  @Post(":id/movements") async move(@Param("id") id: string, @Body() body: unknown, @Req() r: AppRequest) {
    return changeStock(this.db, id, r.actor!.id, parse(stockChangeSchema, body));
  }
}
