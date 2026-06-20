-- ============================================================
-- BONS CADEAUX / CODES PROMO — Crazy Chrono
-- Table des codes générés depuis l'espace Admin, activables par
-- le bénéficiaire (la durée démarre à l'activation).
-- À exécuter UNE FOIS dans le SQL Editor de Supabase (PROD).
-- ============================================================

create extension if not exists "pgcrypto";

create table if not exists public.gift_codes (
  code                varchar(40) primary key,
  type                varchar(20) not null default 'generic',   -- generic | nominative
  duration_months     integer     not null check (duration_months > 0),
  status              varchar(20) not null default 'active',     -- active | redeemed | revoked | expired
  beneficiary_label   varchar(200),                              -- ex: "Marie DUPONT" (nominatif)
  campaign            varchar(100),                              -- ex: "Noël 2026", "Partenariat X"
  notes               text,
  created_by          varchar(120),                              -- email admin créateur
  created_at          timestamptz not null default now(),
  redeemed_by_user_id uuid references auth.users(id) on delete set null,
  redeemed_by_email   varchar(200),
  redeemed_at         timestamptz,
  valid_until         timestamptz                                -- rempli à l'activation (= redeemed_at + durée)
);

create index if not exists gift_codes_status_idx   on public.gift_codes(status);
create index if not exists gift_codes_campaign_idx on public.gift_codes(campaign);
create index if not exists gift_codes_redeemed_idx on public.gift_codes(redeemed_by_user_id);

-- RLS : accès écriture réservé au service_role (backend). Les utilisateurs
-- ne lisent/écrivent jamais cette table directement (tout passe par l'API).
alter table public.gift_codes enable row level security;

-- (Optionnel) Marquer 'source' des subscriptions issues d'un bon cadeau.
alter table public.subscriptions add column if not exists source varchar(30);

-- Vérification
select code, type, duration_months, status, campaign, valid_until
from public.gift_codes
order by created_at desc
limit 20;
