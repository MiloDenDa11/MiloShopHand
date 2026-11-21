import "dotenv/config";
import { Prisma, PrismaClient } from "@prisma/client";
import { readFileSync, existsSync } from "node:fs";
import { resolve, sep } from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";
import { fold } from "../packages/shared/src";
import { isPhotoSpin, type PhotoSpin } from "../apps/web/lib/photo-spin";
import { isDeepStrictEqual } from "node:util";

const root = resolve(__dirname, "..");
const publicRoot = resolve(root, "apps/web/public");
const hex = z.string().regex(/^#[a-f0-9]{6}$/);
const designsSchema = z.array(z.object({
  id: z.string().regex(/^ML-POLO-\d{2}$/), slug: z.string().regex(/^ml-polo-[a-z0-9-]+$/),
  name: z.string().min(5).max(150), description: z.string().min(10), detail: z.string().min(20),
  kind: z.literal("polo"), material: z.string().min(2), fit: z.string().min(2),
  assetStatus: z.literal("ready"), commercialStatus: z.literal("draft"),
  colors: z.array(z.object({ key: z.string(), name: z.string().min(2), hex, accentHex: hex.nullable(),
    image: z.string().regex(/^\/collection-ai\/polo-20261121\/ml-polo-[a-z0-9-]+\.png$/),
  })).length(4),
})).length(10);
const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const json = (file: string) => JSON.parse(readFileSync(resolve(root, file), "utf8"));

export function poloDraftPlan() {
  const designs = designsSchema.parse(json("apps/web/content/polo-designs.json"));
  // Internal estimates are deliberately outside web content/public metadata.
  const estimates = z.object({ status: z.literal("draft-estimate"), products: z.array(z.object({
    slug: z.string(), price: z.number().int().min(500000).max(600000), cost: z.number().int().min(200000).max(250000),
  })).length(10) }).parse(json("prisma/polo-pricing.json"));
  if (new Set(estimates.products.map(p => p.slug)).size !== 10) throw new Error("Duplicate polo pricing");
  if (new Set(designs.map(d => d.slug)).size !== 10 || new Set(designs.map(d => d.id)).size !== 10) throw new Error("Duplicate polo identity");
  const provenance = json("docs/polo-20261121/images.json");
  if (provenance.images?.length !== 40) throw new Error("All 40 reviewed colour plates are required");
  const paths = new Set<string>();
  const products = designs.map(design => {
    const pricing = estimates.products.find(p => p.slug === design.slug);
    if (!pricing) throw new Error(`Polo pricing missing: ${design.slug}`);
    if (new Set(design.colors.map(c => c.name)).size !== 4 || new Set(design.colors.map(c => c.hex)).size !== 4) throw new Error(`Duplicate polo colour: ${design.slug}`);
    const images = design.colors.flatMap((color, index) => {
      const file = resolve(publicRoot, color.image.slice(1));
      if (!file.startsWith(publicRoot + sep) || paths.has(file)) throw new Error("Invalid or reused polo image");
      paths.add(file);
      const record = provenance.images.find((image: any) => image.slug === design.slug && image.color.hex === color.hex);
      if (!record || record.original !== color.image || record.visualReview?.status !== "approved" || !existsSync(file) || digest(readFileSync(file)) !== record.sha256) throw new Error(`Unverified image: ${color.image}`);
      if (record.width !== 1536 || record.height !== 1024) throw new Error("Polo plate dimensions differ from the two-panel contract");
      return (["front", "back"] as const).map((view, side) => ({
        url: `${color.image}?v=${record.sha256.slice(0,12)}&view=${view}`,
        alt: `${design.name} — ${color.name}, ${view === "front" ? "mặt trước, logo ML ngực" : "mặt sau, ML sau gáy"} — Milo Design`,
        color: color.name, position: index * 2 + side, view, crop: view === "front" ? "left" : "right",
      }));
    });
    return { design, images, pricing };
  });
  return { products, summary: { designs: 10, colors: 40, productImages: 80, draftColorSKUs: 40, size: "Chưa chốt", productActive: false, variantActive: false, inventory: 0, priceRange: [500000,600000], costRange: [200000,250000], pricingStatus: "draft-estimate" } };
}

const poloSaleSchema = z.object({
  sizes: z.array(z.string().trim().toUpperCase().min(1).max(20).regex(/^[A-Z0-9]+(?:[ -][A-Z0-9]+)*$/)).min(1).max(10),
  stockPerColorSize: z.number().int().min(1).max(100000),
}).strict().superRefine((input, context) => {
  if (new Set(input.sizes.map(size => size.replaceAll(" ", "-"))).size !== input.sizes.length)
    context.addIssue({ code: "custom", path: ["sizes"], message: "Sale sizes must be distinct" });
  if (input.sizes.some(size => ["DRAFT","PREVIEW","PENDING"].includes(size)))
    context.addIssue({ code: "custom", path: ["sizes"], message: "A confirmed sale size is required" });
});

// No size or stock defaults: opening inventory must come from the merchant.
export function poloSalePlan(input: unknown) {
  const config = poloSaleSchema.parse(input);
  const draft = poloDraftPlan();
  const configHash = digest(Buffer.from(JSON.stringify({ sizes: [...config.sizes].sort(), stockPerColorSize: config.stockPerColorSize })));
  const products = draft.products.map(product => ({ ...product,
    variants: product.design.colors.flatMap(color => config.sizes.map(size => ({
      sku: `${product.design.id}-${color.hex.slice(1).toUpperCase()}-${size.replaceAll(" ", "-")}`,
      color: color.name, colorHex: color.hex, size,
    }))),
  }));
  return { config, configHash, products, summary: { products: 10, colors: 40, sizes: config.sizes,
    saleSKUs: products.reduce((sum, product) => sum + product.variants.length, 0),
    openingUnits: 40 * config.sizes.length * config.stockPerColorSize,
    stockPerColorSize: config.stockPerColorSize, existingPricesPreserved: true } };
}

export async function publishPoloSale(db: PrismaClient, input: unknown) {
  if (process.env.NODE_ENV === "production" || !["localhost","127.0.0.1","[::1]"].includes(new URL(process.env.DATABASE_URL || "").hostname))
    throw new Error("Polo sale publishing is local development only");
  const plan = poloSalePlan(input);
  const entries: {slug:string;spin:PhotoSpin}[] = json("apps/web/content/photo-spins.json");
  const approved = json("docs/photo-spin/approved.json");
  for (const {design} of plan.products) for (const color of design.colors) {
    const entry = entries.find(e => e.slug === design.slug && e.spin.colorHex === color.hex);
    if (!entry || !isPhotoSpin(entry.spin) || !approved.some((e:any) => e.slug === design.slug && e.colorHex === color.hex))
      throw new Error(`Reviewed polo spin missing: ${design.slug}/${color.hex}`);
    for (const atlas of entry.spin.atlases) {
      const url = new URL(atlas.src,"https://milo.local"), file = resolve(publicRoot,url.pathname.slice(1));
      if (!file.startsWith(publicRoot + sep) || !existsSync(file) || digest(readFileSync(file)).slice(0,12) !== url.searchParams.get("v"))
        throw new Error(`Stale polo spin asset: ${atlas.src}`);
    }
  }
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(76212026)`;
    const products = await tx.product.findMany({ where: { slug: { in: plan.products.map(p => p.design.slug) } }, include: { variants: { include: { inventories: true } } } });
    if (products.length !== 10 || products.some(p => (p.design as any)?.managedBy !== "milo-polo-v1"))
      throw new Error("Expected ten existing owned polo products");
    const pending = [];
    for (const product of products) {
      const design = product.design as any;
      const definition = plan.products.find(p => p.design.slug === product.slug)!;
      if (design.commercialStatus === "active") {
        const previous = await tx.auditLog.findFirst({ where: { action: "PRODUCT_SALE_PUBLISH", entity: "Product", entityId: product.id }, orderBy: { createdAt: "desc" } });
        if ((previous?.data as any)?.configHash !== plan.configHash) throw new Error(`Already launched with another size/stock configuration: ${product.slug}`);
        // A replay must preserve later merchant edits, orders and stock changes.
        continue;
      }
      if (!["draft","preview"].includes(design.commercialStatus) || product.variants.length !== 4)
        throw new Error(`Unexpected existing sale configuration: ${product.slug}`);
      if (product.variants.some(v => v.size !== "Chưa chốt" || !v.sku.endsWith("-DRAFT") ||
        !definition.design.colors.some(c => c.name === v.color && c.hex === v.colorHex) ||
        v.inventories.length !== 1 || v.inventories.some(i => i.warehouse !== "MAIN" || i.onHand !== 0 || i.reserved !== 0)))
        throw new Error(`Draft inventory changed; inspect before launching ${product.slug}`);
      if (product.price <= 0 || definition.design.colors.some(color => !isDeepStrictEqual(design.photoSpins?.[color.hex], entries.find(e => e.slug === product.slug && e.spin.colorHex === color.hex)?.spin)))
        throw new Error(`Price or integrated photo spins invalid: ${product.slug}`);
      pending.push({ product, definition });
    }
    const plannedSKUs = pending.flatMap(({definition}) => definition.variants.map(v => v.sku));
    if (plannedSKUs.length && await tx.productVariant.count({ where: { sku: { in: plannedSKUs } } }))
      throw new Error("A planned sale SKU already exists; no changes applied");
    let createdVariants = 0;
    for (const { product, definition } of pending) {
      await tx.productVariant.updateMany({ where: { productId: product.id }, data: { active: false } });
      for (const variant of definition.variants) {
        const created = await tx.productVariant.create({ data: { ...variant, productId: product.id, active: true,
          inventories: { create: { warehouse: "MAIN", onHand: plan.config.stockPerColorSize, reserved: 0 } },
        }, include: { inventories: true } });
        await tx.stockMovement.create({ data: { inventoryId: created.inventories[0].id,
          delta: plan.config.stockPerColorSize, kind: "ADJUSTMENT", onHandBefore: 0, onHandAfter: plan.config.stockPerColorSize,
          reference: `polo-sale-v1:${variant.sku}`, requestHash: plan.configHash,
          reason: "Khởi tạo tồn kho mở bán polo theo số lượng chủ cửa hàng xác nhận.",
        } });
        createdVariants++;
      }
      const design = { ...(product.design as any), commercialStatus: "active", pricingStatus: "published", pendingCommercialFields: [] };
      const description = product.description
        .replace("Bản nháp: giá dự kiến, chưa chốt size và tồn kho; chưa mở bán.", "")
        .replace("Mẫu trưng bày: giá dự kiến; size và tồn kho đang hoàn thiện, chưa nhận đặt hàng.", "").trim();
      await tx.product.update({ where: { id: product.id }, data: { active: true, design: design as Prisma.InputJsonValue, description } });
      await tx.auditLog.create({ data: { action: "PRODUCT_SALE_PUBLISH", entity: "Product", entityId: product.id,
        data: { source: "prisma/polo.ts", slug: product.slug, configHash: plan.configHash, sizes: plan.config.sizes,
          stockPerColorSize: plan.config.stockPerColorSize, createdVariants: definition.variants.length, retiredDraftVariants: 4, price: product.price },
      } });
    }
    return { ...plan.summary, changed: pending.length, preserved: products.length - pending.length,
      createdVariants, initializedStockUnits: createdVariants * plan.config.stockPerColorSize };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60000 });
}

export async function addPoloDrafts(db: PrismaClient) {
  if (process.env.NODE_ENV === "production") throw new Error("Polo concept import is local development only");
  const url = new URL(process.env.DATABASE_URL || "");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error("Refusing a non-local database");
  const plan = poloDraftPlan();
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(76212026)`;
    const existing = await tx.product.findMany({ where: { slug: { in: plan.products.map(p => p.design.slug) } } });
    if (existing.some(product => (product.design as any)?.managedBy !== "milo-polo-v1")) throw new Error("A polo slug is already owned by another product; no changes applied");
    // Never update existing products, prices, variant IDs, images or inventory on reruns.
    const missing = plan.products.filter(p => !existing.some(product => product.slug === p.design.slug));
    if (!missing.length) return { ...plan.summary, created: 0, preserved: existing.length };
    const category = await tx.category.upsert({ where: { slug: "ao-polo" }, update: {}, create: { slug: "ao-polo", name: "Áo polo" } });
    const collection = await tx.collection.upsert({ where: { slug: "milo-polo-studio-2026" }, update: {}, create: {
      slug: "milo-polo-studio-2026", name: "Milo Polo — The Quiet Gentleman", season: "Quanh năm", climate: "Lịch sự / Hằng ngày", campaign: "Polo Studio · ML embroidered", active: false,
    } });
    const style = await tx.styleTag.findUnique({ where: { slug: "minimal" } });
    for (const { design, images, pricing } of missing) {
      const product = await tx.product.create({ data: {
        slug: design.slug, name: design.name,
        description: `${design.description} Mẫu thiết kế MiloShopHand sử dụng logo ML. Hình ảnh và chất liệu là định hướng thiết kế AI, chưa phải ảnh chụp hay thông số hàng hóa thực tế. Bản nháp: giá dự kiến, chưa chốt size và tồn kho; chưa mở bán.`,
        searchText: fold([design.name, "Áo polo có cổ lịch sự trưởng thành MiloShopHand ML", design.description, design.material].join(" ")),
        material: `${design.material} (định hướng thiết kế)`, fit: design.fit,
        care: "Ưu tiên nhãn chăm sóc của sản phẩm thực tế; tránh là trực tiếp lên logo thêu.",
        price: pricing.price, cost: pricing.cost, active: false, featured: false, categoryId: category.id,
        collections: { connect: { id: collection.id } }, ...(style ? { styles: { connect: { id: style.id } } } : {}),
        design: { version: 1, managedBy: "milo-polo-v1", source: "ai", kind: "polo", mediaPresentation: "photo", renderedMedia: false,
          commercialStatus: "draft", pricingStatus: "draft-estimate", pendingCommercialFields: ["sizes","inventory"],
          photoReferenceColorHex: design.colors[0].hex, frontUrl: images[0].url, backUrl: images[1].url,
          colors: design.colors.map(c => ({ color: c.name, colorHex: c.hex, image: c.image })),
        } as Prisma.InputJsonValue,
        images: { create: images },
        variants: { create: design.colors.map(color => ({
          sku: `${design.id}-${color.hex.slice(1).toUpperCase()}-DRAFT`, color: color.name, colorHex: color.hex,
          size: "Chưa chốt", active: false, inventories: { create: { warehouse: "MAIN", onHand: 0, reserved: 0 } },
        })) },
      } });
      await tx.auditLog.create({ data: { action: "PRODUCT_DESIGN_DRAFT_CREATE", entity: "Product", entityId: product.id,
        data: { slug: design.slug, source: "prisma/polo.ts", colors: design.colors.length, status: "draft", active: false },
      } });
    }
    return { ...plan.summary, created: missing.length, preserved: existing.length };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
}

export async function publishPoloPreview(db: PrismaClient, requireSpins = false) {
  if (process.env.NODE_ENV === "production" || !["localhost","127.0.0.1","[::1]"].includes(new URL(process.env.DATABASE_URL || "").hostname)) throw new Error("Polo preview publishing is local development only");
  const plan = poloDraftPlan();
  const entries: {slug:string;spin:PhotoSpin}[] = json("apps/web/content/photo-spins.json");
  const reviewed = json("docs/photo-spin/approved.json");
  if (requireSpins) for (const {design} of plan.products) for (const color of design.colors) {
    const entry = entries.find(e=>e.slug===design.slug&&e.spin.colorHex.toLowerCase()===color.hex);
    if (!entry || !isPhotoSpin(entry.spin) || !reviewed.some((e:any)=>e.slug===design.slug&&e.colorHex===color.hex)) throw new Error(`Reviewed polo spin missing: ${design.slug}/${color.hex}`);
    for (const atlas of entry.spin.atlases) {
      const url = new URL(atlas.src,"https://milo.local");
      const file = resolve(publicRoot,url.pathname.slice(1));
      if (!file.startsWith(publicRoot+sep) || !existsSync(file) || digest(readFileSync(file)).slice(0,12)!==url.searchParams.get("v")) throw new Error(`Stale polo spin asset: ${atlas.src}`);
    }
  }
  return db.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(76212026)`;
    const products=await tx.product.findMany({where:{slug:{in:plan.products.map(p=>p.design.slug)}},include:{variants:{include:{inventories:true}},images:{orderBy:{position:"asc"}}}});
    if(products.length!==10||products.some(p=>(p.design as any)?.managedBy!=="milo-polo-v1"))throw new Error("Expected ten existing owned polo designs");
    let changed=0,variantsShown=0;
    for(const product of products){
      const current=product.design as any;
      if(current.commercialStatus==="active")throw new Error(`An active polo sale cannot be replaced by a preview: ${product.slug}`);
      const definition=plan.products.find(p=>p.design.slug===product.slug)!;
      const placeholderVariants=product.variants.filter(v=>v.size==="Chưa chốt"&&v.sku.endsWith("-DRAFT"));
      if(placeholderVariants.length!==4||placeholderVariants.some(v=>!definition.design.colors.some(c=>c.name===v.color&&c.hex===v.colorHex)||v.inventories.some(i=>i.onHand!==0||i.reserved!==0)))throw new Error(`Unexpected sample stock/colour configuration: ${product.slug}`);
      const photoSpins=requireSpins?Object.fromEntries(entries.filter(e=>e.slug===product.slug).map(e=>[e.spin.colorHex.toLowerCase(),e.spin])):current.photoSpins;
      const metadata={...current,commercialStatus:"preview",...(requireSpins?{photoSpins}:{})};
      const description=product.description.replace("Bản nháp: giá dự kiến, chưa chốt size và tồn kho; chưa mở bán.","Mẫu trưng bày: giá dự kiến; size và tồn kho đang hoàn thiện, chưa nhận đặt hàng.");
      const hidden=placeholderVariants.filter(v=>!v.active);
      if(!product.active||!isDeepStrictEqual(current,metadata)||description!==product.description||hidden.length){
        await tx.product.update({where:{id:product.id},data:{active:true,design:metadata as Prisma.InputJsonValue,description}});
        if(hidden.length)await tx.productVariant.updateMany({where:{id:{in:hidden.map(v=>v.id)}},data:{active:true}});
        await tx.auditLog.create({data:{action:requireSpins?"PRODUCT_SPIN_PUBLISH":"PRODUCT_DESIGN_PREVIEW_PUBLISH",entity:"Product",entityId:product.id,data:{slug:product.slug,colors:4,axis:requireSpins?"y":null,viewsPerColor:requireSpins?24:0,purchasable:false}}});
        changed++;variantsShown+=hidden.length;
      }
    }
    const collection=await tx.collection.findUniqueOrThrow({where:{slug:"milo-polo-studio-2026"}});
    const cover=plan.products[0].images[0].url;
    if(!collection.active||collection.image!==cover){
      await tx.collection.update({where:{id:collection.id},data:{active:true,image:cover}});
      await tx.auditLog.create({data:{action:"COLLECTION_PREVIEW_PUBLISH",entity:"Collection",entityId:collection.id,data:{slug:collection.slug,products:10}}});
    }
    return{products:10,colors:40,changed,variantsShown,visibleOnShop:true,purchasable:false,inventoryChanged:false,spins:requireSpins?40:"unchanged"};
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:30000});
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/prisma/polo.ts")) {
  const db = new PrismaClient();
  const run = async () => {
    if (process.argv.includes("--publish-sale") || process.argv.includes("--plan-sale")) {
      const index = process.argv.indexOf("--sale-config"), file = index >= 0 ? process.argv[index + 1] : undefined;
      if (!file) throw new Error("Provide --sale-config with explicitly confirmed sizes and opening stock");
      const input = json(file);
      console.log(JSON.stringify(process.argv.includes("--plan-sale") ? { mode: "read-only sale plan", ...poloSalePlan(input).summary } : await publishPoloSale(db,input)));
    }
    else if (process.argv.includes("--publish-preview")) console.log(JSON.stringify(await publishPoloPreview(db,process.argv.includes("--with-spins"))));
    else if (process.argv.includes("--apply")) console.log(JSON.stringify(await addPoloDrafts(db)));
    else console.log(JSON.stringify({ mode: "read-only plan", ...poloDraftPlan().summary }));
  };
  run().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.$disconnect());
}
