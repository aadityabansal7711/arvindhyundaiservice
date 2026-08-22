import express, { type NextFunction, type Request, type Response } from "express";
import {
  GdmsLoginError,
  GdmsOtpError,
  fetchRepairBillingForRoNumbers,
  fetchRepairOrders,
  startLogin,
  verifyOtp,
} from "./gdms-client";
import { GdmsProxyError } from "./proxy-config";
import { destroySession, getSession } from "./session-store";
import { GDMS_BASE_URL, GDMS_LOGIN_PAGE_PATH } from "./config";

const PORT = Number(process.env.PORT) || 8080;
const SERVICE_TOKEN = process.env.GDMS_SERVICE_TOKEN;

if (!SERVICE_TOKEN) {
  throw new Error("Missing GDMS_SERVICE_TOKEN env var — required to authenticate callers.");
}

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

/** Every route below /health requires the shared bearer token — this service is a public URL. */
app.use((req: Request, res: Response, next: NextFunction) => {
  const auth = req.header("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
  if (token !== SERVICE_TOKEN) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
});

/** Node's fetch wraps the real low-level failure (ETIMEDOUT, ECONNRESET, ...) in Error.cause. */
function extractCauseDetails(cause: unknown): Record<string, unknown> | null {
  if (!cause || typeof cause !== "object") return null;
  const c = cause as Record<string, unknown>;
  return { code: c.code, errno: c.errno, syscall: c.syscall, address: c.address, port: c.port, message: c.message };
}

/**
 * Diagnostic only — does a plain HTTP fetch (no Chromium) to GDMS's login
 * page and reports how long it took. Lets us tell apart "this host's network
 * can't reach GDMS at all" from "something about Chromium's connection
 * specifically is the problem" without needing to touch infrastructure
 * (static IP, on-prem hosting, etc.) to find out which one it is.
 */
app.get("/debug/reachability", async (_req: Request, res: Response) => {
  const url = `${GDMS_BASE_URL}${GDMS_LOGIN_PAGE_PATH}`;
  const start = Date.now();
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    res.json({ ok: true, url, status: response.status, ms: Date.now() - start });
  } catch (err) {
    console.error("[gdms-service] /debug/reachability failed:", err);
    res.json({
      ok: false,
      url,
      error: err instanceof Error ? err.message : String(err),
      cause: extractCauseDetails(err instanceof Error ? err.cause : undefined),
      ms: Date.now() - start,
    });
  } finally {
    clearTimeout(timeoutHandle);
  }
});

app.post("/login/start", async (req: Request, res: Response) => {
  const { branchId, appUserId, gdmsUserId, gdmsPassword } = req.body ?? {};
  if (
    typeof branchId !== "string" ||
    typeof appUserId !== "string" ||
    typeof gdmsUserId !== "string" ||
    typeof gdmsPassword !== "string" ||
    !branchId ||
    !appUserId ||
    !gdmsUserId ||
    !gdmsPassword
  ) {
    res.status(400).json({ error: "branchId, appUserId, gdmsUserId and gdmsPassword are required" });
    return;
  }

  try {
    const sessionId = await startLogin({ branchId, appUserId, gdmsUserId, gdmsPassword });
    res.json({ sessionId });
  } catch (err) {
    // GdmsProxyError already logged its sanitized cause server-side (see
    // wrapProxyError) and carries a clean, user-safe message — don't log again.
    if (!(err instanceof GdmsLoginError) && !(err instanceof GdmsProxyError)) {
      console.error("[gdms-service] login/start failed:", err);
    }
    const message =
      err instanceof GdmsLoginError || err instanceof GdmsProxyError
        ? err.message
        : "Could not reach GDMS. Please try again in a moment.";
    res.status(502).json({ error: message });
  }
});

/** Pure metadata read so the caller can run its own authorization checks before acting on a session. */
app.get("/session/:id", (req: Request, res: Response) => {
  const session = getSession(req.params.id);
  if (!session) {
    res.status(404).json({ error: "Session not found or expired" });
    return;
  }
  res.json({ userId: session.userId, branchId: session.branchId, stage: session.stage });
});

app.post("/login/verify", async (req: Request, res: Response) => {
  const { sessionId, otp } = req.body ?? {};
  if (typeof sessionId !== "string" || !sessionId || typeof otp !== "string" || !/^\d{6}$/.test(otp)) {
    res.status(400).json({ error: "sessionId and a 6-digit otp are required" });
    return;
  }

  try {
    await verifyOtp(sessionId, otp);
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof GdmsProxyError) {
      // Not a bad-OTP case — the network path itself failed, so 502 (not 400) and no logging here (already done in wrapProxyError).
      res.status(502).json({ error: err.message });
      return;
    }
    const message = err instanceof GdmsOtpError ? err.message : "OTP verification failed. Please try again.";
    res.status(400).json({ error: message });
  }
});

app.post("/fetch", async (req: Request, res: Response) => {
  const { sessionId, dateFrom, dateTo, openRoNumbers } = req.body ?? {};
  if (typeof sessionId !== "string" || !sessionId || typeof dateFrom !== "string" || typeof dateTo !== "string") {
    res.status(400).json({ error: "sessionId, dateFrom and dateTo are required" });
    return;
  }
  const callerOpenRoNumbers: string[] = Array.isArray(openRoNumbers)
    ? openRoNumbers.filter((v): v is string => typeof v === "string")
    : [];

  let rows: Awaited<ReturnType<typeof fetchRepairOrders>>;
  try {
    rows = await fetchRepairOrders(sessionId, dateFrom, dateTo);
  } catch (err) {
    await destroySession(sessionId);
    const message =
      err instanceof GdmsOtpError || err instanceof GdmsProxyError ? err.message : "Failed to fetch ROs from GDMS.";
    res.status(502).json({ error: message });
    return;
  }

  // Repair Billing is looked up by RO number directly, not by GDMS's own
  // date-scoped Repair Billing list — an RO's actual bill date routinely
  // falls outside whatever date range the caller picked for the RO list, so
  // billing must be checked for every RO the caller currently cares about
  // (its already-open ROs, unioned with whatever this RO-list fetch just
  // returned) rather than only ones GDMS happens to say were billed within
  // that same window. Its own failure must not lose the RO import that
  // already succeeded, so it's isolated in its own try/catch.
  const roNumbersToBill = Array.from(new Set([...callerOpenRoNumbers, ...rows.map((r) => r.roNo)]));
  let billingTotals: Awaited<ReturnType<typeof fetchRepairBillingForRoNumbers>>["totals"] = [];
  let billingFetchErrors: Awaited<ReturnType<typeof fetchRepairBillingForRoNumbers>>["errors"] = [];
  let billingFetchFailed = false;
  try {
    const billing = await fetchRepairBillingForRoNumbers(sessionId, roNumbersToBill);
    billingTotals = billing.totals;
    billingFetchErrors = billing.errors;
  } catch (err) {
    billingFetchFailed = true;
    console.warn(
      "[gdms-service] Repair Billing fetch failed, RO import still succeeds without billing data:",
      err instanceof Error ? err.message : err
    );
  } finally {
    await destroySession(sessionId);
  }

  res.json({ rows, billingTotals, billingFetchErrors, billingFetchFailed });
});

app.listen(PORT, () => {
  console.log(`gdms-service listening on :${PORT}`);
});
