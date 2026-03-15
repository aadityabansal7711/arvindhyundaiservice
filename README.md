# arvindhyundaiservice

## Deploying to Vercel

If the live site shows the default Next.js “To get started, edit the page.tsx file” page, the build likely failed or env vars are missing. Do the following:

1. **Environment variables** (Vercel → Project → Settings → Environment Variables). Add for **Production** (and Preview if you use it):
   - `DATABASE_URL` – Postgres connection string (e.g. Supabase pooler, port 6543 with `?pgbouncer=true&sslmode=require`).
   - `DIRECT_URL` – Direct Postgres URL (e.g. Supabase direct, port 5432).
   - `NEXTAUTH_SECRET` – Random secret (e.g. `openssl rand -base64 32`).
   - `NEXTAUTH_URL` – Your live URL, e.g. `https://your-app.vercel.app`.

2. **Redeploy** – After saving env vars, trigger a new deployment (Deployments → ⋮ on latest → Redeploy, or push a new commit). The build runs `prisma generate` and then `next build`.

3. **Database** – Ensure migrations are applied to the same DB you use in production: `npx prisma migrate deploy` (see SUPABASE.md for Supabase).
