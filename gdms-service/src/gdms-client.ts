import crypto from "node:crypto";
import { chromium } from "playwright";
import {
  buildGdmsProxyConfig,
  GdmsProxyError,
  isProxyRelatedError,
  logProxyUsage,
  verifyProxyEgressConsistency,
  wrapProxyError,
} from "./proxy-config";
import {
  GDMS_BASE_URL,
  GDMS_BILLING_DETAIL_PATH,
  GDMS_BILLING_LABOUR_PATH,
  GDMS_BILLING_MAX_ROS,
  GDMS_BILLING_PAGE_SIZE,
  GDMS_BILLING_PART_PATH,
  GDMS_LOGIN_PAGE_PATH,
  GDMS_LOGIN_VERIFY_TIMEOUT_MS,
  GDMS_NAV_TIMEOUT_MS,
  GDMS_OTP_SENT_TIMEOUT_MS,
  GDMS_HOME_PATH,
  GDMS_LOGIN_FORM_VISIBLE_TIMEOUT_MS,
  GDMS_RO_LIST_PATH,
  GDMS_RO_PAGE_SIZE,
  GDMS_SELECTORS,
  OTP_SENT_BANNER_TEXT,
} from "./config";
import { createSession, destroySession, getSession, markAuthenticated } from "./session-store";
import type { GdmsPendingSession } from "./session-store";
import {
  buildBillingTotals,
  type BillingTotals,
  type GdmsBillingLabourRow,
  type GdmsBillingPartRow,
} from "./billing-mapper";

/**
 * Subset of fields GDMS returns per RO in selectRepairOrderList.json's
 * `data[]`. Deliberately just an opaque passthrough shape here — this
 * service never interprets these fields, it only forwards them to the main
 * app, which owns the real mapping in its own src/lib/gdms/mapper.ts.
 */
export type GdmsRoRow = {
  roNo: string;
  [key: string]: unknown;
};

const BILLING_AJAX_HEADERS = {
  "Content-Type": "application/json",
  "X-Requested-With": "XMLHttpRequest",
  "X-AjaxRequest": "1",
} as const;

/**
 * All GDMS network automation lives here, driven via a real headless
 * Chromium browser rather than hand-replicated HTTP requests — GDMS's own
 * page JS computes a password hash and session-bound anti-automation tokens
 * we deliberately do not try to reverse-engineer.
 *
 * IMPORTANT: never call this module from an automated/CI test. Every call
 * here hits the live GDMS site and repeated automated logins risk locking
 * out the dealership's real account.
 */

export class GdmsLoginError extends Error {}
export class GdmsOtpError extends Error {}
/** GDMS genuinely has no Repair Billing detail for this RO yet (not billed) — not a failure. */
export class GdmsBillingNotFoundError extends Error {}

async function readErrorBannerText(page: import("playwright").Page): Promise<string | null> {
  try {
    const locator = page.locator("#errorMessageContext");
    if ((await locator.count()) === 0) return null;
    const text = (await locator.innerText()).trim();
    return text || null;
  } catch {
    return null;
  }
}

