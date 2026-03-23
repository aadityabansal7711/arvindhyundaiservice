import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth-options";
import prisma from "@/lib/prisma";

async function checkAuth() {
    const session = await getServerSession(authOptions);
    if (!session || !(session.user as any).permissions?.includes("users.manage")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return null;
}

export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const authError = await checkAuth();
    if (authError) return authError;

    const { id } = await params;
    if (!id) {
        return NextResponse.json({ error: "User ID required" }, { status: 400 });
    }

    try {
        const body = await req.json();
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

        // Keep branch assignments in sync.
        if (shouldUpdateBranches) {
            await prisma.userBranch.deleteMany({ where: { userId: id } });
            if (branchIdsArr.length > 0) {
                await prisma.userBranch.createMany({
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
            await prisma.userBranch.deleteMany({ where: { userId: id } });
            if (nextBranchId) {
                await prisma.userBranch.create({ data: { userId: id, branchId: nextBranchId } });
            }
        }

        const user = await prisma.user.update({
            where: { id },
            data: data as any,
            include: { role: true, branch: true },
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
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const authError = await checkAuth();
    if (authError) return authError;

    const { id } = await params;
    if (!id) {
        return NextResponse.json({ error: "User ID required" }, { status: 400 });
    }

    try {
        const session = await getServerSession(authOptions);
        const currentUserId = (session?.user as any)?.id;
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
