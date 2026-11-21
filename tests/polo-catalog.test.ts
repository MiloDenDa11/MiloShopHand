import { test } from "node:test";
import assert from "node:assert/strict";
import { poloDraftPlan, poloSalePlan, addPoloDrafts, publishPoloSale } from "../prisma/polo";
import { isUnreleasedDesign } from "../apps/web/lib/product-preview";

test("preview colourways stay unreleased while sizes are placeholders; ordinary sold-out items keep normal handling", () => {
  assert.equal(isUnreleasedDesign({design:{commercialStatus:"preview"},variants:[{size:"Chưa chốt"}]}),true);
  assert.equal(isUnreleasedDesign({design:{commercialStatus:"preview"},variants:[]}),true);
  assert.equal(isUnreleasedDesign({variants:[{size:"M"}]}),false);
  assert.equal(isUnreleasedDesign({design:{commercialStatus:"draft"},variants:[{size:"Chưa chốt"}]}),false);
  assert.equal(isUnreleasedDesign({design:{commercialStatus:"preview"},variants:[{size:"Chưa chốt",active:false},{size:"M",active:true}]}),false);
});

test("polo import contains ten distinct designs and forty colour-specific front/back pairs", () => {
  const plan = poloDraftPlan();
  assert.equal(plan.products.length, 10);
  assert.equal(new Set(plan.products.map(p => p.design.detail)).size, 10);
  const nativeSources = new Set<string>();
  for (const product of plan.products) {
    assert.equal(product.design.colors.length, 4);
    assert.equal(product.images.length, 8);
    for (const color of product.design.colors) {
      nativeSources.add(color.image);
      const pair = product.images.filter(image => image.color === color.name);
      assert.deepEqual(pair.map(image => image.view), ["front", "back"]);
      assert.equal(new URL(pair[0].url, "https://milo.test").pathname, color.image);
      assert.equal(new URL(pair[1].url, "https://milo.test").pathname, color.image);
      assert(pair.every(image => /[?&]v=[a-f0-9]{12}/.test(image.url)));
    }
  }
  assert.equal(nativeSources.size, 40);
});

test("polo drafts retain disabled sales, zero stock and unconfirmed sizes", () => {
  const { summary } = poloDraftPlan();
  assert.equal(summary.productActive, false);
  assert.equal(summary.variantActive, false);
  assert.equal(summary.inventory, 0);
  assert.equal(summary.size, "Chưa chốt");
  assert.equal(summary.draftColorSKUs, 40);
});

test("polo estimates follow the approved ranges and costs stay outside public design metadata", () => {
  for (const product of poloDraftPlan().products) {
    assert(product.pricing.price >= 500000 && product.pricing.price <= 600000);
    assert(product.pricing.cost >= 200000 && product.pricing.cost <= 250000);
    assert.equal((product.design as any).cost, undefined);
    assert.equal((product.design as any).price, undefined);
  }
});

test("polo import refuses production before attempting a database transaction", async () => {
  const previous = process.env.NODE_ENV;
  let touched = false;
  try {
    process.env.NODE_ENV = "production";
    await assert.rejects(addPoloDrafts({ $transaction: async () => { touched = true; } } as any), /local development only/);
    assert.equal(touched, false);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous;
  }
});

test("polo import refuses a remote database before attempting a transaction", async () => {
  const previousMode = process.env.NODE_ENV, previousUrl = process.env.DATABASE_URL;
  let touched = false;
  try {
    process.env.NODE_ENV = "test";
    process.env.DATABASE_URL = "postgresql://example.invalid/milo_test";
    await assert.rejects(addPoloDrafts({ $transaction: async () => { touched = true; } } as any), /non-local database/);
    assert.equal(touched, false);
  } finally {
    if (previousMode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousMode;
    if (previousUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousUrl;
  }
});

test("polo sales require explicit real sizes and opening stock", () => {
  for(const input of [undefined,{}, {sizes:["M"]}, {stockPerColorSize:5}, {sizes:[],stockPerColorSize:5},
    {sizes:["Chưa chốt"],stockPerColorSize:5}, {sizes:["DRAFT"],stockPerColorSize:5},
    {sizes:["M"," m "],stockPerColorSize:5}, {sizes:["ONE SIZE","ONE-SIZE"],stockPerColorSize:5},
    {sizes:["M"],stockPerColorSize:0}, {sizes:["M"],stockPerColorSize:-1}, {sizes:["M"],stockPerColorSize:1.5}])
    assert.throws(()=>poloSalePlan(input));
});

test("sale plan covers every colour and size with unique SKUs; replay identity ignores size ordering", () => {
  const plan=poloSalePlan({sizes:[" s ","M","L","XL"],stockPerColorSize:5});
  assert.equal(plan.summary.saleSKUs,160);assert.equal(plan.summary.openingUnits,800);
  assert.equal(new Set(plan.products.flatMap(p=>p.variants.map(v=>v.sku))).size,160);
  for(const product of plan.products)for(const color of product.design.colors)
    assert.deepEqual(product.variants.filter(v=>v.color===color.name).map(v=>v.size),["S","M","L","XL"]);
  assert.equal(plan.configHash,poloSalePlan({sizes:["XL","L","M","S"],stockPerColorSize:5}).configHash);
  assert.notEqual(plan.configHash,poloSalePlan({sizes:["S","M","L","XL"],stockPerColorSize:6}).configHash);
});

test("sale publisher refuses production or remote databases before a transaction", async () => {
  const previousMode=process.env.NODE_ENV,previousUrl=process.env.DATABASE_URL;let touched=false;
  try{
    const db={$transaction:async()=>{touched=true;}} as any;
    process.env.NODE_ENV="production";process.env.DATABASE_URL="postgresql://localhost/milo";
    await assert.rejects(publishPoloSale(db,{sizes:["M"],stockPerColorSize:5}),/local development only/);
    process.env.NODE_ENV="test";process.env.DATABASE_URL="postgresql://example.invalid/milo";
    await assert.rejects(publishPoloSale(db,{sizes:["M"],stockPerColorSize:5}),/local development only/);
    assert.equal(touched,false);
  }finally{
    if(previousMode===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previousMode;
    if(previousUrl===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=previousUrl;
  }
});
