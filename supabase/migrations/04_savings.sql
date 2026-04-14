-- ============================================================
-- InsureTrack – Guthabenaufzeichner Migration
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- Sparziele
create table if not exists savings_goals (
  id            uuid          primary key default gen_random_uuid(),
  name          varchar(100)  not null,
  target_amount numeric(10,2) default null,       -- optional Zielbetrag
  monthly_soll  numeric(8,2)  not null default 0, -- geplante Einzahlung pro Monat
  color_code    varchar(7)    not null default '#7c3aed',
  sort_order    integer       not null default 0,
  created_at    timestamptz   not null default now()
);

comment on table  savings_goals              is 'Savings goals / buckets.';
comment on column savings_goals.target_amount is 'Optional target amount. NULL means no limit.';
comment on column savings_goals.monthly_soll  is 'Planned monthly deposit in €.';

-- Transaktionen
create table if not exists savings_entries (
  id         uuid          primary key default gen_random_uuid(),
  goal_id    uuid          not null references savings_goals(id) on delete cascade,
  date       date          not null,
  amount     numeric(10,2) not null,
  type       varchar(20)   not null default 'einzahlung'
               check (type in ('einzahlung', 'entnahme', 'neustart')),
  note       text          default '',
  created_at timestamptz   not null default now()
);

comment on table  savings_entries      is 'Savings transactions. type=neustart resets the balance baseline.';
comment on column savings_entries.amount is 'For einzahlung: positive. For entnahme: use positive (sign applied in logic). For neustart: new starting balance.';

-- Indexes
create index if not exists idx_savings_entries_goal_id on savings_entries (goal_id);
create index if not exists idx_savings_entries_date    on savings_entries (date desc);
create index if not exists idx_savings_goals_sort      on savings_goals   (sort_order);

-- RLS
alter table savings_goals   enable row level security;
alter table savings_entries enable row level security;

create policy "Allow all for anon" on savings_goals
  for all using (true) with check (true);

create policy "Allow all for anon" on savings_entries
  for all using (true) with check (true);

-- ─── Seed: Beispielziele ─────────────────────────────────────────────────────
/*
insert into savings_goals (name, target_amount, monthly_soll, color_code, sort_order)
values
  ('Urlaubskasse',   2000.00, 150.00, '#0ea5e9', 1),
  ('Notgroschen',   10000.00, 200.00, '#10b981', 2),
  ('Neues Fahrrad',   800.00,  50.00, '#f59e0b', 3),
  ('Freies Sparen',      null, 100.00, '#7c3aed', 4)
on conflict do nothing;
*/
