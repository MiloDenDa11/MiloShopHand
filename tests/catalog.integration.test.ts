import "dotenv/config";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { CommerceService } from "../apps/api/src/commerce";
import { AdminController } from "../apps/api/src/admin";
import { CatalogCache } from "../apps/api/src/cache";
import { RecommendationsController } from "../apps/api/src/recommendations";

const db = new PrismaClient();
const commerce = new CommerceService(db as any);
const prefix = `catalog-${Date.now()}-${randomUUID().slice(0, 8)}`;
const base = process.env.TEST_API_URL || "http://localhost:4001/api/v1";
const fixtures: any[] = [];
let category: any, collection: any, style: any, actor: any;
const cache = new CatalogCache();

async function get(route: string) {
  const response = await fetch(base + route);
  assert.equal(response.status, 200, `${route}: ${await response.clone().text()}`);
  return response.json() as Promise<any>;
}
const query = (values: Record<string, string | number>) => "/products?" + new URLSearchParams({ category: category.slug, ...Object.fromEntries(Object.entries(values).map(([key, value]) => [key, String(value)])) });

before(async () => {
  if (!new URL(process.env.DATABASE_URL || "").pathname.endsWith("_test") || process.env.NODE_ENV === "production") {
    throw new Error("Catalog integration fixtures require an isolated _test database.");
  }
  category = await db.category.create({ data: { name: prefix, slug: prefix } });
  collection = await db.collection.create({ data: { name: prefix, slug: prefix, season: "Thu đông", climate: "Se lạnh", campaign: "Test only" } });
  style = await db.styleTag.create({ data: { name: prefix, slug: prefix } });
  actor = await db.user.create({ data: { email: `${prefix}@example.test`, name: "Catalog integration", passwordHash: "integration-only-not-a-login-hash", verifiedAt: new Date(), role: "ADMIN" } });
  for (let index = 0; index < 4; index++) {
    fixtures.push(await db.product.create({
      data: {
        slug: `${prefix}-${index}`, name: `${prefix} ${index}`, description: "Isolated catalog integration fixture",
        searchText: `${prefix} ao phong cotton`, material: "Cotton", fit: "Relaxed fit", care: "Test only",
        price: index === 0 ? 100000 : 200000, cost: 10000, active: index < 3, categoryId: category.id,
        createdAt: new Date(Date.UTC(2026, 0, 1 + index)),
        collections: { connect: { id: collection.id } }, styles: { connect: { id: style.id } },
        images: { create: { url: "/products/everyday-essential-tee-0.svg", alt: "Catalog integration fixture", view: "front", crop: null } },
        variants: { create: [
          { sku: `${prefix}-${index}-m`, color: "Đen", colorHex: "#202020", size: "M", inventories: { create: { warehouse: "MAIN", onHand: 20 } } },
          { sku: `${prefix}-${index}-s`, color: "Kem", colorHex: "#eeeecc", size: "S", inventories: { create: { warehouse: "MAIN", onHand: index === 0 ? 0 : 20 } } },
          { sku: `${prefix}-${index}-inactive`, color: "Đỏ", colorHex: "#aa0000", size: "L", active: false, inventories: { create: { warehouse: "MAIN", onHand: 100 } } },
        ] },
      },
      include: { variants: { include: { inventories: true } } },
    }));
  }
  await cache.onModuleInit();
});

after(async () => {
  cache.onModuleDestroy();
  await db.$disconnect();
});

test("catalog pages have stable ordering, bounded public data and matching combined filters", async () => {
  const first = await get(query({ limit: 2 }));
  const second = await get(query({ limit: 2, page: 2 }));
  assert.equal(first.total, 3);
  assert.equal(first.pages, 2);
  assert.deepEqual(first.items.map((p: any) => p.id), [fixtures[2].id, fixtures[1].id]);
  assert.deepEqual(second.items.map((p: any) => p.id), [fixtures[0].id]);
  assert.equal(new Set([...first.items, ...second.items].map((p: any) => p.id)).size, 3);
  assert.equal(first.items[0].cost, undefined);
  assert.equal(first.items[0].searchText, undefined);
  assert.equal(first.items[0].variants.length, 2);
  assert.equal(first.items[0].variants[0].inventories, undefined);
  assert.equal(first.items[0].images[0].view, "front");
  const combined = await get(query({ q: "áo phông", collection: collection.slug, style: style.slug, season: "Thu đông", material: "cotton", fit: "Relaxed fit", size: "S", color: "Kem", stock: "true", min: 150000, max: 200000 }));
  assert.deepEqual(new Set(combined.items.map((p: any) => p.id)), new Set([fixtures[1].id, fixtures[2].id]));
  assert.equal((await get(query({ q: "%' OR true --" }))).total, 0);
  assert.equal((await get(query({ size: "L", color: "Đỏ", stock: "true" }))).total, 0);
});

