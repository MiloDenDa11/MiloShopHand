import { PayOS } from "@payos/node";
import { env, production, fail, json, hash } from "./core";
import { createHmac } from "node:crypto";
export interface PaymentProvider {
  create(p: any, o: any): Promise<any>;
  lookup(p: any): Promise<any>;
  cancel(p: any): Promise<void>;
  verify(body: any): Promise<any>;
}
export class MockPaymentProvider implements PaymentProvider {
  constructor() {
    if (production) throw new Error("Mock payments forbidden in production");
  }
  async create(p: any, o: any) {
    return {
      linkId: `mock-${p.id}`,
      checkoutUrl: `${env.APP_URL}/don-hang/${o.id}`,
      qrData: `MILOSHOPHAND DEVELOPMENT ONLY ${o.code} ${p.amount} VND`,
    };
  }
  async lookup(p: any) {
    return { status: "PENDING", transactions: [] };
  }
  async cancel(p: any) {}
  async verify(body: any) {
    const signature = createHmac("sha256", env.DEV_WEBHOOK_SECRET!)
      .update(JSON.stringify(body.data))
      .digest("hex");
    const { safeEqual } = await import("./core");
    if (!safeEqual(signature, String(body.signature || "")))
      fail("INVALID_SIGNATURE", "Chữ ký mô phỏng không hợp lệ.", 400);
    return body.data;
  }
}
export class PayosProvider implements PaymentProvider {
  client: PayOS;
  constructor() {
    for (const k of ["PAYOS_CLIENT_ID", "PAYOS_API_KEY", "PAYOS_CHECKSUM_KEY"])
      if (!env[k])
        fail("PROVIDER_NOT_CONFIGURED", "payOS chưa được cấu hình.", 503);
    this.client = new PayOS({
      clientId: env.PAYOS_CLIENT_ID!,
      apiKey: env.PAYOS_API_KEY!,
      checksumKey: env.PAYOS_CHECKSUM_KEY!,
    });
  }
  async create(p: any, o: any) {
    try {
      const existing = await this.client.paymentRequests.get(
        Number(p.providerCode),
      );
      return {
        linkId: existing.id,
        checkoutUrl: `https://pay.payos.vn/web/${existing.id}`,
        qrData: null,
      };
    } catch (e: any) {
      if (e.code !== "231") throw e;
    }
    const r = await this.client.paymentRequests.create({
      orderCode: Number(p.providerCode),
      amount: p.amount,
      description: o.code.slice(-25),
      returnUrl: `${env.APP_URL}/don-hang/${o.id}`,
      cancelUrl: `${env.APP_URL}/don-hang/${o.id}`,
      expiredAt: Math.floor(p.expiresAt.getTime() / 1000),
    });
    return {
      linkId: r.paymentLinkId,
      checkoutUrl: r.checkoutUrl,
      qrData: r.qrCode,
    };
  }
  async lookup(p: any) {
    return json(
      await this.client.paymentRequests.get(p.linkId || Number(p.providerCode)),
    );
  }
  async cancel(p: any) {
    await this.client.paymentRequests.cancel(
      p.linkId || Number(p.providerCode),
      "Hết thời gian thanh toán hoặc đơn đã hủy",
    );
  }
  async verify(body: any) {
    try {
      return await this.client.webhooks.verify(body);
    } catch {
      fail("INVALID_SIGNATURE", "Chữ ký payOS không hợp lệ.", 400);
    }
  }
}
export const payments = (): PaymentProvider =>
  env.PAYMENT_PROVIDER === "mock"
    ? new MockPaymentProvider()
    : env.PAYMENT_PROVIDER === "payos"
      ? new PayosProvider()
      : fail(
          "PROVIDER_NOT_CONFIGURED",
          "Thanh toán QR chưa được cấu hình.",
          503,
        );
