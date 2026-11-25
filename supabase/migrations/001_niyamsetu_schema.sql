-- NiyamSetu AI — Complete Supabase PostgreSQL Schema, RLS, Full-Text Search, RPC, Storage & Realtime
-- Run this migration in your Supabase SQL Editor or via `supabase db push`.

-- 1. Extensions
create extension if not exists pgcrypto;

-- 2. Core User Profiles & Saved Bookmarks (synced with Auth UID)
create table if not exists public.user_profiles (
  id text primary key,
  name text not null,
  email text unique not null,
  role text not null default 'STUDENT' check (role in ('STUDENT', 'ADMIN', 'PLATFORM_ADMIN')),
  language_preference text not null default 'en' check (language_preference in ('en', 'te')),
  saved_income numeric,
  saved_marks numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.saved_bookmarks (
  id text primary key,
  owner_id text not null references public.user_profiles(id) on delete cascade,
  scheme_id text not null,
  title text not null,
  note text not null default '',
  status text not null default 'saved' check (status in ('saved', 'in_progress', 'ready')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. Unified Rules Intelligence Engine Tables
create table if not exists public.schemes (
  id text primary key,
  code text not null,
  name text not null,
  name_te text not null,
  authority text not null,
  category text not null,
  description text not null,
  description_te text not null,
  benefit_summary text not null,
  benefit_summary_te text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.documents (
  id text primary key,
  scheme_id text not null references public.schemes(id) on delete cascade,
  title text not null,
  doc_number text not null,
  authority text not null,
  jurisdiction text not null,
  publication_date text not null,
  effective_date text not null,
  subject text not null,
  version integer not null,
  amends_document_id text,
  source_url text not null,
  storage_path text,
  verification_status text not null check (verification_status in ('verified', 'pending_review', 'rejected')),
  uploaded_by text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.document_pages (
  id text primary key,
  document_id text not null references public.documents(id) on delete cascade,
  page_number integer not null,
  text text not null,
  extraction_confidence numeric not null,
  search_tsv tsvector generated always as (to_tsvector('english', coalesce(text, ''))) stored
);

create table if not exists public.rules (
  id text primary key,
  document_id text not null references public.documents(id) on delete cascade,
  scheme_id text not null references public.schemes(id) on delete cascade,
  rule_key text not null,
  version integer not null,
  rule_type text not null,
  label text not null,
  label_te text not null,
  condition_text text not null,
  condition_text_te text not null,
  field text not null,
  operator text not null,
  value text not null,
  applies_to text not null,
  page_number integer not null,
  clause_reference text not null,
  confidence numeric not null,
  status text not null check (status in ('draft', 'active', 'superseded', 'rejected')),
  valid_from text not null,
  valid_to text,
  search_tsv tsvector generated always as (
    to_tsvector('english', coalesce(label, '') || ' ' || coalesce(condition_text, '') || ' ' || coalesce(applies_to, ''))
  ) stored
);

create table if not exists public.rule_changes (
  id text primary key,
  scheme_id text not null references public.schemes(id) on delete cascade,
  rule_key text not null,
  old_rule_id text,
  new_rule_id text not null,
  change_type text not null check (change_type in ('added', 'modified', 'removed')),
  summary text not null,
  detected_at timestamptz not null default now(),
  review_status text not null check (review_status in ('pending', 'approved', 'rejected'))
);

create table if not exists public.rule_links (
  id text primary key,
  rule_id text not null,
  linked_type text not null,
  target_id text not null,
  target_title text not null,
  impact_description text not null
);

create table if not exists public.impact_reports (
  id text primary key,
  rule_id text not null,
  scheme_id text not null references public.schemes(id) on delete cascade,
  title text not null,
  generated_at timestamptz not null default now(),
  status text not null check (status in ('pending', 'partially_applied', 'applied')),
  items jsonb not null default '[]'::jsonb
);

create table if not exists public.procedure_steps (
  id text primary key,
  scheme_id text not null references public.schemes(id) on delete cascade,
  order_number integer not null,
  title text not null,
  title_te text not null,
  description text not null,
  description_te text not null,
  linked_rule_id text,
  active boolean not null default true
);

create table if not exists public.required_documents (
  id text primary key,
  scheme_id text not null references public.schemes(id) on delete cascade,
  name text not null,
  name_te text not null,
  description text not null,
  description_te text not null,
  mandatory boolean not null default true,
  linked_rule_id text,
  active boolean not null default true
);

create table if not exists public.readiness_reports (
  id text primary key,
  user_id text not null,
  scheme_id text not null references public.schemes(id) on delete cascade,
  created_at timestamptz not null default now(),
  overall_status text not null check (overall_status in ('ready', 'incomplete', 'attention_needed')),
  summary text not null,
  summary_te text not null,
  checks jsonb not null default '[]'::jsonb
);

create table if not exists public.deadlines (
  id text primary key,
  scheme_id text not null references public.schemes(id) on delete cascade,
  title text not null,
  title_te text not null,
  due_date text not null,
  owner_role text not null,
  status text not null check (status in ('pending', 'completed')),
  linked_rule_id text
);

create table if not exists public.alerts (
  id text primary key,
  scheme_id text not null references public.schemes(id) on delete cascade,
  target_role text not null,
  message text not null,
  message_te text not null,
  linked_rule_id text,
  created_at timestamptz not null default now(),
  read boolean not null default false
);

create table if not exists public.review_queue (
  id text primary key,
  item_type text not null,
  item_id text not null,
  scheme_id text not null references public.schemes(id) on delete cascade,
  reason text not null,
  confidence numeric not null,
  status text not null check (status in ('pending', 'approved', 'rejected')),
  decision_note text not null default '',
  reviewed_by text,
  reviewed_at timestamptz
);

create table if not exists public.audit_log (
  id text primary key,
  timestamp timestamptz not null default now(),
  actor_id text not null,
  actor_name text not null,
  actor_role text not null,
  action text not null,
  object_type text not null,
  object_id text not null,
  source_reference text not null,
  details text not null
);

create table if not exists public.monitored_sources (
  id text primary key,
  name text not null,
  url text not null,
  authority text not null,
  last_checked timestamptz not null default now(),
  last_status text not null check (last_status in ('unchanged', 'amendment_detected', 'pending_scan'))
);

-- 4. Full-Text & Query Indexes
create index if not exists idx_rules_search_tsv on public.rules using gin (search_tsv);
create index if not exists idx_doc_pages_search_tsv on public.document_pages using gin (search_tsv);
create index if not exists idx_rules_scheme_status on public.rules (scheme_id, status);
create index if not exists idx_bookmarks_owner on public.saved_bookmarks (owner_id);
create index if not exists idx_readiness_user on public.readiness_reports (user_id);

-- 5. Deterministic Eligibility RPC Function (PostgREST callable via supabase.rpc)
create or replace function public.match_schemes_for_citizen(
  p_income numeric default null,
  p_marks numeric default null
)
returns table (
  scheme_id text,
  scheme_code text,
  scheme_name text,
  active_rule_count bigint,
  income_limit numeric,
  marks_minimum numeric,
  eligible boolean
)
language sql
stable
as $$
  select
    s.id as scheme_id,
    s.code as scheme_code,
    s.name as scheme_name,
    count(r.id) as active_rule_count,
    max(case when r.field = 'family_income' then nullif(r.value, '')::numeric end) as income_limit,
    max(case when r.field = 'marks_percent' then nullif(r.value, '')::numeric end) as marks_minimum,
    (
      (p_income is null or max(case when r.field = 'family_income' then nullif(r.value, '')::numeric end) is null or p_income <= max(case when r.field = 'family_income' then nullif(r.value, '')::numeric end))
      and
      (p_marks is null or max(case when r.field = 'marks_percent' then nullif(r.value, '')::numeric end) is null or p_marks >= max(case when r.field = 'marks_percent' then nullif(r.value, '')::numeric end))
    ) as eligible
  from public.schemes s
  left join public.rules r on r.scheme_id = s.id and r.status = 'active'
  group by s.id, s.code, s.name;
$$;

-- 6. Row-Level Security (RLS)
alter table public.user_profiles enable row level security;
alter table public.saved_bookmarks enable row level security;
alter table public.schemes enable row level security;
alter table public.documents enable row level security;
alter table public.document_pages enable row level security;
alter table public.rules enable row level security;
alter table public.rule_changes enable row level security;
alter table public.rule_links enable row level security;
alter table public.impact_reports enable row level security;
alter table public.procedure_steps enable row level security;
alter table public.required_documents enable row level security;
alter table public.readiness_reports enable row level security;
alter table public.deadlines enable row level security;
alter table public.alerts enable row level security;
alter table public.review_queue enable row level security;
alter table public.audit_log enable row level security;
alter table public.monitored_sources enable row level security;

-- Public read for verified schemes, documents, active rules, procedures, required docs & alerts
create policy "Public read schemes" on public.schemes for select using (true);
create policy "Public read verified documents" on public.documents for select using (verification_status = 'verified');
create policy "Public read document pages" on public.document_pages for select using (true);
create policy "Public read active rules" on public.rules for select using (status = 'active');
create policy "Public read procedure steps" on public.procedure_steps for select using (active = true);
create policy "Public read required documents" on public.required_documents for select using (active = true);
create policy "Public read citizen alerts" on public.alerts for select using (target_role in ('ALL', 'STUDENT'));
create policy "Public read monitored sources" on public.monitored_sources for select using (true);

-- Owner-scoped private user data
create policy "Owner read/write profile" on public.user_profiles
  for all using (auth.uid()::text = id) with check (auth.uid()::text = id);

create policy "Owner read/write bookmarks" on public.saved_bookmarks
  for all using (auth.uid()::text = owner_id) with check (auth.uid()::text = owner_id);

create policy "Owner read/write readiness reports" on public.readiness_reports
  for all using (auth.uid()::text = user_id) with check (auth.uid()::text = user_id);

-- 7. Supabase Storage Bucket for Uploaded Notifications & Synthetic Proofs
insert into storage.buckets (id, name, public)
values ('niyamsetu-documents', 'niyamsetu-documents', false)
on conflict (id) do nothing;

-- 8. Supabase Realtime Publication
do $$
begin
  alter publication supabase_realtime add table public.rules;
  alter publication supabase_realtime add table public.alerts;
  alter publication supabase_realtime add table public.review_queue;
  alter publication supabase_realtime add table public.impact_reports;
  alter publication supabase_realtime add table public.saved_bookmarks;
exception
  when duplicate_object then null;
end $$;
