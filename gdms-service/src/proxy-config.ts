import crypto from "node:crypto";
import type { BrowserContext, Page } from "playwright";

/**
 * Bright Data India ISP proxy wiring — the network-egress fix for Railway's
 * outbound IP being blocked by GDMS (confirmed via gdms-probe: direct Railway
 * → ndms.hmil.net times out at the TCP layer; Railway → this proxy →
 * ndms.hmil.net succeeds end-to-end, including a real Playwright navigation
 * to the login page). This module owns exactly that egress concern — it has
 * no knowledge of GDMS selectors, OTP, or RO/billing logic.
 */

export class GdmsProxyError extends Error {}

export type ProxyConfig = { server: string; username: string; password: string };

/** Never log the raw username — Bright Data usernames encode the zone/customer id. */
function maskUsername(username: string): string {
  if (username.length <= 8) return "***";
  return `${username.slice(0, 4)}…${username.slice(-2)}`;
}

/**
 * Builds this GDMS session's Bright Data proxy config, pinning it to one
 * sticky Indian exit IP for the session's entire lifetime (login → OTP →
 * RO/billing fetch) via Bright Data's documented `-session-<id>` username
 * parameter — ISP proxies hold a sticky session for up to 7 days, so a
 * ~10-minute GDMS session is comfortably inside that window.
 *
 * Returns null when GDMS_PROXY_* env vars aren't set — that's expected and
 * fine for local dev on a network that already reaches GDMS directly (e.g.
 * this app's own Mac, confirmed separately). It is NOT fine in a Railway
 * deployment, which is why the login/verify/fetch call sites below refuse to
 * silently fall back to an unproxied direct connection once ANY proxy env
 * var is set but incomplete — see `readProxyConfigFromEnv`.
 */
export function buildGdmsProxyConfig(gdmsSessionId: string): ProxyConfig | null {
  const server = process.env.GDMS_PROXY_SERVER;
  const baseUsername = process.env.GDMS_PROXY_USERNAME;
  const password = process.env.GDMS_PROXY_PASSWORD;

  const anySet = Boolean(server || baseUsername || password);
  const allSet = Boolean(server && baseUsername && password);
  if (!anySet) return null;
  if (!allSet) {
    throw new GdmsProxyError(
      "GDMS_PROXY_SERVER/GDMS_PROXY_USERNAME/GDMS_PROXY_PASSWORD are only partially set — refusing to start a session that might silently fall back to Railway's direct (blocked) egress."
    );
  }

  // Bright Data session ids must be safe alphanumeric — strip the UUID's dashes.
  const safeSessionId = gdmsSessionId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 32);
  const username = `${baseUsername}-country-in-session-gdms${safeSessionId}`;
  return { server: server!, username, password: password! };
}

export function logProxyUsage(gdmsSessionId: string, proxy: ProxyConfig): void {
  console.log(
    `[GDMS][proxy] session ${gdmsSessionId} using Bright Data India ISP proxy, username=${maskUsername(proxy.username)}`
  );
}

/** Known Chromium network error substrings for proxy connect/auth failures, as opposed to a genuine GDMS-side problem. */
const PROXY_ERROR_SIGNATURES = [
  "ERR_PROXY_CONNECTION_FAILED",
  "ERR_TUNNEL_CONNECTION_FAILED",
  "ERR_NO_SUPPORTED_PROXIES",
  "ERR_SOCKS_CONNECTION_FAILED",
  "ERR_PROXY_AUTH",
  "407",
];

export function isProxyRelatedError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return PROXY_ERROR_SIGNATURES.some((sig) => message.includes(sig));
}

/**
 * Wraps a proxy-related failure in a clean, generic message safe to show
 * users — the real Chromium/Bright Data error (never proxy credentials,
 * which Chromium's own error text never includes) is logged server-side only.
 */
export function wrapProxyError(err: unknown, context: string): GdmsProxyError {
  console.error(`[GDMS][proxy] ${context} failed:`, err instanceof Error ? err.message : String(err));
  return new GdmsProxyError("Unable to connect to GDMS through the configured network. Please try again.");
}

// --- Dev-only egress consistency check (items 7/8 — never runs in normal production) ---

const EGRESS_CHECK_URL = "https://api.ipify.org?format=json";

function hashIp(ip: string): string {
  return crypto.createHash("sha256").update(ip).digest("hex").slice(0, 8);
}

/**
 * Confirms `page` (browser-driven navigation) and `context.request` (the
 * Node-side API client `fetchRepairOrders`/`fetchRepairBillingForRoNumbers` actually use)
 * are exiting through the SAME proxy IP — never assumed, only ever asserted
 * after checking. Only runs when GDMS_PROXY_DEBUG=true; a no-op otherwise, so
 * normal user sessions never pay this extra round-trip or depend on a
 * third-party IP-echo service. Throws GdmsProxyError on any mismatch —
 * proceeding with an inconsistent egress risks RO/billing fetches silently
 * hitting Railway's direct, already-proven-blocked egress instead.
 */
export async function verifyProxyEgressConsistency(
  page: Page,
  context: BrowserContext,
  label: string
): Promise<void> {
  if (process.env.GDMS_PROXY_DEBUG !== "true") return;
  if (!buildGdmsProxyConfigured()) return;

  let pageIp: string | undefined;
  let requestIp: string | undefined;
  const checkPage = await context.newPage();
  try {
    await checkPage.goto(EGRESS_CHECK_URL, { timeout: 15_000 });
    const body = await checkPage.textContent("body");
    pageIp = body ? (JSON.parse(body) as { ip?: string }).ip : undefined;
  } catch (err) {
    console.warn(`[GDMS][proxy-check:${label}] page-navigation egress check failed:`, describeError(err));
  } finally {
    await checkPage.close().catch(() => {});
  }

  try {
    const response = await context.request.get(EGRESS_CHECK_URL, { timeout: 15_000 });
    const json = (await response.json()) as { ip?: string };
    requestIp = json.ip;
  } catch (err) {
    console.warn(`[GDMS][proxy-check:${label}] context.request egress check failed:`, describeError(err));
  }

  const pageHash = pageIp ? hashIp(pageIp) : "unknown";
  const requestHash = requestIp ? hashIp(requestIp) : "unknown";
  const consistent = Boolean(pageIp && requestIp && pageIp === requestIp);
  console.log(
    `[GDMS][proxy-check:${label}] page peer hash=${pageHash}, context.request peer hash=${requestHash}, consistent=${consistent}`
  );

  if (!consistent) {
    throw new GdmsProxyError(
      `Playwright page and context.request showed different proxy egress at "${label}" — refusing to continue rather than risk RO/billing requests bypassing the proxy.`
    );
  }
}

function buildGdmsProxyConfigured(): boolean {
  return Boolean(process.env.GDMS_PROXY_SERVER && process.env.GDMS_PROXY_USERNAME && process.env.GDMS_PROXY_PASSWORD);
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
