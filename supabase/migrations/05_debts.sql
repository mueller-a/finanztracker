-- ============================================================
-- InsureTrack – Verbindlichkeiten Migration
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- Kredite / Darlehen
create table if not exists debts (
  id              uuid          primary key default gen_random_uuid(),
  name            varchar(100)  not null,
  total_amount    numeric(12,2) not null,       -- ursprüngliche Darlehenssumme
  interest_rate   numeric(5,3)  not null,       -- Zinssatz p.a. in %
  monthly_rate    numeric(10,2) not null,       -- monatliche Rate (Annuität) €
  start_date      date          not null,       -- Datum der ersten Rate
  color_code      varchar(7)    not null default '#ef4444',
  note            text          default '',
  created_at      timestamptz   not null default now()
);

comment on table  debts               is 'Annuity loans. Balance is calculated automatically from schedule + extra payments.';
comment on column debts.total_amount  is 'Original loan amount in €.';
comment on column debts.interest_rate is 'Annual interest rate in % (e.g. 3.75 for 3.75%).';
comment on column debts.monthly_rate  is 'Fixed monthly annuity payment in €.';
comment on column debts.start_date    is 'Date of first payment (month 1 of the schedule).';

-- Sondertilgungen (nur außerplanmäßige Zahlungen; Regelraten werden berechnet)
create table if not exists debt_payments (
  id               uuid          primary key default gen_random_uuid(),
  debt_id          uuid          not null references debts(id) on delete cascade,
  date             date          not null,
  amount           numeric(10,2) not null check (amount > 0),
  is_extra_payment boolean       not null default true,
  note             text          default '',
  created_at       timestamptz   not null default now()
);

comment on table  debt_payments                  is 'Extra (Sondertilgungs) payments only. Regular annuity payments are derived from the schedule.';
comment on column debt_payments.is_extra_payment is 'Always true — only Sondertilgungen are stored here.';

-- Indexes
create index if not exists idx_debts_start         on debts         (start_date);
create index if not exists idx_debt_payments_debt  on debt_payments (debt_id);
create index if not exists idx_debt_payments_date  on debt_payments (date desc);

-- RLS
alter table debts         enable row level security;
alter table debt_payments enable row level security;

create policy "Allow all for anon" on debts
  for all using (true) with check (true);

create policy "Allow all for anon" on debt_payments
  for all using (true) with check (true);

-- ─── Seed: Beispiel-Darlehen ──────────────────────────────────────────────────
/*
insert into debts (name, total_amount, interest_rate, monthly_rate, start_date, color_code, note)
values
  ('TargoBank Ratenkredit',  15000.00, 6.990, 350.00, '2022-03-01', '#ef4444', 'Autofinanzierung'),
  ('ING Baufinanzierung',   240000.00, 3.750, 1180.00, '2021-07-01', '#f97316', 'Wohnung Hauptstr.')
on conflict do nothing;
*/
