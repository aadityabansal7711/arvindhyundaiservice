import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
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
        const name = typeof body.name === "string" ? body.name.trim() : "";
        if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
        const role = await prisma.role.update({
            where: { id },
            data: { name },
        });
        return NextResponse.json(role);
    } catch (error: any) {
        if (error.code === "P2025") return NextResponse.json({ error: "Role not found" }, { status: 404 });
        if (error.code === "P2002") return NextResponse.json({ error: "Role name already exists" }, { status: 400 });
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
        const count = await prisma.user.count({ where: { roleId: id } });
        if (count > 0) {
            return NextResponse.json(
                { error: "Cannot delete role: users are assigned to it" },
                { status: 400 }
            );
        }
        await prisma.$transaction([
            prisma.rolePermission.deleteMany({ where: { roleId: id } }),
            prisma.role.delete({ where: { id } }),
        ]);
        return NextResponse.json({ success: true });
    } catch (error: any) {
        if (error.code === "P2025") return NextResponse.json({ error: "Role not found" }, { status: 404 });
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
