ALTER TABLE "StockMovement"
  ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'ADJUSTMENT',
  ADD COLUMN "onHandBefore" INTEGER,
  ADD COLUMN "onHandAfter" INTEGER,
  ADD COLUMN "requestHash" TEXT;

UPDATE "StockMovement" SET "kind" = CASE
  WHEN reference LIKE 'reserve:%' OR reference LIKE 'exchange-hold:%' THEN 'RESERVE'
  WHEN reference LIKE 'SHIPPED:%' THEN 'SALE'
  WHEN reference LIKE 'CANCELLED:%' THEN 'RELEASE'
  WHEN reference LIKE 'return:%' THEN 'RETURN'
  WHEN reference LIKE 'exchange-ship:%' THEN 'EXCHANGE'
  ELSE 'ADJUSTMENT' END;

-- Every existing writer updates Inventory before inserting its ledger entry in
-- the same transaction. Capture exact balances here, including orders/returns,
-- without changing their reservation or fulfilment rules. Historical balances
-- are deliberately left NULL: the old ledger did not capture them.
CREATE FUNCTION inventory_movement_snapshot() RETURNS trigger AS $$
BEGIN
  SELECT "onHand" INTO STRICT NEW."onHandAfter" FROM "Inventory" WHERE id = NEW."inventoryId";
  NEW."onHandBefore" := NEW."onHandAfter" - NEW.delta;
  IF NEW.kind = 'ADJUSTMENT' AND NEW."requestHash" IS NULL THEN
    NEW.kind := CASE
      WHEN NEW.reference LIKE 'reserve:%' OR NEW.reference LIKE 'exchange-hold:%' THEN 'RESERVE'
      WHEN NEW.reference LIKE 'SHIPPED:%' THEN 'SALE'
      WHEN NEW.reference LIKE 'CANCELLED:%' THEN 'RELEASE'
      WHEN NEW.reference LIKE 'return:%' THEN 'RETURN'
      WHEN NEW.reference LIKE 'exchange-ship:%' THEN 'EXCHANGE'
      ELSE 'ADJUSTMENT' END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER stock_movement_snapshot BEFORE INSERT ON "StockMovement"
  FOR EACH ROW EXECUTE FUNCTION inventory_movement_snapshot();
ALTER TABLE "StockMovement" ADD CONSTRAINT stock_movement_balances
  CHECK (("onHandBefore" IS NULL AND "onHandAfter" IS NULL) OR
    ("onHandBefore" IS NOT NULL AND "onHandAfter" IS NOT NULL AND
     "onHandBefore" >= 0 AND "onHandAfter" >= 0 AND "onHandAfter" - "onHandBefore" = delta));
ALTER TABLE "StockMovement" ADD CONSTRAINT stock_movement_kind
  CHECK (kind IN ('RECEIPT','ISSUE','ADJUSTMENT','SALE','RETURN','EXCHANGE','RESERVE','RELEASE'));
CREATE INDEX "StockMovement_createdAt_id_idx" ON "StockMovement"("createdAt", id);
