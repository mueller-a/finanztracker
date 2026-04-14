-- ============================================================
-- InsureTrack – Budget Category Migration
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- Add category column with sensible default
ALTER TABLE public.custom_budget_items
  ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'sonstiges';

-- Backfill existing rows based on source
UPDATE public.custom_budget_items
  SET category = CASE
    WHEN source = 'strom'     THEN 'wohnen'
    WHEN source = 'insurance' THEN 'versicherung'
    WHEN source = 'kredit'    THEN 'versicherung'
    WHEN source = 'sparziel'  THEN 'sparen'
    ELSE 'sonstiges'
  END
  WHERE category IS NULL OR category = 'sonstiges';

-- Optional index for filtering
CREATE INDEX IF NOT EXISTS idx_budget_category ON public.custom_budget_items (category);
