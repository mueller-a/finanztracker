-- Supabase SQL ausführen (einmalig im Dashboard → SQL Editor)

create table if not exists public.etf_policen (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Neue Police',
  color text not null default '#7c3aed',
  type text not null check (type in ('insurance', 'avd', 'depot')),
  params jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  constraint etf_policen_pkey primary key (id)
);
alter table public.etf_policen enable row level security;
create policy "Users can manage their own ETF policies"
  on public.etf_policen for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists etf_policen_user_id_idx on public.etf_policen (user_id);