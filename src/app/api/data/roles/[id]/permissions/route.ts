import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { readJsonObject, requireOwnerAdmin, validateMutationRequest } from "@/lib/server-auth";

export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const mutationError = validateMutationRequest(req);
    if (mutationError) return mutationError;
    const auth = await requireOwnerAdmin();
    if (!auth.ok) return auth.response;
    const { id } = await params;
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });
    try {
        const body = await readJsonObject(req);
        if (body instanceof NextResponse) return body;
        const permissionKeys = Array.isArray(body.permissionKeys)
            ? body.permissionKeys.filter((k): k is string => typeof k === "string")
            : null;
        if (!permissionKeys) {
            return NextResponse.json({ error: "permissionKeys must be an array of strings" }, { status: 400 });
        }
        // gdms.fetch is granted per user only (User Management > Edit User),
        // never via a role — see UserPermission. Strip it here too so it
        // can't come back through this endpoint even if a client sends it.
        const filteredPermissionKeys = permissionKeys.filter((k) => k !== "gdms.fetch");

        const role = await prisma.role.findUnique({ where: { id } });
        if (!role) return NextResponse.json({ error: "Role not found" }, { status: 404 });

        const permissions = await prisma.permission.findMany({ where: { key: { in: filteredPermissionKeys } } });

        await prisma.$transaction([
            prisma.rolePermission.deleteMany({ where: { roleId: id } }),
            prisma.rolePermission.createMany({
                data: permissions.map((p) => ({ roleId: id, permissionId: p.id })),
                skipDuplicates: true,
            }),
        ]);

        return NextResponse.json({ success: true });
    } catch (error: any) {
        if (error.code === "P2025") return NextResponse.json({ error: "Role not found" }, { status: 404 });
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
