import "reflect-metadata";
import { Queue, Worker } from "bullmq";
import Redis from "ioredis";
import nodemailer from "nodemailer";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  projectRoot,
  Db,
  env,
  production,
  transaction,
  outbox,
  json,
  unseal,
} from "../../api/src/core";
import { CommerceService } from "../../api/src/commerce";
import { payments, shipping } from "../../api/src/providers";
const db = new Db();
const commerce = new CommerceService(db);
const redis = new Redis(env.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: null,
  lazyConnect: true,
  retryStrategy: (n) => (n < 3 ? 1000 : null),
});
redis.on("error", () => {});
async function email(data: any) {
  const text = data.encryptedText ? unseal(data.encryptedText) : data.text;
  if (env.EMAIL_PROVIDER === "file" && !production) {
    const dir = resolve(projectRoot, ".local/mail");
    await mkdir(dir, { recursive: true });
    await writeFile(
      resolve(dir, `${data.eventId}.json`),
      JSON.stringify({ to: data.to, subject: data.subject, text }, null, 2),
    );
    return;
  }
  if (!env.SMTP_HOST) throw new Error("SMTP_NOT_CONFIGURED");
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: Number(env.SMTP_PORT || 1025),
    secure: env.SMTP_SECURE === "true",
    auth: env.SMTP_USER
      ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }
      : undefined,
    connectionTimeout: 10000,
    socketTimeout: 15000,
  });
  await transport.sendMail({
    from: env.MAIL_FROM,
    to: data.to,
    subject: data.subject,
    text,
    messageId: `<${data.eventId}@miloshophand.local>`,
  });
}
async function handle(event: any) {
  const data = event.payload as any;
  if (event.kind === "EMAIL") await email({ ...data, eventId: event.id });
  else if (event.kind === "PAYMENT_CREATE") {
    const o = await db.order.findUniqueOrThrow({
      where: { id: data.orderId },
      include: { payment: true },
    });
    if (
      o.status === "PENDING_PAYMENT" &&
      o.payment!.expiresAt > new Date() &&
      !o.payment!.linkId
    ) {
      const link = await payments().create(o.payment, o);
      await db.payment.updateMany({
        where: { id: o.payment!.id, status: "PENDING" },
        data: link,
      });
    }
  } else if (event.kind === "PAYMENT_CANCEL") {
    const p = await db.payment.findUniqueOrThrow({
      where: { orderId: data.orderId },
    });
    if (p.linkId) await payments().cancel(p);
  } else if (event.kind === "SHIPMENT_CREATE") {
    const o = await db.order.findUniqueOrThrow({
      where: { id: data.orderId },
      include: { items: true, payment: true, shipment: true },
    });
    if (o.status === "READY_TO_SHIP" && !o.shipment?.trackingCode) {
      if (o.method === "QR" && o.payment!.status !== "PAID")
        throw new Error("PAYMENT_REQUIRED");
      const result = await shipping().create(o);
      await transaction(db, async (tx) => {
        const current = await tx.order.findUniqueOrThrow({
          where: { id: o.id },
        });
        if (current.status !== "READY_TO_SHIP") {
          await outbox(
            tx,
            "SHIPMENT_CANCEL_ORPHAN",
            `orphan:${result.trackingCode}`,
            { trackingCode: result.trackingCode },
          );
          return;
        }
        await tx.shipment.update({
          where: { orderId: o.id },
          data: { trackingCode: result.trackingCode, status: "CREATED" },
        });
        await tx.shipmentEvent.upsert({
          where: { key: `create:${o.id}` },
          create: {
            key: `create:${o.id}`,
            shipmentId: o.shipment!.id,
            status: "CREATED",
            source: env.SHIPPING_PROVIDER!,
            payload: { trackingCode: result.trackingCode },
          },
          update: {},
        });
      });
    }
  } else if (event.kind === "SHIPMENT_CANCEL_ORPHAN") {
    await shipping().cancel(data.trackingCode);
  } else if (event.kind === "SHIPMENT_SYNC") {
    const s = await db.shipment.findUniqueOrThrow({
      where: { id: data.shipmentId },
      include: { order: true },
    });
    if (s.trackingCode) {
      const result = await shipping().lookup(s.trackingCode);
      const map: Record<string, string> = {
        ready_to_pick: "CREATED",
        picking: "CREATED",
        picked: "PICKED_UP",
        storing: "IN_TRANSIT",
        transporting: "IN_TRANSIT",
        sorting: "IN_TRANSIT",
        delivering: "OUT_FOR_DELIVERY",
        delivered: "DELIVERED",
        delivery_fail: "DELIVERY_FAILED",
        waiting_to_return: "RETURNING",
        return: "RETURNING",
        returning: "RETURNING",
        returned: "RETURNED",
        cancel: "CANCELLED",
      };
      const status = map[result.status];
      if (status) {
        if (
          ["PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED"].includes(
            status,
          ) &&
          s.order.status === "READY_TO_SHIP"
        )
          await commerce.transition(
            s.orderId,
            "SHIPPED",
            "system:ghn",
            "GHN API xác nhận nhận hàng",
          );
        if (status === "DELIVERED") {
          const current = await db.order.findUniqueOrThrow({
            where: { id: s.orderId },
          });
          if (current.status === "SHIPPED")
            await commerce.transition(
              s.orderId,
              "DELIVERED",
              "system:ghn",
              "GHN API xác nhận đã giao",
            );
        }
        await transaction(db, async (tx) => {
          const current = await tx.shipment.findUniqueOrThrow({
            where: { id: s.id },
          });
          const terminal = ["RETURNED", "CANCELLED"];
          const rank: Record<string, number> = {
            NOT_CREATED: 0,
            CREATED: 1,
            PICKED_UP: 2,
            IN_TRANSIT: 3,
            OUT_FOR_DELIVERY: 4,
            DELIVERY_FAILED: 5,
            DELIVERED: 6,
            RETURNING: 7,
            RETURNED: 8,
            CANCELLED: 9,
          };
          if (
            !terminal.includes(current.status) &&
            (rank[status] >= rank[current.status] ||
              (current.status === "DELIVERY_FAILED" &&
                status === "OUT_FOR_DELIVERY"))
          )
            await tx.shipment.update({
              where: { id: s.id },
              data: { status: status as any },
            });
          await tx.shipmentEvent.upsert({
            where: { key: `sync:${event.id}` },
            create: {
              key: `sync:${event.id}`,
              shipmentId: s.id,
              status,
              source: "GHN_API",
              payload: { providerStatus: result.status },
            },
            update: {},
          });
        });
      }
    }
  } else if (event.kind === "EXCHANGE_SHIPMENT_CREATE") {
    const e = await db.exchange.findUniqueOrThrow({
      where: { id: data.exchangeId },
      include: {
        returnItem: { include: { request: { include: { order: true } } } },
      },
    });
    if (e.status === "ACCEPTED" && e.received === e.due && !e.trackingCode) {
      const snap = e.snapshot as any;
      const result = await shipping().create({
        code: `EX-${e.id}`,
        method: "QR",
        total: 0,
        subtotal: snap.price * e.quantity,
        address: e.returnItem.request.order.address,
        items: [{ ...snap, quantity: e.quantity }],
      });
      await transaction(db, async (tx) => {
        const current = await tx.exchange.findUniqueOrThrow({
          where: { id: e.id },
        });
        if (current.status !== "ACCEPTED") {
          await outbox(
            tx,
            "SHIPMENT_CANCEL_ORPHAN",
            `orphan:${result.trackingCode}`,
            { trackingCode: result.trackingCode },
          );
          return;
        }
        await tx.exchange.update({
          where: { id: e.id },
          data: { trackingCode: result.trackingCode },
        });
      });
    }
  } else if (event.kind === "ORDER_NOTIFY") {
    await transaction(db, async (tx) => {
      const o = await tx.order.findUniqueOrThrow({
        where: { id: data.orderId },
        include: { user: { select: { email: true } } },
      });
      await tx.notification.upsert({
        where: { key: event.key },
        create: {
          key: event.key,
          userId: o.userId,
          title: data.title,
          body: data.body,
        },
        update: {},
      });
      await outbox(tx, "EMAIL", `email:${event.key}`, {
        to: o.user.email,
        subject: data.title,
        text: data.body,
      });
    });
  } else if (event.kind === "PAYMENT_EXCEPTION") {
    console.warn(
      JSON.stringify({ event: "payment_exception", orderId: data.orderId }),
    );
  } else throw new Error("UNKNOWN_JOB");
}
async function execute(id: string) {
  const e = await db.outboxEvent.findUnique({ where: { id } });
  if (!e || e.status === "DONE") return;
  const claimed = await db.outboxEvent.updateMany({
    where: {
      id,
      status: { in: ["PENDING", "QUEUED", "FAILED"] },
      nextAttemptAt: { lte: new Date() },
    },
    data: {
      status: "RUNNING",
      attempts: { increment: 1 },
      nextAttemptAt: new Date(Date.now() + 120000),
    },
  });
  if (!claimed.count) return;
  try {
    await handle(e);
    await db.outboxEvent.update({
      where: { id },
      data: {
        status: "DONE",
        lastError: null,
        payload: e.kind === "EMAIL" ? { delivered: true } : json(e.payload),
      },
    });
  } catch (error: any) {
    const attempts = e.attempts + 1;
    await db.outboxEvent.update({
      where: { id },
      data: {
        status: attempts >= 8 ? "FAILED" : "PENDING",
        nextAttemptAt: new Date(
          Date.now() + Math.min(300000, 2000 * 2 ** attempts),
        ),
        lastError: String(
          error.code || error.constructor?.name || "PROVIDER_ERROR",
        ).slice(0, 100),
      },
    });
    throw error;
  }
}
let queue: Queue | undefined, worker: Worker | undefined;
let polling = false,
  expiring = false;
