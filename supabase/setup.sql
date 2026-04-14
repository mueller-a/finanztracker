-- ============================================================================
-- Finanztracker – Konsolidiertes Setup-Skript (setup.sql)
-- ============================================================================
--
-- Zweck:
--   Vollständiges, idempotentes Setup-Skript für ein LEERES Supabase-Projekt.
--   Ersetzt die 35 chronologischen Migrations im Ordner supabase/.
--
-- Ausführung:
--   1. Supabase Dashboard → SQL Editor
--   2. Inhalt dieser Datei einfügen und "RUN" klicken.
--   3. Optional mehrfach ausführbar (alle Statements sind idempotent).
--
-- Enthält:
--   - 22 Tabellen (public-Schema)
--   - 2 Storage-Buckets (meter-readings, electricity-bills) + RLS-Policies
--   - Row-Level-Security auf allen User-Tabellen
--   - Trigger set_user_id() füllt user_id automatisch beim INSERT
--
-- Nicht enthalten (separat deployen):
--   - Edge Functions (supabase/functions/bmf-lst-validator/)
--   - Seed-Daten (in den Original-Migrations auskommentiert belassen)
--
-- Autor: Finanztracker-Team, konsolidiert 2026-04-13.
-- ============================================================================

-- Erforderliche Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- ═════════════════════════════════════════════════════════════════════════════
-- ║  TRIGGER-FUNKTION: auto-fill user_id bei INSERT                           ║
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.set_user_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    NEW.user_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ═════════════════════════════════════════════════════════════════════════════
-- ║  SEKTION 1: VERSICHERUNGEN (categories, providers, entries)               ║
-- ═════════════════════════════════════════════════════════════════════════════

-- ─── categories ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.categories (
  id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        varchar(100)  NOT NULL,
  icon        varchar(50)   DEFAULT 'tag',
  color       char(7)       DEFAULT '#6366f1',
  description text          DEFAULT '',
  created_at  timestamptz   NOT NULL DEFAULT now()
);

-- UNIQUE (user_id, name): mehrere User dürfen gleichen Kategorienamen nutzen
ALTER TABLE public.categories DROP CONSTRAINT IF EXISTS categories_name_key;
ALTER TABLE public.categories DROP CONSTRAINT IF EXISTS categories_user_name_unique;
ALTER TABLE public.categories
  ADD CONSTRAINT categories_user_name_unique UNIQUE (user_id, name);

COMMENT ON TABLE  public.categories       IS 'Top-level Versicherungs-Kategorien (Hausrat, KFZ, …).';
COMMENT ON COLUMN public.categories.color IS 'Hex-Farbe für Charts (#rrggbb).';
COMMENT ON COLUMN public.categories.icon  IS 'Icon-Key für das Frontend (home, car, …).';

-- ─── insurance_providers ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.insurance_providers (
  id               uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name             text         NOT NULL,
  website_url      text         NOT NULL DEFAULT '',
  portal_login_url text         NOT NULL DEFAULT '',
  created_at       timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT insurance_providers_user_name_unique UNIQUE (user_id, name)
);

CREATE INDEX IF NOT EXISTS insurance_providers_user_id_idx
  ON public.insurance_providers (user_id);

-- ─── insurance_entries ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.insurance_entries (
  id                   uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id          uuid          NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  provider_id          uuid          REFERENCES public.insurance_providers(id) ON DELETE SET NULL,
  year                 smallint      NOT NULL CHECK (year >= 2000 AND year <= 2100),
  premium              numeric(10,2) NOT NULL CHECK (premium > 0),
  provider             varchar(100)  DEFAULT '',
  payment_interval     varchar(20)   NOT NULL DEFAULT 'jährlich'
                         CHECK (payment_interval IN ('monatlich','vierteljährlich','halbjährlich','jährlich')),
  due_month            integer       CHECK (due_month BETWEEN 1 AND 12),
  notice_period_months integer       NOT NULL DEFAULT 3,
  contract_end_date    date,
  is_cancelled         boolean       NOT NULL DEFAULT false,
  cancellation_date    date,
  optimizer_note       text,
  created_at           timestamptz   NOT NULL DEFAULT now(),
  UNIQUE (category_id, year)
);

COMMENT ON TABLE  public.insurance_entries                  IS 'Jährliche Beitragseinträge pro Kategorie.';
COMMENT ON COLUMN public.insurance_entries.premium          IS 'Beitrag pro Intervall (nicht pro Jahr).';
COMMENT ON COLUMN public.insurance_entries.payment_interval IS 'Zahlintervall: monatlich | vierteljährlich | halbjährlich | jährlich.';
COMMENT ON COLUMN public.insurance_entries.due_month        IS 'Fälligkeitsmonat (1–12) bei nicht-monatlichem Intervall. NULL = n/a.';

CREATE INDEX IF NOT EXISTS idx_entries_category_id ON public.insurance_entries (category_id);
CREATE INDEX IF NOT EXISTS idx_entries_year        ON public.insurance_entries (year);


-- ═════════════════════════════════════════════════════════════════════════════
-- ║  SEKTION 2: STROM (readings, tariffs, periods, Labor-Prices, Extras)      ║
-- ═════════════════════════════════════════════════════════════════════════════

-- ─── electricity_readings ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.electricity_readings (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date       date        NOT NULL,
  value      integer     NOT NULL CHECK (value >= 0),
  note       text        DEFAULT '',
  image_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (date)
);

