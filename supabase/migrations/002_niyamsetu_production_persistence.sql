-- NiyamSetu AI — Additive Production Persistence & Role Constraint Alignment
-- Run after 001_niyamsetu_schema.sql in Supabase SQL Editor.

-- 1. Align user_profiles.role constraint with backend UserRole ('STUDENT', 'ORGANIZATION', 'ADMIN', 'PLATFORM_ADMIN', 'DEVELOPER')
alter table public.user_profiles
  drop constraint if exists user_profiles_role_check;

alter table public.user_profiles
  add constraint user_profiles_role_check
  check (role in ('STUDENT', 'ORGANIZATION', 'ADMIN', 'PLATFORM_ADMIN', 'DEVELOPER'));

-- 2. Durable Full-State Snapshot Store for Ephemeral-Disk Backend Hosts (e.g. Render Web Services)
-- RLS is enabled with NO public client policies: strictly accessed server-side via SUPABASE_SERVICE_ROLE_KEY.
create table if not exists public.app_state_snapshots (
  id text primary key,
  seed_version integer not null,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_state_snapshots enable row level security;
