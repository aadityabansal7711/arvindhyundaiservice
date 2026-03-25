import supabaseAdmin from "./supabase-admin";
import { differenceInDays } from "date-fns";
import { BodyshopJob, BodyshopJobWithMeta, StatusSection } from "./bodyshop-types";
import { BODYSHOP_JOBS_SEED, STATUS_SECTION_ORDER } from "./bodyshop-seed";

const TABLE_NAME = "bodyshop_jobs";

type ListParams = {
  search?: string;
  statusSection?: StatusSection | "All";
  branchIds?: string[];
  limit?: number;
  select?: string;
};

let seedCheckPromise: Promise<void> | null = null;

function normalizeStatusSection(raw: unknown): StatusSection {
  const s = typeof raw === "string" ? raw : "";
  if (s === "Approval Hold") return "Approval Pending";
  if (s === "No Claim") return "Total Loss / Disputed";
  if (STATUS_SECTION_ORDER.includes(s as StatusSection)) return s as StatusSection;
  return "Document Pending";
}

export async function ensureSeededOnce() {
  if (seedCheckPromise) return seedCheckPromise;

  seedCheckPromise = (async () => {
    // Cheap count to see if table exists and has data.
    const { count, error } = await supabaseAdmin
      .from(TABLE_NAME)
      .select("id", { count: "exact", head: true });

    if (error) {
      // Table may not exist yet – just log and fall back to in-memory data.
      console.warn(
        "[bodyshop] Supabase table missing or inaccessible, serving in-memory seed only:",
        error.message
      );
      return;
    }

    if ((count ?? 0) > 0) return;

    const { error: insertError } = await supabaseAdmin
      .from(TABLE_NAME)
      .upsert(BODYSHOP_JOBS_SEED, { onConflict: "id" });

    if (insertError) {
      console.error(
        "[bodyshop] Failed to seed Supabase bodyshop_jobs:",
        insertError.message
      );
    }
  })();

  return seedCheckPromise;
}

/** Exported so API can add meta to Prisma-sourced jobs when merging. */
export function addMeta(job: BodyshopJob): BodyshopJobWithMeta {
  const today = new Date();
  const age_days =
    job.ro_date && !Number.isNaN(Date.parse(job.ro_date))
      ? differenceInDays(today, new Date(job.ro_date))
      : 0;
  const overdue =
    !!job.promised_date &&
    !Number.isNaN(Date.parse(job.promised_date)) &&
    new Date(job.promised_date) < today &&
    job.status_section !== "Delivered";

  return { ...job, age_days, overdue };
}

export async function listBodyshopJobs(
  params: ListParams = {}
): Promise<BodyshopJobWithMeta[]> {
  const { search, statusSection, branchIds, limit = 200, select } = params;

  // Try Supabase first.
  let query = supabaseAdmin
    .from(TABLE_NAME)
    .select(select && select.trim().length > 0 ? select : "*")
    .order("ro_date", { ascending: false })
    .limit(limit);

  if (statusSection && statusSection !== "All") {
    query = query.eq("status_section", statusSection);
  }

  if (branchIds && branchIds.length > 0) {
    query = query.in("branch_id", branchIds);
  }

  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    query = query.or(
      [
        `ro_no.ilike.${term}`,
        `reg_no.ilike.${term}`,
        `customer_name.ilike.${term}`,
        `model.ilike.${term}`,
      ].join(",")
    );
  }

  const { data, error } = await query;

  if (error) {
    console.warn("[bodyshop] Supabase query failed, falling back to seed:", error.message);

    // Fallback: filter in-memory seed data.
    const filtered = BODYSHOP_JOBS_SEED.filter((job) => {
      if (statusSection && statusSection !== "All" && job.status_section !== statusSection) {
        return false;
      }
      if (branchIds && branchIds.length > 0 && job.branch_id && !branchIds.includes(job.branch_id)) {
        return false;
      }
      if (!search || !search.trim()) return true;
      const term = search.trim().toLowerCase();
      return (
        job.ro_no.toLowerCase().includes(term) ||
        (job.reg_no ?? "").toLowerCase().includes(term) ||
        (job.customer_name ?? "").toLowerCase().includes(term) ||
        (job.model ?? "").toLowerCase().includes(term)
      );
    }).slice(0, limit);

    return filtered.map(addMeta);
  }

  return (data ?? []).map((row) => {
    const raw = row as unknown as BodyshopJob;
    return addMeta({
      ...raw,
      status_section: normalizeStatusSection((raw as any).status_section),
    });
  });
}

