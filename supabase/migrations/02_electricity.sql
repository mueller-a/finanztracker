-- ============================================================
-- InsureTrack – Strom-Modul Migration
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- Zählerstand-Tabelle
create table if not exists electricity_readings (
  id         uuid        primary key default gen_random_uuid(),
  date       date        not null,
  value      integer     not null check (value >= 0),  -- kWh Zählerstand (absolut, nicht Verbrauch)
  note       text        default '',
  created_at timestamptz not null default now(),

  unique (date)  -- ein Eintrag pro Tag
);

comment on table  electricity_readings       is 'Absolute meter readings in kWh. Consumption is derived by diffing consecutive readings.';
comment on column electricity_readings.value is 'Absolute counter value in kWh (not delta).';
comment on column electricity_readings.date  is 'Date the reading was taken.';

-- Tarif-Einstellungen (eine Zeile pro Tarif-Periode)
create table if not exists electricity_tariffs (
  id              uuid        primary key default gen_random_uuid(),
  valid_from      date        not null,
  base_price      numeric(8,2) not null,   -- Grundpreis €/Jahr
  unit_price      numeric(6,4) not null,   -- Arbeitspreis €/kWh
  monthly_advance numeric(8,2) not null,   -- Abschlag €/Monat
  provider        varchar(100) default '',
  created_at      timestamptz not null default now()
);

comment on table electricity_tariffs is 'Electricity tariff periods. Use valid_from to track tariff changes over time.';

-- Indexes
create index if not exists idx_readings_date    on electricity_readings (date desc);
create index if not exists idx_tariffs_from     on electricity_tariffs  (valid_from desc);

-- RLS
alter table electricity_readings enable row level security;
alter table electricity_tariffs  enable row level security;

create policy "Allow all for anon" on electricity_readings
  for all using (true) with check (true);

create policy "Allow all for anon" on electricity_tariffs
  for all using (true) with check (true);

-- ─── Seed: Demo-Tarif ────────────────────────────────────────────────────────
-- Passe die Werte auf deinen echten Tarif an, dann ausführen:
/*
insert into electricity_tariffs (valid_from, base_price, unit_price, monthly_advance, provider)
values ('2024-01-01', 120.00, 0.2950, 85.00, 'Stadtwerke Musterstadt')
on conflict do nothing;
*/
