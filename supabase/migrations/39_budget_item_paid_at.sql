-- ─── Budget-Items: paid_at (Zahlung-Status) ─────────────────────────────────
-- Ergänzt custom_budget_items um einen nullable timestamp. NULL = offen,
-- Datum = bezahlt am. Ein Feld gibt uns Status + Log ohne zwei Spalten.
--
-- UI-Verwendung: pro Zeile ein Check-Button, der `paid_at` auf
-- now() / NULL toggelt. Im Header der Ausgaben-Tabelle eine kleine
-- Fortschritts-Anzeige "X / Y bezahlt · Z € offen".

ALTER TABLE public.custom_budget_items
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

-- Keine RLS-Änderung nötig: bestehende Policies auf custom_budget_items
-- beziehen sich auf user_id und greifen automatisch für alle Spalten.

COMMENT ON COLUMN public.custom_budget_items.paid_at IS
  'Zeitpunkt der Zahlung. NULL = offen, Wert = bezahlt am diesem Zeitpunkt.';
