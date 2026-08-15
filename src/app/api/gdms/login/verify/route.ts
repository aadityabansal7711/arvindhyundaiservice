import { NextRequest, NextResponse } from "next/server";
import { GdmsServiceError, getGdmsSessionMeta, verifyGdmsOtp } from "@/lib/gdms/service-client";
import {
  canAccessBranch,
  enforceRateLimit,
  readJsonObject,
  requireAnyPermission,
  validateMutationRequest,
} from "@/lib/server-auth";

export async function POST(request: NextRequest) {
  const mutationError = validateMutationRequest(request);
  if (mutationError) return mutationError;

  const auth = await requireAnyPermission(["gdms.fetch", "users.manage"]);
  if (!auth.ok) return auth.response;

  const rateLimitError = enforceRateLimit(
    request,
    "gdms-login-verify",
    5,
    60_000,
    auth.user.id ?? auth.user.email
  );
  if (rateLimitError) return rateLimitError;

  const parsed = await readJsonObject(request);
  if (parsed instanceof NextResponse) return parsed;
  const sessionId = typeof parsed.sessionId === "string" ? parsed.sessionId.trim() : "";
  const otp = typeof parsed.otp === "string" ? parsed.otp.trim() : "";
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }
  if (!/^\d{6}$/.test(otp)) {
    return NextResponse.json({ error: "Enter the 6-digit OTP" }, { status: 400 });
  }

  const session = await getGdmsSessionMeta(sessionId);
  if (!session) {
    return NextResponse.json(
      { error: "This GDMS session has expired. Please start again." },
      { status: 410 }
    );
  }
  const userId = auth.user.id ?? auth.user.email ?? "unknown";
  if (session.userId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!(await canAccessBranch(auth.user, session.branchId))) {
    return NextResponse.json({ error: "Forbidden branch" }, { status: 403 });
  }

  try {
    await verifyGdmsOtp(sessionId, otp);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message =
      err instanceof GdmsServiceError ? err.message : "OTP verification failed. Please try again.";
    const status = err instanceof GdmsServiceError ? err.status : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
