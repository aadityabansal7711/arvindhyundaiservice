import { launch } from "@cloudflare/playwright";

/**
 * Throwaway connectivity proof-of-concept — NOT the real service.
 *
 * Question this answers: does Cloudflare Browser Rendering (a fresh
 * Playwright browser per attempt, same as how the real gdms-service launches
 * a fresh browser per /login/start call) reliably reach GDMS's login page,
 * or was the one successful browser test earlier a fluke of which Cloudflare
 * datacenter happened to serve that request?
 *
 * Runs several independent attempts in one request (launch → goto → wait for
 * #usrId → close) and reports a per-attempt breakdown. Only worth migrating
 * the real integration here if this comes back consistently ok.
 */

interface Env {
  MYBROWSER: Fetcher;
  PROOF_TOKEN: string;
}

const GDMS_LOGIN_URL = "https://ndms.hmil.net/cmm/cmmi/selectLoginMain.dms";
const ATTEMPTS = 5;
const NAV_TIMEOUT_MS = 20_000;
const SELECTOR_TIMEOUT_MS = 20_000;

type AttemptResult = {
  attempt: number;
  ok: boolean;
  ms: number;
  error?: string;
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const auth = request.headers.get("authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
    if (token !== env.PROOF_TOKEN) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const results: AttemptResult[] = [];

    for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
      const start = Date.now();
      let browser: Awaited<ReturnType<typeof launch>> | null = null;
      try {
        browser = await launch(env.MYBROWSER);
        const page = await browser.newPage();
        await page.goto(GDMS_LOGIN_URL, { timeout: NAV_TIMEOUT_MS, waitUntil: "commit" });
        await page.waitForSelector("#usrId", { timeout: SELECTOR_TIMEOUT_MS });
        results.push({ attempt, ok: true, ms: Date.now() - start });
      } catch (err) {
        results.push({
          attempt,
          ok: false,
          ms: Date.now() - start,
          error: err instanceof Error ? err.message : String(err),
        });
      } finally {
        if (browser) await browser.close().catch(() => {});
      }
    }

    const successes = results.filter((r) => r.ok).length;
    return Response.json({ successes, total: ATTEMPTS, allSucceeded: successes === ATTEMPTS, results });
  },
};
