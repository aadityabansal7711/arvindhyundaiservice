import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth-options";
import prisma from "@/lib/prisma";

export async function GET(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const group = req.nextUrl.searchParams.get("group");
    const permissions = (session.user as any)?.permissions || [];

    try {
        if (group) {
            // Single group: allow anyone with ro.view (for forms) or users.manage
            if (!permissions.includes("ro.view") && !permissions.includes("users.manage")) {
                return NextResponse.json({ error: "Forbidden" }, { status: 403 });
            }

            // Service advisors are branch-linked dropdown options.
            if (group === "service_advisor") {
                const user = session.user as any;
                const canManageUsers = permissions.includes("users.manage");
                const userId = typeof user?.id === "string" ? user.id : null;
                const assignedBranches =
                    userId
                        ? await prisma.user.findUnique({
                              where: { id: userId },
                              select: { branchId: true, branches: { select: { branchId: true } } },
                          })
                        : null;

                // Avoid JWT-cached `branchIds` (NextAuth JWT won't auto-refresh on permission/branch changes)
                const assignedBranchIds: string[] =
                    assignedBranches?.branches?.map((ub: { branchId: string }) => ub.branchId).filter(Boolean) ?? [];
                const primaryBranchId =
                    typeof assignedBranches?.branchId === "string" ? assignedBranches.branchId : undefined;

                const allowed =
                    assignedBranchIds.length > 0
                        ? Array.from(new Set(assignedBranchIds))
                        : primaryBranchId
                          ? [primaryBranchId]
                          : [];

                const requestedBranchId =
                    req.nextUrl.searchParams.get("branchId")?.trim() || undefined;
                // Non-admins: only branches the user is allowed to use; optional ?branchId= must be in that set.
                const effectiveBranchIds =
                    requestedBranchId != null
                        ? allowed.includes(requestedBranchId)
                            ? [requestedBranchId]
                            : []
                        : allowed;

                // For non-admin users, if no allowed branches remain, return no advisors.
                if (!canManageUsers && effectiveBranchIds.length === 0) {
                    return NextResponse.json([]);
                }

                // Admins (users.manage): filter by ?branchId= when provided so the RO form matches the selected branch;
                // with no branchId, return all advisor options (e.g. full-page RO form before branch is chosen).
                const advisors = await prisma.dropdownOption.findMany({
                    where: {
                        groupKey: "service_advisor",
                        ...(canManageUsers
                            ? requestedBranchId
                                ? { branchId: requestedBranchId }
                                : {}
                            : { branchId: { in: effectiveBranchIds } }),
                    },
                    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
                });

                return NextResponse.json(
                    advisors.map((a) => ({
                        id: a.id,
                        label: a.label,
                        value: a.value ?? a.label,
                    }))
                );
            }

            const options = await prisma.dropdownOption.findMany({
                where: { groupKey: group },
                orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
            });
            return NextResponse.json(
                options.map((o) => ({ id: o.id, label: o.label, value: o.value ?? o.label }))
            );
        }

        // All groups: Data page only (users.manage)
        if (!permissions.includes("users.manage")) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        const options = await prisma.dropdownOption.findMany({
            orderBy: [{ groupKey: "asc" }, { sortOrder: "asc" }, { label: "asc" }],
        });
        return NextResponse.json(options);
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
        const { groupKey, label, value, sortOrder, branchId } = body;
        if (!groupKey || !label) {
            return NextResponse.json(
                { error: "groupKey and label are required" },
                { status: 400 }
            );
        }
        if (String(groupKey).trim() === "service_advisor" && !String(branchId ?? "").trim()) {
            return NextResponse.json({ error: "branchId is required for service advisors" }, { status: 400 });
        }
        const option = await prisma.dropdownOption.create({
            data: {
                groupKey: String(groupKey).trim(),
                label: String(label).trim(),
                value: value != null && value !== "" ? String(value).trim() : null,
                branchId: branchId != null && String(branchId).trim() ? String(branchId).trim() : null,
                sortOrder: typeof sortOrder === "number" ? sortOrder : 0,
            },
        });
        return NextResponse.json(option);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
