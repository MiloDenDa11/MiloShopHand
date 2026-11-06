import { Controller, Get, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { parse, fail, env } from "./core";
@ApiTags("shipping")
@Controller("shipping")
export class ShippingController {
  @Get("areas") async areas(@Query() query: any) {
    const q = parse(
      z.object({
        type: z.enum(["province", "district", "ward"]),
        parent: z.coerce.number().int().positive().optional(),
      }),
      query,
    );
    if (env.SHIPPING_PROVIDER !== "ghn" || !env.GHN_TOKEN)
      fail(
        "SHIPPING_UNCONFIGURED",
        "Danh mục khu vực chỉ khả dụng khi GHN được cấu hình.",
        503,
      );
    if (q.type !== "province" && !q.parent)
      fail("PARENT_REQUIRED", "Vui lòng chọn khu vực cấp trước.");
    const url = new URL(`${env.GHN_BASE_URL}/master-data/${q.type}`);
    if (q.type === "district")
      url.searchParams.set("province_id", String(q.parent));
    if (q.type === "ward")
      url.searchParams.set("district_id", String(q.parent));
    const res = await fetch(url, {
      headers: { Token: env.GHN_TOKEN },
      signal: AbortSignal.timeout(12000),
    });
    const b = (await res.json()) as any;
    if (!res.ok || b.code !== 200)
      fail(
        "ADDRESS_DATA_UNAVAILABLE",
        "Chưa lấy được danh mục mới nhất từ GHN. Vui lòng thử lại.",
        503,
      );
    return b.data;
  }
}
