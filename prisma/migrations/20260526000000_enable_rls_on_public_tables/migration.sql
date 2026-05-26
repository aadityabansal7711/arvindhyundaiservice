-- Enable Row Level Security on all public tables exposed via PostgREST.
-- No policies are added: app access goes through Prisma (direct DB connection,
-- bypasses RLS) and the Supabase service-role client (also bypasses RLS).
-- Enabling RLS with no policies blocks anon/authenticated PostgREST access,
-- which closes the Supabase linter "rls_disabled_in_public" findings.

ALTER TABLE public."Branch" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."UserBranch" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."bodyshop_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."bodyshop_job_stages" ENABLE ROW LEVEL SECURITY;
