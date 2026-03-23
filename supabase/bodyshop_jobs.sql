-- Canonical bodyshop jobs table for dealership workflow
create table if not exists public.bodyshop_jobs (
  id text primary key, -- usually same as ro_no for simplicity
  ro_no text not null unique,
  branch_id text,
  ro_date date,
  reg_no text,
  customer_name text,
  model text,
  insurance_company text,
  surveyor text,
  service_advisor text,
  mobile_no text,
  photos text[],
  claim_intimation_date date,
  claim_no text,
  hap_status text,
  survey_date date,
  approval_date date,
  advisor_remark text,
  whatsapp_date date,
  tentative_labor numeric,
  promised_date date,
  general_remark text,
  replace_panels text,
  dent_panels text,
  mrs text,
  mrs_date date,
  order_no text,
  order_date date,
  eta_date date,
  received_date date,
  status_section text not null, -- constrained via app / dropdown
  billing_status text,
  parts_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- If the table already existed, `create table if not exists` won't add new columns.
-- These ALTERs make the script safe to re-run and keep PostgREST schema in sync.
alter table public.bodyshop_jobs add column if not exists branch_id text;
alter table public.bodyshop_jobs add column if not exists photos text[];
alter table public.bodyshop_jobs add column if not exists billing_status text;
alter table public.bodyshop_jobs add column if not exists parts_status text;
alter table public.bodyshop_jobs alter column status_section set default 'Document Pending';

-- Backfill missing status values to the new initial stage.
update public.bodyshop_jobs
set status_section = 'Document Pending'
where status_section is null or btrim(status_section) = '';

create index if not exists idx_bodyshop_jobs_status_section
  on public.bodyshop_jobs (status_section);

create index if not exists idx_bodyshop_jobs_ro_date
  on public.bodyshop_jobs (ro_date desc);

create index if not exists idx_bodyshop_jobs_promised_date
  on public.bodyshop_jobs (promised_date);

-- Stage history for movement across workflow buckets
create table if not exists public.bodyshop_job_stages (
  id uuid primary key default gen_random_uuid(),
  job_id text not null references public.bodyshop_jobs(id) on delete cascade,
  from_status text,
  to_status text not null,
  changed_at timestamptz not null default now(),
  changed_by text, -- optional user id or name
  remark text,
  gm_remark text
);

-- Add new columns to existing installations safely.
alter table public.bodyshop_job_stages add column if not exists gm_remark text;

create index if not exists idx_bodyshop_job_stages_job_id
  on public.bodyshop_job_stages (job_id, changed_at desc);

-- Tombstones for rows deleted in the app UI.
-- Without this, deleted rows can reappear because the API also merges "open" ROs from Prisma.
create table if not exists public.bodyshop_job_hidden (
  job_id text primary key,
  hidden_at timestamptz not null default now()
);

-- Permissions (Supabase)
-- If your project has tightened schema privileges, the API can fail with:
-- "permission denied for schema public"
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on table public.bodyshop_jobs to anon, authenticated, service_role;
grant select, insert, update, delete on table public.bodyshop_job_stages to anon, authenticated, service_role;
grant select, insert, update, delete on table public.bodyshop_job_hidden to anon, authenticated, service_role;

-- Ensure future tables in public are accessible too (optional but helpful).
alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated, service_role;

