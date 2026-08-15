# gdms-service

Always-on browser-automation service for Hyundai's GDMS/NDMS dealer portal. The
main app (`../`) is deployed serverless on Vercel, which can't launch a real
headless Chromium or hold an in-memory session open across requests — this
service exists to do exactly that, deployed as a single always-on instance
(Railway, Docker).

It exposes a small internal HTTP API (`/login/start`, `/session/:id`,
`/login/verify`, `/fetch`) that the main app's `/api/gdms/*` routes call as a
thin, authenticated proxy — all app-level auth/RBAC/DB logic stays in the main
app. Every route (other than `/health`) requires `Authorization: Bearer
<GDMS_SERVICE_TOKEN>`, matching `GDMS_SERVICE_TOKEN` on both sides.

## Local development

```bash
cp .env.example .env.local   # fill in GDMS_SERVICE_TOKEN
npm install
npm run dev
```

## Deploying to Railway

1. New Railway service, Root Directory = `gdms-service`. Railway auto-detects
   the `Dockerfile`.
2. Set `GDMS_SERVICE_TOKEN` in the service's variables (same value as the
   main app's `GDMS_SERVICE_TOKEN`).
3. Keep this service at exactly one replica — sessions live in an in-memory
   `Map` (see `src/session-store.ts`), so horizontal scaling would break the
   login/OTP/fetch flow (a request could land on an instance that never saw
   the session get created).

## Do not automate calls against real GDMS

`gdms-client.ts` drives the actual `ndms.hmil.net` portal. Never call it from
an automated/CI test — repeated automated logins risk locking the
dealership's real account. Test manually, sparingly, with a narrow date
range.
