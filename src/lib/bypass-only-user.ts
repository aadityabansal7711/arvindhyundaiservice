import prisma from "@/lib/prisma";

/** Bodyshop Bypass — restricted to Repair Orders on the Bypass branch only. */
export const BYPASS_ONLY_USER_EMAIL = "bodyshop.bp.hyundai@arvindgroup.in";

export function isBypassOnlyUser(email: string | null | undefined): boolean {
    return typeof email === "string" && email.trim().toLowerCase() === BYPASS_ONLY_USER_EMAIL;
}

let cachedBypassBranchId: string | null | undefined;
let bypassBranchLoad: Promise<string | null> | null = null;

/** Resolves the Branch row whose name is "Bypass" (case-insensitive). */
export async function getBypassBranchId(): Promise<string | null> {
    if (cachedBypassBranchId !== undefined) return cachedBypassBranchId;
    if (!bypassBranchLoad) {
        bypassBranchLoad = prisma.branch
            .findFirst({
                where: { name: { equals: "Bypass", mode: "insensitive" } },
                select: { id: true },
            })
            .then((b) => {
                cachedBypassBranchId = b?.id ?? null;
                return cachedBypassBranchId;
            });
    }
    return bypassBranchLoad;
}

/** True if this user must not see or edit ROs outside the Bypass branch. */
export async function bypassUserDeniesBranchAccess(
    email: string | null | undefined,
    branchId: string | null
): Promise<boolean> {
    if (!isBypassOnlyUser(email)) return false;
    const bid = await getBypassBranchId();
    if (!bid) return true;
    return branchId !== bid;
}

export type BranchScope = { kind: "all" } | { kind: "ids"; ids: string[] };

/**
 * Branch visibility for RO APIs. Bypass-only user is always restricted to the Bypass
 * branch, regardless of role permissions.
 */
export async function getBranchScopeForSessionUser(user: {
    email?: string | null;
    permissions?: string[];
    branchIds?: string[];
    branchId?: string | null;
}): Promise<BranchScope> {
    if (isBypassOnlyUser(user.email)) {
        const bid = await getBypassBranchId();
        return { kind: "ids", ids: bid ? [bid] : [] };
    }

    const permissions: string[] = Array.isArray(user?.permissions) ? user.permissions : [];
    const canViewAllBranches = permissions.includes("branches.view_all");
    if (canViewAllBranches) {
        return { kind: "all" };
    }

    const canViewMultiBranches = permissions.includes("branches.view_multi");
    const assignedBranchIds: string[] = Array.isArray(user?.branchIds) ? user.branchIds : [];
    const userBranchId = typeof user?.branchId === "string" ? user.branchId : undefined;

    const allowedBranchIds = canViewMultiBranches
        ? assignedBranchIds.length > 0
            ? assignedBranchIds
            : userBranchId
              ? [userBranchId]
              : []
        : userBranchId
          ? [userBranchId]
          : [];

    return { kind: "ids", ids: allowedBranchIds };
}
