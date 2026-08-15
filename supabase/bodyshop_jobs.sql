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

-- Splits Bodyshop (insurance/accident, GDMS work type "AR") from Service
-- (every other GDMS work type) into separate boards. Existing rows all
-- default to 'bodyshop' via this ADD COLUMN's constant-default backfill —
-- nothing already on the Bodyshop board disappears.
alter table public.bodyshop_jobs add column if not exists job_category text not null default 'bodyshop';

create index if not exists idx_bodyshop_jobs_category_status_ro_date
  on public.bodyshop_jobs (job_category, status_section, ro_date desc);

create index if not exists idx_bodyshop_jobs_category_open_board
  on public.bodyshop_jobs (job_category, status_section, ro_date desc)
  where status_section <> 'Delivered';

-- Raw GDMS work-type code (e.g. "AR", "PS") so the board can show a human
-- "Type" column (see getWorkTypeLabel() in src/lib/gdms/mapper.ts). Null for
-- manually-added records and rows never re-touched since this column was added.
alter table public.bodyshop_jobs add column if not exists work_type text;

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

create index if not exists idx_bodyshop_jobs_branch_status_ro_date
  on public.bodyshop_jobs (branch_id, status_section, ro_date desc);

create index if not exists idx_bodyshop_jobs_open_board
  on public.bodyshop_jobs (status_section, ro_date desc)
  where status_section <> 'Delivered';

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
alter table public.bodyshop_job_stages add column if not exists changed_by text;
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
-- The Next.js API uses the service-role key server-side. Do not expose these
-- operational tables to the public anon key; staff permissions are enforced in
-- the application API layer.
grant usage on schema public to service_role;
revoke all on table public.bodyshop_jobs from anon, authenticated;
revoke all on table public.bodyshop_job_stages from anon, authenticated;
revoke all on table public.bodyshop_job_hidden from anon, authenticated;
grant select, insert, update, delete on table public.bodyshop_jobs to service_role;
grant select, insert, update, delete on table public.bodyshop_job_stages to service_role;
grant select, insert, update, delete on table public.bodyshop_job_hidden to service_role;
