-- ============================================================
-- InsureTrack – Guthaben Asset Manager Migration
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- New columns on savings_goals
-- kategorie: asset class bucket
-- zinssatz:  annual interest rate for Tagesgeldkonto (%)
-- nominalwert, kupon, faelligkeitsdatum, kupon_intervall: Anleihen fields
-- etf_id: soft reference to etf_policen.id (text, no FK because etf_policen.id is client-generated text)

ALTER TABLE public.savings_goals
  ADD COLUMN IF NOT EXISTS kategorie        text        NOT NULL DEFAULT 'rücklagen'
    CHECK (kategorie IN ('rücklagen', 'tagesgeld', 'anleihen', 'private_investments')),
  ADD COLUMN IF NOT EXISTS zinssatz         numeric(7,4) DEFAULT NULL,          -- % p.a.
  ADD COLUMN IF NOT EXISTS nominalwert      numeric(12,2) DEFAULT NULL,         -- Rückzahlungsbetrag Anleihe
  ADD COLUMN IF NOT EXISTS kupon            numeric(7,4) DEFAULT NULL,          -- % p.a.
  ADD COLUMN IF NOT EXISTS faelligkeitsdatum date        DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS kupon_intervall  text        DEFAULT 'jährlich'
    CHECK (kupon_intervall IN ('monatlich', 'vierteljährlich', 'halbjährlich', 'jährlich')),
  ADD COLUMN IF NOT EXISTS etf_id           text        DEFAULT NULL;           -- soft ref to etf_policen.id

-- Index for category filtering
CREATE INDEX IF NOT EXISTS idx_savings_goals_kategorie
  ON public.savings_goals (kategorie);
