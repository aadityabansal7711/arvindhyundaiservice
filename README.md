# arvindhyundaiservice

## Deploying to Vercel

If the live site shows the default Next.js “To get started, edit the page.tsx file” page, the build likely failed or env vars are missing. Do the following:

1. **Environment variables** (Vercel → Project → Settings → Environment Variables). Add for **Production** (and Preview if you use it):
   - `DATABASE_URL` – Postgres connection string (use **Supabase** pooler, port 6543 with `?pgbouncer=true&sslmode=require` so all data lives in Supabase).
   - `DIRECT_URL` – Direct Postgres URL (Supabase direct, port 5432).
   - `NEXTAUTH_SECRET` – Random secret (e.g. `openssl rand -base64 32`).
   - `NEXTAUTH_URL` – Your live URL, e.g. `https://your-app.vercel.app`.
   - Supabase: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (see `.env.example` and **SUPABASE.md**).

2. **Redeploy** – After saving env vars, trigger a new deployment (Deployments → ⋮ on latest → Redeploy, or push a new commit). The build runs `prisma generate` and then `next build`.

3. **Database** – Ensure migrations are applied to the same DB you use in production: `npx prisma migrate deploy` (see SUPABASE.md for Supabase).
