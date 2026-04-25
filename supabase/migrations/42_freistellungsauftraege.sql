-- ─── Freistellungsaufträge: Aufteilung des Sparerpauschbetrags ─────────────
-- In Deutschland steht jeder Person ein jährlicher Sparerpauschbetrag von
-- 1.000 € (Stand 2024, Single) zu, den man über `Freistellungsaufträge` auf
-- mehrere Banken / Broker aufteilen kann. Diese Tabelle trackt die Verteilung.
--
-- Nutzung: User hinterlegt pro Jahr + Anbieter den erteilten Betrag und
-- optional den bereits ausgeschöpften Anteil. Frontend rendert die Summen
-- und warnt, wenn der Pauschbetrag überzeichnet ist.

CREATE TABLE IF NOT EXISTS public.freistellungsauftraege (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  year            integer       NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  provider        text          NOT NULL,
  allotted_amount numeric(10,2) NOT NULL DEFAULT 0,
  used_amount     numeric(10,2) NOT NULL DEFAULT 0,
  note            text,
  created_at      timestamptz   NOT NULL DEFAULT now(),
  updated_at      timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_freistellungsauftraege_user_year
  ON public.freistellungsauftraege (user_id, year);

COMMENT ON TABLE  public.freistellungsauftraege                 IS 'Freistellungsaufträge zur Aufteilung des Sparerpauschbetrags pro Jahr und Anbieter.';
COMMENT ON COLUMN public.freistellungsauftraege.allotted_amount IS 'Erteilter Freistellungsauftrag in € — Σ ≤ Sparerpauschbetrag.';
COMMENT ON COLUMN public.freistellungsauftraege.used_amount     IS 'Bereits ausgeschöpfter Anteil (Kapitalerträge bis YTD).';

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.freistellungsauftraege ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fa_owner_select" ON public.freistellungsauftraege;
CREATE POLICY "fa_owner_select"
  ON public.freistellungsauftraege FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "fa_owner_insert" ON public.freistellungsauftraege;
CREATE POLICY "fa_owner_insert"
  ON public.freistellungsauftraege FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "fa_owner_update" ON public.freistellungsauftraege;
CREATE POLICY "fa_owner_update"
  ON public.freistellungsauftraege FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "fa_owner_delete" ON public.freistellungsauftraege;
CREATE POLICY "fa_owner_delete"
  ON public.freistellungsauftraege FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
