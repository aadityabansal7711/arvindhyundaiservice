import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { decryptSecret } from "@/lib/gdms/crypto";
import { GdmsServiceError, startGdmsLogin } from "@/lib/gdms/service-client";
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
    "gdms-login-start",
    5,
    60_000,
    auth.user.id ?? auth.user.email
  );
  if (rateLimitError) return rateLimitError;

  const parsed = await readJsonObject(request);
  if (parsed instanceof NextResponse) return parsed;
  const branchId = typeof parsed.branchId === "string" ? parsed.branchId.trim() : "";
  if (!branchId) {
    return NextResponse.json({ error: "branchId is required" }, { status: 400 });
  }
  if (!(await canAccessBranch(auth.user, branchId))) {
    return NextResponse.json({ error: "Forbidden branch" }, { status: 403 });
  }

  const userId = auth.user.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const credential = await prisma.gdmsCredential.findUnique({
    where: { userId_branchId: { userId, branchId } },
  });
  if (!credential) {
    return NextResponse.json(
      { error: "You haven't set up your GDMS credentials for this branch yet. Set them up on the GDMS Credentials page." },
      { status: 400 }
    );
  }

  let password: string;
  try {
    password = decryptSecret(credential.encryptedPassword);
  } catch {
    return NextResponse.json(
      { error: "Failed to decrypt stored GDMS credentials. Please re-enter them on the GDMS Credentials page." },
      { status: 500 }
    );
  }

  try {
    const { sessionId } = await startGdmsLogin({
      branchId,
      appUserId: userId,
      gdmsUserId: credential.gdmsUserId,
      gdmsPassword: password,
    });
    return NextResponse.json({ sessionId });
  } catch (err) {
    const message =
      err instanceof GdmsServiceError ? err.message : "Could not reach GDMS. Please try again in a moment.";
    const status = err instanceof GdmsServiceError ? err.status : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
