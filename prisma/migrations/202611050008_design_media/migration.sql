-- Additive only: preserve product identifiers, order relations and inventory.
ALTER TABLE "Product" ADD COLUMN "design" JSONB;
ALTER TABLE "ProductImage" ADD COLUMN "view" TEXT;
ALTER TABLE "ProductImage" ADD COLUMN "crop" TEXT;
