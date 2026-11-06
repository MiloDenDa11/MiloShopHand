import {
  Controller,
  Get,
  Post,
  Param,
  Req,
  Body,
  Inject,
  UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiCookieAuth } from "@nestjs/swagger";
import { z } from "zod";
import {
  Db,
  AppRequest,
  AuthGuard,
  AdminGuard,
  parse,
  fail,
  transaction,
  audit,
  outbox,
  reauth,
  json,
} from "./core";
@ApiTags("returns")
@ApiCookieAuth()
@UseGuards(AuthGuard)
@Controller("exchanges")
export class ExchangeController {
  constructor(@Inject(Db) private db: Db) {}
  @Get() async mine(@Req() r: AppRequest) {
    const rows = await this.db.exchange.findMany({
      where: { returnItem: { request: { order: { userId: r.actor!.id } } } },
      include: {
        returnItem: {
          include: {
            request: { include: { order: { select: { code: true } } } },
          },
        },
      },
      take: 100,
    });
    return rows.map(({ inventoryId, receipts, ...x }: any) => x);
  }
  @Post(":id/accept") async accept(
    @Param("id") id: string,
    @Req() r: AppRequest,
  ) {
    return transaction(this.db, async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Exchange" WHERE id=${id} FOR UPDATE`;
      const e = await tx.exchange.findFirst({
        where: {
          id,
          returnItem: { request: { order: { userId: r.actor!.id } } },
        },
        include: {
          returnItem: {
            include: {
              request: { include: { order: { include: { payment: true } } } },
            },
          },
        },
      });
      if (!e) fail("NOT_FOUND", "Không tìm thấy đề nghị đổi size.", 404);
      if (e.status === "ACCEPTED") return { message: "Đã xác nhận đề nghị." };
      if (e.status !== "OFFERED" || e.expiresAt < new Date())
        fail(
          "OFFER_EXPIRED",
          "Đề nghị đã hết hạn. Cửa hàng cần kiểm tra lại tồn.",
        );
      if (e.refundDue) {
        const p = e.returnItem.request.order.payment!;
        await tx.$queryRaw`SELECT id FROM "Payment" WHERE id=${p.id} FOR UPDATE`;
        const pending = await tx.refund.aggregate({
          where: { paymentId: p.id, status: { in: ["REQUESTED", "APPROVED"] } },
          _sum: { amount: true },
        });
        if (e.refundDue + p.refunded + (pending._sum.amount || 0) > p.received)
          fail("REFUND_LIMIT", "Cần đối soát khoản hoàn của đơn gốc.");
        await tx.refund.create({
          data: {
            paymentId: p.id,
            key: `exchange:${e.id}`,
            amount: e.refundDue,
            goodsAmount: e.refundDue,
            reason: "Chênh lệch đổi size đã được khách chấp nhận",
          },
        });
      }
      await tx.exchange.update({
        where: { id },
        data: {
          status: "ACCEPTED",
          history: [
            ...(e.history as any[]),
            {
              action: "CUSTOMER_ACCEPTED",
              actor: r.actor!.id,
              at: new Date().toISOString(),
            },
          ],
        },
      });
      await audit(tx, r.actor!.id, "EXCHANGE_ACCEPT", "Exchange", id);
      return {
        message:
          "Đã đồng ý đổi size và chi phí được công bố. Cửa hàng sẽ đối soát khoản phát sinh trước khi gửi.",
      };
    });
  }
}
@ApiTags("admin")
@ApiCookieAuth()
@UseGuards(AdminGuard)
@Controller("admin/exchanges")
export class AdminExchangeController {
  constructor(@Inject(Db) private db: Db) {}
  @Get() list() {
    return this.db.exchange.findMany({
      include: {
        returnItem: {
          include: {
            orderItem: true,
            request: { include: { order: { select: { code: true } } } },
          },
        },
        inventory: { include: { variant: true } },
        receipts: true,
      },
      take: 100,
    });
  }
  @Post() async offer(@Body() body: any, @Req() r: AppRequest) {
    const d = parse(
      z
        .object({
          returnItemId: z.string(),
          replacementVariantId: z.string(),
          shippingFee: z.number().int().nonnegative().max(1000000),
          reason: z.string().min(5),
        })
        .strict(),
      body,
    );
    return transaction(this.db, async (tx) => {
      const item = await tx.returnItem.findUniqueOrThrow({
        where: { id: d.returnItemId },
        include: { orderItem: true, request: true, exchange: true },
      });
      if (item.exchange) return item.exchange;
      if (item.request.status !== "RECEIVED" || item.inspection !== "PASS")
        fail(
          "QC_REQUIRED",
          "Chỉ đề nghị đổi sau khi thực nhận và kiểm tra hàng đạt.",
        );
      const v = await tx.productVariant.findFirst({
        where: {
          id: d.replacementVariantId,
          active: true,
          productId: item.orderItem.productId,
          product: { active: true },
        },
        include: { product: true },
      });
      if (!v)
        fail(
          "INVALID_VARIANT",
          "Biến thể đổi phải thuộc cùng sản phẩm và đang bán.",
        );
      const inv = await tx.inventory.findUniqueOrThrow({
        where: { variantId_warehouse: { variantId: v.id, warehouse: "MAIN" } },
      });
      const quantity = item.quantity;
      const n =
        await tx.$executeRaw`UPDATE "Inventory" SET reserved=reserved+${quantity} WHERE id=${inv.id} AND "onHand"-reserved>=${quantity}`;
      if (!n) fail("OUT_OF_STOCK", "Size thay thế không đủ hàng.", 409);
      const difference =
        ((v.price ?? v.product.price) - item.orderItem.price) * quantity;
      const balance = difference + d.shippingFee;
      const e = await tx.exchange.create({
        data: {
          returnItemId: item.id,
          inventoryId: inv.id,
          quantity,
          snapshot: {
            name: v.product.name,
            sku: v.sku,
            color: v.color,
            size: v.size,
            price: v.price ?? v.product.price,
            cost: v.product.cost,
            variantId: v.id,
          },
          priceDifference: difference,
          shippingFee: d.shippingFee,
          due: Math.max(0, balance),
          refundDue: Math.max(0, -balance),
          expiresAt: new Date(Date.now() + 48 * 3600000),
          history: [
            {
              action: "OFFERED",
              actor: r.actor!.id,
              reason: d.reason,
              at: new Date().toISOString(),
            },
          ],
        },
      });
      await tx.stockMovement.create({
        data: {
          inventoryId: inv.id,
          delta: 0,
          reason: `Giữ ${quantity} cho đổi size ${e.id}`,
          reference: `exchange-hold:${e.id}`,
          actorId: r.actor!.id,
        },
      });
      await audit(tx, r.actor!.id, "EXCHANGE_OFFER", "Exchange", e.id, d);
      return e;
    });
  }
  @Post(":id/reconcile") async reconcile(
    @Param("id") id: string,
    @Body() body: any,
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
      body,
    );
    return transaction(this.db, async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Exchange" WHERE id=${id} FOR UPDATE`;
      const e = await tx.exchange.findUniqueOrThrow({ where: { id } });
      const prior = await tx.exchangeReceipt.findUnique({
        where: { reference: d.reference },
      });
      if (prior) {
        if (prior.exchangeId !== id || prior.amount !== d.amount)
          fail("EVIDENCE_CONFLICT", "Tham chiếu đã được dùng.", 409);
        return prior;
      }
      if (
        e.status !== "ACCEPTED" ||
        e.expiresAt < new Date() ||
        e.received + d.amount > e.due
      )
        fail("AMOUNT_INVALID", "Số tiền hoặc thời hạn đề nghị không hợp lệ.");
      await tx.exchange.update({
        where: { id },
        data: { received: { increment: d.amount } },
      });
      const result = await tx.exchangeReceipt.create({
        data: { exchangeId: id, ...d, actorId: r.actor!.id },
      });
      await audit(
        tx,
        r.actor!.id,
        "EXCHANGE_RECEIPT_RECONCILED",
        "Exchange",
        id,
        d,
      );
      return result;
    });
  }
  @Post(":id/action") async action(
    @Param("id") id: string,
    @Body() body: any,
    @Req() r: AppRequest,
  ) {
    const d = parse(
      z
        .object({
          action: z.enum(["CREATE_SHIPMENT", "SHIP", "DELIVER", "CANCEL"]),
          reason: z.string().min(5),
        })
        .strict(),
      body,
    );
    return transaction(this.db, async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Exchange" WHERE id=${id} FOR UPDATE`;
      const e = await tx.exchange.findUniqueOrThrow({ where: { id } });
      if (d.action === "CREATE_SHIPMENT") {
        if (
          e.status !== "ACCEPTED" ||
          e.received !== e.due ||
          e.expiresAt < new Date()
        )
          fail(
            "EXCHANGE_NOT_READY",
            "Khách cần đồng ý, khoản phát sinh cần đối soát đủ và đề nghị còn hạn.",
          );
        await outbox(
          tx,
          "EXCHANGE_SHIPMENT_CREATE",
          `exchange-shipment:${id}`,
          { exchangeId: id },
        );
        return { message: "Đã xếp hàng tạo vận đơn đổi size." };
      }
      let status = e.status;
      if (d.action === "SHIP") {
        if (e.status === "SHIPPED") return e;
        if (e.status !== "ACCEPTED" || !e.trackingCode || e.received !== e.due)
          fail("EXCHANGE_NOT_READY", "Chưa đủ điều kiện xuất hàng đổi size.");
        await tx.inventory.update({
          where: { id: e.inventoryId },
          data: {
            reserved: { decrement: e.quantity },
            onHand: { decrement: e.quantity },
          },
        });
        await tx.stockMovement.create({
          data: {
            inventoryId: e.inventoryId,
            delta: -e.quantity,
            reason: d.reason,
            reference: `exchange-ship:${id}`,
            actorId: r.actor!.id,
          },
        });
        status = "SHIPPED";
      } else if (d.action === "DELIVER") {
        if (e.status !== "SHIPPED")
          fail("INVALID_STATE", "Đơn đổi size chưa được gửi.");
        status = "DELIVERED";
      } else if (d.action === "CANCEL") {
        if (e.status === "CANCELLED") return e;
        if (
          !["OFFERED", "ACCEPTED"].includes(e.status) ||
          e.trackingCode ||
          e.received
        )
          fail(
            "EXCHANGE_SUPPORT_REQUIRED",
            "Vận đơn hoặc khoản tiền đã phát sinh cần hủy/hoàn có chứng từ trước.",
          );
        await tx.inventory.update({
          where: { id: e.inventoryId },
          data: { reserved: { decrement: e.quantity } },
        });
        status = "CANCELLED";
      }
      await tx.exchange.update({
        where: { id },
        data: {
          status,
          history: [
            ...(e.history as any[]),
            {
              action: d.action,
              reason: d.reason,
              actor: r.actor!.id,
              at: new Date().toISOString(),
            },
          ],
        },
      });
      await audit(tx, r.actor!.id, `EXCHANGE_${d.action}`, "Exchange", id, d);
      return { message: "Đã cập nhật đổi size." };
    });
  }
}
