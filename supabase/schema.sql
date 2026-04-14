-- ============================================================
-- InsureTrack – Supabase Schema
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor)
-- ============================================================

-- Enable UUID generation (already available in Supabase by default)
create extension if not exists "pgcrypto";

-- ─── categories ─────────────────────────────────────────────────────────────
create table if not exists categories (
  id          uuid primary key default gen_random_uuid(),
  name        varchar(100) not null unique,
  -- Optional display metadata (used by the frontend; safe to leave null)
  icon        varchar(50)  default 'tag',
  color       char(7)      default '#6366f1',  -- hex e.g. #6366f1
  description text         default '',
  created_at  timestamptz  not null default now()
);

comment on table  categories          is 'Top-level insurance categories (e.g. Hausrat, KFZ). These are permanent anchors – providers may change but the category stays.';
comment on column categories.color    is 'Hex color used in charts (#rrggbb).';
comment on column categories.icon     is 'Icon key for the frontend (e.g. home, car, shield).';

-- ─── insurance_entries ──────────────────────────────────────────────────────
create table if not exists insurance_entries (
  id          uuid        primary key default gen_random_uuid(),
  category_id uuid        not null references categories(id) on delete cascade,
  year        smallint    not null check (year >= 2000 and year <= 2100),
  premium     numeric(10, 2) not null check (premium > 0),  -- annual premium in EUR
  provider    varchar(100) not null,
  created_at  timestamptz  not null default now(),

  -- One entry per category per year; use upsert (on conflict) to update
  unique (category_id, year)
);

comment on table  insurance_entries         is 'Annual premium entries per category. Provider can change year-to-year while the category (trend) stays intact.';
comment on column insurance_entries.premium is 'Annual gross premium in EUR.';
comment on column insurance_entries.year    is 'Calendar year the premium was paid.';

-- ─── Indexes ─────────────────────────────────────────────────────────────────
create index if not exists idx_entries_category_id on insurance_entries (category_id);
create index if not exists idx_entries_year        on insurance_entries (year);

-- ─── Row Level Security ───────────────────────────────────────────────────────
-- Enable RLS so only authenticated users can read/write their own data.
-- Adjust policies to fit your auth model (single-user vs multi-user).

alter table categories       enable row level security;
alter table insurance_entries enable row level security;

-- Example: authenticated users can do everything (single-user app).
-- Replace with user-scoped policies if you add a users table.
create policy "Allow all for authenticated users" on categories
  for all using (auth.role() = 'authenticated');

create policy "Allow all for authenticated users" on insurance_entries
  for all using (auth.role() = 'authenticated');

-- ─── Seed data (optional – delete before production) ─────────────────────────
-- Paste the block below into a separate SQL run if you want demo data.
/*
insert into categories (name, icon, color, description) values
  ('Hausrat',          'home',      '#6366f1', 'Hausratversicherung – Schutz für Wohnungsinhalt'),
  ('Haftpflicht',      'shield',    '#06b6d4', 'Private Haftpflichtversicherung'),
  ('KFZ',              'car',       '#f59e0b', 'Kraftfahrzeugversicherung (Haftpflicht + Teilkasko)'),
  ('Kranken-Zusatz',   'heart',     '#10b981', 'Private Krankenzusatzversicherung'),
  ('Berufsunfähigkeit','briefcase', '#8b5cf6', 'Berufsunfähigkeitsversicherung'),
  ('Rechtsschutz',     'gavel',     '#ef4444', 'Rechtsschutzversicherung')
on conflict (name) do nothing;
*/
