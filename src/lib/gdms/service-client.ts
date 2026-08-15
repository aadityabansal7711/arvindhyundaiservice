/**
 * Thin client for the standalone gdms-service (see ../../../gdms-service) —
 * the always-on process that actually drives a headless Chromium against
 * GDMS. This app is deployed serverless on Vercel and can neither launch
 * Chromium nor hold a browser session open across requests, so every
 * GDMS-network call is proxied over HTTP to that service instead.
 */

export class GdmsServiceError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export type GdmsSessionMeta = {
  userId: string;
  branchId: string;
  stage: "awaiting_otp" | "authenticated";
};

function getServiceConfig(): { url: string; token: string } {
  const url = process.env.GDMS_SERVICE_URL;
  const token = process.env.GDMS_SERVICE_TOKEN;
  if (!url || !token) {
    throw new Error("Missing GDMS_SERVICE_URL/GDMS_SERVICE_TOKEN env vars.");
  }
  return { url: url.replace(/\/$/, ""), token };
}

/** Throws GdmsServiceError (with the service's own status/message) on any non-2xx response. */
async function callGdmsService<T>(path: string, body?: unknown): Promise<T> {
  const { url, token } = getServiceConfig();
  const res = await fetch(`${url}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = typeof json?.error === "string" ? json.error : "GDMS service request failed";
    throw new GdmsServiceError(message, res.status);
  }
  return json as T;
}

export function startGdmsLogin(params: {
  branchId: string;
  appUserId: string;
  gdmsUserId: string;
  gdmsPassword: string;
}): Promise<{ sessionId: string }> {
  return callGdmsService("/login/start", params);
}

/** Pure metadata read — returns null if the session doesn't exist or has expired. */
export async function getGdmsSessionMeta(sessionId: string): Promise<GdmsSessionMeta | null> {
  try {
    return await callGdmsService<GdmsSessionMeta>(`/session/${encodeURIComponent(sessionId)}`);
  } catch (err) {
    if (err instanceof GdmsServiceError && err.status === 404) return null;
    throw err;
  }
}

export function verifyGdmsOtp(sessionId: string, otp: string): Promise<{ ok: true }> {
  return callGdmsService("/login/verify", { sessionId, otp });
}

export type GdmsFetchResult = {
  rows: { roNo: string; [key: string]: unknown }[];
  billingTotals: {
    roNo: string;
    billingNo: string | null;
    laborAmount: number;
    laborDiscountAmount: number;
    partsAmount: number;
  }[];
  billingFetchErrors: { roNo: string; message: string }[];
  billingFetchFailed: boolean;
};

export function fetchGdmsRos(sessionId: string, dateFrom: string, dateTo: string): Promise<GdmsFetchResult> {
  return callGdmsService("/fetch", { sessionId, dateFrom, dateTo });
}
