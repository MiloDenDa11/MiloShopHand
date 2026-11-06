import { Controller, Get, Query, Param, Inject } from "@nestjs/common";
import { ApiTags, ApiQuery, ApiOperation } from "@nestjs/swagger";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { Db, parse, fail, env } from "./core";
import { CatalogCache } from "./cache";
import { fold } from "../../../packages/shared/src";
export const publicProduct = (p: any) => ({
  id: p.id,
  slug: p.slug,
  name: p.name,
  description: p.description,
  price: p.price,
  originalPrice: p.originalPrice,
  material: p.material,
  fit: p.fit,
  care: p.care,
  category: p.category,
  collections: p.collections,
  styles: p.styles,
  images: p.images,
  featured: p.featured,
  createdAt: p.createdAt,
  design: p.design ?? null,
  variants: p.variants
    ?.filter((v: any) => v.active)
    .map((v: any) => ({
      id: v.id,
      sku: v.sku,
      color: v.color,
      colorHex: v.colorHex,
      size: v.size,
      price: v.price ?? p.price,
      available: v.inventories.reduce(
        (s: number, i: any) => s + i.onHand - i.reserved,
        0,
      ),
    })),
});
// One PostgreSQL round trip for the bounded page, instead of one Prisma query
// for each relation. Only public fields and current inventory are hydrated.
async function readPublicProducts(db: Db, filter: Prisma.Sql): Promise<any[]> {
  return db.$queryRaw<any[]>(Prisma.sql`
    SELECT p.id,p.slug,p.name,p.description,p.price,p."originalPrice",p.material,p.fit,p.care,
      p.featured,p."createdAt",p."categoryId",p.design,
      to_jsonb(category) AS category,
      COALESCE((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.slug)
        FROM "_CollectionToProduct" cp JOIN "Collection" c ON c.id=cp."A"
        WHERE cp."B"=p.id),'[]'::jsonb) AS collections,
      COALESCE((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.slug)
        FROM "_ProductToStyleTag" ps JOIN "StyleTag" s ON s.id=ps."B"
        WHERE ps."A"=p.id),'[]'::jsonb) AS styles,
      COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'id',i.id,'url',i.url,'alt',i.alt,'color',i.color,'position',i.position,'view',i.view,'crop',i.crop
        ) ORDER BY i.position,i.id) FROM "ProductImage" i WHERE i."productId"=p.id),'[]'::jsonb) AS images,
      COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'id',v.id,'sku',v.sku,'color',v.color,'colorHex',v."colorHex",'size',v.size,'price',v.price,'active',v.active,
          'inventories',COALESCE((SELECT jsonb_agg(jsonb_build_object('onHand',i."onHand",'reserved',i.reserved))
            FROM "Inventory" i WHERE i."variantId"=v.id),'[]'::jsonb)
        ) ORDER BY v.id) FROM "ProductVariant" v WHERE v."productId"=p.id AND v.active=true),'[]'::jsonb) AS variants
    FROM "Product" p JOIN "Category" category ON category.id=p."categoryId"
    WHERE p.active=true AND ${filter}
  `);
}

export async function loadPublicProducts(db: Db, ids: string[]): Promise<any[]> {
  if (!ids.length) return [];
  if (ids.length > 48) throw new Error("Public product hydration is limited to one page.");
  return readPublicProducts(db, Prisma.sql`p.id IN (${Prisma.join(ids)})`);
}

const listSchema = z.object({
  q: z.string().max(100).optional(),
  category: z.string().optional(),
  collection: z.string().optional(),
  style: z.string().optional(),
  size: z.string().optional(),
  color: z.string().optional(),
  season: z.string().optional(),
  material: z.string().optional(),
  fit: z.string().optional(),
  min: z.coerce.number().int().nonnegative().optional(),
  max: z.coerce.number().int().nonnegative().optional(),
  stock: z.enum(["true", "false"]).optional(),
  sort: z.enum(["newest", "price-asc", "price-desc", "bestseller", "rating"]).default("newest"),
  page: z.coerce.number().int().min(1).max(100).default(1),
  limit: z.coerce.number().int().min(1).max(48).default(12),
});