export async function startLogin(params: {
  branchId: string;
  appUserId: string;
  gdmsUserId: string;
  gdmsPassword: string;
}): Promise<string> {
  // Generated up front (not inside createSession, as before) because the
  // Bright Data proxy session id must be baked into the proxy username
  // before the browser even launches — this same id becomes the session
  // store's id too, so "one GDMS session" and "one sticky proxy session"
  // are always the same lifetime by construction.
  const gdmsSessionId = crypto.randomUUID();
  const proxyConfig = buildGdmsProxyConfig(gdmsSessionId);
  if (proxyConfig) logProxyUsage(gdmsSessionId, proxyConfig);

  let browser: import("playwright").Browser;
  try {
    browser = await chromium.launch({
      headless: true,
      ...(proxyConfig
        ? { proxy: { server: proxyConfig.server, username: proxyConfig.username, password: proxyConfig.password } }
        : {}),
    });
  } catch (err) {
    if (isProxyRelatedError(err)) throw wrapProxyError(err, "browser launch");
    throw new GdmsLoginError(
      err instanceof Error
        ? `Headless browser failed to start: ${err.message}`
        : "Headless browser failed to start"
    );
  }

  // Proxy set at both launch AND context level — Playwright's context.request
  // (used by fetchRepairOrders/fetchRepairBillingForRoNumbers) is verified below to
  // actually honor it; this is belt-and-braces, not a substitute for that check.
  const context = await browser.newContext({
    ignoreHTTPSErrors: false,
    ...(proxyConfig
      ? { proxy: { server: proxyConfig.server, username: proxyConfig.username, password: proxyConfig.password } }
      : {}),
  });
  const page = await context.newPage();

  try {
    await verifyProxyEgressConsistency(page, context, "before-send-otp");

    console.log(`[GDMS] Opening login page for branch ${params.branchId}...`);
    // "commit" resolves as soon as the response headers arrive, rather than
    // waiting for the full document + its scripts to finish loading — GDMS's
    // login page can take a while past that point (analytics/anti-bot JS,
    // slow subresources) even once the response itself came back quickly, so
    // waiting on "domcontentloaded" here was timing out well before the form
    // was actually unusable to fill in.
    await page.goto(`${GDMS_BASE_URL}${GDMS_LOGIN_PAGE_PATH}`, {
      timeout: GDMS_NAV_TIMEOUT_MS,
      waitUntil: "commit",
    });
    console.log("[GDMS] Login URL committed, waiting for the form to render...");

    await page.locator(GDMS_SELECTORS.usrId).waitFor({
      state: "visible",
      timeout: GDMS_LOGIN_FORM_VISIBLE_TIMEOUT_MS,
    });
    console.log("[GDMS] Username field visible");

    await page.fill(GDMS_SELECTORS.usrId, params.gdmsUserId);
    await page.fill(GDMS_SELECTORS.usrPswdNo, params.gdmsPassword);

    await Promise.all([
      page.waitForNavigation({ timeout: GDMS_OTP_SENT_TIMEOUT_MS, waitUntil: "domcontentloaded" }),
      page.click(GDMS_SELECTORS.btnGenerateOtp),
    ]);

    const bannerText = await readErrorBannerText(page);
    if (!bannerText || !bannerText.includes(OTP_SENT_BANNER_TEXT)) {
      throw new GdmsLoginError(
        bannerText || "GDMS did not confirm the OTP was sent. Check the branch's GDMS username/password."
      );
    }

    const sessionId = await createSession({
      id: gdmsSessionId,
      branchId: params.branchId,
      userId: params.appUserId,
      browser,
      context,
      page,
    });
    return sessionId;
  } catch (err) {
    await browser.close().catch(() => {});
    if (err instanceof GdmsLoginError || err instanceof GdmsProxyError) throw err;
    if (isProxyRelatedError(err)) throw wrapProxyError(err, "login page navigation");
    throw new GdmsLoginError(
      err instanceof Error ? err.message : "Failed to reach GDMS login page"
    );
  }
}

export async function verifyOtp(sessionId: string, otp: string): Promise<void> {
  const session = getSession(sessionId);
  if (!session) {
    throw new GdmsOtpError("This GDMS session has expired. Please start again.");
  }
  const { page, context } = session;

  await verifyProxyEgressConsistency(page, context, "before-verify-otp");

  await page.fill(GDMS_SELECTORS.otpEnter, otp);

  try {
    await Promise.all([
      page.waitForNavigation({ timeout: GDMS_LOGIN_VERIFY_TIMEOUT_MS, waitUntil: "domcontentloaded" }),
      page.click(GDMS_SELECTORS.btnLoginClickGdmsNew),
    ]);
  } catch {
    // Fall through — check current URL/banner below regardless of whether
    // waitForNavigation itself resolved or timed out.
  }

  if (page.url().includes(GDMS_HOME_PATH)) {
    markAuthenticated(sessionId);
    return;
  }

  const bannerText = await readErrorBannerText(page);
  await destroySession(sessionId);
  throw new GdmsOtpError(bannerText || "OTP verification failed. Please try again.");
}

function toGdmsRangeTimestamp(dateStr: string, dayOffset: number): string {
  // GDMS expects IST-midnight boundaries expressed in UTC (IST = UTC+5:30,
  // no DST). IST midnight of `dateStr` = (dateStr - 1 day) 18:30:00.000Z.
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + dayOffset);
  return `${d.toISOString().slice(0, 10)}T18:30:00.000Z`;
}