COMMENT ON TABLE  public.electricity_readings       IS 'Absolute Zählerstände in kWh.';
COMMENT ON COLUMN public.electricity_readings.value IS 'Absolutwert Zähler in kWh.';

CREATE INDEX IF NOT EXISTS idx_readings_date ON public.electricity_readings (date DESC);

-- ─── electricity_tariffs ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.electricity_tariffs (
  id                   uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  valid_from           date         NOT NULL,
  base_price           numeric(8,2) NOT NULL,
  unit_price           numeric(6,4) NOT NULL,
  monthly_advance      numeric(8,2) NOT NULL,
  provider             varchar(100) DEFAULT '',
  notice_period_months integer      NOT NULL DEFAULT 1,
  contract_end_date    date,
  is_cancelled         boolean      NOT NULL DEFAULT false,
  cancellation_date    date,
  optimizer_note       text,
  created_at           timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tariffs_from ON public.electricity_tariffs (valid_from DESC);

-- ─── tariff_installments (variable monatliche Abschläge) ────────────────────
CREATE TABLE IF NOT EXISTS public.tariff_installments (
  id          uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  tariff_id   uuid         NOT NULL REFERENCES public.electricity_tariffs(id) ON DELETE CASCADE,
  amount      numeric(8,2) NOT NULL CHECK (amount >= 0),
  valid_from  date         NOT NULL,
  created_at  timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tariff_installments_tariff_from
  ON public.tariff_installments (tariff_id, valid_from);

-- ─── electricity_periods (Jahreshistorie) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.electricity_periods (
  id               uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period           varchar(20)  NOT NULL,
  grundpreis       numeric(8,2) NOT NULL DEFAULT 0,
  arbeitspreis     numeric(6,4) NOT NULL DEFAULT 0,
  verbrauch_kwh    integer      NOT NULL DEFAULT 0,
  abschlag         numeric(8,2) NOT NULL DEFAULT 0,
  monate           integer      NOT NULL DEFAULT 12,
  anbieter         varchar(100) DEFAULT '',
  vertragsnummer   varchar(100) DEFAULT '',
  serviceportal    text         DEFAULT '',
  period_start     date,
  period_end       date,
  bill_file_path   text,
  created_at       timestamptz  NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.electricity_periods.period_start   IS 'Beginn der Abrechnungsperiode (für tageweise Gewichtung der Arbeitspreise).';
COMMENT ON COLUMN public.electricity_periods.period_end     IS 'Ende der Abrechnungsperiode (inklusive).';
COMMENT ON COLUMN public.electricity_periods.bill_file_path IS 'Pfad der Stromrechnung im Storage-Bucket "electricity-bills".';

CREATE INDEX IF NOT EXISTS idx_periods_period ON public.electricity_periods (period DESC);

-- ─── billing_period_labor_prices (1:N Arbeitspreise pro Periode) ────────────
CREATE TABLE IF NOT EXISTS public.billing_period_labor_prices (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  billing_period_id uuid          NOT NULL REFERENCES public.electricity_periods(id) ON DELETE CASCADE,
  price_per_kwh     numeric(10,6) NOT NULL,
  valid_from        date          NOT NULL,
  consumption_kwh   numeric(10,2),
  created_at        timestamptz   NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.billing_period_labor_prices                IS 'N Arbeitspreise pro Abrechnungsperiode (unterjährige Preisänderungen).';
COMMENT ON COLUMN public.billing_period_labor_prices.price_per_kwh  IS 'Arbeitspreis €/kWh, bis zu 6 Nachkommastellen.';
COMMENT ON COLUMN public.billing_period_labor_prices.consumption_kwh IS 'Verbrauch kWh dieses Preis-Zeitraums. NULL = Fallback auf gewichteten Durchschnitt.';

CREATE INDEX IF NOT EXISTS idx_bpl_prices_period
  ON public.billing_period_labor_prices (billing_period_id, valid_from);

-- ─── billing_period_extra_costs (Mahn-/Rücklastschriftgebühren) ─────────────
CREATE TABLE IF NOT EXISTS public.billing_period_extra_costs (
  id                 uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  billing_period_id  uuid         NOT NULL REFERENCES public.electricity_periods(id) ON DELETE CASCADE,
  description        text         NOT NULL DEFAULT '',
  amount             numeric(8,2) NOT NULL CHECK (amount >= 0),
  user_id            uuid         REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at         timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bp_extra_costs_period
  ON public.billing_period_extra_costs (billing_period_id);

-- ─── billing_period_credits (Gutschriften / Boni) ───────────────────────────
CREATE TABLE IF NOT EXISTS public.billing_period_credits (
  id                 uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  billing_period_id  uuid         NOT NULL REFERENCES public.electricity_periods(id) ON DELETE CASCADE,
  description        text         NOT NULL DEFAULT '',
  amount             numeric(8,2) NOT NULL CHECK (amount >= 0),
  user_id            uuid         REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at         timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bp_credits_period
  ON public.billing_period_credits (billing_period_id);


-- ═════════════════════════════════════════════════════════════════════════════
-- ║  SEKTION 3: GUTHABEN / SPARZIELE (savings_goals, savings_entries)         ║
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.savings_goals (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name              varchar(100)  NOT NULL,
  target_amount     numeric(10,2) DEFAULT NULL,
  monthly_soll      numeric(8,2)  NOT NULL DEFAULT 0,
  color_code        varchar(7)    NOT NULL DEFAULT '#7c3aed',
  sort_order        integer       NOT NULL DEFAULT 0,
  kategorie         text          NOT NULL DEFAULT 'rücklagen'
                      CHECK (kategorie IN ('rücklagen','tagesgeld','anleihen','private_investments')),
  zinssatz          numeric(7,4)  DEFAULT NULL,
  nominalwert       numeric(12,2) DEFAULT NULL,
  kupon             numeric(7,4)  DEFAULT NULL,
  faelligkeitsdatum date          DEFAULT NULL,
  kupon_intervall   text          DEFAULT 'jährlich'
                      CHECK (kupon_intervall IN ('monatlich','vierteljährlich','halbjährlich','jährlich')),
  etf_id            text          DEFAULT NULL,
  created_at        timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_savings_goals_sort      ON public.savings_goals (sort_order);
CREATE INDEX IF NOT EXISTS idx_savings_goals_kategorie ON public.savings_goals (kategorie);

CREATE TABLE IF NOT EXISTS public.savings_entries (
  id         uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goal_id    uuid          NOT NULL REFERENCES public.savings_goals(id) ON DELETE CASCADE,
  date       date          NOT NULL,
  amount     numeric(10,2) NOT NULL,
  type       varchar(20)   NOT NULL DEFAULT 'einzahlung'
                CHECK (type IN ('einzahlung','entnahme','neustart')),
  note       text          DEFAULT '',
  created_at timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_savings_entries_goal_id ON public.savings_entries (goal_id);
CREATE INDEX IF NOT EXISTS idx_savings_entries_date    ON public.savings_entries (date DESC);


-- ═════════════════════════════════════════════════════════════════════════════
-- ║  SEKTION 4: VERBINDLICHKEITEN / DEBTS                                     ║
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.debts (
  id                        uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name                      varchar(100)  NOT NULL,
  total_amount              numeric(12,2) NOT NULL,
  interest_rate             numeric(5,3)  NOT NULL,
  monthly_rate              numeric(10,2) NOT NULL,
  start_date                date          NOT NULL,
  color_code                varchar(7)    NOT NULL DEFAULT '#ef4444',
  note                      text          DEFAULT '',
  debt_type                 text          DEFAULT 'annuity'
                              CHECK (debt_type IN ('annuity','revolving')),
  credit_limit              numeric(12,2) DEFAULT NULL,
  initial_interest_override numeric(10,2),
  created_at                timestamptz   NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.debts.initial_interest_override
  IS 'Optional override für den Zinsbetrag (EUR) der ersten Rate. NULL = Standard.';

CREATE INDEX IF NOT EXISTS idx_debts_start ON public.debts (start_date);
CREATE INDEX IF NOT EXISTS idx_debts_type  ON public.debts (debt_type);

CREATE TABLE IF NOT EXISTS public.debt_payments (
  id               uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  debt_id          uuid          NOT NULL REFERENCES public.debts(id) ON DELETE CASCADE,
  date             date          NOT NULL,
  amount           numeric(10,2) NOT NULL CHECK (amount > 0),
  is_extra_payment boolean       NOT NULL DEFAULT true,
  type             text          NOT NULL DEFAULT 'repayment',
  note             text          DEFAULT '',
  created_at       timestamptz   NOT NULL DEFAULT now()
);

-- CHECK auf 'type' idempotent setzen
ALTER TABLE public.debt_payments DROP CONSTRAINT IF EXISTS debt_payments_type_check;
ALTER TABLE public.debt_payments
  ADD CONSTRAINT debt_payments_type_check
  CHECK (type IN ('repayment','withdrawal'));

COMMENT ON COLUMN public.debt_payments.type
  IS 'Buchungstyp: repayment (Tilgung, senkt Saldo) oder withdrawal (Entnahme, erhöht Saldo).';

CREATE INDEX IF NOT EXISTS idx_debt_payments_debt      ON public.debt_payments (debt_id);
CREATE INDEX IF NOT EXISTS idx_debt_payments_date      ON public.debt_payments (date DESC);
CREATE INDEX IF NOT EXISTS idx_debt_payments_debt_type ON public.debt_payments (debt_id, type);


-- ═════════════════════════════════════════════════════════════════════════════
-- ║  SEKTION 5: BUDGET (custom_budget_items)                                  ║
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.custom_budget_items (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  month         integer       NOT NULL CHECK (month BETWEEN 1 AND 12),
  year          integer       NOT NULL,
  label         varchar(200)  NOT NULL,
  amount        numeric(10,2) NOT NULL DEFAULT 0,
  share_percent integer       NOT NULL DEFAULT 100 CHECK (share_percent BETWEEN 0 AND 100),
  type          varchar(10)   NOT NULL DEFAULT 'expense'
                  CHECK (type IN ('income','expense')),
  source        varchar(20)   NOT NULL DEFAULT 'custom',
                  -- 'custom' | 'insurance' | 'strom' | 'kredit' | 'sparziel'
  source_id     uuid,
  category      text          DEFAULT 'sonstiges',
  note          text          DEFAULT '',
  sort_order    integer       NOT NULL DEFAULT 0,
  created_at    timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_budget_month_year ON public.custom_budget_items (year, month);
CREATE INDEX IF NOT EXISTS idx_budget_source     ON public.custom_budget_items (source, source_id);
CREATE INDEX IF NOT EXISTS idx_budget_category   ON public.custom_budget_items (category);


-- ═════════════════════════════════════════════════════════════════════════════
-- ║  SEKTION 6: ETF-POLICEN, POLICY-SNAPSHOTS, PKV, SALARY                    ║
-- ═════════════════════════════════════════════════════════════════════════════

-- ─── etf_policen ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.etf_policen (
  id         text        PRIMARY KEY,
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       text        NOT NULL DEFAULT 'Neue Police',
  color      text        NOT NULL DEFAULT '#7c3aed',
  type       text        NOT NULL,
  params     jsonb       NOT NULL DEFAULT '{}',
  is_passive boolean     NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Type-CHECK idempotent neu anlegen (finaler Wertebereich)
ALTER TABLE public.etf_policen DROP CONSTRAINT IF EXISTS etf_policen_type_check;
ALTER TABLE public.etf_policen
  ADD CONSTRAINT etf_policen_type_check
  CHECK (type IN ('insurance','avd','depot','bav','drv'));

COMMENT ON COLUMN public.etf_policen.is_passive
  IS 'true = Vertrag beitragsfrei gestellt. Keine weiteren Beiträge in der Projektion.';

CREATE INDEX IF NOT EXISTS etf_policen_user_id_idx ON public.etf_policen (user_id);

-- ─── policy_snapshots ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.policy_snapshots (
  id                          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                     uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  policy_id                   text          NOT NULL REFERENCES public.etf_policen(id) ON DELETE CASCADE,
  snapshot_date               date          NOT NULL,
  contract_value              numeric(12,2) NOT NULL DEFAULT 0,
  fund_balance                numeric(12,2),
  valuation_reserves          numeric(12,2),
  guaranteed_value            numeric(12,2),
  total_contributions_paid    numeric(12,2),
  employer_contribution_paid  numeric(12,2),
  employee_contribution_paid  numeric(12,2),
  cost_acquisition            numeric(12,2),
  cost_administration         numeric(12,2),
  cost_fund                   numeric(12,2),
  cost_other                  numeric(12,2),
  total_costs_paid            numeric(12,2),
  fund_allocation             jsonb         NOT NULL DEFAULT '[]',
  note                        text          DEFAULT '',
  created_at                  timestamptz   NOT NULL DEFAULT now(),
  updated_at                  timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT policy_snapshots_unique_date UNIQUE (policy_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_policy_snapshots_policy
  ON public.policy_snapshots (policy_id, snapshot_date DESC);

-- ─── pkv_configs ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pkv_configs (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       text        NOT NULL DEFAULT 'Neue Konfiguration',
  data       jsonb       NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pkv_configs_user_id_idx ON public.pkv_configs (user_id);

-- ─── salary_settings ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.salary_settings (
  id         uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  params     jsonb         NOT NULL DEFAULT '{}',
  netto      numeric(10,2),
  updated_at timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT salary_settings_user_unique UNIQUE (user_id)
);


-- ═════════════════════════════════════════════════════════════════════════════
-- ║  SEKTION 7: REAL ESTATE (properties, mortgages)                           ║
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.properties (
  id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name                text          NOT NULL DEFAULT 'Neue Immobilie',
  type                text          NOT NULL DEFAULT 'vermietet'
                        CHECK (type IN ('eigengenutzt','vermietet')),
  purchase_price      numeric(12,2) NOT NULL DEFAULT 0,
  purchase_date       date,
  market_value        numeric(12,2),
  land_value_ratio    numeric(5,2)  NOT NULL DEFAULT 20,
  living_space        numeric(8,2),
  build_year          integer,
  monthly_rent        numeric(8,2)  NOT NULL DEFAULT 0,
  monthly_hausgeld    numeric(8,2)  NOT NULL DEFAULT 0,
  maintenance_reserve numeric(8,2)  NOT NULL DEFAULT 0,
  color_code          text          NOT NULL DEFAULT '#7c3aed',
  note                text          DEFAULT '',
  created_at          timestamptz   NOT NULL DEFAULT now(),
  updated_at          timestamptz   NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.mortgages (
  id                       uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  property_id              uuid          NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  label                    text          NOT NULL DEFAULT 'Darlehen',
  principal                numeric(12,2) NOT NULL DEFAULT 0,
  interest_rate            numeric(5,3)  NOT NULL DEFAULT 2.0,
  repayment_rate           numeric(5,3)  NOT NULL DEFAULT 2.0,
  start_date               date,
  fixed_until              date,
  special_repayment_yearly numeric(10,2) NOT NULL DEFAULT 0,
  color_code               text          NOT NULL DEFAULT '#0ea5e9',
  created_at               timestamptz   NOT NULL DEFAULT now(),
  updated_at               timestamptz   NOT NULL DEFAULT now()
);


-- ═════════════════════════════════════════════════════════════════════════════
-- ║  SEKTION 8: USER MODULE SETTINGS (Feature-Toggles + Rolle)                ║
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.user_module_settings (
  user_id              uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  show_insurance       boolean     NOT NULL DEFAULT true,
  show_electricity     boolean     NOT NULL DEFAULT true,
  show_debts           boolean     NOT NULL DEFAULT true,
  show_budget          boolean     NOT NULL DEFAULT true,
  show_salary          boolean     NOT NULL DEFAULT true,
  show_pkv_calc        boolean     NOT NULL DEFAULT true,
  show_retirement_plan boolean     NOT NULL DEFAULT true,
  show_savings         boolean     NOT NULL DEFAULT true,
  show_real_estate     boolean     NOT NULL DEFAULT true,
  dark_mode            boolean,
  role                 text        NOT NULL DEFAULT 'user',
  is_pkv               boolean     NOT NULL DEFAULT true,
  steuer_satz_alter    integer     NOT NULL DEFAULT 25,
  updated_at           timestamptz NOT NULL DEFAULT now()
);


-- ═════════════════════════════════════════════════════════════════════════════
-- ║  SEKTION 9: TRIGGER (auto user_id)                                        ║
-- ═════════════════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_set_user_id_categories           ON public.categories;
CREATE TRIGGER trg_set_user_id_categories
  BEFORE INSERT ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();

DROP TRIGGER IF EXISTS trg_set_user_id_insurance_entries    ON public.insurance_entries;
CREATE TRIGGER trg_set_user_id_insurance_entries
  BEFORE INSERT ON public.insurance_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();

DROP TRIGGER IF EXISTS trg_set_user_id_electricity_readings ON public.electricity_readings;
CREATE TRIGGER trg_set_user_id_electricity_readings
  BEFORE INSERT ON public.electricity_readings
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();

DROP TRIGGER IF EXISTS trg_set_user_id_electricity_tariffs  ON public.electricity_tariffs;
CREATE TRIGGER trg_set_user_id_electricity_tariffs
  BEFORE INSERT ON public.electricity_tariffs
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();

DROP TRIGGER IF EXISTS trg_set_user_id_electricity_periods  ON public.electricity_periods;
CREATE TRIGGER trg_set_user_id_electricity_periods
  BEFORE INSERT ON public.electricity_periods
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();

DROP TRIGGER IF EXISTS trg_set_user_id_savings_goals        ON public.savings_goals;
CREATE TRIGGER trg_set_user_id_savings_goals
  BEFORE INSERT ON public.savings_goals
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();

DROP TRIGGER IF EXISTS trg_set_user_id_savings_entries      ON public.savings_entries;
CREATE TRIGGER trg_set_user_id_savings_entries
  BEFORE INSERT ON public.savings_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();

DROP TRIGGER IF EXISTS trg_set_user_id_debts                ON public.debts;
CREATE TRIGGER trg_set_user_id_debts
  BEFORE INSERT ON public.debts
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();

DROP TRIGGER IF EXISTS trg_set_user_id_debt_payments        ON public.debt_payments;
CREATE TRIGGER trg_set_user_id_debt_payments
  BEFORE INSERT ON public.debt_payments
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();

DROP TRIGGER IF EXISTS trg_set_user_id_custom_budget_items  ON public.custom_budget_items;
CREATE TRIGGER trg_set_user_id_custom_budget_items
  BEFORE INSERT ON public.custom_budget_items
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();

DROP TRIGGER IF EXISTS trg_set_user_id_properties           ON public.properties;
CREATE TRIGGER trg_set_user_id_properties
  BEFORE INSERT ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();

DROP TRIGGER IF EXISTS trg_set_user_id_mortgages            ON public.mortgages;
CREATE TRIGGER trg_set_user_id_mortgages
  BEFORE INSERT ON public.mortgages
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();

DROP TRIGGER IF EXISTS trg_set_user_id_policy_snapshots     ON public.policy_snapshots;
CREATE TRIGGER trg_set_user_id_policy_snapshots
  BEFORE INSERT ON public.policy_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();

DROP TRIGGER IF EXISTS trg_set_user_id_bp_extra_costs       ON public.billing_period_extra_costs;
CREATE TRIGGER trg_set_user_id_bp_extra_costs
  BEFORE INSERT ON public.billing_period_extra_costs
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();

DROP TRIGGER IF EXISTS trg_set_user_id_bp_credits           ON public.billing_period_credits;
CREATE TRIGGER trg_set_user_id_bp_credits
  BEFORE INSERT ON public.billing_period_credits
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();


-- ═════════════════════════════════════════════════════════════════════════════
-- ║  SEKTION 10: ROW-LEVEL SECURITY (RLS aktivieren + Policies)               ║
-- ═════════════════════════════════════════════════════════════════════════════

-- ─── categories ─────────────────────────────────────────────────────────────
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for anon"                ON public.categories;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.categories;
DROP POLICY IF EXISTS "categories_select" ON public.categories;
DROP POLICY IF EXISTS "categories_insert" ON public.categories;
DROP POLICY IF EXISTS "categories_update" ON public.categories;
DROP POLICY IF EXISTS "categories_delete" ON public.categories;

CREATE POLICY "categories_select" ON public.categories
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "categories_insert" ON public.categories
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "categories_update" ON public.categories
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "categories_delete" ON public.categories
  FOR DELETE USING (auth.uid() = user_id);

-- ─── insurance_entries ──────────────────────────────────────────────────────
ALTER TABLE public.insurance_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for anon"                ON public.insurance_entries;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.insurance_entries;
DROP POLICY IF EXISTS "insurance_entries_select" ON public.insurance_entries;
DROP POLICY IF EXISTS "insurance_entries_insert" ON public.insurance_entries;
DROP POLICY IF EXISTS "insurance_entries_update" ON public.insurance_entries;
DROP POLICY IF EXISTS "insurance_entries_delete" ON public.insurance_entries;

CREATE POLICY "insurance_entries_select" ON public.insurance_entries
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "insurance_entries_insert" ON public.insurance_entries
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "insurance_entries_update" ON public.insurance_entries
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "insurance_entries_delete" ON public.insurance_entries
  FOR DELETE USING (auth.uid() = user_id);

-- ─── insurance_providers ────────────────────────────────────────────────────
ALTER TABLE public.insurance_providers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own insurance providers" ON public.insurance_providers;

CREATE POLICY "Users can manage their own insurance providers"
  ON public.insurance_providers FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── electricity_readings ───────────────────────────────────────────────────
ALTER TABLE public.electricity_readings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for anon"                ON public.electricity_readings;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.electricity_readings;
DROP POLICY IF EXISTS "electricity_readings_select" ON public.electricity_readings;
DROP POLICY IF EXISTS "electricity_readings_insert" ON public.electricity_readings;
DROP POLICY IF EXISTS "electricity_readings_update" ON public.electricity_readings;
DROP POLICY IF EXISTS "electricity_readings_delete" ON public.electricity_readings;

CREATE POLICY "electricity_readings_select" ON public.electricity_readings
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "electricity_readings_insert" ON public.electricity_readings
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "electricity_readings_update" ON public.electricity_readings
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "electricity_readings_delete" ON public.electricity_readings
  FOR DELETE USING (auth.uid() = user_id);

-- ─── electricity_tariffs ────────────────────────────────────────────────────
ALTER TABLE public.electricity_tariffs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for anon"                ON public.electricity_tariffs;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.electricity_tariffs;
DROP POLICY IF EXISTS "electricity_tariffs_select" ON public.electricity_tariffs;
DROP POLICY IF EXISTS "electricity_tariffs_insert" ON public.electricity_tariffs;
DROP POLICY IF EXISTS "electricity_tariffs_update" ON public.electricity_tariffs;
DROP POLICY IF EXISTS "electricity_tariffs_delete" ON public.electricity_tariffs;

CREATE POLICY "electricity_tariffs_select" ON public.electricity_tariffs
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "electricity_tariffs_insert" ON public.electricity_tariffs
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "electricity_tariffs_update" ON public.electricity_tariffs
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "electricity_tariffs_delete" ON public.electricity_tariffs
  FOR DELETE USING (auth.uid() = user_id);

-- ─── tariff_installments (permissiv, Security über Parent-Tarif) ────────────
-- Hinweis: Diese Tabelle hat keine eigene user_id; Sicherheit wird über
-- RLS auf electricity_tariffs (via FK) gewährleistet. Policy bewusst wie
-- in migration_add_tariff_installments.sql gehalten.
ALTER TABLE public.tariff_installments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for anon" ON public.tariff_installments;
CREATE POLICY "Allow all for anon" ON public.tariff_installments
  FOR ALL USING (true) WITH CHECK (true);

-- ─── electricity_periods ────────────────────────────────────────────────────
ALTER TABLE public.electricity_periods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for anon"                ON public.electricity_periods;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.electricity_periods;
DROP POLICY IF EXISTS "electricity_periods_select" ON public.electricity_periods;
DROP POLICY IF EXISTS "electricity_periods_insert" ON public.electricity_periods;
DROP POLICY IF EXISTS "electricity_periods_update" ON public.electricity_periods;
DROP POLICY IF EXISTS "electricity_periods_delete" ON public.electricity_periods;

CREATE POLICY "electricity_periods_select" ON public.electricity_periods
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "electricity_periods_insert" ON public.electricity_periods
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "electricity_periods_update" ON public.electricity_periods
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "electricity_periods_delete" ON public.electricity_periods
  FOR DELETE USING (auth.uid() = user_id);

-- ─── billing_period_labor_prices (permissiv, Security über Parent) ─────────
-- Hinweis: Tabelle hat keine eigene user_id; Sicherheit via RLS auf
-- electricity_periods (FK). Policy identisch zur Original-Migration.
ALTER TABLE public.billing_period_labor_prices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for anon" ON public.billing_period_labor_prices;
CREATE POLICY "Allow all for anon" ON public.billing_period_labor_prices
  FOR ALL USING (true) WITH CHECK (true);

-- ─── billing_period_extra_costs ─────────────────────────────────────────────
ALTER TABLE public.billing_period_extra_costs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for anon"                ON public.billing_period_extra_costs;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.billing_period_extra_costs;
DROP POLICY IF EXISTS "bp_extra_costs_select" ON public.billing_period_extra_costs;
DROP POLICY IF EXISTS "bp_extra_costs_insert" ON public.billing_period_extra_costs;
DROP POLICY IF EXISTS "bp_extra_costs_update" ON public.billing_period_extra_costs;
DROP POLICY IF EXISTS "bp_extra_costs_delete" ON public.billing_period_extra_costs;

CREATE POLICY "bp_extra_costs_select" ON public.billing_period_extra_costs
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "bp_extra_costs_insert" ON public.billing_period_extra_costs
  FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);
CREATE POLICY "bp_extra_costs_update" ON public.billing_period_extra_costs
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "bp_extra_costs_delete" ON public.billing_period_extra_costs
  FOR DELETE USING (auth.uid() = user_id);

-- ─── billing_period_credits ─────────────────────────────────────────────────
ALTER TABLE public.billing_period_credits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for anon"                ON public.billing_period_credits;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.billing_period_credits;
DROP POLICY IF EXISTS "bp_credits_select" ON public.billing_period_credits;
DROP POLICY IF EXISTS "bp_credits_insert" ON public.billing_period_credits;
DROP POLICY IF EXISTS "bp_credits_update" ON public.billing_period_credits;
DROP POLICY IF EXISTS "bp_credits_delete" ON public.billing_period_credits;

CREATE POLICY "bp_credits_select" ON public.billing_period_credits
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "bp_credits_insert" ON public.billing_period_credits
  FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);
CREATE POLICY "bp_credits_update" ON public.billing_period_credits
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "bp_credits_delete" ON public.billing_period_credits
  FOR DELETE USING (auth.uid() = user_id);

-- ─── savings_goals ──────────────────────────────────────────────────────────
ALTER TABLE public.savings_goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for anon"                ON public.savings_goals;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.savings_goals;
DROP POLICY IF EXISTS "savings_goals_select" ON public.savings_goals;
DROP POLICY IF EXISTS "savings_goals_insert" ON public.savings_goals;
DROP POLICY IF EXISTS "savings_goals_update" ON public.savings_goals;
DROP POLICY IF EXISTS "savings_goals_delete" ON public.savings_goals;

CREATE POLICY "savings_goals_select" ON public.savings_goals
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "savings_goals_insert" ON public.savings_goals
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "savings_goals_update" ON public.savings_goals
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "savings_goals_delete" ON public.savings_goals
  FOR DELETE USING (auth.uid() = user_id);

-- ─── savings_entries ────────────────────────────────────────────────────────
ALTER TABLE public.savings_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for anon"                ON public.savings_entries;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.savings_entries;
DROP POLICY IF EXISTS "savings_entries_select" ON public.savings_entries;
DROP POLICY IF EXISTS "savings_entries_insert" ON public.savings_entries;
DROP POLICY IF EXISTS "savings_entries_update" ON public.savings_entries;
DROP POLICY IF EXISTS "savings_entries_delete" ON public.savings_entries;

CREATE POLICY "savings_entries_select" ON public.savings_entries
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "savings_entries_insert" ON public.savings_entries
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "savings_entries_update" ON public.savings_entries
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "savings_entries_delete" ON public.savings_entries
  FOR DELETE USING (auth.uid() = user_id);

-- ─── debts ──────────────────────────────────────────────────────────────────
ALTER TABLE public.debts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for anon"                ON public.debts;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.debts;
DROP POLICY IF EXISTS "debts_select" ON public.debts;
DROP POLICY IF EXISTS "debts_insert" ON public.debts;
DROP POLICY IF EXISTS "debts_update" ON public.debts;
DROP POLICY IF EXISTS "debts_delete" ON public.debts;

CREATE POLICY "debts_select" ON public.debts
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "debts_insert" ON public.debts
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "debts_update" ON public.debts
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "debts_delete" ON public.debts
  FOR DELETE USING (auth.uid() = user_id);

-- ─── debt_payments ──────────────────────────────────────────────────────────
ALTER TABLE public.debt_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for anon"                ON public.debt_payments;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.debt_payments;
DROP POLICY IF EXISTS "debt_payments_select" ON public.debt_payments;
DROP POLICY IF EXISTS "debt_payments_insert" ON public.debt_payments;
DROP POLICY IF EXISTS "debt_payments_update" ON public.debt_payments;
DROP POLICY IF EXISTS "debt_payments_delete" ON public.debt_payments;

CREATE POLICY "debt_payments_select" ON public.debt_payments
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "debt_payments_insert" ON public.debt_payments
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "debt_payments_update" ON public.debt_payments
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "debt_payments_delete" ON public.debt_payments
  FOR DELETE USING (auth.uid() = user_id);

-- ─── custom_budget_items ────────────────────────────────────────────────────
ALTER TABLE public.custom_budget_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for anon"                ON public.custom_budget_items;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.custom_budget_items;
DROP POLICY IF EXISTS "custom_budget_items_select" ON public.custom_budget_items;
DROP POLICY IF EXISTS "custom_budget_items_insert" ON public.custom_budget_items;
DROP POLICY IF EXISTS "custom_budget_items_update" ON public.custom_budget_items;
DROP POLICY IF EXISTS "custom_budget_items_delete" ON public.custom_budget_items;

CREATE POLICY "custom_budget_items_select" ON public.custom_budget_items
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "custom_budget_items_insert" ON public.custom_budget_items
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "custom_budget_items_update" ON public.custom_budget_items
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "custom_budget_items_delete" ON public.custom_budget_items
  FOR DELETE USING (auth.uid() = user_id);

-- ─── etf_policen ────────────────────────────────────────────────────────────
ALTER TABLE public.etf_policen ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own ETF policies" ON public.etf_policen;

CREATE POLICY "Users can manage their own ETF policies"
  ON public.etf_policen FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── policy_snapshots ───────────────────────────────────────────────────────
ALTER TABLE public.policy_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "policy_snapshots_select" ON public.policy_snapshots;
DROP POLICY IF EXISTS "policy_snapshots_insert" ON public.policy_snapshots;
DROP POLICY IF EXISTS "policy_snapshots_update" ON public.policy_snapshots;
DROP POLICY IF EXISTS "policy_snapshots_delete" ON public.policy_snapshots;

CREATE POLICY "policy_snapshots_select" ON public.policy_snapshots
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "policy_snapshots_insert" ON public.policy_snapshots
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "policy_snapshots_update" ON public.policy_snapshots
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "policy_snapshots_delete" ON public.policy_snapshots
  FOR DELETE USING (auth.uid() = user_id);

-- ─── pkv_configs ────────────────────────────────────────────────────────────
ALTER TABLE public.pkv_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own PKV configs" ON public.pkv_configs;

CREATE POLICY "Users can manage their own PKV configs"
  ON public.pkv_configs FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── salary_settings ────────────────────────────────────────────────────────
ALTER TABLE public.salary_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own salary settings" ON public.salary_settings;

CREATE POLICY "Users manage own salary settings"
  ON public.salary_settings FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── properties ─────────────────────────────────────────────────────────────
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "properties_select" ON public.properties;
DROP POLICY IF EXISTS "properties_insert" ON public.properties;
DROP POLICY IF EXISTS "properties_update" ON public.properties;
DROP POLICY IF EXISTS "properties_delete" ON public.properties;

CREATE POLICY "properties_select" ON public.properties
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "properties_insert" ON public.properties
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "properties_update" ON public.properties
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "properties_delete" ON public.properties
  FOR DELETE USING (auth.uid() = user_id);

-- ─── mortgages ──────────────────────────────────────────────────────────────
ALTER TABLE public.mortgages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mortgages_select" ON public.mortgages;
DROP POLICY IF EXISTS "mortgages_insert" ON public.mortgages;
DROP POLICY IF EXISTS "mortgages_update" ON public.mortgages;
DROP POLICY IF EXISTS "mortgages_delete" ON public.mortgages;

CREATE POLICY "mortgages_select" ON public.mortgages
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "mortgages_insert" ON public.mortgages
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "mortgages_update" ON public.mortgages
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "mortgages_delete" ON public.mortgages
  FOR DELETE USING (auth.uid() = user_id);

-- ─── user_module_settings ───────────────────────────────────────────────────
-- SELECT-Policy ist Admin-aware: Admins dürfen alle Zeilen lesen.
ALTER TABLE public.user_module_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_module_settings_select" ON public.user_module_settings;
DROP POLICY IF EXISTS "user_module_settings_insert" ON public.user_module_settings;
DROP POLICY IF EXISTS "user_module_settings_update" ON public.user_module_settings;
DROP POLICY IF EXISTS "user_module_settings_delete" ON public.user_module_settings;
DROP POLICY IF EXISTS "admins_read_all_settings"    ON public.user_module_settings;

CREATE POLICY "admins_read_all_settings" ON public.user_module_settings
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR (SELECT role FROM public.user_module_settings WHERE user_id = auth.uid()) = 'admin'
  );

CREATE POLICY "user_module_settings_insert" ON public.user_module_settings
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_module_settings_update" ON public.user_module_settings
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_module_settings_delete" ON public.user_module_settings
  FOR DELETE USING (auth.uid() = user_id);


-- ═════════════════════════════════════════════════════════════════════════════
-- ║  SEKTION 11: STORAGE-BUCKETS + RLS-POLICIES                               ║
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Pfad-Konvention in beiden Buckets: {auth.uid()}/{dateiname}.{ext}
-- Das erste Pfad-Segment MUSS die User-ID sein (wird via RLS erzwungen).
-- ============================================================================

-- ─── Bucket: meter-readings (Foto-Upload für Zählerstände) ──────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('meter-readings', 'meter-readings', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "meter_readings_select_own" ON storage.objects;
DROP POLICY IF EXISTS "meter_readings_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "meter_readings_update_own" ON storage.objects;
DROP POLICY IF EXISTS "meter_readings_delete_own" ON storage.objects;

CREATE POLICY "meter_readings_select_own"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'meter-readings'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "meter_readings_insert_own"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'meter-readings'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "meter_readings_update_own"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'meter-readings'
    AND auth.uid()::text = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = 'meter-readings'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "meter_readings_delete_own"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'meter-readings'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- ─── Bucket: electricity-bills (Jahresrechnungen als PDF/Bild) ──────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('electricity-bills', 'electricity-bills', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "electricity_bills_select_own" ON storage.objects;
DROP POLICY IF EXISTS "electricity_bills_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "electricity_bills_update_own" ON storage.objects;
DROP POLICY IF EXISTS "electricity_bills_delete_own" ON storage.objects;

CREATE POLICY "electricity_bills_select_own"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'electricity-bills'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "electricity_bills_insert_own"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'electricity-bills'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "electricity_bills_update_own"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'electricity-bills'
    AND auth.uid()::text = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = 'electricity-bills'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "electricity_bills_delete_own"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'electricity-bills'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );


-- ============================================================================
-- FERTIG — setup.sql abgeschlossen.
--
-- Nächste Schritte (außerhalb von SQL):
--   1. (Optional) Edge Function deployen:
--      supabase functions deploy bmf-lst-validator
--   2. Ersten User in Supabase Auth anlegen (Email/Password oder OAuth).
--   3. Admin-Rolle setzen (nach erstem Login):
--      UPDATE public.user_module_settings
--        SET role = 'admin'
--        WHERE user_id IN (SELECT id FROM auth.users WHERE email = 'dein@mail.de');
-- ============================================================================
