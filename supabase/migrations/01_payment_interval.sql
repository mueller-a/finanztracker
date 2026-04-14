-- Migration: Add payment_interval to insurance_entries
-- Run this in: Supabase Dashboard → SQL Editor

alter table insurance_entries
  add column if not exists payment_interval varchar(20)
    not null default 'jährlich'
    check (payment_interval in ('monatlich', 'vierteljährlich', 'halbjährlich', 'jährlich'));

comment on column insurance_entries.payment_interval is
  'Wie oft der Beitrag gezahlt wird. premium ist immer der Betrag pro Intervall, nicht pro Jahr.';
