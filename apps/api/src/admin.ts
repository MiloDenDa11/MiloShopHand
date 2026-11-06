import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
  Inject,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiTags, ApiCookieAuth, ApiOperation } from "@nestjs/swagger";
import { z } from "zod";
import { Response } from "express";
import {
  projectRoot,
  Db,
  AppRequest,
  AdminGuard,
  parse,
  fail,
  transaction,
  audit,
  outbox,
  reauth,
  json,
  env,
} from "./core";
import { CommerceService } from "./commerce";
import { CatalogCache } from "./cache";
import { fold } from "../../../packages/shared/src";
import { shipping } from "./providers";
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
const reasonSchema = z.object({ reason: z.string().trim().min(5).max(1000) });
const productSchema = z
  .object({
    name: z.string().min(2).max(150),
    slug: z.string().regex(/^[a-z0-9-]+$/),
    description: z.string().min(10).max(10000),
    categoryId: z.string(),
    material: z.string().min(2).max(200),
    fit: z.string().min(2).max(100),
    care: z.string().max(1000),
    price: z.number().int().positive().max(2000000000),
    originalPrice: z.number().int().positive().nullable().optional(),
    cost: z.number().int().nonnegative(),
    active: z.boolean().default(true),
    featured: z.boolean().default(false),
    styleIds: z.array(z.string()).max(20).default([]),
    collectionIds: z.array(z.string()).max(20).default([]),
    images: z
      .array(
        z.object({
          url: z
            .string()
            .max(500)
            .refine(
              (v) =>
                v.startsWith("/products/") ||
                v.startsWith("/collection-ai/") ||
                v.startsWith("/collection-legacy/") ||
                v.startsWith("/collection-v2/") ||
                v.startsWith("/collection-spin/") ||
                v.startsWith("/uploads/") ||
                (!!env.S3_PUBLIC_URL && v.startsWith(env.S3_PUBLIC_URL + "/")),
            ),
          alt: z.string().min(1).max(200),
          color: z.string().optional(),
          view: z.string().max(30).nullable().optional(),
          crop: z.string().max(100).nullable().optional(),
        }),
      )
      .max(12),
    variants: z
      .array(
        z.object({
          id: z.string().optional(),
          sku: z.string().min(3).max(100),
          color: z.string().max(50),
          colorHex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
          size: z.string().max(20),
          price: z.number().int().positive().nullable().optional(),
          active: z.boolean().default(true),
        }),
      )
      .min(1)
      .max(100),
  })
  .strict();