export async function fetchRepairOrders(
  sessionId: string,
  dateFrom: string,
  dateTo: string
): Promise<GdmsRoRow[]> {
  const session = getSession(sessionId);
  if (!session) {
    throw new GdmsOtpError("This GDMS session has expired. Please start again.");
  }
  if (session.stage !== "authenticated") {
    throw new GdmsOtpError("This GDMS session has not completed OTP verification yet.");
  }

  await verifyProxyEgressConsistency(session.page, session.context, "before-fetch-ros");

  const sRoStrtDate = toGdmsRangeTimestamp(dateFrom, -1);
  const sRoFnshDate = toGdmsRangeTimestamp(dateTo, 0);

  const allRows: GdmsRoRow[] = [];
  let total = Number.POSITIVE_INFINITY;
  const MAX_PAGES = 200;

  for (let pageIndex = 1; pageIndex <= MAX_PAGES && allRows.length < total; pageIndex += 1) {
    const firstIndex = (pageIndex - 1) * GDMS_RO_PAGE_SIZE;
    const lastIndex = firstIndex + GDMS_RO_PAGE_SIZE;

    let response: Awaited<ReturnType<typeof session.context.request.post>>;
    try {
      response = await session.context.request.post(`${GDMS_BASE_URL}${GDMS_RO_LIST_PATH}`, {
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
          "X-AjaxRequest": "1",
        },
        data: {
          recordCountPerPage: GDMS_RO_PAGE_SIZE,
          pageIndex,
          firstIndex,
          lastIndex,
          sRoStrtDate,
          sRoFnshDate,
          sModelCode: "",
          sWorkType: "",
          sRoStat: "",
          sSaleStrtDate: null,
          sSaleFnshDate: null,
          sUsedCarYn: "",
          sSaEmpNo: "",
          sDssYn: "",
          sRoNo: "",
          sRgstnNo: "",
          vhclUseType: "",
          isNightService: "",
          sVinFullFlag: "",
          sVinNo: "",
          sScrnId: "RO",
        },
      });
    } catch (err) {
      if (isProxyRelatedError(err)) throw wrapProxyError(err, "RO list request");
      throw err;
    }

    if (!response.ok()) {
      throw new Error(`GDMS RO list request failed: ${response.status()} ${response.statusText()}`);
    }

    const json = (await response.json()) as { total?: number; data?: GdmsRoRow[] };
    const rows = Array.isArray(json?.data) ? json.data : [];
    total = typeof json?.total === "number" ? json.total : rows.length;
    if (rows.length === 0) break;
    allRows.push(...rows);
  }

  return allRows;
}

async function fetchAllBillingPages<T>(
  session: GdmsPendingSession,
  path: string,
  baseParams: Record<string, unknown>
): Promise<T[]> {
  const rows: T[] = [];
  let total = Number.POSITIVE_INFINITY;
  const MAX_PAGES = 20;

  for (let pageIndex = 1; pageIndex <= MAX_PAGES && rows.length < total; pageIndex += 1) {
    const firstIndex = (pageIndex - 1) * GDMS_BILLING_PAGE_SIZE;
    const lastIndex = firstIndex + GDMS_BILLING_PAGE_SIZE;

    let response: Awaited<ReturnType<typeof session.context.request.post>>;
    try {
      response = await session.context.request.post(`${GDMS_BASE_URL}${path}`, {
        headers: BILLING_AJAX_HEADERS,
        data: { recordCountPerPage: GDMS_BILLING_PAGE_SIZE, pageIndex, firstIndex, lastIndex, ...baseParams },
        timeout: GDMS_NAV_TIMEOUT_MS,
      });
    } catch (err) {
      if (isProxyRelatedError(err)) throw wrapProxyError(err, `billing request to ${path}`);
      throw err;
    }

    if (!response.ok()) {
      throw new Error(`GDMS request to ${path} failed: ${response.status()} ${response.statusText()}`);
    }

    const json = (await response.json()) as { total?: unknown; data?: T[] };
    const pageRows = Array.isArray(json?.data) ? json.data : [];
    total = Number(json?.total) || pageRows.length;
    if (pageRows.length === 0) break;
    rows.push(...pageRows);
  }

  return rows;
}

