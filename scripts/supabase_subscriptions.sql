-- Run this in Supabase SQL Editor (Production project)
create extension if not exists "pgcrypto";

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  stripe_subscription_id text,
  price_id text,
  status text,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subscriptions_user_id_idx on public.subscriptions (user_id);
create index if not exists subscriptions_status_idx on public.subscriptions (status);
create index if not exists subscriptions_updated_at_idx on public.subscriptions (updated_at desc);

alter table public.subscriptions enable row level security;

drop policy if exists "subscriptions_read_own" on public.subscriptions;
create policy "subscriptions_read_own"
on public.subscriptions
for select
to authenticated
using (auth.uid() = user_id);
