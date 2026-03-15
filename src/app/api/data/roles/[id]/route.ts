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
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });
    try {
        const body = await req.json();
        const name = body?.name?.trim();
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
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
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
