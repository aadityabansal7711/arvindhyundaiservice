import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth-options";
import prisma from "@/lib/prisma";
import { readJsonObject, requireOwnerAdmin, validateMutationRequest } from "@/lib/server-auth";

async function checkAuth() {
    const session = await getServerSession(authOptions);
    if (!session || !(session.user as any).permissions?.includes("users.manage")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return null;
}

export async function GET() {
    const authError = await checkAuth();
    if (authError) return authError;
    try {
        const roles = await prisma.role.findMany({
            orderBy: { name: "asc" },
            include: { permissions: { include: { permission: true } } },
        });
        const result = roles.map((r) => ({
            id: r.id,
            name: r.name,
            permissionKeys: r.permissions.map((rp) => rp.permission.key),
        }));
        return NextResponse.json(result);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const mutationError = validateMutationRequest(req);
    if (mutationError) return mutationError;
    const auth = await requireOwnerAdmin();
    if (!auth.ok) return auth.response;
    try {
        const body = await readJsonObject(req);
        if (body instanceof NextResponse) return body;
        const name = typeof body.name === "string" ? body.name.trim() : "";
        if (!name) {
            return NextResponse.json({ error: "Name is required" }, { status: 400 });
        }
        const role = await prisma.role.create({
            data: { name },
        });
        return NextResponse.json(role);
    } catch (error: any) {
        if (error.code === "P2002") {
            return NextResponse.json({ error: "Role name already exists" }, { status: 400 });
        }
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
