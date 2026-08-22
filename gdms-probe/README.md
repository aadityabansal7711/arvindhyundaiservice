# gdms-probe

Standalone network diagnostic harness for GDMS (`ndms.hmil.net`) reachability. Built to answer *where exactly* connectivity fails — DNS, raw TCP, TLS/SNI, or the full HTTP request — and to compare IPv4 vs IPv6, across different hosts (this machine, Railway, a future Indian VPS) with directly comparable output.

Deliberately has **zero** connection to `gdms-service` — doesn't import from it, doesn't touch the Playwright login flow, doesn't know about GDMS credentials or proxy config. It only ever loads the public, unauthenticated login page (`GET /cmm/cmmi/selectLoginMain.dms`), same as any browser visiting the site does.

## What it checks, per run

1. DNS A records
2. DNS AAAA records
3. Raw TCP connect to port 443 (first A record IP)
4. TLS handshake with correct SNI (same IP)
5. Forced-IPv4 full HTTPS request (connect + TLS + HTTP, pinned to the resolved A record IP)
6. Forced-IPv6 full HTTPS request — only attempted if an AAAA record exists
7. "Ground truth" HTTPS request using normal DNS resolution (closest to what a real browser does)
8. This host's own outbound public IP, ASN/org, and country (via ipapi.co)

Each check has its own 10s timeout and reports success/failure + timing independently, so a partial failure (e.g. TCP connects but TLS hangs) is visible rather than masked by one aggregate error.

## Run locally

```bash
npm install
npm run probe
```

Prints the full JSON report to stdout.

## Run on Railway (or any other host, for comparison)

```bash
cp .env.example .env.local   # fill in PROBE_TOKEN
npm install
npm run build && npm start
```

Deploy the same way as `gdms-service` (Root Directory = `gdms-probe`, Dockerfile auto-detected). Once deployed:

```bash
curl -H "Authorization: Bearer <PROBE_TOKEN>" https://<your-probe-url>/debug-not-needed-just-hit-root
```

(any authenticated request to any path except `/health` runs the probe and returns the JSON report)

Set `PROBE_ENV_LABEL` on each deployment (e.g. `railway-singapore`, `vps-mumbai`) so the `environment` field in the output makes multi-host comparisons unambiguous at a glance.
