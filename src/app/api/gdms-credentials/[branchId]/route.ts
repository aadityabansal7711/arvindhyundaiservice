import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { canAccessBranch, rejectCrossSiteMutation, requireAnyPermission } from "@/lib/server-auth";

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ branchId: string }> }
) {
  const mutationError = rejectCrossSiteMutation(request);
  if (mutationError) return mutationError;

  const auth = await requireAnyPermission(["gdms.fetch", "users.manage"]);
  if (!auth.ok) return auth.response;

  const { branchId } = await context.params;

  if (!(await canAccessBranch(auth.user, branchId))) {
    return NextResponse.json({ error: "Forbidden branch" }, { status: 403 });
  }

  const userId = auth.user.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await prisma.gdmsCredential.deleteMany({ where: { userId, branchId } });

  return NextResponse.json({ success: true });
}