/**
 * For one RO: loads its Repair Billing detail (needed to get the `modelCode`
 * the Labour tab's request requires — mirrors the real UI, which loads the
 * detail panel before the Labour/Parts tabs), then sums its Labour and Parts
 * tabs into billing totals.
 */
async function fetchBillingDetailForRo(
  session: GdmsPendingSession,
  roNo: string,
  billingNoFallback: string | null
): Promise<BillingTotals> {
  const detailResponse = await session.context.request.post(`${GDMS_BASE_URL}${GDMS_BILLING_DETAIL_PATH}`, {
    headers: BILLING_AJAX_HEADERS,
    data: { sCondition: "sRoNo", sKeyword: roNo },
    timeout: GDMS_NAV_TIMEOUT_MS,
  });
  if (!detailResponse.ok()) {
    throw new Error(
      `GDMS Repair Billing detail request failed: ${detailResponse.status()} ${detailResponse.statusText()}`
    );
  }
  const detailJson = (await detailResponse.json()) as {
    detail?: { modelCode?: string | null; custGstNo?: string | null; bilngNo?: string | null } | null;
  };
  const detail = detailJson?.detail;
  if (!detail) {
    throw new GdmsBillingNotFoundError(`GDMS returned no billing detail for RO ${roNo}`);
  }

  const [labourRows, partRows] = await Promise.all([
    fetchAllBillingPages<GdmsBillingLabourRow>(session, GDMS_BILLING_LABOUR_PATH, {
      roNo,
      modelCode: detail.modelCode ?? "",
      searchType: "D",
      custGstNo: detail.custGstNo ?? "",
    }),
    fetchAllBillingPages<GdmsBillingPartRow>(session, GDMS_BILLING_PART_PATH, {
      roNo,
      searchType: "D",
      indictor: "C",
    }),
  ]);

  return buildBillingTotals({
    roNo,
    billingNo: detail.bilngNo ?? billingNoFallback,
    labourRows,
    partRows,
  });
}

/**
 * Fetches labour/parts billing totals for an explicit list of RO numbers, via
 * GDMS's Repair Billing detail screen (a different screen from the RO List
 * above). Does NOT destroy the session; same contract as `fetchRepairOrders`.
 *
 * Deliberately driven by the caller's RO numbers rather than GDMS's own
 * Repair Billing *list* (which is scoped to a bill-date range): a bodyshop
 * repair routinely gets billed weeks after its RO was opened, so filtering
 * billing lookups by the same date range used for the RO list caused
 * already-open ROs to never have their Labour/Parts amounts backfilled. The
 * caller is expected to pass every currently-open RO it cares about.
 *
 * An RO simply not billed yet is expected and skipped silently — it's not a
 * failure. Other per-RO failures (a bad detail response, a network blip) are
 * collected in `errors` rather than aborting the whole batch, since one bad
 * RO shouldn't lose billing data for the rest.
 */
export async function fetchRepairBillingForRoNumbers(
  sessionId: string,
  roNumbers: string[]
): Promise<{ totals: BillingTotals[]; errors: { roNo: string; message: string }[] }> {
  const session = getSession(sessionId);
  if (!session) {
    throw new GdmsOtpError("This GDMS session has expired. Please start again.");
  }
  if (session.stage !== "authenticated") {
    throw new GdmsOtpError("This GDMS session has not completed OTP verification yet.");
  }

  const uniqueRos = Array.from(new Set(roNumbers.map((r) => r.trim()).filter(Boolean))).slice(
    0,
    GDMS_BILLING_MAX_ROS
  );

  const totals: BillingTotals[] = [];
  const errors: { roNo: string; message: string }[] = [];

  for (const roNo of uniqueRos) {
    try {
      totals.push(await fetchBillingDetailForRo(session, roNo, null));
    } catch (err) {
      if (err instanceof GdmsBillingNotFoundError) continue;
      errors.push({ roNo, message: err instanceof Error ? err.message : "Failed to fetch billing detail" });
    }
  }

  return { totals, errors };
}
