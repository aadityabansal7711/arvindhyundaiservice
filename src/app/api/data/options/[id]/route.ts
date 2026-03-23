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
        return NextResponse.json({ error: "ID required" }, { status: 400 });
    }

    try {
        const body = await req.json();
        const data: { label?: string; value?: string | null; sortOrder?: number; branchId?: string | null } = {};
        if (typeof body.label === "string") data.label = body.label.trim();
        if (body.value !== undefined) data.value = body.value === "" ? null : String(body.value).trim();
        if (typeof body.sortOrder === "number") data.sortOrder = body.sortOrder;
        if (body.branchId !== undefined) {
            data.branchId = body.branchId && String(body.branchId).trim() ? String(body.branchId).trim() : null;
        }

        const option = await prisma.dropdownOption.update({
            where: { id },
            data,
        });
        return NextResponse.json(option);
    } catch (error: any) {
        if (error.code === "P2025") {
            return NextResponse.json({ error: "Option not found" }, { status: 404 });
        }
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
    if (!id) {
        return NextResponse.json({ error: "ID required" }, { status: 400 });
    }

    try {
        await prisma.dropdownOption.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch (error: any) {
        if (error.code === "P2025") {
            return NextResponse.json({ error: "Option not found" }, { status: 404 });
        }
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
