# Supabase + Prisma Setup

## Everything in Supabase

When configured correctly, **all app data and auth live in Supabase**:

| What | Where in Supabase |
|------|-------------------|
| **All app data** (users, ROs, vehicles, branches, options, etc.) | **Supabase Postgres** — Prisma writes to the database at `DATABASE_URL`. When that URL is your Supabase project (pooler + direct), every table is in Supabase. |
| **Login / passwords** | **Supabase Auth** — sign-in, user creation, and password changes go through Supabase Auth; `User.supabaseAuthId` links app users to `auth.users`. |
| **RO photos** | **Supabase Postgres** — stored as JSON in `RepairOrder.photos` (base64). Optionally you can later move these to Supabase Storage and store URLs instead. |

### Checklist: ensure everything is in Supabase

1. **Use Supabase as your database**
   - In [Supabase Dashboard](https://app.supabase.com) → your project → **Settings → Database**, copy:
     - **Connection string (URI)** for "Transaction" mode (pooler, port **6543**) → use as `DATABASE_URL` (add `?pgbouncer=true&sslmode=require` if not present).
     - **Connection string (URI)** for "Session" mode (direct, port **5432**) → use as `DIRECT_URL`.
   - Put both in `.env` (and in Vercel/hosting env vars for production).

2. **Apply migrations to Supabase**
   ```bash
   npx prisma migrate deploy
   ```
   So all tables (User, Branch, RepairOrder, etc.) exist in Supabase.

3. **Configure Supabase Auth**
   - In Supabase: **Authentication → Providers → Email** — enable Email, set "Confirm email" as needed.
   - In `.env` set: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (from **Settings → API**).

4. **Verify**
   - Call `GET /api/supabase-verify` (when the app is running). It checks that the app can reach Supabase DB and Auth.

After this, the app does not use any other database or auth provider; everything is in Supabase.

---

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
- `Branch`, `User` (includes optional `supabaseAuthId` for Auth sync)
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

The app now uses **Supabase Auth** for logins (see below). Storage is still unused.

---

## Supabase Auth (logins)

The app signs users in via **Supabase Auth** (email + password). App users and roles stay in your **Prisma `User`** table; Supabase Auth is used only to verify the password.

- **Login flow:** NextAuth Credentials provider first calls `supabase.auth.signInWithPassword()`. If that fails (e.g. user not yet in Supabase), it falls back to your existing Prisma + bcrypt check and, on success, creates the user in Supabase Auth so the next login uses Supabase.
- **New users (admin):** When an admin creates a user in the app, the user is created in both Prisma and Supabase Auth (same email/password). `User.supabaseAuthId` links the two.
- **Change password:** When a user changes their password, it is updated in both Prisma and Supabase Auth when the user has a `supabaseAuthId`.

**Required in Supabase dashboard:**

1. **Authentication → Providers → Email:** Enable “Email” and ensure “Confirm email” is off if you want immediate logins (or use “Confirm email” and set `email_confirm: true` when creating users, which we do).
2. **Environment variables:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` must be set in `.env` and in your host (e.g. Vercel).

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
