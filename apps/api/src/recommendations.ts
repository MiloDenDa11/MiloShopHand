import { Controller, Get, Query, Req, UseGuards, Inject } from "@nestjs/common";
import { ApiTags, ApiCookieAuth } from "@nestjs/swagger";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { Db, AuthGuard, AppRequest, parse } from "./core";
import { publicProduct, loadPublicProducts } from "./catalog";
@ApiTags("me")
@ApiCookieAuth()
@UseGuards(AuthGuard)
@Controller("me")
export class RecommendationsController {
  constructor(@Inject(Db) private db: Db) {}
  @Get("recommendations") async recommend(
    @Req() r: AppRequest,
    @Query() query: any,
  ) {
    const q = parse(
      z.object({ recent: z.string().max(1500).default("") }),
      query,
    );
    const user = await this.db.user.findUniqueOrThrow({
      where: { id: r.actor!.id },
      select: { preferences: true },
    });
    const bought = await this.db.orderItem.findMany({
      where: {
        order: {
          userId: r.actor!.id,
          status: { in: ["DELIVERED", "COMPLETED"] },
        },
      },
      select: {
        variant: {
          select: {
            product: { select: { styles: { select: { slug: true } } } },
          },
        },
      },
      take: 100,
    });
    const viewed = await this.db.product.findMany({
      where: { slug: { in: q.recent.split(",").slice(0, 12) } },
      select: { styles: { select: { slug: true } } },
    });
    const weights = new Map<string, number>();
    for (const s of user.preferences) weights.set(s, 6);
    for (const i of bought)
      for (const s of i.variant.product.styles)
        weights.set(s.slug, (weights.get(s.slug) || 0) + 3);
    for (const i of viewed)
      for (const s of i.styles)
        weights.set(s.slug, (weights.get(s.slug) || 0) + 2);
    const weightTable = weights.size
      ? Prisma.sql`(VALUES ${Prisma.join([...weights].map(([slug, weight]) => Prisma.sql`(${slug},${weight}::int)`))})`
      : Prisma.sql`(SELECT NULL::text,0::int)`;
    // Rank IDs in PostgreSQL; only hydrate the four recommendations. Previously
    // each request loaded images, variants and stock for up to 500 products.
    const scored = await this.db.$queryRaw<{ id: string; score: bigint }[]>(Prisma.sql`
      SELECT p.id,COALESCE(SUM(w.weight),0) AS score FROM "Product" p
      LEFT JOIN "_ProductToStyleTag" ps ON ps."A"=p.id
      LEFT JOIN "StyleTag" s ON s.id=ps."B"
      LEFT JOIN ${weightTable} AS w(slug,weight) ON w.slug=s.slug
      WHERE p.active=true GROUP BY p.id
      ORDER BY score DESC,p."createdAt" DESC,p.id ASC LIMIT 4
    `);
    const products = await loadPublicProducts(this.db, scored.map((row) => row.id));
    const byId = new Map(products.map((p) => [p.id, p]));
    return {
      items: scored.flatMap(({ id, score }) => {
        const p = byId.get(id);
        if (!p) return [];
        return [{
        ...publicProduct(p),
        reason: Number(score)
          ? `Tag ${p.styles
              .filter((s: { slug: string }) => weights.has(s.slug))
              .map((s: { name: string }) => s.name)
              .join(", ")} trùng sở thích, sản phẩm đã xem hoặc đã mua.`
          : "Thiết kế mới nhất khi chưa có đủ tín hiệu sở thích.",
        }];
      }),
      rules:
        "Sở thích tự chọn +6, tag từ đơn đã giao +3, tag từ sản phẩm vừa xem +2. Không dùng dữ liệu ngoài cửa hàng.",
    };
  }
}
