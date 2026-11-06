CREATE INDEX IF NOT EXISTS product_search_trgm ON "Product" USING GIN("searchText" gin_trgm_ops);
ALTER TABLE "Exchange" ADD CONSTRAINT exchange_states CHECK(status IN ('OFFERED','ACCEPTED','SHIPPED','DELIVERED','CANCELLED'));
