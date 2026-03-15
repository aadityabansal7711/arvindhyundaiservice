# Supabase + Prisma Setup

## Why data might not be updating in Supabase

1. **Migrations not applied**  
   The app schema is in Prisma; Supabase only has what’s been applied via migrations. If you never ran migrations against Supabase, tables may be missing or out of date and writes can fail or go to the wrong place.

   **Fix:** From the project root (with `.env` containing your Supabase `DATABASE_URL` and `DIRECT_URL`):

   ```bash
   npx prisma migrate deploy
   ```

   Check status:

   ```bash
   npx prisma migrate status
   ```

2. **Wrong database in use**  
   If `DATABASE_URL` in the environment points to another database (e.g. local Postgres or an old URL), the app will write there instead of Supabase.  
   **Fix:** Ensure `.env` (and production env vars) use the Supabase pooler URL (port 6543) and direct URL (port 5432) from the Supabase project settings.

3. **Production env vars**  
   On Vercel/Netlify/etc., set `DATABASE_URL` and `DIRECT_URL` in the dashboard so the deployed app uses Supabase.

---

## “Useless” tables in Supabase

### Tables that belong to your app (Prisma)

These are the only tables your app uses. In Table Editor you’ll see them with the same names (case-sensitive):

- `Role`, `Permission`, `RolePermission`
- `Branch`, `User`
- `Customer`, `Vehicle`, `RepairOrder`
- `InsuranceClaim`, `Survey`, `Billing`
- `PartsOrder`, `WorkNote`
- `ImportRun`, `AuditLog`
- `DropdownOption`

### Tables already removed by migrations

- **`WhatsAppUpdate`** and **`NdcEntry`** were dropped in migration `20260315090638_add_ro_photos`. If they still exist in Supabase, either:
  - Run `npx prisma migrate deploy` so that migration runs and removes them, or  
  - Manually drop them in SQL Editor:  
    `DROP TABLE IF EXISTS "NdcEntry"; DROP TABLE IF EXISTS "WhatsAppUpdate";`

### Supabase system tables (normal, not “useless”)

Supabase creates and uses these; you can ignore them in Table Editor if you only care about app data:

- **Auth:** `auth.users`, `auth.sessions`, `auth.refresh_tokens`, etc.
- **Storage:** `storage.objects`, `storage.buckets`, etc.
- **Realtime / extensions:** `realtime.*`, `graphql_*`, `extensions.*`, etc.
- **Internal:** `supabase_migrations.*`, `vault.*`, etc.

Your app uses **Prisma → Postgres** only; it does not use Supabase Auth or Storage, so those tables are for Supabase’s own features.

---

## Connection strings (already in `.env`)

- **`DATABASE_URL`** – Pooler (port 6543) with `?pgbouncer=true&sslmode=require` for the Next.js app.  
- **`DIRECT_URL`** – Direct connection (port 5432) for `prisma migrate` and other CLI commands.

Keeping both ensures writes go to Supabase and migrations apply correctly.

---

## If migrations are up to date but data still doesn’t show

- **Supabase dashboard:** Confirm you’re in the correct project and in **Table Editor → public** schema. Your app uses the `public` schema.
- **Realtime:** Supabase Realtime may not receive events for changes made through Prisma (transaction pooler). The data is still saved; refresh the Table Editor or your app to see it.
- **Browser cache:** Hard refresh or use an incognito window when testing.
- **Errors:** Check the browser console and your Next.js server logs when you create/update data; any Prisma or 500 errors will explain failed writes.
