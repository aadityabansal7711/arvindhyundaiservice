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
        const data: { name?: string; city?: string } = {};
        if (typeof body.name === "string") data.name = body.name.trim();
        if (typeof body.city === "string") data.city = body.city.trim();
        const branch = await prisma.branch.update({
            where: { id },
            data,
        });
        return NextResponse.json(branch);
    } catch (error: any) {
        if (error.code === "P2025") return NextResponse.json({ error: "Branch not found" }, { status: 404 });
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
        const count = await prisma.user.count({ where: { branchId: id } });
        if (count > 0) {
            return NextResponse.json(
                { error: "Cannot delete branch: users are assigned to it" },
                { status: 400 }
            );
        }
        await prisma.branch.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch (error: any) {
        if (error.code === "P2025") return NextResponse.json({ error: "Branch not found" }, { status: 404 });
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
