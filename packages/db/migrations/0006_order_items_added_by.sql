-- Adds origin tracking to order_items so vendor UI can distinguish hospital-requested
-- items from vendor-added items on the encounter page.
ALTER TABLE order_items ADD COLUMN added_by TEXT NOT NULL DEFAULT 'HOSPITAL'
  CHECK (added_by IN ('HOSPITAL','VENDOR'));
CREATE INDEX IF NOT EXISTS order_items_added_by_idx ON order_items(added_by);
