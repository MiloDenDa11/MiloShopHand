ALTER TABLE "Refund" ADD COLUMN "goodsAmount" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "shippingAmount" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "taxAmount" INTEGER NOT NULL DEFAULT 0;
UPDATE "Refund" SET "goodsAmount"=amount;
ALTER TABLE "Refund" ADD CONSTRAINT refund_parts CHECK("goodsAmount">=0 AND "shippingAmount">=0 AND "taxAmount">=0 AND amount="goodsAmount"+"shippingAmount"+"taxAmount");
