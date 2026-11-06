-- Custom GIN indexes must be preserved when future Prisma diffs are reviewed.
CREATE INDEX IF NOT EXISTS product_search_trgm ON "Product" USING GIN("searchText" gin_trgm_ops);