async function dispatch() {
  if (polling) return;
  polling = true;
  try {
    await db.outboxEvent.updateMany({
      where: { status: "RUNNING", nextAttemptAt: { lt: new Date() } },
      data: { status: "PENDING" },
    });
    const events = await db.outboxEvent.findMany({
      where: {
        status: { in: ["PENDING", "QUEUED"] },
        nextAttemptAt: { lte: new Date() },
      },
      orderBy: { createdAt: "asc" },
      take: 30,
    });
    for (const e of events) {
      if (queue) {
        await queue.add(
          e.kind,
          { id: e.id },
          {
            jobId: `${e.id}-${e.attempts}`,
            attempts: 5,
            backoff: { type: "exponential", delay: 3000 },
            removeOnComplete: true,
            removeOnFail: 100,
          },
        );
        await db.outboxEvent.updateMany({
          where: { id: e.id, status: "PENDING" },
          data: { status: "QUEUED" },
        });
      } else await execute(e.id).catch(() => {});
    }
  } catch (e: any) {
    console.error(
      JSON.stringify({
        event: "dispatch_error",
        code: e.code || "WORKER_ERROR",
      }),
    );
  } finally {
    polling = false;
  }
}
async function expiry() {
  if (expiring) return;
  expiring = true;
  try {
    const orders = await db.order.findMany({
      where: {
        status: { in: ["PENDING_PAYMENT", "PENDING_CONFIRMATION"] },
        expiresAt: { lt: new Date() },
      },
      include: { payment: true },
      take: 50,
    });
    for (const o of orders) {
      try {
        if (o.method === "QR") {
          await commerce.reconcile(o.id);
          const current = await db.order.findUniqueOrThrow({
            where: { id: o.id },
            include: { payment: true },
          });
          if (current.payment?.status === "PAID") continue;
          if (current.payment?.linkId) {
            await payments().cancel(current.payment);
            await commerce.reconcile(o.id);
          }
        }
        const current = await db.order.findUniqueOrThrow({
          where: { id: o.id },
          include: { payment: true },
        });
        if (current.method === "QR" && current.payment?.status === "PAID")
          continue;
        await commerce.transition(
          o.id,
          "CANCELLED",
          "system:expiry",
          "Hết thời hạn thanh toán/xác nhận sau đối soát",
        );
      } catch (e: any) {
        console.warn(
          JSON.stringify({
            event: "expiry_deferred",
            orderId: o.id,
            code: e.code || "PROVIDER_ERROR",
          }),
        );
      }
    }
    const expired = await db.exchange.findMany({
      where: {
        status: { in: ["OFFERED", "ACCEPTED"] },
        expiresAt: { lt: new Date() },
        received: 0,
        trackingCode: null,
      },
      take: 50,
    });
    for (const e of expired)
      await transaction(db, async (tx) => {
        const claimed = await tx.exchange.updateMany({
          where: {
            id: e.id,
            status: { in: ["OFFERED", "ACCEPTED"] },
            received: 0,
            trackingCode: null,
          },
          data: { status: "CANCELLED" },
        });
        if (claimed.count) {
          await tx.inventory.update({
            where: { id: e.inventoryId },
            data: { reserved: { decrement: e.quantity } },
          });
          await tx.stockMovement.create({
            data: {
              inventoryId: e.inventoryId,
              delta: 0,
              reason: "Exchange offer expired",
              reference: "exchange-expiry:" + e.id,
            },
          });
        }
      });
    const active = await db.shipment.findMany({
      where: {
        trackingCode: { not: null },
        status: {
          in: [
            "CREATED",
            "PICKED_UP",
            "IN_TRANSIT",
            "OUT_FOR_DELIVERY",
            "DELIVERY_FAILED",
            "RETURNING",
          ],
        },
      },
      take: 50,
    });
    if (env.SHIPPING_PROVIDER === "ghn")
      for (const s of active)
        await outbox(
          db,
          "SHIPMENT_SYNC",
          `poll:${s.id}:${Math.floor(Date.now() / 120000)}`,
          { shipmentId: s.id },
        );
  } finally {
    expiring = false;
  }
}
async function main() {
  await db.$connect();
  try {
    await redis.connect();
    queue = new Queue("milo-jobs", { connection: redis as any });
    worker = new Worker("milo-jobs", async (job) => execute(job.data.id), {
      connection: redis as any,
      concurrency: 4,
    });
    worker.on("failed", (job, error) =>
      console.warn(
        JSON.stringify({
          event: "job_retry",
          jobId: job?.id,
          code: error.name,
        }),
      ),
    );
  } catch {
    if (production) throw new Error("Redis required in production");
    console.log(
      "Development: durable PostgreSQL outbox polling; Redis unavailable.",
    );
  }
  console.log("Worker ready");
  await dispatch();
  await expiry();
  const a = setInterval(dispatch, 3000),
    b = setInterval(expiry, 30000);
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, async () => {
      clearInterval(a);
      clearInterval(b);
      await worker?.close();
      await queue?.close();
      redis.disconnect();
      await db.$disconnect();
      process.exit(0);
    });
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
