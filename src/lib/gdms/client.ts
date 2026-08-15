import { chromium } from "playwright";
import {
  GDMS_BASE_URL,
  GDMS_LOGIN_PAGE_PATH,
  GDMS_LOGIN_VERIFY_TIMEOUT_MS,
  GDMS_NAV_TIMEOUT_MS,
  GDMS_OTP_SENT_TIMEOUT_MS,
  GDMS_HOME_PATH,
  GDMS_RO_LIST_PATH,
  GDMS_RO_PAGE_SIZE,
  GDMS_SELECTORS,
  OTP_SENT_BANNER_TEXT,
} from "./config";
import { createSession, destroySession, getSession, markAuthenticated } from "./session-store";
import type { GdmsRoRow } from "./mapper";

/**
 * All GDMS network automation lives here, driven via a real headless
 * Chromium browser rather than hand-replicated HTTP requests — GDMS's own
 * page JS computes a password hash and session-bound anti-automation tokens
 * we deliberately do not try to reverse-engineer.
 *
 * IMPORTANT: never call this module from an automated/CI test. Every call
 * here hits the live GDMS site and repeated automated logins risk locking
 * out the dealership's real account. See the plan's rollout section for the
 * (manual, deliberately sparse) testing approach.
 */

export class GdmsLoginError extends Error {}
export class GdmsOtpError extends Error {}

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
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(`${GDMS_BASE_URL}${GDMS_LOGIN_PAGE_PATH}`, {
      timeout: GDMS_NAV_TIMEOUT_MS,
      waitUntil: "domcontentloaded",
    });

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
      branchId: params.branchId,
      userId: params.appUserId,
      browser,
      context,
      page,
    });
    return sessionId;
  } catch (err) {
    await browser.close().catch(() => {});
    if (err instanceof GdmsLoginError) throw err;
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
  const { page } = session;

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

  const sRoStrtDate = toGdmsRangeTimestamp(dateFrom, -1);
  const sRoFnshDate = toGdmsRangeTimestamp(dateTo, 0);

  const allRows: GdmsRoRow[] = [];
  let total = Number.POSITIVE_INFINITY;
  const MAX_PAGES = 200;

  try {
    for (let pageIndex = 1; pageIndex <= MAX_PAGES && allRows.length < total; pageIndex += 1) {
      const firstIndex = (pageIndex - 1) * GDMS_RO_PAGE_SIZE;
      const lastIndex = firstIndex + GDMS_RO_PAGE_SIZE;

      const response = await session.context.request.post(`${GDMS_BASE_URL}${GDMS_RO_LIST_PATH}`, {
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

      if (!response.ok()) {
        throw new Error(`GDMS RO list request failed: ${response.status()} ${response.statusText()}`);
      }

      const json = (await response.json()) as { total?: number; data?: GdmsRoRow[] };
      const rows = Array.isArray(json?.data) ? json.data : [];
      total = typeof json?.total === "number" ? json.total : rows.length;
      if (rows.length === 0) break;
      allRows.push(...rows);
    }
  } finally {
    await destroySession(sessionId);
  }

  return allRows;
}
