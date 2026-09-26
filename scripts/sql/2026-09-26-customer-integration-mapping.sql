-- Additive only. Does not modify existing quotes, prices, customers or addresses.
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS integration_mapping jsonb NOT NULL DEFAULT '{}'::jsonb;
