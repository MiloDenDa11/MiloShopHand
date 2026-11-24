-- Additive only. Existing orders are unassigned and existing MFA remains opt-out.
ALTER TABLE "MFA" ADD COLUMN "enabledAt" TIMESTAMP(3);
CREATE TABLE "OrderAssignment" (
  "orderId" TEXT NOT NULL,
  "assigneeId" TEXT,
  "assignedAt" TIMESTAMP(3),
  "revision" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrderAssignment_pkey" PRIMARY KEY ("orderId"),
  CONSTRAINT "OrderAssignment_revision_check" CHECK ("revision" >= 0),
  CONSTRAINT "OrderAssignment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "OrderAssignment_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "OrderAssignment_assigneeId_assignedAt_idx" ON "OrderAssignment"("assigneeId", "assignedAt");
