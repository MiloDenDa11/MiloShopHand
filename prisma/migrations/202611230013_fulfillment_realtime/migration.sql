-- Add packing verification state without rewriting existing orders or inventory.
CREATE TABLE "OrderPacking" (
  "orderId" TEXT NOT NULL PRIMARY KEY,
  "fingerprint" TEXT NOT NULL,
  "checked" JSONB NOT NULL DEFAULT '{}',
  "revision" INTEGER NOT NULL DEFAULT 0 CHECK ("revision" >= 0),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrderPacking_checked_object" CHECK (jsonb_typeof("checked") = 'object'),
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "PackingScan" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "orderId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "action" TEXT NOT NULL CHECK ("action" IN ('SCAN','UNDO','RESET')),
  "sku" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("orderId") REFERENCES "OrderPacking"("orderId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PackingScan_orderId_requestId_key" ON "PackingScan"("orderId", "requestId");
CREATE INDEX "PackingScan_orderId_createdAt_idx" ON "PackingScan"("orderId", "createdAt");

-- Only routing identifiers, never buyer details, prices, tokens or message bodies.
-- PostgreSQL delivers NOTIFY after commit; rollback produces no event.
CREATE FUNCTION milo_realtime_changed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'Notification' THEN
    PERFORM pg_notify('milo_realtime_v1', json_build_object('kind','notifications','userId',NEW."userId")::text);
  ELSIF TG_TABLE_NAME = 'Order' THEN
    PERFORM pg_notify('milo_realtime_v1', json_build_object('kind','orders','userId',NEW."userId",'orderId',NEW.id)::text);
  ELSIF TG_TABLE_NAME IN ('Shipment', 'Payment') THEN
    PERFORM pg_notify('milo_realtime_v1', json_build_object('kind','orders','userId',(SELECT "userId" FROM "Order" WHERE id=NEW."orderId"),'orderId',NEW."orderId")::text);
  ELSE
    PERFORM pg_notify('milo_realtime_v1', json_build_object('kind','seller','orderId',NEW."orderId")::text);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER milo_notification_changed AFTER INSERT OR UPDATE ON "Notification" FOR EACH ROW EXECUTE FUNCTION milo_realtime_changed();
CREATE TRIGGER milo_order_changed AFTER INSERT OR UPDATE ON "Order" FOR EACH ROW EXECUTE FUNCTION milo_realtime_changed();
CREATE TRIGGER milo_assignment_changed AFTER INSERT OR UPDATE ON "OrderAssignment" FOR EACH ROW EXECUTE FUNCTION milo_realtime_changed();
CREATE TRIGGER milo_packing_changed AFTER INSERT OR UPDATE ON "OrderPacking" FOR EACH ROW EXECUTE FUNCTION milo_realtime_changed();
CREATE TRIGGER milo_shipment_changed AFTER INSERT OR UPDATE ON "Shipment" FOR EACH ROW EXECUTE FUNCTION milo_realtime_changed();
CREATE TRIGGER milo_payment_changed AFTER INSERT OR UPDATE ON "Payment" FOR EACH ROW EXECUTE FUNCTION milo_realtime_changed();
