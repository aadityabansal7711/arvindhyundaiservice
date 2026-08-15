import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireOwnerAdmin, rejectCrossSiteMutation } from "@/lib/server-auth";

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ branchId: string }> }
) {
  const mutationError = rejectCrossSiteMutation(request);
  if (mutationError) return mutationError;

  const auth = await requireOwnerAdmin();
  if (!auth.ok) return auth.response;

  const { branchId } = await context.params;
  await prisma.gdmsCredential.deleteMany({ where: { branchId } });

  return NextResponse.json({ success: true });
}