test("bestseller/rating pagination uses aggregate scores and ignores pending orders or hidden reviews", async () => {
  const address = { recipient: "Catalog Test", phone: "0901234567", text: "123 Test Street, Thành phố Hồ Chí Minh", detail: "Test", instructions: "", confirmed: true, isDefault: false };
  for (const [index, quantity, status] of [[0, 2, "DELIVERED"], [1, 5, "COMPLETED"], [2, 8, "PENDING_CONFIRMATION"]] as const) {
    const variant = fixtures[index].variants.find((v: any) => v.size === "M");
    const order: any = await commerce.checkout(actor, { items: [{ variantId: variant.id, quantity }], address, method: "COD" }, `${prefix}-${randomUUID()}`);
    if (status !== "PENDING_CONFIRMATION") await db.order.update({ where: { id: order.id }, data: { status } });
    if (index < 2) await db.review.create({ data: { orderItemId: order.items[0].id, rating: index === 0 ? 5 : 1, content: "Catalog integration only" } });
  }
  const hiddenOrder: any = await commerce.checkout(actor, { items: [{ variantId: fixtures[1].variants.find((v: any) => v.size === "S").id, quantity: 1 }], address, method: "COD" }, `${prefix}-${randomUUID()}`);
  await db.order.update({ where: { id: hiddenOrder.id }, data: { status: "DELIVERED" } });
  await db.review.create({ data: { orderItemId: hiddenOrder.items[0].id, rating: 5, visible: false, content: "Hidden catalog integration review" } });
  assert.deepEqual((await get(query({ sort: "bestseller", limit: 1 }))).items.map((p: any) => p.id), [fixtures[1].id]);
  assert.deepEqual((await get(query({ sort: "bestseller", limit: 1, page: 2 }))).items.map((p: any) => p.id), [fixtures[0].id]);
  assert.deepEqual((await get(query({ sort: "rating", limit: 1 }))).items.map((p: any) => p.id), [fixtures[0].id]);
  assert.deepEqual((await get(query({ sort: "rating", limit: 1, page: 2 }))).items.map((p: any) => p.id), [fixtures[1].id]);
  assert.equal((await get(query({ sort: "rating", page: 5, limit: 1 }))).items.length, 0);
});

test("list and detail immediately reflect changed price and stock without waiting for cache expiry", async () => {
  const product = fixtures[1];
  const variant = product.variants.find((v: any) => v.size === "M");
  const before = await get(`/products/${product.slug}`);
  assert(before.variants.find((v: any) => v.id === variant.id).available > 0);
  const inventory = await db.inventory.findUniqueOrThrow({ where: { id: variant.inventories[0].id } });
  await db.$transaction([
    db.product.update({ where: { id: product.id }, data: { price: 215000 } }),
    db.inventory.update({ where: { id: inventory.id }, data: { onHand: inventory.reserved } }),
  ]);
  const detail = await get(`/products/${product.slug}`);
  assert.equal(detail.price, 215000);
  assert.equal(detail.variants.find((v: any) => v.id === variant.id).available, 0);
  const list = await get(query({ size: "M", color: "Đen", stock: "true" }));
  assert.equal(list.items.some((p: any) => p.id === product.id), false);
  assert.equal((await get(query({ q: prefix, min: 215000 }))).items[0].price, 215000);
});

test("recommendations rank preferences/purchases/recent views and support an empty signal set", async () => {
  await db.user.update({ where: { id: actor.id }, data: { preferences: [style.slug] } });
  const controller = new RecommendationsController(db as any);
  const personalized = await controller.recommend({ actor } as any, { recent: fixtures[0].slug });
  assert.equal(personalized.items.length, 4);
  assert.deepEqual(new Set(personalized.items.slice(0, 3).map((p: any) => p.id)), new Set(fixtures.slice(0, 3).map((p) => p.id)));
  assert(personalized.items[0].reason.includes(style.name));
  assert.equal(personalized.items.some((p: any) => p.id === fixtures[3].id), false);
  assert.equal(personalized.items[0].cost, undefined);
  const guest = await db.user.create({ data: { email: `${prefix}-empty@example.test`, name: "No recommendation signals", passwordHash: "integration-only-not-a-login-hash" } });
  const fallback = await controller.recommend({ actor: guest } as any, {});
  assert.equal(fallback.items.length, 4);
  assert(fallback.items.every((p: any) => p.reason.includes("chưa có đủ tín hiệu")));
});

test("admin metadata changes invalidate taxonomy across API processes", async () => {
  const admin = new AdminController(db as any, commerce, cache);
  await get("/catalog");
  const name = `${prefix} updated`;
  await admin.saveData("categories", { id: category.id, slug: category.slug, name }, { actor } as any);
  const taxonomy = await get("/catalog");
  assert.equal(taxonomy.categories.find((c: any) => c.id === category.id).name, name);
  await admin.removeMetadata("collections", collection.id, { actor } as any);
  assert.equal((await get("/catalog")).collections.some((c: any) => c.id === collection.id), false);
});

test("an in-flight old taxonomy loader cannot overwrite a newer cache revision", async () => {
  const key = "integration-cache-race";
  let release!: () => void, started!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const loading = new Promise<void>((resolve) => { started = resolve; });
  await cache.invalidate(key);
  const old = cache.get(key, async () => { started(); await gate; return { version: "old" }; });
  await loading;
  await cache.invalidate(key);
  assert.deepEqual(await cache.get(key, async () => ({ version: "new" })), { version: "new" });
  release();
  await old;
  assert.deepEqual(await cache.get(key, async () => { throw new Error("New revision should remain cached"); }), { version: "new" });
});