@ApiTags("admin")
@ApiCookieAuth()
@UseGuards(AdminGuard)
@Controller("admin")
export class AdminController {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(CommerceService) private commerce: CommerceService,
    @Inject(CatalogCache) private cache?: CatalogCache,
  ) {}
  @Delete("data/:kind/:id") async removeMetadata(
    @Param("kind") kind: string,
    @Param("id") id: string,
    @Req() r: AppRequest,
  ) {
    const result = await transaction(this.db, async (tx) => {
      if (kind === "coupons")
        await tx.coupon.update({ where: { id }, data: { active: false } });
      else if (kind === "collections")
        await tx.collection.update({ where: { id }, data: { active: false } });
      else if (kind === "categories") {
        if (await tx.product.count({ where: { categoryId: id } }))
          fail(
            "RESOURCE_IN_USE",
            "Danh mục đang có sản phẩm. Hãy chuyển sản phẩm sang danh mục khác trước.",
            409,
          );
        await tx.category.delete({ where: { id } });
      } else if (kind === "styles") {
        if (await tx.product.count({ where: { styles: { some: { id } } } }))
          fail(
            "RESOURCE_IN_USE",
            "Tag đang được dùng. Hãy gỡ khỏi sản phẩm trước.",
            409,
          );
        await tx.styleTag.delete({ where: { id } });
      } else fail("NOT_FOUND", "Tài nguyên không hỗ trợ thao tác này.", 404);
      await audit(tx, r.actor!.id, "METADATA_REMOVE", kind, id);
      return { message: "Đã cập nhật. Lịch sử đơn hàng được bảo toàn." };
    });
    if (kind !== "coupons") await this.cache?.invalidate("taxonomy");
    return result;
  }
  @Get("dashboard") async dashboard(@Query() q: any) {
    const d = parse(
      z.object({
        from: z.coerce.date().default(new Date(Date.now() - 30 * 86400000)),
        to: z.coerce.date().default(new Date()),
      }),
      q,
    );
    const orders = await this.db.order.findMany({
      where: { createdAt: { gte: d.from, lte: d.to } },
      include: {
        items: true,
        payment: { include: { refunds: true } },
        shipment: { include: { settlements: true } },
        returns: { include: { items: { include: { orderItem: true } } } },
      },
    });
    const lowStock = await this.db
      .$queryRaw`SELECT i.id,v.sku,p.name,i."onHand",i.reserved,(i."onHand"-i.reserved) AS available FROM "Inventory" i JOIN "ProductVariant" v ON v.id=i."variantId" JOIN "Product" p ON p.id=v."productId" WHERE i."onHand"-i.reserved<=i."lowThreshold" ORDER BY available LIMIT 30`;
    const delivered = orders.filter((o) =>
      ["DELIVERED", "COMPLETED"].includes(o.status),
    );
    const sum = (fn: (o: any) => number) =>
      orders.reduce((s, o) => s + fn(o), 0);
    const byStatus = Object.fromEntries(
      [
        "PENDING_PAYMENT",
        "PENDING_CONFIRMATION",
        "CONFIRMED",
        "PACKING",
        "READY_TO_SHIP",
        "SHIPPED",
        "DELIVERED",
        "COMPLETED",
        "CANCELLED",
      ].map((s) => [s, orders.filter((o) => o.status === s).length]),
    );
    const refunds = sum((o) => o.payment?.refunded || 0);
    const refundGoods = delivered.reduce(
      (s, o) =>
        s +
        (o.payment?.refunds
          .filter((f) => f.status === "COMPLETED")
          .reduce((a, f) => a + f.goodsAmount, 0) || 0),
      0,
    );
    const exchanges = await this.db.exchange.findMany({
      where: { createdAt: { gte: d.from, lte: d.to } },
    });
    const exchangeReceived = exchanges.reduce((s, e) => s + e.received, 0);
    const exchangeSales = exchanges
      .filter((e) => e.status === "DELIVERED")
      .reduce((s, e) => s + Math.max(0, e.priceDifference), 0);
    const grossReceived = sum((o) => o.payment?.received || 0);
    const qrReceived = sum((o) =>
      o.method === "QR" ? o.payment?.received || 0 : 0,
    );
    const codCollected = sum((o) => o.shipment?.codCollected || 0),
      codRemitted = sum((o) => o.shipment?.codRemitted || 0),
      carrierFees = sum(
        (o) =>
          o.shipment?.settlements.reduce((s: number, x: any) => s + x.fee, 0) ||
          0,
      );
    const sales = delivered.reduce((s, o) => s + o.subtotal - o.discount, 0);
    const costBeforeReturns = delivered.reduce(
      (s, o) => s + o.items.reduce((a, i) => a + i.cost * i.quantity, 0),
      0,
    );
    const restockedCost = delivered.reduce(
      (s, o) =>
        s +
        o.returns.reduce(
          (a, r) =>
            a +
            r.items
              .filter((i) => i.restockedAt)
              .reduce((b, i) => b + i.quantity * i.orderItem.cost, 0),
          0,
        ),
      0,
    );
    const replacementCost = exchanges
      .filter((e) => e.status === "DELIVERED")
      .reduce(
        (s, e) => s + Number((e.snapshot as any).cost || 0) * e.quantity,
        0,
      );
    const cost = costBeforeReturns - restockedCost + replacementCost;
    const best = new Map<string, any>();
    for (const o of delivered)
      for (const i of o.items) {
        const p = best.get(i.productId) || {
          name: i.name,
          quantity: 0,
          value: 0,
        };
        p.quantity += i.quantity;
        p.value += i.price * i.quantity - i.discount;
        best.set(i.productId, p);
      }
    const daily = Object.entries(
      orders.reduce((m: any, o) => {
        const day = new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Ho_Chi_Minh",
        }).format(o.createdAt);
        m[day] =
          (m[day] || 0) +
          (["DELIVERED", "COMPLETED"].includes(o.status)
            ? o.subtotal - o.discount
            : 0);
        return m;
      }, {}),
    ).map(([date, value]) => ({ date, value }));
    return json({
      period: d,
      count: orders.length,
      byStatus,
      createdValue: sum((o) => o.total),
      sales,
      netSales: sales + exchangeSales - refundGoods,
      refundGoods,
      exchangeReceived,
      exchangeSales,
      grossReceived,
      refunds,
      bankCash:
        qrReceived + codRemitted + exchangeReceived - carrierFees - refunds,
      codCollected,
      codPendingRemittance: codCollected - codRemitted,
      codRemitted,
      carrierFees,
      discounts: sum((o) => o.discount),
      shippingCharged: sum((o) => o.shippingFee),
      costOfGoods: cost,
      estimatedGrossMargin: sales + exchangeSales - refundGoods - cost,
      marginNote:
        "Biên gộp ước tính = doanh thu hàng hóa thuần − giá vốn đã điều chỉnh nhập lại/đổi size; chưa gồm vận chuyển, marketing, vận hành và thuế. Không phải lợi nhuận ròng.",
      cancelRate: orders.length ? byStatus.CANCELLED / orders.length : 0,
      returnRate: orders.length
        ? orders.filter((o) => o.returns.length).length / orders.length
        : 0,
      deliveryFailedRate: orders.length
        ? orders.filter((o) => o.shipment?.status === "DELIVERY_FAILED")
            .length / orders.length
        : 0,
      lowStock,
      bestsellers: [...best.values()]
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 10),
      daily,
    });
  }
  @Get("orders") async orders(@Query() query: any) {
    const q = parse(
      z.object({
        q: z.string().max(100).optional(),
        status: z.string().optional(),
        payment: z.string().optional(),
        shipping: z.string().optional(),
        page: z.coerce.number().int().min(1).max(1000).default(1),
      }),
      query,
    );
    const where: any = {};
    if (q.status) where.status = q.status;
    if (q.payment) where.payment = { status: q.payment };
    if (q.shipping) where.shipment = { status: q.shipping };
    if (q.q)
      where.OR = [
        { code: { contains: q.q, mode: "insensitive" } },
        { user: { name: { contains: q.q, mode: "insensitive" } } },
        { user: { email: { contains: q.q, mode: "insensitive" } } },
        { address: { path: ["phone"], string_contains: q.q } },
        { shipment: { trackingCode: { contains: q.q } } },
      ];
    const [items, total] = await Promise.all([
      this.db.order.findMany({
        where,
        include: {
          user: { select: { name: true, email: true } },
          items: true,
          payment: true,
          shipment: true,
          history: true,
          returns: { include: { items: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 30,
        skip: (q.page - 1) * 30,
      }),
      this.db.order.count({ where }),
    ]);
    return json({ items, total, page: q.page });
  }
  @Patch("orders/:id/status") status(
    @Param("id") id: string,
    @Body() body: any,
    @Req() r: AppRequest,
  ) {
    const d = parse(reasonSchema.extend({ status: z.string() }), body);
    return this.commerce.transition(id, d.status, r.actor!.id, d.reason);
  }
  @Patch("orders/:id/note") async note(
    @Param("id") id: string,
    @Body() body: any,
    @Req() r: AppRequest,
  ) {
    const d = parse(z.object({ note: z.string().max(3000) }).strict(), body);
    return transaction(this.db, async (tx) => {
      await tx.order.update({ where: { id }, data: { internalNote: d.note } });
      await audit(tx, r.actor!.id, "ORDER_NOTE", "Order", id, { note: d.note });
      return { message: "Đã lưu ghi chú." };
    });
  }
  @Post("orders/:id/shipment") async createShipment(
    @Param("id") id: string,
    @Req() r: AppRequest,
  ) {
    const o = await this.db.order.findUniqueOrThrow({
      where: { id },
      include: { payment: true },
    });
    if (o.status !== "READY_TO_SHIP")
      fail(
        "INVALID_STATE",
        "Đơn cần sẵn sàng giao trước khi tạo vận đơn.",
        409,
      );
    if (o.method === "QR" && o.payment?.status !== "PAID")
      fail("PAYMENT_REQUIRED", "Đơn QR chưa thanh toán.", 409);
    shipping();
    await this.db.outboxEvent.upsert({
      where: { key: `shipment-create:${id}` },
      create: {
        key: `shipment-create:${id}`,
        kind: "SHIPMENT_CREATE",
        payload: { orderId: id },
      },
      update: { status: "PENDING", nextAttemptAt: new Date(), lastError: null },
    });
    await audit(this.db, r.actor!.id, "SHIPMENT_REQUEST", "Order", id);
    return {
      message:
        "Đã xếp hàng tạo vận đơn; chỉ xác nhận khi nhà cung cấp trả kết quả.",
    };
  }
  @Post("orders/:id/shipment/cancel") async cancelShipment(
    @Param("id") id: string,
    @Req() r: AppRequest,
  ) {
    reauth(r);
    const s = await this.db.shipment.findUniqueOrThrow({
      where: { orderId: id },
      include: { order: true },
    });
    if (["SHIPPED", "DELIVERED", "COMPLETED"].includes(s.order.status))
      fail("CANCEL_NOT_ALLOWED", "Vận đơn đã bàn giao.", 409);
    if (s.trackingCode) await shipping().cancel(s.trackingCode);
    await transaction(this.db, async (tx) => {
      const o = await tx.order.findUniqueOrThrow({ where: { id } });
      if (["SHIPPED", "DELIVERED", "COMPLETED"].includes(o.status))
        fail("CANCEL_RACE", "Đơn vừa được xuất kho; cần đối soát lại.", 409);
      await tx.shipment.update({
        where: { id: s.id },
        data: { status: "CANCELLED" },
      });
      await audit(tx, r.actor!.id, "SHIPMENT_CANCELLED", "Shipment", s.id);
    });
    return { message: "Vận đơn đã được hủy." };
  }
  @Post("orders/:id/reconcile") async reconcile(
    @Param("id") id: string,
    @Req() r: AppRequest,
  ) {
    reauth(r);
    await this.commerce.reconcile(id);
    await audit(this.db, r.actor!.id, "PAYMENT_RECONCILE", "Order", id);
    return { message: "Đã đối soát với nhà cung cấp." };
  }
  @Get("inventory") async inventory() {
    return this.db.inventory.findMany({
      include: {
        variant: { include: { product: { select: { name: true } } } },
        movements: { orderBy: { createdAt: "desc" }, take: 10 },
      },
      orderBy: { onHand: "asc" },
      take: 500,
    });
  }
  @Post("inventory/:id/adjust") async adjust(
    @Param("id") id: string,
    @Body() body: any,
    @Req() r: AppRequest,
  ) {
    const d = parse(
      reasonSchema.extend({
        delta: z
          .number()
          .int()
          .min(-100000)
          .max(100000)
          .refine((n) => n !== 0),
        key: z.string().min(16).max(100),
      }),
      body,
    );
    return transaction(this.db, async (tx) => {
      const prior = await tx.stockMovement.findUnique({
        where: { reference: d.key },
      });
      if (prior) {
        if (prior.inventoryId !== id || prior.delta !== d.delta)
          fail(
            "IDEMPOTENCY_CONFLICT",
            "Mã điều chỉnh đã dùng cho nội dung khác.",
            409,
          );
        return prior;
      }
      const n =
        await tx.$executeRaw`UPDATE "Inventory" SET "onHand"="onHand"+${d.delta} WHERE id=${id} AND "onHand"+${d.delta}>=reserved`;
      if (!n)
        fail(
          "INVALID_STOCK",
          "Tồn thực tế không thể thấp hơn lượng đang giữ.",
          409,
        );
      const m = await tx.stockMovement.create({
        data: {
          inventoryId: id,
          delta: d.delta,
          reason: d.reason,
          reference: d.key,
          actorId: r.actor!.id,
        },
      });
      await audit(tx, r.actor!.id, "STOCK_ADJUST", "Inventory", id, d);
      return m;
    });
  }
  @Get("products") products() {
    return this.db.product.findMany({
      include: {
        category: true,
        styles: true,
        collections: true,
        images: true,
        variants: { include: { inventories: true } },
      },
      take: 500,
      orderBy: { createdAt: "desc" },
    });
  }
  async saveProduct(id: string | undefined, body: unknown, actor: string) {
    const d = parse(productSchema, body);
    const { styleIds, collectionIds, images, variants, ...base } = d;
    return transaction(this.db, async (tx) => {
      const searchText = fold(
        [
          base.name,
          base.description,
          base.material,
          base.fit,
          (await tx.category.findUnique({ where: { id: base.categoryId } }))
            ?.name,
          (await tx.styleTag.findMany({ where: { id: { in: styleIds } } }))
            .map((s) => s.name)
            .join(" "),
        ].join(" "),
      );
      const p = id
        ? await tx.product.update({
            where: { id },
            data: {
              ...base,
              searchText,
              styles: { set: styleIds.map((id) => ({ id })) },
              collections: { set: collectionIds.map((id) => ({ id })) },
            },
          })
        : await tx.product.create({
            data: {
              ...base,
              searchText,
              styles: { connect: styleIds.map((id) => ({ id })) },
              collections: { connect: collectionIds.map((id) => ({ id })) },
            },
          });
      await tx.productImage.deleteMany({ where: { productId: p.id } });
      await tx.productImage.createMany({
        data: images.map((img, position) => ({
          ...img,
          position,
          productId: p.id,
        })),
      });
      await tx.productVariant.updateMany({
        where: {
          productId: p.id,
          id: { notIn: variants.flatMap((v) => (v.id ? [v.id] : [])) },
        },
        data: { active: false },
      });
      for (const v of variants) {
        const { id: vid, ...data } = v;
        if (vid) {
          const old = await tx.productVariant.findFirst({
            where: { id: vid, productId: p.id },
          });
          if (!old) fail("INVALID_VARIANT", "Biến thể không thuộc sản phẩm.");
          await tx.productVariant.update({ where: { id: vid }, data });
        } else
          await tx.productVariant.create({
            data: {
              ...data,
              productId: p.id,
              inventories: { create: { warehouse: "MAIN" } },
            },
          });
      }
      await audit(
        tx,
        actor,
        id ? "PRODUCT_UPDATE" : "PRODUCT_CREATE",
        "Product",
        p.id,
        { name: p.name },
      );
      return p;
    });
  }
  @Post("products") createProduct(@Body() b: any, @Req() r: AppRequest) {
    return this.saveProduct(undefined, b, r.actor!.id);
  }
  @Patch("products/:id") updateProduct(
    @Param("id") id: string,
    @Body() b: any,
    @Req() r: AppRequest,
  ) {
    return this.saveProduct(id, b, r.actor!.id);
  }
  @Get("data/:kind") async data(@Param("kind") kind: string) {
    const models: any = {
      categories: this.db.category,
      collections: this.db.collection,
      styles: this.db.styleTag,
      coupons: this.db.coupon,
      users: this.db.user,
      reviews: this.db.review,
      returns: this.db.returnRequest,
      payments: this.db.payment,
      refunds: this.db.refund,
      audit: this.db.auditLog,
      jobs: this.db.outboxEvent,
      settings: this.db.storeSetting,
    };
    if (!models[kind]) fail("NOT_FOUND", "Không tìm thấy tài nguyên.", 404);
    if (kind === "users")
      return this.db.user.findMany({
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          disabled: true,
          verifiedAt: true,
          createdAt: true,
        },
        take: 100,
      });
    if (kind === "payments")
      return json(
        await this.db.payment.findMany({
          include: {
            events: true,
            transactions: true,
            refunds: true,
            order: { select: { code: true, method: true } },
          },
          take: 100,
        }),
      );
    if (kind === "returns")
      return this.db.returnRequest.findMany({
        include: {
          items: { include: { orderItem: true } },
          order: { select: { code: true } },
        },
        take: 100,
      });
    if (kind === "settings")
      return this.db.storeSetting.findMany({
        where: { key: { not: { startsWith: "login:" } } },
      });
    if (kind === "jobs")
      return this.db.outboxEvent.findMany({
        select: {
          id: true,
          kind: true,
          key: true,
          status: true,
          attempts: true,
          lastError: true,
          nextAttemptAt: true,
        },
        take: 100,
        orderBy: { createdAt: "desc" },
      });
    return json(await models[kind].findMany({ take: 100 }));
  }
  @Post("data/:kind") async saveData(
    @Param("kind") kind: string,
    @Body() body: any,
    @Req() r: AppRequest,
  ) {
    const id = body.id;
    let data: any, model: any;
    if (["categories", "styles"].includes(kind)) {
      data = parse(
        z.object({
          name: z.string().min(2).max(100),
          slug: z.string().regex(/^[a-z0-9-]+$/),
        }),
        body,
      );
      model = kind === "categories" ? this.db.category : this.db.styleTag;
    } else if (kind === "collections") {
      data = parse(
        z.object({
          name: z.string().min(2),
          slug: z.string().regex(/^[a-z0-9-]+$/),
          season: z.string().min(2),
          climate: z.string().min(2),
          campaign: z.string().default(""),
          image: z.string().default(""),
          active: z.boolean().default(true),
        }),
        body,
      );
      model = this.db.collection;
    } else if (kind === "coupons") {
      data = parse(
        z.object({
          code: z
            .string()
            .min(3)
            .max(40)
            .transform((v) => v.toUpperCase()),
          type: z.enum(["PERCENT", "FIXED"]),
          value: z.number().int().positive(),
          maxDiscount: z.number().int().nonnegative(),
          minSubtotal: z.number().int().nonnegative(),
          startsAt: z.coerce.date(),
          endsAt: z.coerce.date(),
          maxUses: z.number().int().positive(),
          perUserLimit: z.number().int().positive(),
          active: z.boolean(),
          productIds: z.array(z.string()).default([]),
          userIds: z.array(z.string()).default([]),
        }),
        body,
      );
      if (
        data.startsAt >= data.endsAt ||
        (data.type === "PERCENT" && data.value > 100)
      )
        fail(
          "INVALID_COUPON",
          "Khoảng thời gian hoặc tỷ lệ giảm không hợp lệ.",
        );
      model = this.db.coupon;
    } else fail("READ_ONLY", "Tài nguyên không hỗ trợ thao tác này.");
    const result = await transaction(this.db, async (tx) => {
      const m = (tx as any)[
        kind === "categories"
          ? "category"
          : kind === "styles"
            ? "styleTag"
            : kind === "collections"
              ? "collection"
              : "coupon"
      ];
      const saved = id
        ? await m.update({ where: { id }, data })
        : await m.create({ data });
      await audit(tx, r.actor!.id, "CONFIG_SAVE", kind, saved.id, data);
      return saved;
    });
    if (kind !== "coupons") await this.cache?.invalidate("taxonomy");
    return result;
  }
  @Patch("users/:id") async user(
    @Param("id") id: string,
    @Body() b: any,
    @Req() r: AppRequest,
  ) {
    reauth(r);
    const d = parse(z.object({ disabled: z.boolean() }).strict(), b);
    if (id === r.actor!.id)
      fail("SELF_DISABLE", "Không thể tự khóa tài khoản.");
    return transaction(this.db, async (tx) => {
      await tx.user.update({ where: { id }, data: d });
      if (d.disabled) await tx.session.deleteMany({ where: { userId: id } });
      await audit(tx, r.actor!.id, "USER_STATUS", "User", id, d);
      return { message: "Đã cập nhật trạng thái tài khoản." };
    });
  }
  @Post("reviews/:id/moderate") async moderate(
    @Param("id") id: string,
    @Body() b: any,
    @Req() r: AppRequest,
  ) {
    const d = parse(reasonSchema.extend({ visible: z.boolean() }), b);
    return transaction(this.db, async (tx) => {
      await tx.review.update({
        where: { id },
        data: { visible: d.visible, moderationReason: d.reason },
      });
      await audit(tx, r.actor!.id, "REVIEW_MODERATE", "Review", id, d);
      return { message: "Đã lưu kiểm duyệt." };
    });
  }
  @Post("cod/:id/collect") async collect(
    @Param("id") id: string,
    @Body() b: any,
    @Req() r: AppRequest,
  ) {
    reauth(r);
    const d = parse(
      z
        .object({
          amount: z.number().int().positive(),
          reference: z.string().min(5),
          evidence: z.string().min(10),
        })
        .strict(),
      b,
    );
    return transaction(this.db, async (tx) => {
      const s = await tx.shipment.findUniqueOrThrow({
        where: { id },
        include: { order: { include: { payment: true } } },
      });
      await tx.$queryRaw`SELECT id FROM "Shipment" WHERE id=${id} FOR UPDATE`;
      if (
        s.order.method !== "COD" ||
        s.status !== "DELIVERED" ||
        d.amount !== s.codExpected
      )
        fail("COD_INVALID", "Chỉ xác nhận đúng tiền COD của đơn đã giao.");
      if (s.codCollected === d.amount) return { duplicate: true };
      if (s.codCollected) fail("COD_CONFLICT", "COD đã được xác nhận.");
      await tx.shipment.update({
        where: { id },
        data: { codCollected: d.amount },
      });
      await tx.payment.update({
        where: { orderId: s.orderId },
        data: { status: "PAID", received: d.amount },
      });
      await tx.paymentTransaction.create({
        data: {
          paymentId: s.order.payment!.id,
          reference: d.reference,
          amount: d.amount,
          currency: "VND",
          source: "COD_CARRIER_EVIDENCE",
          evidence: { evidence: d.evidence, actor: r.actor!.id },
        },
      });
      await audit(tx, r.actor!.id, "COD_COLLECTED", "Shipment", id, d);
      return {
        message:
          "Đã xác nhận đơn vị vận chuyển thu COD. Tiền chưa được tính là đã về ngân hàng.",
      };
    });
  }
  @Post("cod/:id/settle") async settle(
    @Param("id") id: string,
    @Body() b: any,
    @Req() r: AppRequest,
  ) {
    reauth(r);
    const d = parse(
      z
        .object({
          amount: z.number().int().positive(),
          fee: z.number().int().nonnegative(),
          reference: z.string().min(5),
          evidence: z.string().min(10),
        })
        .strict(),
      b,
    );
    return transaction(this.db, async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Shipment" WHERE id=${id} FOR UPDATE`;
      const s = await tx.shipment.findUniqueOrThrow({ where: { id } });
      const prior = await tx.cODSettlement.findUnique({
        where: { reference: d.reference },
      });
      if (prior) {
        if (prior.shipmentId !== id || prior.amount !== d.amount)
          fail("SETTLEMENT_CONFLICT", "Mã đối soát đã được dùng.", 409);
        return prior;
      }
      if (s.codRemitted + d.amount > s.codCollected || d.fee > d.amount)
        fail("COD_OVER_SETTLEMENT", "Đối soát vượt số COD đã thu.");
      await tx.shipment.update({
        where: { id },
        data: { codRemitted: { increment: d.amount } },
      });
      const result = await tx.cODSettlement.create({
        data: { shipmentId: id, ...d, actor: r.actor!.id },
      });
      await audit(tx, r.actor!.id, "COD_SETTLED", "Shipment", id, d);
      return result;
    });
  }
  @Post("refunds") async refund(@Body() b: any, @Req() r: AppRequest) {
    reauth(r);
    const d = parse(
      z
        .object({
          paymentId: z.string(),
          amount: z.number().int().positive(),
          shippingAmount: z.number().int().nonnegative().default(0),
          taxAmount: z.number().int().nonnegative().default(0),
          reason: z.string().min(5),
          key: z.string().min(16),
        })
        .strict(),
      b,
    );
    return transaction(this.db, async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Payment" WHERE id=${d.paymentId} FOR UPDATE`;
      const old = await tx.refund.findUnique({ where: { key: d.key } });
      if (old) {
        if (old.amount !== d.amount || old.paymentId !== d.paymentId)
          fail("IDEMPOTENCY_CONFLICT", "Mã yêu cầu hoàn tiền đã dùng.", 409);
        return old;
      }
      const p = await tx.payment.findUniqueOrThrow({
        where: { id: d.paymentId },
      });
      const pending = await tx.refund.aggregate({
        where: { paymentId: p.id, status: { in: ["REQUESTED", "APPROVED"] } },
        _sum: { amount: true },
      });
      if (d.amount + (pending._sum.amount || 0) + p.refunded > p.received)
        fail("REFUND_EXCEEDS_RECEIVED", "Số tiền hoàn vượt số thực nhận.");
      const goodsAmount = d.amount - d.shippingAmount - d.taxAmount;
      if (goodsAmount < 0)
        fail("REFUND_PARTS_INVALID", "Phân loại tiền hoàn vượt tổng số tiền.");
      const result = await tx.refund.create({ data: { ...d, goodsAmount } });
      await audit(tx, r.actor!.id, "REFUND_REQUEST", "Refund", result.id, d);
      return result;
    });
  }
  @Post("refunds/:id/process") async processRefund(
    @Param("id") id: string,
    @Body() b: any,
    @Req() r: AppRequest,
  ) {
    reauth(r);
    const d = parse(
      z
        .object({
          action: z.enum(["APPROVE", "COMPLETE", "REJECT"]),
          evidence: z.string().min(10).max(1000),
        })
        .strict(),
      b,
    );
    return transaction(this.db, async (tx) => {
      const f = await tx.refund.findUniqueOrThrow({ where: { id } });
      await tx.$queryRaw`SELECT id FROM "Payment" WHERE id=${f.paymentId} FOR UPDATE`;
      if (f.status === "COMPLETED") return f;
      if (
        (d.action === "APPROVE" && f.status !== "REQUESTED") ||
        (d.action === "COMPLETE" && f.status !== "APPROVED")
      )
        fail("INVALID_STATE", "Yêu cầu hoàn tiền chưa ở trạng thái phù hợp.");
      if (d.action === "COMPLETE") {
        const p = await tx.payment.findUniqueOrThrow({
          where: { id: f.paymentId },
        });
        if (p.refunded + f.amount > p.received)
          fail("REFUND_EXCEEDS_RECEIVED", "Hoàn tiền vượt số thực nhận.");
        await tx.payment.update({
          where: { id: p.id },
          data: {
            refunded: { increment: f.amount },
            status:
              p.refunded + f.amount === p.received
                ? "REFUNDED"
                : "PARTIALLY_REFUNDED",
          },
        });
      }
      const status =
        d.action === "APPROVE"
          ? "APPROVED"
          : d.action === "COMPLETE"
            ? "COMPLETED"
            : "REJECTED";
      const result = await tx.refund.update({
        where: { id },
        data: { status, evidence: d.evidence, approvedBy: r.actor!.id },
      });
      await audit(tx, r.actor!.id, `REFUND_${status}`, "Refund", id, d);
      return result;
    });
  }
  @Post("returns/:id/process") async processReturn(
    @Param("id") id: string,
    @Body() b: any,
    @Req() r: AppRequest,
  ) {
    const d = parse(
      reasonSchema.extend({
        action: z.enum([
          "APPROVE",
          "REJECT",
          "RECEIVE",
          "QC_PASS",
          "QC_FAIL",
          "RESTOCK",
          "COMPLETE",
        ]),
        itemId: z.string().optional(),
      }),
      b,
    );
    return transaction(this.db, async (tx) => {
      await tx.$queryRaw`SELECT id FROM "ReturnRequest" WHERE id=${id} FOR UPDATE`;
      const ret = await tx.returnRequest.findUniqueOrThrow({
        where: { id },
        include: { items: { include: { orderItem: true } } },
      });
      const next: Record<string, [string[], string]> = {
        APPROVE: [["REQUESTED"], "APPROVED"],
        REJECT: [["REQUESTED", "APPROVED"], "REJECTED"],
        RECEIVE: [["APPROVED"], "RECEIVED"],
        COMPLETE: [["RECEIVED"], "COMPLETED"],
      };
      if (d.action === "RESTOCK" || d.action.startsWith("QC_")) {
        if (ret.status !== "RECEIVED")
          fail("RETURN_NOT_RECEIVED", "Chưa thực nhận hàng hoàn.");
        const item = ret.items.find((i) => i.id === d.itemId);
        if (!item) fail("NOT_FOUND", "Không tìm thấy dòng đổi trả.", 404);
        if (d.action === "RESTOCK") {
          if (item.inspection !== "PASS")
            fail("QC_REQUIRED", "Hàng cần kiểm tra đạt trước khi nhập lại.");
          if (item.restockedAt) return { duplicate: true };
          const inv = await tx.inventory.findUniqueOrThrow({
            where: {
              variantId_warehouse: {
                variantId: item.orderItem.variantId,
                warehouse: "MAIN",
              },
            },
          });
          await tx.inventory.update({
            where: { id: inv.id },
            data: { onHand: { increment: item.quantity } },
          });
          await tx.returnItem.update({
            where: { id: item.id },
            data: { restockedAt: new Date() },
          });
          await tx.stockMovement.create({
            data: {
              inventoryId: inv.id,
              delta: item.quantity,
              reason: d.reason,
              reference: `return:${item.id}`,
              actorId: r.actor!.id,
            },
          });
        } else {
          if (item.restockedAt) fail("ALREADY_RESTOCKED", "Hàng đã nhập kho.");
          await tx.returnItem.update({
            where: { id: item.id },
            data: { inspection: d.action === "QC_PASS" ? "PASS" : "FAIL" },
          });
        }
      } else {
        if (!next[d.action][0].includes(ret.status))
          fail("INVALID_STATE", "Trạng thái đổi trả không hợp lệ.");
        if (
          d.action === "COMPLETE" &&
          ret.items.some((i) => i.inspection === "PENDING")
        )
          fail("QC_REQUIRED", "Cần kiểm tra toàn bộ hàng hoàn.");
        await tx.returnRequest.update({
          where: { id },
          data: { status: next[d.action][1] },
        });
      }
      const history = [
        ...(ret.history as any[]),
        {
          action: d.action,
          reason: d.reason,
          actor: r.actor!.id,
          at: new Date().toISOString(),
        },
      ];
      await tx.returnRequest.update({ where: { id }, data: { history } });
      await audit(
        tx,
        r.actor!.id,
        `RETURN_${d.action}`,
        "ReturnRequest",
        id,
        d,
      );
      return { message: "Đã cập nhật yêu cầu đổi trả." };
    });
  }
  @Post("settings") async settings(@Body() b: any, @Req() r: AppRequest) {
    const d = parse(
      z
        .object({
          brand: z.string().min(2).max(50),
          announcement: z.string().max(200),
          contactEmail: z.string().email(),
          shippingPolicy: z.string().max(10000),
          returnPolicy: z.string().max(10000),
          privacyPolicy: z.string().max(10000),
          banners: z
            .array(
              z.object({
                title: z.string(),
                image: z.string(),
                href: z.string().startsWith("/"),
              }),
            )
            .max(10)
            .default([]),
        })
        .strict(),
      b,
    );
    return transaction(this.db, async (tx) => {
      await tx.storeSetting.upsert({
        where: { key: "public" },
        create: { key: "public", value: d },
        update: { value: d },
      });
      await audit(
        tx,
        r.actor!.id,
        "STORE_SETTINGS",
        "StoreSetting",
        "public",
        d,
      );
      return { message: "Đã lưu cấu hình." };
    });
  }
  @Post("jobs/:id/retry") async retry(
    @Param("id") id: string,
    @Req() r: AppRequest,
  ) {
    await this.db.outboxEvent.update({
      where: { id },
      data: { status: "PENDING", nextAttemptAt: new Date(), lastError: null },
    });
    await audit(this.db, r.actor!.id, "JOB_RETRY", "OutboxEvent", id);
    return { message: "Đã đưa tác vụ về hàng đợi." };
  }
  @Get("export.csv") async csv(@Res() res: Response, @Query() q: any) {
    const range = parse(
      z.object({
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
      }),
      q,
    );
    const orders = await this.db.order.findMany({
      where: { createdAt: { gte: range.from, lte: range.to } },
      include: { payment: true, shipment: true },
      orderBy: { createdAt: "desc" },
      take: 10000,
    });
    const esc = (v: any) =>
      '"' +
      String(v ?? "")
        .replace(/^[=+@-]/, "'")
        .replace(/"/g, '""') +
      '"';
    const rows = [
      [
        "Mã đơn",
        "Ngày UTC",
        "Trạng thái",
        "Thanh toán",
        "Phương thức",
        "Tổng VND",
        "Đã thu",
        "Đã hoàn",
        "COD đã chuyển",
      ],
      ...orders.map((o) => [
        o.code,
        o.createdAt.toISOString(),
        o.status,
        o.payment?.status,
        o.method,
        o.total,
        o.payment?.received,
        o.payment?.refunded,
        o.shipment?.codRemitted,
      ]),
    ];
    res
      .header("Content-Type", "text/csv; charset=utf-8")
      .header(
        "Content-Disposition",
        'attachment; filename="miloshophand-orders.csv"',
      )
      .send("\uFEFF" + rows.map((row) => row.map(esc).join(",")).join("\r\n"));
  }
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    }),
  )
  @Post("uploads")
  async upload(@UploadedFile() file: any, @Req() r: AppRequest) {
    if (!file?.buffer) fail("FILE_REQUIRED", "Vui lòng chọn ảnh.");
    let buffer: Buffer;
    try {
      const metadata = await sharp(file.buffer, {
        limitInputPixels: 24000000,
      }).metadata();
      if (!["jpeg", "png", "webp", "avif"].includes(metadata.format || ""))
        throw new Error("INVALID_IMAGE");
      buffer = await sharp(file.buffer, {
        limitInputPixels: 24000000,
        animated: false,
      })
        .rotate()
        .resize({
          width: 1800,
          height: 1800,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 85 })
        .toBuffer();
    } catch {
      fail(
        "INVALID_IMAGE",
        "Ảnh không hợp lệ hoặc vượt kích thước. Chỉ chấp nhận ảnh raster.",
        422,
      );
    }
    const name = `${randomUUID()}.webp`;
    let url: string;
    if (env.STORAGE_PROVIDER === "s3") {
      for (const k of [
        "S3_BUCKET",
        "S3_ACCESS_KEY_ID",
        "S3_SECRET_ACCESS_KEY",
        "S3_PUBLIC_URL",
      ])
        if (!env[k])
          fail("STORAGE_UNCONFIGURED", "Lưu trữ S3 chưa được cấu hình.", 503);
      const client = new S3Client({
        endpoint: env.S3_ENDPOINT,
        region: env.S3_REGION || "auto",
        credentials: {
          accessKeyId: env.S3_ACCESS_KEY_ID!,
          secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
        },
      });
      await client.send(
        new PutObjectCommand({
          Bucket: env.S3_BUCKET,
          Key: name,
          Body: buffer,
          ContentType: "image/webp",
        }),
      );
      url = `${env.S3_PUBLIC_URL}/${name}`;
    } else {
      const dir = resolve(projectRoot, env.UPLOAD_DIR || "uploads");
      await mkdir(dir, { recursive: true });
      await writeFile(resolve(dir, name), buffer);
      url = `/uploads/${name}`;
    }
    await audit(this.db, r.actor!.id, "IMAGE_UPLOAD", "Asset", name);
    return { url };
  }
}
