import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Req,
  Param,
  Headers,
  UseGuards,
  Inject,
  Injectable,
} from "@nestjs/common";
import {
  ApiTags,
  ApiCookieAuth,
  ApiOperation,
  ApiHeader,
  ApiBody,
} from "@nestjs/swagger";
import { z } from "zod";
import { designPhotoUrl } from "../../../packages/shared/src/design-photo";
import {
  Db,
  AppRequest,
  AuthGuard,
  parse,
  fail,
  hash,
  transaction,
  outbox,
  audit,
  json,
  env,
} from "./core";
import {
  addressSchema,
  cartSchema,
  checkoutSchema,
  amounts,
  allocateDiscount,
  assertTransition,
} from "../../../packages/shared/src";
import { phone } from "./auth";
import { payments, shipping } from "./providers";
import { randomBytes } from "node:crypto";
const userOrderInclude = {
  items: true,
  payment: true,
  shipment: {
    include: { events: { orderBy: { createdAt: "desc" as const }, take: 30 } },
  },
  history: { orderBy: { createdAt: "asc" as const } },
  returns: { include: { items: true } },
};
export function orderDto(o: any) {
  const { internalNote, requestHash, idempotencyKey, ...publicFields } = o;
  return json({
    ...publicFields,
    items: o.items?.map(({ cost, ...i }: any) => i),
    payment: o.payment
      ? {
          id: o.payment.id,
          status: o.payment.status,
          provider: o.payment.provider,
          amount: o.payment.amount,
          received: o.payment.received,
          refunded: o.payment.refunded,
          checkoutUrl: o.payment.checkoutUrl,
          qrData: o.payment.qrData,
          expiresAt: o.payment.expiresAt,
        }
      : null,
  });
}
@Injectable()
export class CommerceService {
  constructor(@Inject(Db) public db: Db) {}
  canonical(items: { variantId: string; quantity: number }[]) {
    const map = new Map<string, number>();
    for (const i of items)
      map.set(i.variantId, (map.get(i.variantId) || 0) + i.quantity);
    const result = [...map]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([variantId, quantity]) => ({ variantId, quantity }));
    if (result.some((i) => i.quantity > 20))
      fail("QUANTITY_LIMIT", "Mỗi biến thể tối đa 20 sản phẩm.");
    return result;
  }
  async price(
    tx: any,
    items: any[],
    couponCode: string | undefined,
    userId: string,
    consume = false,
  ) {
    const lines = [];
    for (const item of items) {
      const v = await tx.productVariant.findUnique({
        where: { id: item.variantId },
        include: {
          product: {
            include: { images: { orderBy: { position: "asc" } } },
          },
          inventories: { where: { warehouse: "MAIN" } },
        },
      });
      if (!v || !v.active || !v.product.active)
        fail("PRODUCT_UNAVAILABLE", "Sản phẩm đã ngừng bán.");
      const inv = v.inventories[0];
      if (!inv || inv.onHand - inv.reserved < item.quantity)
        fail(
          "OUT_OF_STOCK",
          `${v.product.name} (${v.color}, ${v.size}) không đủ hàng.`,
          409,
        );
      lines.push({
        ...item,
        v,
        inventoryId: inv.id,
        price: v.price ?? v.product.price,
      });
    }
    const subtotal = lines.reduce((s, i) => s + i.price * i.quantity, 0);
    let discount = 0,
      coupon: any = null;
    if (couponCode) {
      if (consume)
        await tx.$queryRaw`SELECT id FROM "Coupon" WHERE code=${couponCode.toUpperCase()} FOR UPDATE`;
      coupon = await tx.coupon.findUnique({
        where: { code: couponCode.toUpperCase() },
      });
      const now = new Date();
      if (
        !coupon ||
        !coupon.active ||
        coupon.startsAt > now ||
        coupon.endsAt < now ||
        coupon.used >= coupon.maxUses ||
        subtotal < coupon.minSubtotal ||
        (coupon.userIds.length && !coupon.userIds.includes(userId))
      )
        fail(
          "COUPON_INVALID",
          "Mã ưu đãi không hợp lệ, đã hết lượt hoặc chưa đủ điều kiện.",
        );
      const count = await tx.couponRedemption.count({
        where: { couponId: coupon.id, userId },
      });
      if (count >= coupon.perUserLimit)
        fail("COUPON_LIMIT", "Bạn đã dùng hết lượt ưu đãi này.");
      const eligible = lines
        .filter(
          (i) =>
            !coupon.productIds.length ||
            coupon.productIds.includes(i.v.productId),
        )
        .reduce((s, i) => s + i.price * i.quantity, 0);
      discount = Math.min(
        eligible,
        coupon.maxDiscount,
        coupon.type === "PERCENT"
          ? Math.floor((eligible * coupon.value) / 100)
          : coupon.value,
      );
      if (!discount)
        fail("COUPON_SCOPE", "Không có sản phẩm phù hợp với mã ưu đãi.");
    }
    return { lines, subtotal, discount, coupon };
  }
  async quote(userId: string, body: unknown) {
    const d = parse(checkoutSchema, body);
    d.items = this.canonical(d.items);
    d.address.phone = phone(d.address.phone);
    const p = await this.price(this.db, d.items, d.coupon, userId);
    const s = await shipping().quote(
      d.address,
      p.subtotal - p.discount,
      Math.max(
        500,
        p.lines.reduce((s, i) => s + i.quantity * 300, 0),
      ),
    );
    return {
      ...amounts(p.lines, p.discount, s.fee),
      shipping: s,
      lines: p.lines.map((i) => ({
        variantId: i.variantId,
        quantity: i.quantity,
        price: i.price,
        name: i.v.product.name,
        available: i.v.inventories[0].onHand - i.v.inventories[0].reserved,
      })),
      message:
        "Giá và tồn kho sẽ được kiểm tra lại khi xác nhận. Thêm vào giỏ chưa giữ hàng.",
    };
  }
  async checkout(user: any, body: unknown, key: string) {
    if (!user.verifiedAt)
      fail(
        "EMAIL_UNVERIFIED",
        "Vui lòng xác minh email trước khi đặt hàng.",
        403,
      );
    if (!key || key.length < 16 || key.length > 100)
      fail("IDEMPOTENCY_REQUIRED", "Yêu cầu mã chống đặt hàng trùng.");
    const d = parse(checkoutSchema, body);
    d.items = this.canonical(d.items);
    d.address.phone = phone(d.address.phone);
    d.coupon = d.coupon?.toUpperCase();
    const requestHash = hash(JSON.stringify(d));
    const prior = await this.db.order.findUnique({
      where: {
        userId_idempotencyKey: { userId: user.id, idempotencyKey: key },
      },
      include: userOrderInclude,
    });
    if (prior) {
      if (prior.requestHash !== requestHash)
        fail(
          "IDEMPOTENCY_CONFLICT",
          "Mã yêu cầu đã được dùng cho nội dung khác.",
          409,
        );
      return orderDto(prior);
    }
    if (d.method === "QR") payments();
    const preview = await this.price(this.db, d.items, d.coupon, user.id);
    const quote = await shipping().quote(
      d.address,
      preview.subtotal - preview.discount,
      Math.max(
        500,
        preview.lines.reduce((s, i) => s + i.quantity * 300, 0),
      ),
    );
    const result = await transaction(this.db, async (tx) => {
      const exists = await tx.order.findUnique({
        where: {
          userId_idempotencyKey: { userId: user.id, idempotencyKey: key },
        },
        include: userOrderInclude,
      });
      if (exists) {
        if (exists.requestHash !== requestHash)
          fail(
            "IDEMPOTENCY_CONFLICT",
            "Mã yêu cầu đã được dùng cho nội dung khác.",
            409,
          );
        return exists;
      }
      const p = await this.price(tx, d.items, d.coupon, user.id, true);
      if (p.subtotal !== preview.subtotal || p.discount !== preview.discount)
        fail(
          "PRICE_CHANGED",
          "Giá đã thay đổi. Vui lòng kiểm tra lại đơn.",
          409,
        );
      const total = amounts(p.lines, p.discount, quote.fee);
      if (
        d.method === "COD" &&
        total.total > Number(env.COD_MAX_VND || 3000000)
      )
        fail("COD_LIMIT", "Đơn COD vượt giới hạn cho phép. Vui lòng chọn QR.");
      const activeCod = await tx.order.count({
        where: {
          userId: user.id,
          method: "COD",
          status: {
            in: [
              "PENDING_CONFIRMATION",
              "CONFIRMED",
              "PACKING",
              "READY_TO_SHIP",
            ],
          },
        },
      });
      if (d.method === "COD" && activeCod >= 3)
        fail(
          "COD_ABUSE_LIMIT",
          "Bạn đang có 3 đơn COD chưa bàn giao. Vui lòng liên hệ cửa hàng.",
        );
      const expiresAt = new Date(
        Date.now() +
          (d.method === "QR"
            ? Number(env.QR_TTL_MINUTES || 15) * 60000
            : Number(env.COD_CONFIRM_HOURS || 48) * 3600000),
      );
      const discounts = allocateDiscount(
        p.lines.map((i) =>
          p.coupon?.productIds.length &&
          !p.coupon.productIds.includes(i.v.productId)
            ? 0
            : i.price * i.quantity,
        ),
        p.discount,
      );
      const o = await tx.order.create({
        data: {
          code: `MS${new Date().getUTCFullYear().toString().slice(-2)}${randomBytes(5).toString("hex").toUpperCase()}`,
          userId: user.id,
          idempotencyKey: key,
          requestHash,
          status:
            d.method === "QR" ? "PENDING_PAYMENT" : "PENDING_CONFIRMATION",
          method: d.method,
          address: json(d.address),
          ...total,
          expiresAt,
          items: {
            create: p.lines.map((i, n) => ({
              variantId: i.variantId,
              productId: i.v.productId,
              name: i.v.product.name,
              sku: i.v.sku,
              color: i.v.color,
              size: i.v.size,
              image: designPhotoUrl(i.v.product.images.find((image:any)=>image.color===i.v.color&&image.view==="front")||i.v.product.images.find((image:any)=>!image.color||image.color===i.v.color)||i.v.product.images[0],i.v,i.v.product.design),
              price: i.price,
              cost: i.v.product.cost,
              quantity: i.quantity,
              discount: discounts[n],
            })),
          },
          payment: {
            create: {
              provider:
                d.method === "QR"
                  ? env.PAYMENT_PROVIDER || "unconfigured"
                  : "COD",
              status: d.method === "QR" ? "PENDING" : "UNPAID",
              amount: total.total,
              expiresAt,
            },
          },
          shipment: {
            create: {
              provider: env.SHIPPING_PROVIDER || "unconfigured",
              fee: quote.fee,
              codExpected: d.method === "COD" ? total.total : 0,
            },
          },
          history: {
            create: {
              to:
                d.method === "QR" ? "PENDING_PAYMENT" : "PENDING_CONFIRMATION",
              actor: user.id,
              reason: "Tạo đơn hàng",
            },
          },
        },
      });
      for (const i of p.lines) {
        const updated =
          await tx.$executeRaw`UPDATE "Inventory" SET reserved=reserved+${i.quantity} WHERE id=${i.inventoryId} AND "onHand"-reserved>=${i.quantity}`;
        if (updated !== 1)
          fail(
            "OUT_OF_STOCK",
            "Sản phẩm vừa được khách khác đặt. Vui lòng kiểm tra giỏ hàng.",
            409,
          );
        await tx.inventoryReservation.create({
          data: {
            orderId: o.id,
            inventoryId: i.inventoryId,
            quantity: i.quantity,
            expiresAt,
          },
        });
        await tx.stockMovement.create({
          data: {
            inventoryId: i.inventoryId,
            delta: 0,
            reason: `Giữ ${i.quantity} cho ${o.code}`,
            reference: `reserve:${o.id}:${i.inventoryId}`,
            actorId: user.id,
          },
        });
      }
      if (p.coupon) {
        const used = await tx.coupon.updateMany({
          where: { id: p.coupon.id, used: { lt: p.coupon.maxUses } },
          data: { used: { increment: 1 } },
        });
        if (!used.count) fail("COUPON_LIMIT", "Mã ưu đãi vừa hết lượt.", 409);
        await tx.couponRedemption.create({
          data: {
            couponId: p.coupon.id,
            userId: user.id,
            orderId: o.id,
            amount: p.discount,
          },
        });
      }
      if (d.method === "QR")
        await outbox(tx, "PAYMENT_CREATE", `payment-create:${o.id}`, {
          orderId: o.id,
        });
      await outbox(tx, "ORDER_NOTIFY", `order-created:${o.id}`, {
        orderId: o.id,
        title: "Đặt hàng thành công",
        body: `Đơn ${o.code} đã được ghi nhận.`,
      });
      await tx.cartItem.deleteMany({ where: { cart: { userId: user.id } } });
      return tx.order.findUniqueOrThrow({
        where: { id: o.id },
        include: userOrderInclude,
      });
    });
    return orderDto(result);
  }
  async transition(
    id: string,
    to: string,
    actor: string,
    reason: string,
    isUser = false,
  ) {
    return transaction(this.db, async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${id} FOR UPDATE`;
      const o = await tx.order.findUnique({
        where: { id },
        include: { payment: true, shipment: true, reservations: true },
      });
      if (!o) fail("NOT_FOUND", "Không tìm thấy đơn.", 404);
      if (
        isUser &&
        (o.userId !== actor ||
          !["PENDING_PAYMENT", "PENDING_CONFIRMATION"].includes(o.status) ||
          to !== "CANCELLED")
      )
        fail(
          "CANCEL_NOT_ALLOWED",
          "Đơn đã được xử lý. Vui lòng tạo yêu cầu hỗ trợ.",
          409,
        );
      try {
        if (!assertTransition(o.status, to, o.method, o.payment!.status))
          return o;
      } catch (e: any) {
        fail("INVALID_STATE", e.message, 409);
      }
      if (
        to === "PENDING_CONFIRMATION" &&
        o.method === "QR" &&
        o.payment!.status !== "PAID"
      )
        fail("PAYMENT_REQUIRED", "Cần bằng chứng thanh toán hợp lệ.", 409);
      if (
        to === "SHIPPED" &&
        (!o.shipment?.trackingCode || o.shipment.status === "CANCELLED")
      )
        fail(
          "SHIPMENT_REQUIRED",
          "Cần tạo vận đơn thành công trước khi xuất hàng.",
          409,
        );
      if (
        to === "CANCELLED" &&
        o.shipment?.trackingCode &&
        o.shipment.status !== "CANCELLED"
      )
        fail(
          "SHIPMENT_CANCEL_REQUIRED",
          "Cần hủy vận đơn qua nhà cung cấp trước khi hủy đơn.",
          409,
        );
      if (to === "SHIPPED" || to === "CANCELLED") {
        for (const r of o.reservations.filter((r) => r.state === "ACTIVE")) {
          const claimed = await tx.inventoryReservation.updateMany({
            where: { id: r.id, state: "ACTIVE" },
            data: { state: to === "SHIPPED" ? "CONSUMED" : "RELEASED" },
          });
          if (claimed.count) {
            await tx.inventory.update({
              where: { id: r.inventoryId },
              data: {
                reserved: { decrement: r.quantity },
                ...(to === "SHIPPED"
                  ? { onHand: { decrement: r.quantity } }
                  : {}),
              },
            });
            await tx.stockMovement.create({
              data: {
                inventoryId: r.inventoryId,
                delta: to === "SHIPPED" ? -r.quantity : 0,
                reason,
                reference: `${to}:${r.id}`,
                actorId: actor.startsWith("system:") ? undefined : actor,
              },
            });
          }
        }
      }
      if (to === "CANCELLED") {
        if (
          ["PAID", "PARTIALLY_REFUNDED"].includes(o.payment!.status) &&
          o.payment!.received > o.payment!.refunded
        ) {
          const allocated = await tx.refund.aggregate({
            where: {
              paymentId: o.payment!.id,
              status: { in: ["REQUESTED", "APPROVED", "COMPLETED"] },
            },
            _sum: {
              amount: true,
              goodsAmount: true,
              shippingAmount: true,
              taxAmount: true,
            },
          });
          const remaining = o.payment!.received - (allocated._sum.amount || 0);
          if (remaining > 0)
            await tx.refund.upsert({
              where: { key: `cancel:${o.id}` },
              create: {
                key: `cancel:${o.id}`,
                paymentId: o.payment!.id,
                amount: remaining,
                shippingAmount: Math.max(
                  0,
                  o.shippingFee -
                    o.shippingDiscount -
                    (allocated._sum.shippingAmount || 0),
                ),
                taxAmount: Math.max(0, o.tax - (allocated._sum.taxAmount || 0)),
                goodsAmount:
                  remaining -
                  Math.max(
                    0,
                    o.shippingFee -
                      o.shippingDiscount -
                      (allocated._sum.shippingAmount || 0),
                  ) -
                  Math.max(0, o.tax - (allocated._sum.taxAmount || 0)),
                reason: "Hủy đơn đã nhận tiền",
              },
              update: {},
            });
        } else if (o.payment!.status === "PENDING")
          await tx.payment.update({
            where: { id: o.payment!.id },
            data: { status: "EXPIRED" },
          });
        if (o.method === "QR")
          await outbox(tx, "PAYMENT_CANCEL", `payment-cancel:${o.id}`, {
            orderId: id,
          });
      }
      if (to === "DELIVERED")
        await tx.shipment.update({
          where: { orderId: id },
          data: { status: "DELIVERED" },
        });
      await tx.order.update({ where: { id }, data: { status: to as any } });
      await tx.orderStatusHistory.create({
        data: { orderId: id, from: o.status, to, actor, reason },
      });
      await audit(
        tx,
        actor.startsWith("system:") ? undefined : actor,
        "ORDER_TRANSITION",
        "Order",
        id,
        { from: o.status, to, reason },
      );
      await outbox(tx, "ORDER_NOTIFY", `status:${id}:${to}`, {
        orderId: id,
        title: "Cập nhật đơn hàng",
        body: `Đơn ${o.code}: ${to}`,
      });
      return tx.order.findUniqueOrThrow({
        where: { id },
        include: userOrderInclude,
      });
    });
  }
  async receive(data: any, source: string) {
    const schema = z.object({
      orderCode: z.coerce.number().int().positive().safe(),
      reference: z.string().min(1).max(150),
      amount: z.number().int().positive().max(2000000000),
      currency: z.literal("VND"),
      code: z.literal("00"),
      paymentLinkId: z.string().optional(),
    });
    const d = parse(schema, data);
    return transaction(this.db, async (tx) => {
      const p = await tx.payment.findUnique({
        where: { providerCode: BigInt(d.orderCode) },
        include: { order: true },
      });
      if (!p) fail("PAYMENT_NOT_FOUND", "Không tìm thấy thanh toán.", 404);
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${p.orderId} FOR UPDATE`;
      if (p.linkId && d.paymentLinkId && p.linkId !== d.paymentLinkId)
        fail("LINK_MISMATCH", "Mã liên kết thanh toán không khớp.");
      const seen = await tx.paymentTransaction.findUnique({
        where: { reference: d.reference },
      });
      if (seen) {
        if (seen.paymentId !== p.id || seen.amount !== d.amount)
          fail("TRANSACTION_CONFLICT", "Mã giao dịch xung đột.", 409);
        return { duplicate: true };
      }
      const rawTime = data.transactionDateTime;
      const providerTime = rawTime
        ? new Date(
            /[zZ]|[+-]\d{2}:?\d{2}$/.test(rawTime)
              ? rawTime
              : String(rawTime).replace(" ", "T") + "+07:00",
          )
        : new Date();
      const validTime =
        Number.isFinite(providerTime.getTime()) &&
        providerTime >= p.order.createdAt &&
        providerTime <= p.expiresAt &&
        providerTime.getTime() <= Date.now() + 300000;
      const accepted =
        d.amount === p.amount &&
        p.status === "PENDING" &&
        p.order.status === "PENDING_PAYMENT" &&
        validTime;
      await tx.paymentTransaction.create({
        data: {
          paymentId: p.id,
          reference: d.reference,
          amount: d.amount,
          currency: "VND",
          source,
          evidence: {
            orderCode: d.orderCode,
            reference: d.reference,
            amount: d.amount,
            currency: d.currency,
            linkId: d.paymentLinkId || null,
            verified: true,
          },
        },
      });
      await tx.paymentEvent.create({
        data: {
          paymentId: p.id,
          key: `${p.provider}:${d.reference}`,
          result: accepted ? "ACCEPTED" : "EXCEPTION",
          payload: { amount: d.amount, reference: d.reference, source },
        },
      });
      await tx.payment.update({
        where: { id: p.id },
        data: {
          received: { increment: d.amount },
          status: accepted ? "PAID" : "EXCEPTION",
        },
      });
      if (accepted) {
        await tx.order.update({
          where: { id: p.orderId },
          data: { status: "PENDING_CONFIRMATION" },
        });
        await tx.orderStatusHistory.create({
          data: {
            orderId: p.orderId,
            from: p.order.status,
            to: "PENDING_CONFIRMATION",
            actor: `system:${source}`,
            reason: `Thanh toán ${d.reference} đã xác minh`,
          },
        });
        await outbox(tx, "ORDER_NOTIFY", `paid:${p.id}`, {
          orderId: p.orderId,
          title: "Đã nhận thanh toán",
          body: `Đơn ${p.order.code} đã thanh toán.`,
        });
      } else {
        await outbox(
          tx,
          "PAYMENT_EXCEPTION",
          `payment-exception:${d.reference}`,
          { orderId: p.orderId, reference: d.reference },
        );
      }
      return { accepted, exception: !accepted };
    });
  }
  async reconcile(orderId: string) {
    const p = await this.db.payment.findUniqueOrThrow({ where: { orderId } });
    if (p.provider === "COD") return;
    const result = await payments().lookup(p);
    for (const t of result.transactions || []) {
      if (t.reference && t.amount > 0)
        await this.receive(
          {
            orderCode: Number(p.providerCode),
            reference: t.reference,
            amount: t.amount,
            currency: t.currency || "VND",
            code: "00",
            paymentLinkId: result.id,
          },
          "reconcile",
        );
    }
    return result;
  }
}
@ApiTags("cart", "checkout", "orders")
@ApiCookieAuth()
@UseGuards(AuthGuard)
@Controller()
export class CommerceController {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(CommerceService) private commerce: CommerceService,
  ) {}
  @Get("cart") async cart(@Req() r: AppRequest) {
    return this.db.cart.findUnique({
      where: { userId: r.actor!.id },
      include: {
        items: {
          include: {
            variant: {
              include: {
                product: {
                  select: { name: true, slug: true, price: true, images: true },
                },
                inventories: true,
              },
            },
          },
        },
      },
    });
  }
  @Post("cart/merge") async merge(@Body() body: any, @Req() r: AppRequest) {
    const d = parse(cartSchema, body);
    const items = this.commerce.canonical(d.items);
    return transaction(this.db, async (tx) => {
      const cart = await tx.cart.upsert({
        where: { userId: r.actor!.id },
        create: { userId: r.actor!.id },
        update: {},
      });
      for (const i of items) {
        const v = await tx.productVariant.findFirst({
          where: { id: i.variantId, active: true, product: { active: true } },
        });
        if (!v) continue;
        const old = await tx.cartItem.findUnique({
          where: {
            cartId_variantId: { cartId: cart.id, variantId: i.variantId },
          },
        });
        await tx.cartItem.upsert({
          where: {
            cartId_variantId: { cartId: cart.id, variantId: i.variantId },
          },
          create: { cartId: cart.id, ...i },
          update: { quantity: Math.min(20, (old?.quantity || 0) + i.quantity) },
        });
      }
      return { message: "Đã hợp nhất giỏ hàng." };
    });
  }
  @Patch("cart") async cartReplace(@Body() body: any, @Req() r: AppRequest) {
    const d = parse(cartSchema, body);
    return transaction(this.db, async (tx) => {
      const c = await tx.cart.upsert({
        where: { userId: r.actor!.id },
        create: { userId: r.actor!.id },
        update: {},
      });
      await tx.cartItem.deleteMany({ where: { cartId: c.id } });
      if (d.items.length)
        await tx.cartItem.createMany({
          data: this.commerce
            .canonical(d.items)
            .map((i) => ({ ...i, cartId: c.id })),
        });
      return { message: "Đã lưu giỏ hàng." };
    });
  }
  @Post("checkout/quote") quote(@Body() b: unknown, @Req() r: AppRequest) {
    return this.commerce.quote(r.actor!.id, b);
  }
  @ApiOperation({
    summary: "Tạo đơn, giữ kho và voucher nguyên tử; yêu cầu email verified",
  })
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @Post("checkout")
  checkout(
    @Body() b: unknown,
    @Headers("idempotency-key") key: string,
    @Req() r: AppRequest,
  ) {
    return this.commerce.checkout(r.actor, b, key);
  }
  @Get("orders") async orders(@Req() r: AppRequest) {
    const list = await this.db.order.findMany({
      where: { userId: r.actor!.id },
      include: userOrderInclude,
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return list.map(orderDto);
  }
  @Get("orders/:id") async order(
    @Param("id") id: string,
    @Req() r: AppRequest,
  ) {
    const o = await this.db.order.findFirst({
      where: { id, userId: r.actor!.id },
      include: userOrderInclude,
    });
    if (!o) fail("NOT_FOUND", "Không tìm thấy đơn hàng.", 404);
    return orderDto(o);
  }
  @Post("orders/:id/cancel") async cancel(
    @Param("id") id: string,
    @Req() r: AppRequest,
  ) {
    const o = await this.db.order.findFirst({
      where: { id, userId: r.actor!.id },
    });
    if (!o) fail("NOT_FOUND", "Không tìm thấy đơn.", 404);
    return orderDto(
      await this.commerce.transition(
        id,
        "CANCELLED",
        r.actor!.id,
        "Khách yêu cầu hủy",
        true,
      ),
    );
  }
  @Get("addresses") addresses(@Req() r: AppRequest) {
    return this.db.address.findMany({
      where: { userId: r.actor!.id },
      orderBy: { isDefault: "desc" },
    });
  }
  @Post("addresses") async address(@Body() body: any, @Req() r: AppRequest) {
    const d = parse(addressSchema, body);
    d.phone = phone(d.phone);
    return transaction(this.db, async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${r.actor!.id} FOR UPDATE`;
      if (d.isDefault)
        await tx.address.updateMany({
          where: { userId: r.actor!.id },
          data: { isDefault: false },
        });
      return tx.address.create({ data: { ...d, userId: r.actor!.id } });
    });
  }
  @Patch("addresses/:id") async addressUpdate(
    @Param("id") id: string,
    @Body() body: any,
    @Req() r: AppRequest,
  ) {
    const d = parse(addressSchema, body);
    d.phone = phone(d.phone);
    return transaction(this.db, async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${r.actor!.id} FOR UPDATE`;
      const found = await tx.address.findFirst({
        where: { id, userId: r.actor!.id },
      });
      if (!found) fail("NOT_FOUND", "Không tìm thấy địa chỉ.", 404);
      if (d.isDefault)
        await tx.address.updateMany({
          where: { userId: r.actor!.id },
          data: { isDefault: false },
        });
      return tx.address.update({ where: { id }, data: d });
    });
  }
  @Delete("addresses/:id") async addressDelete(
    @Param("id") id: string,
    @Req() r: AppRequest,
  ) {
    await this.db.address.deleteMany({ where: { id, userId: r.actor!.id } });
    return { message: "Đã xóa địa chỉ." };
  }
  @Post("reviews") async review(@Body() body: any, @Req() r: AppRequest) {
    const d = parse(
      z
        .object({
          orderItemId: z.string(),
          rating: z.number().int().min(1).max(5),
          content: z.string().trim().min(10).max(2000),
        })
        .strict(),
      body,
    );
    const i = await this.db.orderItem.findFirst({
      where: {
        id: d.orderItemId,
        order: {
          userId: r.actor!.id,
          status: { in: ["DELIVERED", "COMPLETED"] },
        },
      },
    });
    if (!i)
      fail(
        "REVIEW_NOT_ALLOWED",
        "Chỉ có thể đánh giá sản phẩm bạn đã nhận.",
        403,
      );
    return this.db.review.create({ data: d });
  }
  @Get("returns") returns(@Req() r: AppRequest) {
    return this.db.returnRequest.findMany({
      where: { order: { userId: r.actor!.id } },
      include: { items: true, order: { select: { code: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }
  @Post("returns") async createReturn(@Body() body: any, @Req() r: AppRequest) {
    const d = parse(
      z
        .object({
          orderId: z.string(),
          reason: z.string().min(10).max(1000),
          images: z
            .array(z.string().startsWith("/api/v1/returns/attachments/"))
            .max(5)
            .default([]),
          items: z
            .array(
              z
                .object({
                  orderItemId: z.string(),
                  quantity: z.number().int().positive(),
                  exchangeVariantId: z.string().optional(),
                })
                .strict(),
            )
            .min(1)
            .max(50),
        })
        .strict(),
      body,
    );
    return transaction(this.db, async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${d.orderId} FOR UPDATE`;
      const o = await tx.order.findFirst({
        where: {
          id: d.orderId,
          userId: r.actor!.id,
          status: { in: ["DELIVERED", "COMPLETED"] },
        },
        include: { items: true, history: true },
      });
      if (!o) fail("RETURN_NOT_ALLOWED", "Đơn chưa đủ điều kiện đổi trả.", 403);
      const delivered = o.history.find((h) => h.to === "DELIVERED");
      if (
        !delivered ||
        Date.now() - delivered.createdAt.getTime() >
          Number(env.RETURN_DAYS || 14) * 86400000
      )
        fail("RETURN_EXPIRED", "Đơn đã quá thời hạn đổi trả.");
      if (new Set(d.items.map((i) => i.orderItemId)).size !== d.items.length)
        fail("DUPLICATE_ITEM", "Dòng hàng bị lặp.");
      for (const item of d.items) {
        const line = o.items.find((i) => i.id === item.orderItemId);
        const prior = await tx.returnItem.aggregate({
          where: {
            orderItemId: item.orderItemId,
            request: { status: { not: "REJECTED" } },
          },
          _sum: { quantity: true },
        });
        if (!line || item.quantity + (prior._sum.quantity || 0) > line.quantity)
          fail("RETURN_QUANTITY", "Số lượng đổi trả vượt số đã mua.");
        if (item.exchangeVariantId)
          fail(
            "EXCHANGE_ASSISTED",
            "Đổi size cần cửa hàng kiểm tra và giữ biến thể thay thế. Vui lòng nêu size trong lý do; chưa tính phí khi chưa xác nhận.",
          );
      }
      const uploadIds = d.images.map((url) => url.split("/").pop()!);
      if (
        uploadIds.length &&
        (await tx.userUpload.count({
          where: { id: { in: uploadIds }, userId: r.actor!.id },
        })) !== new Set(uploadIds).size
      )
        fail("INVALID_ATTACHMENT", "Attachment ownership invalid", 403);
      return tx.returnRequest.create({
        data: {
          orderId: o.id,
          reason: d.reason,
          images: d.images,
          history: [
            {
              status: "REQUESTED",
              actor: r.actor!.id,
              at: new Date().toISOString(),
            },
          ],
          items: { create: d.items },
        },
        include: { items: true },
      });
    });
  }
}
@ApiTags("webhooks")
@Controller("webhooks")
export class WebhookController {
  constructor(
    @Inject(CommerceService) private commerce: CommerceService,
    @Inject(Db) private db: Db,
  ) {}
  @ApiOperation({
    summary: "payOS signature-verified webhook; returnUrl không xác nhận tiền",
  })
  @Post("payos")
  async payos(@Body() b: any) {
    const d = await payments().verify(b);
    if (b.success === false || (b.code && b.code !== "00"))
      return { accepted: false };
    return this.commerce.receive(d, "webhook");
  }
  @Post("ghn") async ghn(@Body() b: any) {
    const d = parse(
      z.object({ OrderCode: z.string().min(1).max(80) }).passthrough(),
      b,
    );
    const s = await this.db.shipment.findUnique({
      where: { trackingCode: d.OrderCode },
    });
    if (!s) return { accepted: false };
    await outbox(
      this.db,
      "SHIPMENT_SYNC",
      `shipment-sync:${s.id}:${Math.floor(Date.now() / 30000)}`,
      { shipmentId: s.id },
    );
    return {
      queued: true,
      message: "Callback chỉ yêu cầu đối soát qua API GHN.",
    };
  }
}
