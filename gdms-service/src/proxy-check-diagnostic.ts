import crypto from "node:crypto";
import { chromium } from "playwright";
import { buildGdmsProxyConfig } from "./proxy-config";
import { GDMS_BASE_URL, GDMS_LOGIN_PAGE_PATH, GDMS_NAV_TIMEOUT_MS, GDMS_SELECTORS } from "./config";

/**
 * TEMPORARY diagnostic — verifies the real production Bright Data proxy
 * config reaches the GDMS login page correctly, without ever touching
 * credentials, OTP, or the session store. Self-contained on purpose so it
 * can be deleted in one step (this file + its one route in server.ts) once
 * the first real end-to-end login succeeds — see the note at the bottom of
 * that route in server.ts.
 *
 * Does NOT fill the login form, click Generate OTP, or call createSession —
 * the browser/context/page created here never outlive this function.
 */

// Two different services, each used via whichever access pattern already
// proved reliable through this proxy during earlier testing this session:
// ipify (page.goto + read body) for the page-vs-context.request IP hash
// comparison, and Bright Data's own geo endpoint (context.request only —
// page-navigating it hit repeated Chromium/CDP quirks with raw JSON
// responses through this proxy) for the country confirmation.
const IP_CHECK_URL = "https://api.ipify.org?format=json";
const GEO_CHECK_URL = "https://geo.brdtest.com/mygeo.json";
const TIMEOUT_MS = 20_000;

function hashIp(ip: string): string {
  return crypto.createHash("sha256").update(ip).digest("hex").slice(0, 8);
}

function describeErr(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export type ProxyCheckResult = {
  proxyConfigured: boolean;
  ok: boolean;
  ms: number;
  exitCountryIsIndia?: boolean;
  pageEgressHash?: string;
  contextRequestEgressHash?: string;
  egressHashesMatch?: boolean;
  gdmsHttpStatus?: number;
  gdmsPageTitle?: string;
  usrIdPresent?: boolean;
  usrPswdNoPresent?: boolean;
  error?: string;
};

export async function runProxyCheckDiagnostic(): Promise<ProxyCheckResult> {
  const start = Date.now();

  // Never registered in session-store — purely a throwaway id for the
  // Bright Data session-pinning username parameter during this one check.
  const throwawaySessionId = crypto.randomUUID();
  let proxyConfig: ReturnType<typeof buildGdmsProxyConfig>;
  try {
    proxyConfig = buildGdmsProxyConfig(throwawaySessionId);
  } catch (err) {
    return {
      proxyConfigured: false,
      ok: false,
      ms: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
  if (!proxyConfig) {
    return { proxyConfigured: false, ok: false, ms: Date.now() - start, error: "GDMS_PROXY_* not configured" };
  }

  const result: ProxyCheckResult = { proxyConfigured: true, ok: false, ms: 0 };

  let browser: import("playwright").Browser | undefined;
  try {
    browser = await chromium.launch({
      headless: true,
      proxy: { server: proxyConfig.server, username: proxyConfig.username, password: proxyConfig.password },
    });
    const context = await browser.newContext({
      ignoreHTTPSErrors: false,
      proxy: { server: proxyConfig.server, username: proxyConfig.username, password: proxyConfig.password },
    });
    const page = await context.newPage();

    // --- egress consistency: page navigation vs context.request, same IP? ---
    // This specific page-navigation-to-a-raw-JSON-endpoint check has shown
    // intermittent flakiness through this proxy (not a code bug — identical
    // code succeeded earlier this session) — bounded retry is safe here
    // since it's a credential-free third-party HTTP check, not a GDMS login
    // attempt, so none of the account-lockout concerns around retrying apply.
    let pageIp: string | undefined;
    for (let attempt = 1; attempt <= 3 && !pageIp; attempt += 1) {
      const ipPage = await context.newPage();
      try {
        await ipPage.goto(IP_CHECK_URL, { timeout: TIMEOUT_MS, waitUntil: "commit" });
        const body = await ipPage.locator("body").textContent({ timeout: TIMEOUT_MS });
        pageIp = body ? (JSON.parse(body) as { ip?: string }).ip : undefined;
      } catch (err) {
        console.warn(`[gdms-service] proxy-check page-egress attempt ${attempt} failed:`, describeErr(err));
      } finally {
        await ipPage.close().catch(() => {});
      }
    }
    if (pageIp) result.pageEgressHash = hashIp(pageIp);

    // Third-party IP/geo checks are best-effort and non-fatal — a hiccup on
    // ipify's or Bright Data's diagnostic endpoint must never prevent the
    // GDMS login-page check below (the actually important result) from running.
    try {
      const ipResponse = await context.request.get(IP_CHECK_URL, { timeout: TIMEOUT_MS });
      const requestIp = ((await ipResponse.json()) as { ip?: string }).ip;
      if (requestIp) result.contextRequestEgressHash = hashIp(requestIp);
    } catch (err) {
      console.warn("[gdms-service] proxy-check context.request egress check failed:", describeErr(err));
    }
    result.egressHashesMatch = Boolean(
      result.pageEgressHash && result.contextRequestEgressHash && result.pageEgressHash === result.contextRequestEgressHash
    );

    try {
      const geoResponse = await context.request.get(GEO_CHECK_URL, { timeout: TIMEOUT_MS });
      const geo = (await geoResponse.json()) as { country?: string };
      result.exitCountryIsIndia = geo.country === "IN";
    } catch (err) {
      console.warn("[gdms-service] proxy-check country check failed:", describeErr(err));
    }

    // --- GDMS login page load only — no form fill, no submit ---
    const response = await page.goto(`${GDMS_BASE_URL}${GDMS_LOGIN_PAGE_PATH}`, {
      timeout: GDMS_NAV_TIMEOUT_MS,
      waitUntil: "commit",
    });
    await page.locator(GDMS_SELECTORS.usrId).waitFor({ state: "visible", timeout: 30_000 }).catch(() => {});
    result.gdmsHttpStatus = response?.status();
    result.gdmsPageTitle = await page.title().catch(() => undefined);
    result.usrIdPresent = (await page.locator(GDMS_SELECTORS.usrId).count()) > 0;
    result.usrPswdNoPresent = (await page.locator(GDMS_SELECTORS.usrPswdNo).count()) > 0;

    result.ok = Boolean(
      result.egressHashesMatch && result.exitCountryIsIndia && result.usrIdPresent && result.usrPswdNoPresent
    );
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
  } finally {
    await browser?.close().catch(() => {});
    result.ms = Date.now() - start;
  }

  return result;
}
