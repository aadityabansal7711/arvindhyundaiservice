import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth-options";
import prisma from "@/lib/prisma";
import { isOwnerUser } from "@/lib/owner-access";
import { readJsonObject, rejectCrossSiteMutation, validateMutationRequest } from "@/lib/server-auth";

const DEPARTMENT_VALUES = new Set(["bodyshop", "workshop", "both"]);

async function checkAuth() {
    const session = await getServerSession(authOptions);
    if (!session || !(session.user as any).permissions?.includes("users.manage")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!isOwnerUser(session.user)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
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
    if (!id) {
        return NextResponse.json({ error: "ID required" }, { status: 400 });
    }

    try {
        const body = await readJsonObject(req);
        if (body instanceof NextResponse) return body;
        const data: {
            label?: string;
            value?: string | null;
            sortOrder?: number;
            branchId?: string | null;
            department?: string | null;
        } = {};
        if (typeof body.label === "string") data.label = body.label.trim();
        if (body.value !== undefined) data.value = body.value === "" ? null : String(body.value).trim();
        if (typeof body.sortOrder === "number") data.sortOrder = body.sortOrder;
        if (body.branchId !== undefined) {
            data.branchId = body.branchId && String(body.branchId).trim() ? String(body.branchId).trim() : null;
        }
        if (body.department !== undefined) {
            if (body.department != null && body.department !== "" && !DEPARTMENT_VALUES.has(String(body.department))) {
                return NextResponse.json({ error: "department must be bodyshop, workshop, or both" }, { status: 400 });
            }
            data.department = body.department && String(body.department).trim() ? String(body.department).trim() : null;
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
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const originError = rejectCrossSiteMutation(req);
    if (originError) return originError;
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
