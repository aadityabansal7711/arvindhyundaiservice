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

        // Important: do not rely on JWT-cached `branchIds` because branch assignments may have changed
        // and NextAuth JWT strategy won't refresh automatically until re-login.
        const userId = typeof user?.id === "string" ? user.id : null;
        const assignedBranches = !canViewAll && userId
            ? await prisma.user.findUnique({
                  where: { id: userId },
                  select: { branchId: true, branches: { select: { branchId: true } } },
              })
            : null;

        const assignedBranchIds: string[] =
            assignedBranches?.branches?.map((ub: { branchId: string }) => ub.branchId).filter(Boolean) ?? [];
        const primaryBranchId =
            typeof assignedBranches?.branchId === "string" ? assignedBranches.branchId : undefined;

        const allowedBranchIds = canViewAll
            ? null
            : assignedBranchIds.length > 0
              ? assignedBranchIds
              : primaryBranchId
                ? [primaryBranchId]
                : [];

        const branches = await prisma.branch.findMany({
            where: allowedBranchIds === null ? undefined : { id: { in: allowedBranchIds } },
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
