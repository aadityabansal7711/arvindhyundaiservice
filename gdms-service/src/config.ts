/** Constants for talking to Hyundai's GDMS/NDMS dealer portal. */

export const GDMS_BASE_URL = "https://ndms.hmil.net";
export const GDMS_LOGIN_PAGE_PATH = "/cmm/cmmi/selectLoginMain.dms";
export const GDMS_LOGIN_ACTION_PATH = "/cmm/cmmi/selectLoginAction.json";
export const GDMS_HOME_PATH = "/cmm/cmmd/selectHome.dms";
export const GDMS_RO_LIST_PATH = "/ser/serc/selectRepairOrderList.json";
/** GDMS's own "Logout" nav button navigates here (`fnLogOut()` in the site's JS). */
export const GDMS_LOGOUT_PATH = "/cmm/cmmi/selectLogoutAction.dms";

/**
 * GDMS's "Repair Billing" section — a separate screen from the Repair Order
 * List above. Its detail/Labour/Parts endpoints give the actual billing line
 * items for one RO, looked up directly by RO number (not via GDMS's own
 * Repair Billing list, which is scoped to a bill-date range). Paths captured
 * from a live HAR export.
 */
export const GDMS_BILLING_DETAIL_PATH = "/ser/serd/selectRepairBillingDetail.json";
export const GDMS_BILLING_LABOUR_PATH = "/ser/serd/selectRepairBillingLabr.json";
export const GDMS_BILLING_PART_PATH = "/ser/serd/selectRepairBillingPart.json";
export const GDMS_BILLING_PAGE_SIZE = 50;
/** Safety cap on how many ROs one fetch will pull Labour/Parts billing detail for. */
export const GDMS_BILLING_MAX_ROS = 300;

/** Real element IDs on the GDMS login page, captured from a live HAR export. */
export const GDMS_SELECTORS = {
  usrId: "#usrId",
  usrPswdNo: "#usrPswdNo",
  btnGenerateOtp: "#btnGenerateOtp",
  otpEnter: "#otpEnter",
  btnLoginClickGdmsNew: "#btnLoginClickGdmsNew",
} as const;

/** Text shown on the login page after "Send OTP" succeeds. */
export const OTP_SENT_BANNER_TEXT = "OTP Successfully Sent";

export const GDMS_RO_PAGE_SIZE = 50;

/** How long a pending login session (open headless browser) may sit idle before we tear it down. */
export const GDMS_SESSION_TTL_MS = 10 * 60 * 1000;

/** Bounds concurrent open headless-browser sessions (one per branch, at most). */
export const GDMS_MAX_CONCURRENT_SESSIONS = 3;

/** Generous timeouts — GDMS is a slow enterprise portal, not a modern SPA. */
export const GDMS_NAV_TIMEOUT_MS = 90_000;
/** How long to wait for the login form to actually render after navigation "commits" (headers received). */
export const GDMS_LOGIN_FORM_VISIBLE_TIMEOUT_MS = 60_000;
export const GDMS_OTP_SENT_TIMEOUT_MS = 20_000;
export const GDMS_LOGIN_VERIFY_TIMEOUT_MS = 20_000;
/** Best-effort logout on cleanup — short timeout since this must never hold up session teardown. */
export const GDMS_LOGOUT_TIMEOUT_MS = 8_000;
