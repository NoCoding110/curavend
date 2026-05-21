-- 0018_procurement_backfill.sql
--
-- Phase A: Enterprise procurement backfill.
--   * 9 new tables (customer_purchase_orders, order_recurrence_plans,
--     order_shipments, order_contacts, sku_groups, integration_log,
--     notification_preferences, notification_delivery_log, unsubscribes)
--   * Targeted column extensions on orders (small — most lives on related tables),
--     vendor_item_skus, invoices, invoice_items, hospitals, vendors
--   * Indexes for cron scans, audit retrieval, tenant scoping
--   * Forward-compatible backfill of cents-based monetary fields
--
-- D1 enforces a 100-column-per-table SQLite limit, so shipping/tracking and
-- contact records live on separate 1:N tables (order_shipments, order_contacts)
-- which is also the more normalized enterprise design.

-- ═══════════════════════════════════════════════════════════════════════════
-- NEW TABLES
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. customer_purchase_orders ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_purchase_orders (
  id TEXT PRIMARY KEY,
  hospital_id TEXT NOT NULL,
  po_number TEXT NOT NULL,
  po_date TEXT NOT NULL,
  authorized_amount REAL,
  spent_amount REAL NOT NULL DEFAULT 0,
  expires_at TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN',
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS customer_po_hospital_po_uk
  ON customer_purchase_orders(hospital_id, po_number);
CREATE INDEX IF NOT EXISTS customer_po_hospital_idx
  ON customer_purchase_orders(hospital_id);
CREATE INDEX IF NOT EXISTS customer_po_status_idx
  ON customer_purchase_orders(status);

-- ── 2. order_recurrence_plans ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_recurrence_plans (
  id TEXT PRIMARY KEY,
  parent_order_id TEXT NOT NULL,
  hospital_id TEXT NOT NULL,
  vendor_id TEXT,
  frequency_unit TEXT NOT NULL,
  frequency_value INTEGER NOT NULL,
  anchor_day INTEGER,
  custom_cron_expression TEXT,
  start_date TEXT NOT NULL,
  end_date TEXT,
  total_occurrences INTEGER,
  skip_dates TEXT,
  lead_time_days INTEGER NOT NULL DEFAULT 3,
  require_reauth_every INTEGER,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  next_occurrence_date TEXT,
  occurrences_spawned INTEGER NOT NULL DEFAULT 0,
  paused_at TEXT,
  paused_by TEXT,
  paused_reason TEXT,
  pause_until TEXT,
  cancelled_at TEXT,
  cancelled_by TEXT,
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS recurrence_status_next_idx
  ON order_recurrence_plans(status, next_occurrence_date);
CREATE INDEX IF NOT EXISTS recurrence_parent_order_idx
  ON order_recurrence_plans(parent_order_id);
CREATE INDEX IF NOT EXISTS recurrence_hospital_idx
  ON order_recurrence_plans(hospital_id);
CREATE INDEX IF NOT EXISTS recurrence_vendor_idx
  ON order_recurrence_plans(vendor_id);

-- ── 3. order_shipments ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_shipments (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  shipment_sequence INTEGER NOT NULL DEFAULT 1,
  carrier_code TEXT,
  carrier_service_level TEXT,
  tracking_number TEXT,
  shipment_date TEXT,
  expected_delivery_date TEXT,
  actual_delivery_date TEXT,
  signature_required INTEGER DEFAULT 0,
  insured_value_cents INTEGER,
  hazmat_flag INTEGER DEFAULT 0,
  weight_grams INTEGER,
  dimensions_cm TEXT,
  ship_from_address TEXT,
  ship_to_address TEXT,
  latest_status TEXT,
  latest_status_at TEXT,
  latest_status_location TEXT,
  pod_attachment TEXT,
  pod_signed_by TEXT,
  pod_signed_at TEXT,
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS order_shipments_order_idx ON order_shipments(order_id);
CREATE INDEX IF NOT EXISTS order_shipments_tracking_idx ON order_shipments(tracking_number);
CREATE INDEX IF NOT EXISTS order_shipments_carrier_idx ON order_shipments(carrier_code);

-- ── 4. order_contacts ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_contacts (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  role TEXT NOT NULL,
  name TEXT,
  email TEXT,
  phone TEXT,
  title TEXT,
  notes TEXT,
  is_primary INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS order_contacts_order_role_uk
  ON order_contacts(order_id, role);
CREATE INDEX IF NOT EXISTS order_contacts_order_idx ON order_contacts(order_id);

-- ── 5. sku_groups ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sku_groups (
  id TEXT PRIMARY KEY,
  vendor_id TEXT NOT NULL,
  group_name TEXT NOT NULL,
  tagline TEXT,
  long_description TEXT,
  salient_features TEXT,
  brand_manufacturer TEXT,
  cover_image_url TEXT,
  datasheet_url TEXT,
  ifu_url TEXT,
  msds_url TEXT,
  brochure_url TEXT,
  video_url TEXT,
  category_path TEXT,
  variant_attributes TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS sku_groups_vendor_idx ON sku_groups(vendor_id);
CREATE INDEX IF NOT EXISTS sku_groups_active_idx ON sku_groups(is_active);

-- ── 6. integration_log ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS integration_log (
  id TEXT PRIMARY KEY,
  connector_type TEXT NOT NULL,
  connector_id TEXT,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  direction TEXT NOT NULL,
  http_method TEXT,
  url TEXT,
  request_payload TEXT,
  response_status INTEGER,
  response_body TEXT,
  status TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_retry_at TEXT,
  last_error_message TEXT,
  idempotency_key TEXT,
  triggered_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS integration_log_idempotency_uk
  ON integration_log(idempotency_key);
CREATE INDEX IF NOT EXISTS integration_log_status_retry_idx
  ON integration_log(status, next_retry_at);
CREATE INDEX IF NOT EXISTS integration_log_entity_idx
  ON integration_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS integration_log_connector_idx
  ON integration_log(connector_id);

-- ── 7. notification_preferences ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notification_preferences (
  id TEXT PRIMARY KEY,
  scope_type TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  channel TEXT NOT NULL,
  recipient_type TEXT NOT NULL,
  custom_email TEXT,
  custom_phone TEXT,
  custom_webhook_url TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS notif_pref_scope_event_channel_recipient_uk
  ON notification_preferences(scope_type, scope_id, event_type, channel, recipient_type);
CREATE INDEX IF NOT EXISTS notif_pref_scope_event_active_idx
  ON notification_preferences(scope_type, scope_id, event_type, is_active);

-- ── 8. notification_delivery_log ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notification_delivery_log (
  id TEXT PRIMARY KEY,
  notification_id TEXT,
  event_type TEXT NOT NULL,
  channel TEXT NOT NULL,
  recipient_type TEXT,
  recipient_address TEXT NOT NULL,
  recipient_user_id TEXT,
  external_message_id TEXT,
  delivery_status TEXT NOT NULL,
  status_reason TEXT,
  related_entity_type TEXT,
  related_entity_id TEXT,
  sent_at TEXT,
  delivered_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS notif_delivery_recipient_status_idx
  ON notification_delivery_log(recipient_address, delivery_status);
CREATE INDEX IF NOT EXISTS notif_delivery_related_entity_idx
  ON notification_delivery_log(related_entity_type, related_entity_id);
CREATE INDEX IF NOT EXISTS notif_delivery_external_msg_idx
  ON notification_delivery_log(external_message_id);

-- ── 9. unsubscribes ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS unsubscribes (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  event_types TEXT,
  reason TEXT,
  source TEXT,
  unsubscribed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS unsubscribes_email_uk ON unsubscribes(email);

-- ═══════════════════════════════════════════════════════════════════════════
-- ORDERS — only 6 new columns (most lives on related tables)
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE orders ADD COLUMN customer_purchase_order_id TEXT;
ALTER TABLE orders ADD COLUMN recurrence_plan_id TEXT;
ALTER TABLE orders ADD COLUMN recurrence_index INTEGER;
ALTER TABLE orders ADD COLUMN tax_exempt INTEGER DEFAULT 0;
ALTER TABLE orders ADD COLUMN tax_exempt_certificate_id TEXT;
ALTER TABLE orders ADD COLUMN tax_jurisdiction_code TEXT;

CREATE INDEX IF NOT EXISTS orders_customer_po_idx ON orders(customer_purchase_order_id);
CREATE INDEX IF NOT EXISTS orders_recurrence_plan_idx ON orders(recurrence_plan_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- VENDOR_ITEM_SKUS — column additions
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE vendor_item_skus ADD COLUMN currency_code TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE vendor_item_skus ADD COLUMN group_id TEXT;
ALTER TABLE vendor_item_skus ADD COLUMN variant_attributes TEXT;
ALTER TABLE vendor_item_skus ADD COLUMN minimum_order_quantity INTEGER NOT NULL DEFAULT 1;
ALTER TABLE vendor_item_skus ADD COLUMN maximum_order_quantity INTEGER;
ALTER TABLE vendor_item_skus ADD COLUMN pack_multiple INTEGER NOT NULL DEFAULT 1;
ALTER TABLE vendor_item_skus ADD COLUMN tagline TEXT;
ALTER TABLE vendor_item_skus ADD COLUMN long_description TEXT;
ALTER TABLE vendor_item_skus ADD COLUMN image_url TEXT;
ALTER TABLE vendor_item_skus ADD COLUMN datasheet_url TEXT;
ALTER TABLE vendor_item_skus ADD COLUMN ifu_url TEXT;
ALTER TABLE vendor_item_skus ADD COLUMN msds_url TEXT;
ALTER TABLE vendor_item_skus ADD COLUMN video_url TEXT;
ALTER TABLE vendor_item_skus ADD COLUMN tax_code TEXT;
ALTER TABLE vendor_item_skus ADD COLUMN hs_code TEXT;
ALTER TABLE vendor_item_skus ADD COLUMN weight_grams INTEGER;
ALTER TABLE vendor_item_skus ADD COLUMN dimensions_cm TEXT;
ALTER TABLE vendor_item_skus ADD COLUMN hazmat INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS vendor_item_skus_group_idx ON vendor_item_skus(group_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- INVOICES — column additions + backfill
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE invoices ADD COLUMN subtotal_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN tax_total_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN discount_total_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN shipping_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN grand_total_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN currency_code TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE invoices ADD COLUMN fx_rate REAL;
ALTER TABLE invoices ADD COLUMN tax_engine_calculated_at TEXT;
ALTER TABLE invoices ADD COLUMN tax_engine_provider TEXT;
ALTER TABLE invoices ADD COLUMN tax_engine_calculation_id TEXT;
ALTER TABLE invoices ADD COLUMN stripe_payment_intent_id TEXT;
ALTER TABLE invoices ADD COLUMN stripe_charge_id TEXT;
ALTER TABLE invoices ADD COLUMN stripe_checkout_session_id TEXT;

UPDATE invoices
SET grand_total_cents = CAST(ROUND(COALESCE(total, 0) * 100) AS INTEGER),
    subtotal_cents = CAST(ROUND(COALESCE(total, 0) * 100) AS INTEGER)
WHERE total IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- INVOICE_ITEMS — column additions + backfill
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE invoice_items ADD COLUMN quantity_requested INTEGER;
ALTER TABLE invoice_items ADD COLUMN unit_price_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE invoice_items ADD COLUMN line_subtotal_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE invoice_items ADD COLUMN discount_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE invoice_items ADD COLUMN tax_rate REAL;
ALTER TABLE invoice_items ADD COLUMN tax_amount_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE invoice_items ADD COLUMN tax_code TEXT;
ALTER TABLE invoice_items ADD COLUMN tax_jurisdiction_code TEXT;
ALTER TABLE invoice_items ADD COLUMN tax_exempt INTEGER DEFAULT 0;
ALTER TABLE invoice_items ADD COLUMN tax_exempt_reason TEXT;
ALTER TABLE invoice_items ADD COLUMN line_total_cents INTEGER NOT NULL DEFAULT 0;

UPDATE invoice_items
SET unit_price_cents = CAST(ROUND(COALESCE(unit_price, 0) * 100) AS INTEGER),
    line_subtotal_cents = CAST(ROUND(COALESCE(spend, 0) * 100) AS INTEGER),
    line_total_cents = CAST(ROUND(COALESCE(spend, 0) * 100) AS INTEGER)
WHERE unit_price IS NOT NULL OR spend IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- HOSPITALS — column additions
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE hospitals ADD COLUMN order_number_prefix TEXT;
ALTER TABLE hospitals ADD COLUMN default_tax_jurisdiction_code TEXT;
ALTER TABLE hospitals ADD COLUMN tax_exempt INTEGER DEFAULT 0;
ALTER TABLE hospitals ADD COLUMN tax_exempt_certificate_url TEXT;
ALTER TABLE hospitals ADD COLUMN preferred_currency_code TEXT NOT NULL DEFAULT 'USD';

-- ═══════════════════════════════════════════════════════════════════════════
-- VENDORS — column additions
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE vendors ADD COLUMN default_ship_from_address TEXT;
ALTER TABLE vendors ADD COLUMN default_carrier_code TEXT;
ALTER TABLE vendors ADD COLUMN tracking_url_template TEXT;
