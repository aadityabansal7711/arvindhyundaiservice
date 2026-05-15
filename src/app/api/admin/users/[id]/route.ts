import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { enforceRateLimit, readJsonObject, rejectCrossSiteMutation, requireOwnerAdmin, validateMutationRequest } from "@/lib/server-auth";

async function checkAuth() {
    const auth = await requireOwnerAdmin();
    if (!auth.ok) return auth.response;
    return null;
}

export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const mutationError = validateMutationRequest(req);
    if (mutationError) return mutationError;

    const authError = await checkAuth();
    if (authError) return authError;
    const rateLimitError = enforceRateLimit(req, "admin-user-update", 60, 60_000);
    if (rateLimitError) return rateLimitError;

    const { id } = await params;
    if (!id) {
        return NextResponse.json({ error: "User ID required" }, { status: 400 });
    }

    try {
        const body = await readJsonObject(req);
        if (body instanceof NextResponse) return body;
        const { name, phone, roleId, branchId, branchIds, active } = body;

        const data: Record<string, unknown> = {};
        if (typeof name === "string") data.name = name.trim();
        if (phone !== undefined) data.phone = phone === "" || phone == null ? null : String(phone);
        if (typeof roleId === "string") data.roleId = roleId;
        const branchIdsArr = Array.isArray(branchIds)
            ? Array.from(new Set(branchIds.map((b: any) => String(b).trim()).filter(Boolean)))
            : [];
        const shouldUpdateBranches = Array.isArray(branchIds);
        const shouldUpdateBranchId = !shouldUpdateBranches && branchId !== undefined;

        if (typeof active === "boolean") data.active = active;

        const user = await prisma.$transaction(async (tx) => {
            if (shouldUpdateBranches) {
                await tx.userBranch.deleteMany({ where: { userId: id } });
                if (branchIdsArr.length > 0) {
                    await tx.userBranch.createMany({
                        data: branchIdsArr.map((bid) => ({ userId: id, branchId: bid })),
                        skipDuplicates: true,
                    });
                    data.branchId = branchIdsArr[0];
                } else {
                    data.branchId = null;
                }
            } else if (shouldUpdateBranchId) {
                const nextBranchId =
                    typeof branchId === "string" && branchId.trim().length > 0 ? branchId.trim() : null;
                data.branchId = nextBranchId;
                await tx.userBranch.deleteMany({ where: { userId: id } });
                if (nextBranchId) {
                    await tx.userBranch.create({ data: { userId: id, branchId: nextBranchId } });
                }
            }

            return tx.user.update({
                where: { id },
                data: data as any,
                include: { role: true, branch: true },
            });
        });

        return NextResponse.json(user);
    } catch (error: any) {
        if (error.code === "P2025") {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }
        return NextResponse.json({ error: error.message ?? "Update failed" }, { status: 500 });
    }
}

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const mutationError = rejectCrossSiteMutation(req);
    if (mutationError) return mutationError;

    const auth = await requireOwnerAdmin();
    if (!auth.ok) return auth.response;
    const rateLimitError = enforceRateLimit(req, "admin-user-delete", 20, 60_000, auth.user.id ?? auth.user.email);
    if (rateLimitError) return rateLimitError;

    const { id } = await params;
    if (!id) {
        return NextResponse.json({ error: "User ID required" }, { status: 400 });
    }

    try {
        const currentUserId = auth.user.id;
        if (currentUserId === id) {
            return NextResponse.json(
                { error: "You cannot delete your own account" },
                { status: 400 }
            );
        }

        await prisma.user.delete({
            where: { id },
        });

        return NextResponse.json({ success: true });
    } catch (error: any) {
        if (error.code === "P2025") {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }
        return NextResponse.json({ error: error.message ?? "Delete failed" }, { status: 500 });
    }
}
