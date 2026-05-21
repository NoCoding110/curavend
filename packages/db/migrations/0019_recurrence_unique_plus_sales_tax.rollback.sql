-- 0019_recurrence_unique_plus_sales_tax.rollback.sql
--
-- Inverse of migration 0019.

-- 1. Drop UNIQUE constraint on orders(recurrence_plan_id, recurrence_index)
DROP INDEX IF EXISTS orders_recurrence_unique;

-- 2. Drop sales_tax_rates table (deletes seed rows too)
DROP TABLE IF EXISTS sales_tax_rates;
