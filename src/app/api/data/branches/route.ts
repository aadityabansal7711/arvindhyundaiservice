import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth-options";
import prisma from "@/lib/prisma";
import { getBypassBranchId, isBypassOnlyUser } from "@/lib/bypass-only-user";
import { getAllBranchesCached, invalidateBranchListCache, type BranchRow } from "@/lib/branch-list";
import { readJsonObject, requireOwnerAdmin, validateMutationRequest } from "@/lib/server-auth";

export { invalidateBranchListCache };

export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    try {
        const user = session.user as any;
        const all = await getAllBranchesCached();

        let result: BranchRow[];
        if (isBypassOnlyUser(user?.email)) {
            const bid = await getBypassBranchId();
            result = bid ? all.filter((b) => b.id === bid) : [];
        } else {
            const permissions: string[] = Array.isArray(user?.permissions) ? user.permissions : [];
            const canViewAll =
                permissions.includes("branches.view_all") || permissions.includes("users.manage");

            if (canViewAll) {
                result = all;
            } else {
                // Branch assignments may have changed since login — query fresh, not JWT cache.
                const userId = typeof user?.id === "string" ? user.id : null;
                const assignedBranches = userId
                    ? await prisma.user.findUnique({
                          where: { id: userId },
                          select: { branchId: true, branches: { select: { branchId: true } } },
                      })
                    : null;

                const assignedBranchIds: string[] =
                    assignedBranches?.branches?.map((ub: { branchId: string }) => ub.branchId).filter(Boolean) ?? [];
                const primaryBranchId =
                    typeof assignedBranches?.branchId === "string" ? assignedBranches.branchId : undefined;

                const allowedSet = new Set<string>(
                    assignedBranchIds.length > 0 ? assignedBranchIds : primaryBranchId ? [primaryBranchId] : []
                );
                result = all.filter((b) => allowedSet.has(b.id));
            }
        }

        const res = NextResponse.json(result);
        res.headers.set("Cache-Control", "private, max-age=60, stale-while-revalidate=600");
        return res;
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
        const city = typeof body.city === "string" ? body.city.trim() : "";
        if (!name) {
            return NextResponse.json({ error: "Name is required" }, { status: 400 });
        }
        const branch = await prisma.branch.create({
            data: { name, city },
        });
        invalidateBranchListCache();
        return NextResponse.json(branch);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