const contains = (value: string) => `%${value.replace(/[\\%_]/g, "\\$&")}%`;
function productFilters(q: z.output<typeof listSchema>) {
  const filters: Prisma.Sql[] = [Prisma.sql`p.active=true`];
  for (const word of fold(q.q || "").split(/\s+/).filter(Boolean))
    filters.push(Prisma.sql`p."searchText" LIKE ${contains(word)}`);
  if (q.category)
    filters.push(Prisma.sql`EXISTS (SELECT 1 FROM "Category" c WHERE c.id=p."categoryId" AND c.slug=${q.category})`);
  if (q.collection || q.season) {
    const collectionFilters = [Prisma.sql`cp."B"=p.id`];
    if (q.collection) collectionFilters.push(Prisma.sql`c.slug=${q.collection}`);
    if (q.season) collectionFilters.push(Prisma.sql`c.season=${q.season}`);
    filters.push(Prisma.sql`EXISTS (SELECT 1 FROM "_CollectionToProduct" cp JOIN "Collection" c ON c.id=cp."A" WHERE ${Prisma.join(collectionFilters, " AND ")})`);
  }
  if (q.style)
    filters.push(Prisma.sql`EXISTS (SELECT 1 FROM "_ProductToStyleTag" ps JOIN "StyleTag" s ON s.id=ps."B" WHERE ps."A"=p.id AND s.slug=${q.style})`);
  if (q.material) filters.push(Prisma.sql`p.material ILIKE ${contains(q.material)}`);
  if (q.fit) filters.push(Prisma.sql`p.fit=${q.fit}`);
  if (q.min !== undefined) filters.push(Prisma.sql`p.price>=${q.min}`);
  if (q.max !== undefined) filters.push(Prisma.sql`p.price<=${q.max}`);
  if (q.size || q.color || q.stock === "true") {
    const variantFilters = [Prisma.sql`v."productId"=p.id`, Prisma.sql`v.active=true`];
    if (q.size) variantFilters.push(Prisma.sql`v.size=${q.size}`);
    if (q.color) variantFilters.push(Prisma.sql`v.color=${q.color}`);
    if (q.stock === "true")
      variantFilters.push(Prisma.sql`EXISTS (SELECT 1 FROM "Inventory" i WHERE i."variantId"=v.id AND i."onHand">i.reserved)`);
    filters.push(Prisma.sql`EXISTS (SELECT 1 FROM "ProductVariant" v WHERE ${Prisma.join(variantFilters, " AND ")})`);
  }
  return Prisma.join(filters, " AND ");
}
@ApiTags("products")
@Controller()
export class CatalogController {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(CatalogCache) private cache: CatalogCache,
  ) {}
  @Get("config") async config() {
    const setting = await this.db.storeSetting.findUnique({
      where: { key: "public" },
    });
    return {
      brand: env.BRAND_NAME || "MILOSHOPHAND",
      paymentMode: env.PAYMENT_PROVIDER,
      shippingMode: env.SHIPPING_PROVIDER,
      flatShipping: Number(env.SHIPPING_FLAT_VND || 30000),
      freeShippingMin: Number(env.FREE_SHIPPING_MIN_VND || 699000),
      returnDays: Number(env.RETURN_DAYS || 14),
      ...(setting?.value as any),
    };
  }
  @Get("catalog") async catalog() {
    return this.cache.get("taxonomy", async () => {
      const [categories, collections, styles] = await Promise.all([
        this.db.category.findMany(),
        this.db.collection.findMany({ where: { active: true } }),
        this.db.styleTag.findMany(),
      ]);
      return { categories, collections, styles };
    });
  }
  @ApiOperation({
    summary:
      "Catalog: recherche tiếng Việt có/không dấu, filter kết hợp, page ≤100, limit ≤48",
  })
  @ApiQuery({ name: "q", required: false })
  @ApiQuery({ name: "category", required: false })
  @ApiQuery({
    name: "sort",
    required: false,
    enum: ["newest", "price-asc", "price-desc", "bestseller", "rating"],
  })
  @Get("products")
  async list(@Query() query: any) {
    const q = parse(listSchema, query);
    const filters = productFilters(q);
    const ranking = q.sort === "bestseller"
      ? Prisma.sql`LEFT JOIN (SELECT oi."productId", SUM(oi.quantity) AS score FROM "OrderItem" oi JOIN "Order" o ON o.id=oi."orderId" WHERE o.status IN ('DELIVERED','COMPLETED') GROUP BY oi."productId") ranking ON ranking."productId"=p.id`
      : q.sort === "rating"
        ? Prisma.sql`LEFT JOIN (SELECT oi."productId", AVG(r.rating) AS score FROM "Review" r JOIN "OrderItem" oi ON oi.id=r."orderItemId" WHERE r.visible=true GROUP BY oi."productId") ranking ON ranking."productId"=p.id`
        : Prisma.empty;
    const order = q.sort === "price-asc" ? Prisma.sql`p.price ASC`
      : q.sort === "price-desc" ? Prisma.sql`p.price DESC`
        : ["bestseller", "rating"].includes(q.sort) ? Prisma.sql`COALESCE(ranking.score,0) DESC`
          : Prisma.sql`p."createdAt" DESC`;
    // PostgreSQL sorts and pages IDs before loading relations. This stays bounded
    // by limit (48) even for bestseller/rating, rather than hydrating 1,000 items.
    const [counts, ids] = await Promise.all([
      this.db.$queryRaw<{ total: bigint }[]>(Prisma.sql`SELECT COUNT(*) AS total FROM "Product" p WHERE ${filters}`),
      this.db.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT p.id FROM "Product" p ${ranking} WHERE ${filters} ORDER BY ${order}, p."createdAt" DESC, p.id ASC LIMIT ${q.limit} OFFSET ${(q.page - 1) * q.limit}`),
    ]);
    const total = Number(counts[0].total);
    const rows = await loadPublicProducts(this.db, ids.map((row) => row.id));
    const byId = new Map(rows.map((row) => [row.id, row]));
    const all = ids.flatMap(({ id }) => byId.has(id) ? [byId.get(id)!] : []);
    return {
      items: all.map(publicProduct),
      total,
      page: q.page,
      limit: q.limit,
      pages: Math.ceil(total / q.limit),
    };
  }
  @Get("products/:slug") async detail(@Param("slug") slug: string) {
    const [p] = await readPublicProducts(this.db, Prisma.sql`p.slug=${slug}`);
    if (!p) fail("NOT_FOUND", "Sản phẩm không tồn tại hoặc đã ngừng bán.", 404);
    const [reviews, related] = await Promise.all([
      this.db.review.findMany({
        where: { visible: true, orderItem: { productId: p.id } },
        select: {
          id: true,
          rating: true,
          content: true,
          createdAt: true,
          orderItem: {
            select: {
              color: true,
              size: true,
              order: { select: { user: { select: { name: true } } } },
            },
          },
        },
        take: 50,
        orderBy: { createdAt: "desc" },
      }),
      this.db.product.findMany({
        where: {
          active: true,
          id: { not: p.id },
          OR: [
            { categoryId: p.categoryId },
            { styles: { some: { id: { in: p.styles.map((s: { id: string }) => s.id) } } } },
          ],
        },
        select: { id: true },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        take: 4,
      }),
    ]);
    const relatedProducts = await loadPublicProducts(this.db, related.map((row) => row.id));
    const relatedById = new Map(relatedProducts.map((row) => [row.id, row]));
    return {
      ...publicProduct(p),
      reviews: reviews.map((r) => ({
        id: r.id,
        rating: r.rating,
        content: r.content,
        createdAt: r.createdAt,
        name: r.orderItem.order.user.name,
        color: r.orderItem.color,
        size: r.orderItem.size,
      })),
      related: related.flatMap(({ id }) => relatedById.has(id) ? [publicProduct(relatedById.get(id))] : []),
      recommendationReason: "Cùng danh mục hoặc có tag phong cách tương đồng.",
    };
  }
}
