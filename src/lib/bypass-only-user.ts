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

// Cache the prisma user-assignments lookup per user.id. This was running on
// every API request (bodyshop list/POST, dashboard, server-auth) and was the
// dominant cold-start cost. Branch assignments change rarely, so a short TTL
// is safe; updates propagate within ASSIGNMENTS_TTL_MS.
type AssignmentsRow = { branchId: string | null; branches: { branchId: string }[] } | null;
const ASSIGNMENTS_TTL_MS = 30_000;
const assignmentsCache = new Map<string, { data: AssignmentsRow; expiresAt: number }>();
const assignmentsInflight = new Map<string, Promise<AssignmentsRow>>();

function loadAssignments(userId: string): Promise<AssignmentsRow> {
    const now = Date.now();
    const hit = assignmentsCache.get(userId);
    if (hit && hit.expiresAt > now) return Promise.resolve(hit.data);
    const existing = assignmentsInflight.get(userId);
    if (existing) return existing;
    const p = prisma.user
        .findUnique({
            where: { id: userId },
            select: { branchId: true, branches: { select: { branchId: true } } },
        })
        .then((row) => {
            assignmentsCache.set(userId, { data: row as AssignmentsRow, expiresAt: Date.now() + ASSIGNMENTS_TTL_MS });
            return row as AssignmentsRow;
        })
        .finally(() => {
            assignmentsInflight.delete(userId);
        });
    assignmentsInflight.set(userId, p);
    return p;
}

export function invalidateBranchScopeCache(userId?: string) {
    if (userId) assignmentsCache.delete(userId);
    else assignmentsCache.clear();
}

/** Cached read of a user's branch assignments. Same TTL as the scope cache. */
export async function getCachedUserBranchAssignments(userId: string) {
    return loadAssignments(userId);
}

/**
 * Branch visibility for RO APIs. Bypass-only user is always restricted to the Bypass
 * branch, regardless of role permissions.
 */
export async function getBranchScopeForSessionUser(user: {
    id?: string | null;
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
    const canViewAllBranches =
        permissions.includes("branches.view_all") || permissions.includes("users.manage");
    if (canViewAllBranches) {
        return { kind: "all" };
    }

    const canViewMultiBranches = permissions.includes("branches.view_multi");
    const freshAssignments =
        typeof user?.id === "string" ? await loadAssignments(user.id) : null;
    const assignedBranchIds: string[] =
        freshAssignments?.branches?.map((ub) => ub.branchId).filter(Boolean) ??
        (Array.isArray(user?.branchIds) ? user.branchIds : []);
    const userBranchId =
        typeof freshAssignments?.branchId === "string"
            ? freshAssignments.branchId
            : typeof user?.branchId === "string"
              ? user.branchId
              : undefined;

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
