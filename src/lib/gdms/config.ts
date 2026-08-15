/** Constants for talking to Hyundai's GDMS/NDMS dealer portal. */

export const GDMS_BASE_URL = "https://ndms.hmil.net";
export const GDMS_LOGIN_PAGE_PATH = "/cmm/cmmi/selectLoginMain.dms";
export const GDMS_LOGIN_ACTION_PATH = "/cmm/cmmi/selectLoginAction.json";
export const GDMS_HOME_PATH = "/cmm/cmmd/selectHome.dms";
export const GDMS_RO_LIST_PATH = "/ser/serc/selectRepairOrderList.json";
/** GDMS's own "Logout" nav button navigates here (`fnLogOut()` in the site's JS). */
export const GDMS_LOGOUT_PATH = "/cmm/cmmi/selectLogoutAction.dms";

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
export const GDMS_NAV_TIMEOUT_MS = 30_000;
export const GDMS_OTP_SENT_TIMEOUT_MS = 20_000;
export const GDMS_LOGIN_VERIFY_TIMEOUT_MS = 20_000;
/** Best-effort logout on cleanup — short timeout since this must never hold up session teardown. */
export const GDMS_LOGOUT_TIMEOUT_MS = 8_000;
