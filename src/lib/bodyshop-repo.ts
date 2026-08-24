import supabaseAdmin from "./supabase-admin";
import { differenceInDays } from "date-fns";
import { AnyStatusSection, BodyshopJob, BodyshopJobWithMeta, JobCategory } from "./bodyshop-types";
import { BODYSHOP_JOBS_SEED, STATUS_SECTION_ORDER } from "./bodyshop-seed";
import { SERVICE_STATUS_SECTION_ORDER } from "./service-seed";

const TABLE_NAME = "bodyshop_jobs";
const SUPABASE_PAGE_SIZE = 1000;

type ListParams = {
  search?: string;
  statusSection?: AnyStatusSection | "All";
  branchIds?: string[];
  limit?: number;
  select?: string;
  jobCategory?: JobCategory | "all";
};

let seedCheckPromise: Promise<void> | null = null;

function resolveJobCategory(raw: unknown): JobCategory {
  return raw === "service" ? "service" : "bodyshop";
}

/** Uses the row's own category — a stray mismatch with the query filter must not get silently coerced wrong. */
function normalizeStatusSection(raw: unknown, category: JobCategory): AnyStatusSection {
  const s = typeof raw === "string" ? raw : "";
  if (category === "service") {
    return (SERVICE_STATUS_SECTION_ORDER as readonly string[]).includes(s)
      ? (s as AnyStatusSection)
      : SERVICE_STATUS_SECTION_ORDER[0];
  }
  if (s === "Approval Hold") return "Approval Pending";
  if (s === "No Claim") return "Total Loss / Disputed";
  if ((STATUS_SECTION_ORDER as readonly string[]).includes(s)) return s as AnyStatusSection;
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

  return { ...job, age_days };
}

export async function listBodyshopJobs(
  params: ListParams = {}
): Promise<BodyshopJobWithMeta[]> {
  const { search, statusSection, branchIds, limit = 200, select, jobCategory = "bodyshop" } = params;

  if (branchIds && branchIds.length === 0) {
    return [];
  }

  const pageSize = Math.min(SUPABASE_PAGE_SIZE, Math.max(1, limit));
  const pages = Math.ceil(limit / pageSize);
  const data: BodyshopJob[] = [];
  let error: { message: string } | null = null;

  // Try Supabase first. Supabase/PostgREST can cap a single response at 1,000
  // rows, so analytics-sized reads must page explicitly or "Both" totals only
  // reflect the first chunk of the shared bodyshop_jobs table.
  for (let page = 0; page < pages; page += 1) {
    const from = page * pageSize;
    const to = Math.min(from + pageSize - 1, limit - 1);
    let query = supabaseAdmin
      .from(TABLE_NAME)
      .select(select && select.trim().length > 0 ? select : "*")
      .order("ro_date", { ascending: false })
      .range(from, to);

    if (jobCategory !== "all") {
      query = query.eq("job_category", jobCategory);
    }

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

    const pageResult = await query;
    if (pageResult.error) {
      error = pageResult.error;
      break;
    }
    const pageData = (pageResult.data ?? []) as unknown as BodyshopJob[];
    data.push(...pageData);
    if (pageData.length < pageSize) break;
  }

  if (error) {
    console.warn("[bodyshop] Supabase query failed, falling back to seed:", error.message);

    // Fallback: filter in-memory seed data.
    const filtered = BODYSHOP_JOBS_SEED.filter((job) => {
      if (
        jobCategory !== "all" &&
        resolveJobCategory((job as { job_category?: unknown }).job_category) !== jobCategory
      ) {
        return false;
      }
      if (statusSection && statusSection !== "All" && job.status_section !== statusSection) {
        return false;
      }
      if (branchIds && branchIds.length > 0 && (!job.branch_id || !branchIds.includes(job.branch_id))) {
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

  return data.map((row) => {
    const raw = row as unknown as BodyshopJob;
    const rowCategory = resolveJobCategory((raw as { job_category?: unknown }).job_category);
    return addMeta({
      ...raw,
      job_category: rowCategory,
      status_section: normalizeStatusSection((raw as { status_section?: unknown }).status_section, rowCategory),
    });
  });
}
