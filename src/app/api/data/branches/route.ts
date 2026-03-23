import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth-options";
import prisma from "@/lib/prisma";

export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    try {
        const user = session.user as any;
        const permissions: string[] = Array.isArray(user?.permissions) ? user.permissions : [];
        const canViewAll = permissions.includes("branches.view_all") || permissions.includes("users.manage");
        const branchIds: string[] = Array.isArray(user?.branchIds) ? user.branchIds : [];
        const primaryBranchId = typeof user?.branchId === "string" ? user.branchId : undefined;

        const branches = await prisma.branch.findMany({
            where: canViewAll
                ? undefined
                : {
                      id: {
                          in:
                              branchIds.length > 0
                                  ? branchIds
                                  : primaryBranchId
                                    ? [primaryBranchId]
                                    : [],
                      },
                  },
            orderBy: { name: "asc" },
        });
        return NextResponse.json(branches);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session || !(session.user as any).permissions?.includes("users.manage")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    try {
        const body = await req.json();
        const name = body?.name?.trim();
        const city = body?.city?.trim() ?? "";
        if (!name) {
            return NextResponse.json({ error: "Name is required" }, { status: 400 });
        }
        const branch = await prisma.branch.create({
            data: { name, city },
        });
        return NextResponse.json(branch);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
