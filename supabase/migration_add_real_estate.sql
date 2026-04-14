-- ============================================================
-- InsureTrack – Real Estate Module
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- ── Properties ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.properties (
  id               uuid        NOT NULL DEFAULT gen_random_uuid(),
  user_id          uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name             text        NOT NULL DEFAULT 'Neue Immobilie',
  type             text        NOT NULL DEFAULT 'vermietet' CHECK (type IN ('eigengenutzt', 'vermietet')),
  purchase_price   numeric(12,2) NOT NULL DEFAULT 0,
  purchase_date    date,
  market_value     numeric(12,2),
  land_value_ratio numeric(5,2) NOT NULL DEFAULT 20,
  living_space     numeric(8,2),
  build_year       integer,
  monthly_rent     numeric(8,2) NOT NULL DEFAULT 0,
  monthly_hausgeld numeric(8,2) NOT NULL DEFAULT 0,
  maintenance_reserve numeric(8,2) NOT NULL DEFAULT 0,
  color_code       text        NOT NULL DEFAULT '#7c3aed',
  note             text        DEFAULT '',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT properties_pkey PRIMARY KEY (id)
);

ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "properties_select" ON public.properties FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "properties_insert" ON public.properties FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "properties_update" ON public.properties FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "properties_delete" ON public.properties FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER trg_set_user_id_properties
  BEFORE INSERT ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();

-- ── Mortgages ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mortgages (
  id                       uuid        NOT NULL DEFAULT gen_random_uuid(),
  property_id              uuid        NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  user_id                  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label                    text        NOT NULL DEFAULT 'Darlehen',
  principal                numeric(12,2) NOT NULL DEFAULT 0,
  interest_rate            numeric(5,3) NOT NULL DEFAULT 2.0,
  repayment_rate           numeric(5,3) NOT NULL DEFAULT 2.0,
  start_date               date,
  fixed_until              date,
  special_repayment_yearly numeric(10,2) NOT NULL DEFAULT 0,
  color_code               text        NOT NULL DEFAULT '#0ea5e9',
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mortgages_pkey PRIMARY KEY (id)
);

ALTER TABLE public.mortgages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mortgages_select" ON public.mortgages FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "mortgages_insert" ON public.mortgages FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "mortgages_update" ON public.mortgages FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "mortgages_delete" ON public.mortgages FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER trg_set_user_id_mortgages
  BEFORE INSERT ON public.mortgages
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();

-- ── Module toggle ─────────────────────────────────────────────
ALTER TABLE public.user_module_settings
  ADD COLUMN IF NOT EXISTS show_real_estate boolean NOT NULL DEFAULT true;
