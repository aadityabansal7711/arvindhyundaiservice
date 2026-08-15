import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { decryptSecret } from "@/lib/gdms/crypto";
import { GdmsLoginError, startLogin } from "@/lib/gdms/client";
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

  const credential = await prisma.gdmsCredential.findUnique({ where: { branchId } });
  if (!credential) {
    return NextResponse.json(
      { error: "GDMS credentials are not configured for this branch. Set them up in Admin → GDMS Credentials." },
      { status: 400 }
    );
  }

  let password: string;
  try {
    password = decryptSecret(credential.encryptedPassword);
  } catch {
    return NextResponse.json(
      { error: "Failed to decrypt stored GDMS credentials. Please re-enter them in Admin → GDMS Credentials." },
      { status: 500 }
    );
  }

  try {
    const sessionId = await startLogin({
      branchId,
      appUserId: auth.user.id ?? auth.user.email ?? "unknown",
      gdmsUserId: credential.gdmsUserId,
      gdmsPassword: password,
    });
    return NextResponse.json({ sessionId });
  } catch (err) {
    const message =
      err instanceof GdmsLoginError
        ? err.message
        : "Could not reach GDMS. Please try again in a moment.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
