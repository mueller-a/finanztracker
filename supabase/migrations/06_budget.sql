-- ============================================================
-- InsureTrack – Budget-Modul Migration
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- ─── Extend insurance_entries: add due_month ─────────────────────────────────
-- due_month: for non-monthly intervals, which month (1-12) this entry is due.
-- e.g. jährlich in March → due_month = 3
alter table insurance_entries
  add column if not exists due_month integer
    check (due_month between 1 and 12);

comment on column insurance_entries.due_month is
  'For non-monthly intervals: the calendar month (1=Jan … 12=Dez) when the payment falls due. NULL = not applicable.';

-- ─── custom_budget_items ─────────────────────────────────────────────────────
create table if not exists custom_budget_items (
  id            uuid          primary key default gen_random_uuid(),
  month         integer       not null check (month between 1 and 12),
  year          integer       not null,
  label         varchar(200)  not null,
  amount        numeric(10,2) not null default 0,
  share_percent integer       not null default 100 check (share_percent between 0 and 100),
  type          varchar(10)   not null default 'expense'
                  check (type in ('income', 'expense')),
  source        varchar(20)   not null default 'custom',
                  -- 'custom' | 'insurance' | 'strom' | 'kredit'
  source_id     uuid,         -- optional ref to originating row
  note          text          default '',
  sort_order    integer       not null default 0,
  created_at    timestamptz   not null default now()
);

comment on table  custom_budget_items              is 'Monthly budget rows — custom entries + auto-imported items from other modules.';
comment on column custom_budget_items.share_percent is 'Fraction of amount attributed to the user (0-100). Mein Anteil = amount * share_percent / 100.';
comment on column custom_budget_items.source       is 'Origin: custom (user-created), insurance, strom, kredit.';

create index if not exists idx_budget_month_year on custom_budget_items (year, month);
create index if not exists idx_budget_source     on custom_budget_items (source, source_id);

alter table custom_budget_items enable row level security;

create policy "Allow all for anon" on custom_budget_items
  for all using (true) with check (true);
