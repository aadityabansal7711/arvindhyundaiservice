import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAllBranchesCached } from "@/lib/branch-list";
import { getBranchScopeForSessionUser } from "@/lib/bypass-only-user";
import { encryptSecret } from "@/lib/gdms/crypto";
import {
  canAccessBranch,
  enforceRateLimit,
  readJsonObject,
  requireAnyPermission,
  validateMutationRequest,
} from "@/lib/server-auth";

function maskUsername(usrId: string): string {
  if (usrId.length <= 2) return "*".repeat(usrId.length);
  return `${usrId[0]}${"*".repeat(usrId.length - 2)}${usrId[usrId.length - 1]}`;
}

export async function GET() {
  const auth = await requireAnyPermission(["gdms.fetch", "users.manage"]);
  if (!auth.ok) return auth.response;

  const scope = await getBranchScopeForSessionUser(auth.user);
  const allBranches = await getAllBranchesCached();
  const branches =
    scope.kind === "all" ? allBranches : allBranches.filter((b) => scope.ids.includes(b.id));

  const userId = auth.user.id ?? "";
  const credentials = userId
    ? await prisma.gdmsCredential.findMany({
        where: { userId, branchId: { in: branches.map((b) => b.id) } },
      })
    : [];
  const byBranch = new Map(credentials.map((c) => [c.branchId, c]));

  const rows = branches.map((branch) => {
    const cred = byBranch.get(branch.id);
    return {
      branchId: branch.id,
      branchName: branch.name,
      isConfigured: Boolean(cred),
      gdmsUserIdMasked: cred ? maskUsername(cred.gdmsUserId) : null,
      updatedAt: cred?.updatedAt ?? null,
    };
  });

  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const mutationError = validateMutationRequest(request);
  if (mutationError) return mutationError;

  const auth = await requireAnyPermission(["gdms.fetch", "users.manage"]);
  if (!auth.ok) return auth.response;

  const rateLimitError = enforceRateLimit(
    request,
    "gdms-credentials-write",
    20,
    60_000,
    auth.user.id ?? auth.user.email
  );
  if (rateLimitError) return rateLimitError;

  const parsed = await readJsonObject(request);
  if (parsed instanceof NextResponse) return parsed;
  const branchId = typeof parsed.branchId === "string" ? parsed.branchId.trim() : "";
  const gdmsUserId = typeof parsed.gdmsUserId === "string" ? parsed.gdmsUserId.trim() : "";
  const gdmsPassword = typeof parsed.gdmsPassword === "string" ? parsed.gdmsPassword : "";

  if (!branchId || !gdmsUserId || !gdmsPassword) {
    return NextResponse.json(
      { error: "branchId, gdmsUserId and gdmsPassword are required" },
      { status: 400 }
    );
  }

  if (!(await canAccessBranch(auth.user, branchId))) {
    return NextResponse.json({ error: "Forbidden branch" }, { status: 403 });
  }

  const userId = auth.user.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const branch = await prisma.branch.findUnique({ where: { id: branchId } });
  if (!branch) {
    return NextResponse.json({ error: "Branch not found" }, { status: 404 });
  }

  const encryptedPassword = encryptSecret(gdmsPassword);

  await prisma.gdmsCredential.upsert({
    where: { userId_branchId: { userId, branchId } },
    update: { gdmsUserId, encryptedPassword },
    create: { userId, branchId, gdmsUserId, encryptedPassword },
  });

  return NextResponse.json({ success: true });
}
