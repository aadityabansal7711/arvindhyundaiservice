import prisma from "@/lib/prisma";

export type BranchRow = { id: string; name: string; city: string | null };

const TTL_MS = 10 * 60 * 1000;
let cache: { data: BranchRow[]; expiresAt: number } | null = null;
let inflight: Promise<BranchRow[]> | null = null;

export async function getAllBranchesCached(): Promise<BranchRow[]> {
    const now = Date.now();
    if (cache && cache.expiresAt > now) return cache.data;
    if (inflight) return inflight;
    inflight = prisma.branch
        .findMany({ orderBy: { name: "asc" } })
        .then((rows) => {
            cache = { data: rows as BranchRow[], expiresAt: Date.now() + TTL_MS };
            return cache.data;
        })
        .finally(() => {
            inflight = null;
        });
    return inflight;
}

export async function getBranchNameMap(): Promise<Map<string, string>> {
    const rows = await getAllBranchesCached();
    return new Map(rows.map((b) => [b.id, b.name]));
}

export function invalidateBranchListCache() {
    cache = null;
}
