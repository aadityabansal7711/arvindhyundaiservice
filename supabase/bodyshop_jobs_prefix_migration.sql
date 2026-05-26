-- One-off migration: force a branch prefix (BP / FT / DH) on every existing
-- bodyshop RO so per-branch 1..N series cannot collide.
--
-- Format: "<PREFIX>-<existing id/ro_no>"
-- Keep this mapping in sync with src/lib/ro-prefix.ts.
--
-- Run this once against the Supabase database. Wrapped in a transaction so a
-- partial failure leaves no half-prefixed data.

begin;

-- 1. Allow the parent PK to be renamed without violating the FK from
--    bodyshop_job_stages. Recreate the constraint with ON UPDATE CASCADE.
--    Guarded so the migration is a no-op on installs that don't yet have
--    the stage-history table.
do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'bodyshop_job_stages'
  ) then
    alter table public.bodyshop_job_stages
      drop constraint if exists bodyshop_job_stages_job_id_fkey;
    alter table public.bodyshop_job_stages
      add constraint bodyshop_job_stages_job_id_fkey
      foreign key (job_id) references public.bodyshop_jobs(id)
      on delete cascade
      on update cascade;
  end if;
end$$;

-- 2. Resolve branch name -> prefix once.
with branch_prefix as (
  select
    id::text as branch_id,
    case lower(name)
      when 'bypass'    then 'BP'
      when 'fatehabad' then 'FT'
      when 'dharera'   then 'DH'
      else null
    end as prefix
  from public."Branch"
)
update public.bodyshop_jobs j
set
  id    = bp.prefix || '-' || j.id,
  ro_no = bp.prefix || '-' || coalesce(j.ro_no, j.id)
from branch_prefix bp
where j.branch_id = bp.branch_id
  and bp.prefix is not null;

-- 3. Also rewrite tombstones in bodyshop_job_hidden (if that table exists in
--    this environment) so a previously-deleted RO doesn't reappear after the
--    rename. Wrapped in a DO block so the migration still runs on installs
--    that never created the tombstone table.
do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'bodyshop_job_hidden'
  ) then
    with branch_prefix as (
      select
        id::text as branch_id,
        case lower(name)
          when 'bypass'    then 'BP'
          when 'fatehabad' then 'FT'
          when 'dharera'   then 'DH'
          else null
        end as prefix
      from public."Branch"
    )
    update public.bodyshop_job_hidden h
    set job_id = bp.prefix || '-' || h.job_id
    from public.bodyshop_jobs j
    join branch_prefix bp on bp.branch_id = j.branch_id
    where j.id = bp.prefix || '-' || h.job_id
      and bp.prefix is not null;
  end if;
end$$;

commit;

-- Sanity check (run manually after commit):
--   select branch_id, count(*), min(id), max(id)
--   from public.bodyshop_jobs
--   group by branch_id;
