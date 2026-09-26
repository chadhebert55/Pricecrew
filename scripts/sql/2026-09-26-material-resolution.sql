-- Additive only. Never update saved quote assembly/pricing snapshots.
ALTER TABLE price_book_items
  ADD COLUMN IF NOT EXISTS supplier_cost numeric(15,6),
  ADD COLUMN IF NOT EXISTS supplier_uom text,
  ADD COLUMN IF NOT EXISTS normalized_unit text,
  ADD COLUMN IF NOT EXISTS normalized_unit_cost numeric(15,6),
  ADD COLUMN IF NOT EXISTS supplier_unit_quantity numeric(15,6),
  ADD COLUMN IF NOT EXISTS material_preferences jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS panel_family text;