export interface ShippingProvider {
  quote(
    address: any,
    subtotal: number,
    weight?: number,
  ): Promise<{ fee: number; label: string; serviceId?: number }>;
  create(o: any): Promise<any>;
  lookup(code: string, byClient?: boolean): Promise<any>;
  cancel(code: string): Promise<any>;
}
export class MockShippingProvider implements ShippingProvider {
  constructor() {
    if (production) throw new Error("Mock shipping forbidden in production");
  }
  async quote(a: any, subtotal: number) {
    return {
      fee:
        subtotal >= Number(env.FREE_SHIPPING_MIN_VND || 699000)
          ? 0
          : Number(env.SHIPPING_FLAT_VND || 30000),
      label: "Giao hàng phát triển (mô phỏng), 2–4 ngày",
    };
  }
  async create(o: any) {
    return { trackingCode: `DEV-${o.code}`, status: "CREATED" };
  }
  async lookup(code: string) {
    return { order_code: code, status: "ready_to_pick", cod_amount: 0 };
  }
  async cancel(code: string) {
    return { cancelled: true };
  }
}
export class GhnProvider implements ShippingProvider {
  constructor() {
    for (const k of [
      "GHN_TOKEN",
      "GHN_SHOP_ID",
      "GHN_FROM_DISTRICT_ID",
      "GHN_FROM_WARD_CODE",
    ])
      if (!env[k])
        fail("PROVIDER_NOT_CONFIGURED", "GHN chưa đủ cấu hình.", 503);
  }
  async call(endpoint: string, data: any) {
    const r = await fetch(`${env.GHN_BASE_URL}/${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Token: env.GHN_TOKEN!,
        ShopId: env.GHN_SHOP_ID!,
      },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(15000),
    });
    const b = (await r.json()) as any;
    if (!r.ok || b.code !== 200)
      fail(
        "SHIPPING_UNAVAILABLE",
        "GHN chưa xác nhận được dịch vụ. Vui lòng kiểm tra địa chỉ hoặc thử lại.",
        503,
      );
    return b.data;
  }
  async services(address: any) {
    if (!address.districtId || !address.wardCode)
      fail(
        "ADDRESS_MAPPING_REQUIRED",
        "Địa chỉ cần mã khu vực GHN. Vui lòng chọn từ danh mục vận chuyển.",
        422,
      );
    const rows = await this.call("v2/shipping-order/available-services", {
      shop_id: Number(env.GHN_SHOP_ID),
      from_district: Number(env.GHN_FROM_DISTRICT_ID),
      to_district: address.districtId,
    });
    const service =
      rows?.find((s: any) => s.service_type_id === 2) || rows?.[0];
    if (!service)
      fail("OUTSIDE_SERVICE_AREA", "Địa chỉ nằm ngoài vùng phục vụ.", 422);
    return service;
  }
  async quote(address: any, subtotal: number, weight = 500) {
    const s = await this.services(address);
    const fee = await this.call("v2/shipping-order/fee", {
      service_id: s.service_id,
      to_district_id: address.districtId,
      to_ward_code: address.wardCode,
      weight,
      length: 30,
      width: 25,
      height: 8,
      insurance_value: Math.min(subtotal, 5000000),
    });
    return {
      fee: fee.total,
      label: `GHN ${s.short_name || ""} — thời gian theo vận đơn`,
      serviceId: s.service_id,
    };
  }
  async lookup(code: string, byClient = false) {
    return this.call(
      byClient
        ? "v2/shipping-order/detail-by-client-code"
        : "v2/shipping-order/detail",
      byClient ? { client_order_code: code } : { order_code: code },
    );
  }
  async create(o: any) {
    try {
      const prior = await this.lookup(o.code, true);
      if (prior?.order_code)
        return { trackingCode: prior.order_code, status: "CREATED" };
    } catch (e: any) {
      if (e.getStatus?.() !== 503) throw e;
    }
    const a = o.address;
    const service = await this.services(a);
    const r = await this.call("v2/shipping-order/create", {
      payment_type_id: 1,
      note: a.instructions,
      required_note: "CHOXEMHANGKHONGTHU",
      to_name: a.recipient,
      to_phone: a.phone,
      to_address: [a.text, a.detail].filter(Boolean).join(", "),
      to_ward_code: a.wardCode,
      to_district_id: a.districtId,
      from_district_id: Number(env.GHN_FROM_DISTRICT_ID),
      from_ward_code: env.GHN_FROM_WARD_CODE,
      client_order_code: o.code,
      cod_amount: o.method === "COD" ? o.total : 0,
      content: o.items
        .map((i: any) => i.name)
        .join(", ")
        .slice(0, 1900),
      weight: Math.max(
        500,
        o.items.reduce((s: number, i: any) => s + i.quantity * 300, 0),
      ),
      length: 30,
      width: 25,
      height: 8,
      insurance_value: Math.min(o.subtotal, 5000000),
      service_id: service.service_id,
      items: o.items.map((i: any) => ({
        name: i.name,
        code: i.sku,
        quantity: i.quantity,
        price: i.price,
        weight: 300,
      })),
    });
    return { trackingCode: r.order_code, status: "CREATED" };
  }
  async cancel(code: string) {
    return this.call("v2/switch-status/cancel", { order_codes: [code] });
  }
}
export const shipping = (): ShippingProvider =>
  env.SHIPPING_PROVIDER === "mock"
    ? new MockShippingProvider()
    : env.SHIPPING_PROVIDER === "ghn"
      ? new GhnProvider()
      : fail("PROVIDER_NOT_CONFIGURED", "Vận chuyển chưa được cấu hình.", 503);
