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
        const { name, phone, roleId, branchId, active } = body;

        const data: Record<string, unknown> = {};
        if (typeof name === "string") data.name = name.trim();
        if (phone !== undefined) data.phone = phone === "" || phone == null ? null : String(phone);
        if (typeof roleId === "string") data.roleId = roleId;
        if (branchId === "" || branchId == null) data.branchId = null;
        else if (typeof branchId === "string") data.branchId = branchId;
        if (typeof active === "boolean") data.active = active;

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
