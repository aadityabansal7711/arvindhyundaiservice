import prisma from "@/lib/prisma";
import supabaseAdmin from "@/lib/supabase-admin";

export type BranchRow = { id: string; name: string; city: string | null };

const TTL_MS = 10 * 60 * 1000;
let cache: { data: BranchRow[]; expiresAt: number } | null = null;
let inflight: Promise<BranchRow[]> | null = null;

// Supabase REST is the primary path — it shares the pooled HTTP client with the
// rest of the bodyshop API and avoids prisma cold-start stalls that previously
// left the Branch column blank on the bodyshop board. Prisma is the fallback so
// we still work if the Branch table is missing the PostgREST grants.
async function loadBranches(): Promise<BranchRow[]> {
    const { data, error } = await supabaseAdmin
        .from("Branch")
        .select("id,name,city")
        .order("name", { ascending: true });
    if (!error && Array.isArray(data)) {
        return data.map((r: any) => ({
            id: String(r.id),
            name: String(r.name ?? ""),
            city: r.city ?? null,
        }));
    }
    const rows = await prisma.branch.findMany({ orderBy: { name: "asc" } });
    return rows as BranchRow[];
}

export async function getAllBranchesCached(): Promise<BranchRow[]> {
    const now = Date.now();
    if (cache && cache.expiresAt > now) return cache.data;
    if (inflight) return inflight;
    inflight = loadBranches()
        .then((rows) => {
            cache = { data: rows, expiresAt: Date.now() + TTL_MS };
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
