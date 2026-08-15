import { NextRequest, NextResponse } from "next/server";
import { GdmsServiceError, fetchGdmsRos, getGdmsSessionMeta } from "@/lib/gdms/service-client";
import { applyBillingToBodyshopJobs, upsertBodyshopJobsFromGdms } from "@/lib/gdms/upsert";
import type { GdmsRoRow } from "@/lib/gdms/mapper";
import { getBranchNameMap } from "@/lib/branch-list";
import { clearBodyshopJobsCache } from "@/lib/bodyshop-jobs-cache";
import {
  canAccessBranch,
  enforceRateLimit,
  readJsonObject,
  requireAnyPermission,
  validateMutationRequest,
} from "@/lib/server-auth";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 366;

export async function POST(request: NextRequest) {
  const mutationError = validateMutationRequest(request);
  if (mutationError) return mutationError;

  const auth = await requireAnyPermission(["gdms.fetch", "users.manage"]);
  if (!auth.ok) return auth.response;

  const rateLimitError = enforceRateLimit(
    request,
    "gdms-fetch",
    5,
    60_000,
    auth.user.id ?? auth.user.email
  );
  if (rateLimitError) return rateLimitError;

  const parsed = await readJsonObject(request);
  if (parsed instanceof NextResponse) return parsed;
  const sessionId = typeof parsed.sessionId === "string" ? parsed.sessionId.trim() : "";
  const branchId = typeof parsed.branchId === "string" ? parsed.branchId.trim() : "";
  const dateFrom = typeof parsed.dateFrom === "string" ? parsed.dateFrom.trim() : "";
  const dateTo = typeof parsed.dateTo === "string" ? parsed.dateTo.trim() : "";

  if (!sessionId || !branchId) {
    return NextResponse.json({ error: "sessionId and branchId are required" }, { status: 400 });
  }
  if (!DATE_RE.test(dateFrom) || !DATE_RE.test(dateTo)) {
    return NextResponse.json({ error: "dateFrom/dateTo must be YYYY-MM-DD" }, { status: 400 });
  }
  const fromMs = new Date(`${dateFrom}T00:00:00.000Z`).getTime();
  const toMs = new Date(`${dateTo}T00:00:00.000Z`).getTime();
  if (Number.isNaN(fromMs) || Number.isNaN(toMs) || fromMs > toMs) {
    return NextResponse.json({ error: "dateFrom must be on or before dateTo" }, { status: 400 });
  }
  if ((toMs - fromMs) / (24 * 60 * 60 * 1000) > MAX_RANGE_DAYS) {
    return NextResponse.json({ error: `Date range cannot exceed ${MAX_RANGE_DAYS} days` }, { status: 400 });
  }

  if (!(await canAccessBranch(auth.user, branchId))) {
    return NextResponse.json({ error: "Forbidden branch" }, { status: 403 });
  }

  const session = await getGdmsSessionMeta(sessionId);
  if (!session) {
    return NextResponse.json(
      { error: "This GDMS session has expired. Please start again." },
      { status: 410 }
    );
  }
  const userId = auth.user.id ?? auth.user.email ?? "unknown";
  if (session.userId !== userId || session.branchId !== branchId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (session.stage !== "authenticated") {
    return NextResponse.json(
      { error: "GDMS login has not completed OTP verification yet." },
      { status: 400 }
    );
  }

  // The gdms-service call does the RO-list fetch, the Repair Billing fetch
  // (isolated from RO-list failure on its side), and session teardown all in
  // one round trip — see gdms-service/src/server.ts's POST /fetch.
  let fetchResult: Awaited<ReturnType<typeof fetchGdmsRos>>;
  try {
    fetchResult = await fetchGdmsRos(sessionId, dateFrom, dateTo);
  } catch (err) {
    const message = err instanceof GdmsServiceError ? err.message : "Failed to fetch ROs from GDMS.";
    const status = err instanceof GdmsServiceError ? err.status : 502;
    return NextResponse.json({ error: message }, { status });
  }
  const { billingTotals, billingFetchErrors, billingFetchFailed } = fetchResult;
  const rows = fetchResult.rows as unknown as GdmsRoRow[];

  console.log(
    "[gdms-debug] roNo -> modelCode:",
    JSON.stringify(rows.map((r) => ({ roNo: r.roNo, modelCode: r.modelCode })), null, 2)
  );

  const branchNameMap = await getBranchNameMap().catch(() => new Map<string, string>());
  const branchName = branchNameMap.get(branchId) ?? null;
  const result = await upsertBodyshopJobsFromGdms(rows, branchId, branchName);
  const billingResult =
    billingTotals.length > 0
      ? await applyBillingToBodyshopJobs(billingTotals, branchName)
      : { updated: 0, notFound: [], errors: [] };

  clearBodyshopJobsCache();

  return NextResponse.json({
    totalFetched: rows.length,
    created: result.created,
    skipped: result.skipped,
    reclassified: result.reclassified,
    errors: result.errors,
    billing: {
      totalBilled: billingTotals.length,
      updated: billingResult.updated,
      notFound: billingResult.notFound,
      fetchFailed: billingFetchFailed,
      errors: [...billingFetchErrors, ...billingResult.errors],
    },
  });
}
