import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { invalidateBranchListCache } from "../route";
import { readJsonObject, rejectCrossSiteMutation, requireOwnerAdmin, validateMutationRequest } from "@/lib/server-auth";

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
    const { id } = await params;
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });
    try {
        const body = await readJsonObject(req);
        if (body instanceof NextResponse) return body;
        const data: { name?: string; city?: string } = {};
        if (typeof body.name === "string") data.name = body.name.trim();
        if (typeof body.city === "string") data.city = body.city.trim();
        const branch = await prisma.branch.update({
            where: { id },
            data,
        });
        invalidateBranchListCache();
        return NextResponse.json(branch);
    } catch (error: any) {
        if (error.code === "P2025") return NextResponse.json({ error: "Branch not found" }, { status: 404 });
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const originError = rejectCrossSiteMutation(req);
    if (originError) return originError;
    const authError = await checkAuth();
    if (authError) return authError;
    const { id } = await params;
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });
    try {
        const count = await prisma.user.count({ where: { branchId: id } });
        if (count > 0) {
            return NextResponse.json(
                { error: "Cannot delete branch: users are assigned to it" },
                { status: 400 }
            );
        }
        await prisma.branch.delete({ where: { id } });
        invalidateBranchListCache();
        return NextResponse.json({ success: true });
    } catch (error: any) {
        if (error.code === "P2025") return NextResponse.json({ error: "Branch not found" }, { status: 404 });
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
