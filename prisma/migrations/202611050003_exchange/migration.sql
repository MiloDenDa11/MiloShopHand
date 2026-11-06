-- DropIndex
DROP INDEX "product_search_trgm";

-- CreateTable
CREATE TABLE "Exchange" (
    "id" TEXT NOT NULL,
    "returnItemId" TEXT NOT NULL,
    "inventoryId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "priceDifference" INTEGER NOT NULL,
    "shippingFee" INTEGER NOT NULL,
    "due" INTEGER NOT NULL,
    "refundDue" INTEGER NOT NULL,
    "received" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'OFFERED',
    "trackingCode" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "history" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Exchange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExchangeReceipt" (
    "id" TEXT NOT NULL,
    "exchangeId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "evidence" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExchangeReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Exchange_returnItemId_key" ON "Exchange"("returnItemId");

-- CreateIndex
CREATE UNIQUE INDEX "Exchange_trackingCode_key" ON "Exchange"("trackingCode");

-- CreateIndex
CREATE INDEX "Exchange_status_expiresAt_idx" ON "Exchange"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeReceipt_reference_key" ON "ExchangeReceipt"("reference");

-- AddForeignKey
ALTER TABLE "Exchange" ADD CONSTRAINT "Exchange_returnItemId_fkey" FOREIGN KEY ("returnItemId") REFERENCES "ReturnItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exchange" ADD CONSTRAINT "Exchange_inventoryId_fkey" FOREIGN KEY ("inventoryId") REFERENCES "Inventory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeReceipt" ADD CONSTRAINT "ExchangeReceipt_exchangeId_fkey" FOREIGN KEY ("exchangeId") REFERENCES "Exchange"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Exchange" ADD CONSTRAINT exchange_amounts CHECK(quantity>0 AND "shippingFee">=0 AND due>=0 AND "refundDue">=0 AND received>=0 AND received<=due AND due-"refundDue"="priceDifference"+"shippingFee"); ALTER TABLE "ExchangeReceipt" ADD CONSTRAINT exchange_receipt_amount CHECK(amount>0);
