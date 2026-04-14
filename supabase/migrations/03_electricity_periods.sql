-- ============================================================
-- InsureTrack – Strom Jahreshistorie Migration
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

create table if not exists electricity_periods (
  id               uuid          primary key default gen_random_uuid(),
  period           varchar(20)   not null,           -- e.g. '2024', '2022/2023'
  grundpreis       numeric(8,2)  not null default 0, -- €/Jahr
  arbeitspreis     numeric(6,4)  not null default 0, -- €/kWh
  verbrauch_kwh    integer       not null default 0, -- tatsächlicher Verbrauch
  abschlag         numeric(8,2)  not null default 0, -- €/Monat
  monate           integer       not null default 12,
  anbieter         varchar(100)  default '',
  vertragsnummer   varchar(100)  default '',
  serviceportal    text          default '',
  created_at       timestamptz   not null default now()
);

comment on table  electricity_periods              is 'Historical electricity billing periods (one row per tariff year/period).';
comment on column electricity_periods.grundpreis   is 'Annual base price in €.';
comment on column electricity_periods.arbeitspreis is 'Unit price in €/kWh.';
comment on column electricity_periods.verbrauch_kwh is 'Actual consumption in kWh for the period.';
comment on column electricity_periods.abschlag     is 'Monthly advance payment in €.';
comment on column electricity_periods.monate       is 'Number of months the tariff was active.';

create index if not exists idx_periods_period on electricity_periods (period desc);

alter table electricity_periods enable row level security;

create policy "Allow all for anon" on electricity_periods
  for all using (true) with check (true);

-- ─── Seed: Beispieldaten ─────────────────────────────────────────────────────
-- Passe die Werte auf deine echten Abrechnungen an, dann ausführen:
/*
insert into electricity_periods (period, grundpreis, arbeitspreis, verbrauch_kwh, abschlag, monate, anbieter, vertragsnummer, serviceportal)
values
  ('2021',      105.00, 0.2650, 3520, 78.00,  12, 'Stadtwerke',   '12345678', 'https://stadtwerke.de'),
  ('2021/2022', 110.00, 0.2750, 1800, 82.00,   6, 'Wechselanbieter', '87654321', ''),
  ('2022',       95.00, 0.3100, 3100, 90.00,  12, 'Idealenergie', '99887766', 'https://idealenergie.de'),
  ('2023',       86.16, 0.2841, 3450, 100.00, 12, 'Idealenergie', '72311015113', 'https://idealenergie.de'),
  ('2024',       86.16, 0.2841, 3380, 100.00, 12, 'Idealenergie', '72311015113', 'https://idealenergie.de')
on conflict do nothing;
*/
