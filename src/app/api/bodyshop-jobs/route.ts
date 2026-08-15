import { NextRequest, NextResponse } from "next/server";
import { listBodyshopJobs, ensureSeededOnce } from "@/lib/bodyshop-repo";
import { AnyStatusSection, BodyshopJob, BodyshopJobWithMeta, JobCategory, StatusSection } from "@/lib/bodyshop-types";
import supabaseAdmin from "@/lib/supabase-admin";
import { getBypassBranchId, getBranchScopeForSessionUser, isBypassOnlyUser } from "@/lib/bypass-only-user";
import { getBranchNameMap } from "@/lib/branch-list";
import { STATUS_SECTION_ORDER } from "@/lib/bodyshop-seed";
import { SERVICE_STATUS_SECTION_ORDER } from "@/lib/service-seed";
import { enforceRateLimit, readJsonObject, requireBodyshopAccess, validateMutationRequest } from "@/lib/server-auth";
import { applyRoPrefix, getRoPrefixForBranchName } from "@/lib/ro-prefix";
import { cacheGet, cacheSet, clearBodyshopJobsCache } from "@/lib/bodyshop-jobs-cache";

// Photos and job fields are updated frequently (Move/Add actions). Force
// dynamic behavior so Next does not cache stale responses.
export const dynamic = "force-dynamic";
export const revalidate = 0;

const HIDDEN_TABLE = "bodyshop_job_hidden";
const cacheClear = clearBodyshopJobsCache;

function sectionOrderFor(category: JobCategory): readonly AnyStatusSection[] {
  return category === "service" ? SERVICE_STATUS_SECTION_ORDER : STATUS_SECTION_ORDER;
}

function isValidStatusSection(value: unknown, category: JobCategory): value is AnyStatusSection {
  return typeof value === "string" && (sectionOrderFor(category) as readonly string[]).includes(value);
}

function asText(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
}

function asPhotoList(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const photos = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  return photos.length > 0 ? photos : null;
}

function asOptionalNumber(value: unknown): number | null {
  if (value === "" || value == null) return null;
  const next = typeof value === "number" ? value : Number(value);
  return Number.isFinite(next) ? next : null;
}

const STATUS_MAP: Record<string, StatusSection> = {
  OPEN: "Document Pending",
  DOCUMENT_PENDING: "Document Pending",
  CLAIM_INTIMATION_PENDING: "Claim Intimation Pending",
  SURVEY_PENDING: "Survey Pending",
  "Survey Pending": "Survey Pending",
  "Document Pending": "Document Pending",
  "Claim Intimation Pending": "Claim Intimation Pending",
  "Approval Pending": "Approval Pending",
  "Approval Hold": "Approval Pending",
  "Approval Received": "Approval Received",
  PNA: "PNA",
  Dismantle: "Dismantle",
  Mechanical: "Mechanical",
  Cutting: "Cutting",
  Denting: "Denting",
  Painting: "Painting",
  Fitting: "Fitting",
  "Ready for Pre-Invoice": "Ready for Pre-Invoice",
  "Billed but Not Ready": "Billed but Not Ready",
  "DO Awaited": "DO Awaited",
  "Customer Awaited": "Customer Awaited",
  "Total Loss / Disputed": "Total Loss / Disputed",
  "No Claim": "Total Loss / Disputed",
  Delivered: "Delivered",
};

function mapCurrentStatusToSection(currentStatus: string): StatusSection {
  return STATUS_MAP[currentStatus] ?? "Document Pending";
}

function normalizeStatusSection(raw: unknown, category: JobCategory): AnyStatusSection {
  const s = typeof raw === "string" ? raw : "";
  if (category === "service") {
    return (SERVICE_STATUS_SECTION_ORDER as readonly string[]).includes(s)
      ? (s as AnyStatusSection)
      : SERVICE_STATUS_SECTION_ORDER[0];
  }
  if (s === "Approval Hold") return "Approval Pending";
  if (s === "No Claim") return "Total Loss / Disputed";
  return (STATUS_SECTION_ORDER as readonly string[]).includes(s) ? (s as AnyStatusSection) : "Document Pending";
}

function mapROToBodyshopJob(ro: {
  roNo: string;
  branchId: string | null;
  vehicleInDate: Date;
  committedDeliveryDate: Date | null;
  currentStatus: string;
  serviceAdvisorName: string | null;
  panelsNewReplace: number | null;
  panelsDent: number | null;
  vehicle: { registrationNo: string; model: string; customer: { name: string; mobile: string } };
  advisor: { name: string } | null;
  insuranceClaim?: { insuranceCompany: string; claimNo: string | null; claimIntimationDate: Date | null; hapFlag: boolean | null } | null;
  survey?: { surveyorName: string | null; surveyDate: Date | null; approvalDate: Date | null } | null;
  billing?: { actualLabour: number; billAmount: number } | null;
}): BodyshopJob {
  const status_section = mapCurrentStatusToSection(ro.currentStatus);
  const now = new Date().toISOString();
  return {
    id: ro.roNo,
    ro_no: ro.roNo,
    job_category: "bodyshop",
    work_type: null,
    branch_id: ro.branchId ?? null,
    ro_date: ro.vehicleInDate.toISOString().slice(0, 10),
    reg_no: ro.vehicle.registrationNo,
    customer_name: ro.vehicle.customer.name,
    model: ro.vehicle.model,
    insurance_company: ro.insuranceClaim?.insuranceCompany ?? null,
    surveyor: ro.survey?.surveyorName ?? null,
    service_advisor: ro.serviceAdvisorName ?? ro.advisor?.name ?? null,
    mobile_no: ro.vehicle.customer.mobile,
    photos: null,
    claim_intimation_date: ro.insuranceClaim?.claimIntimationDate?.toISOString().slice(0, 10) ?? null,
    claim_no: ro.insuranceClaim?.claimNo ?? null,
    hap_status: ro.insuranceClaim?.hapFlag === true ? "HAP" : ro.insuranceClaim?.hapFlag === false ? "N HAP" : null,
    survey_date: ro.survey?.surveyDate?.toISOString().slice(0, 10) ?? null,
    approval_date: ro.survey?.approvalDate?.toISOString().slice(0, 10) ?? null,
    advisor_remark: null,
    whatsapp_date: null,
    tentative_labor: ro.billing?.actualLabour ?? ro.billing?.billAmount ?? null,
    promised_date: ro.committedDeliveryDate?.toISOString().slice(0, 10) ?? null,
    general_remark: null,
    replace_panels: ro.panelsNewReplace != null ? String(ro.panelsNewReplace) : null,
    dent_panels: ro.panelsDent != null ? String(ro.panelsDent) : null,
    mrs: null,
    mrs_date: null,
    order_no: null,
    order_date: null,
    eta_date: null,
    received_date: null,
    status_section,
    billing_status: null,
    parts_status: null,
    created_at: now,
    updated_at: now,
  };
}

function mapROToBodyshopJobBoard(ro: {
  roNo: string;
  branchId: string | null;
  vehicleInDate: Date;
  currentStatus: string;
  serviceAdvisorName: string | null;
  vehicle: { registrationNo: string; model: string; customer: { name: string; mobile: string } };
  insuranceClaim?: { insuranceCompany: string | null } | null;
}): BodyshopJob {
  const status_section = mapCurrentStatusToSection(ro.currentStatus);
  const now = new Date().toISOString();
  return {
    id: ro.roNo,
    ro_no: ro.roNo,
    job_category: "bodyshop",
    work_type: null,
    branch_id: ro.branchId ?? null,
    ro_date: ro.vehicleInDate.toISOString().slice(0, 10),
    reg_no: ro.vehicle.registrationNo,
    customer_name: ro.vehicle.customer.name,
    model: ro.vehicle.model,
    insurance_company: ro.insuranceClaim?.insuranceCompany ?? null,
    surveyor: null,
    service_advisor: ro.serviceAdvisorName ?? null,
    mobile_no: ro.vehicle.customer.mobile,
    photos: null,
    claim_intimation_date: null,
    claim_no: null,
    hap_status: null,
    survey_date: null,
    approval_date: null,
    advisor_remark: null,
    whatsapp_date: null,
    tentative_labor: null,
    promised_date: null,
    general_remark: null,
    replace_panels: null,
    dent_panels: null,
    mrs: null,
    mrs_date: null,
    order_no: null,
    order_date: null,
    eta_date: null,
    received_date: null,
    status_section,
    billing_status: null,
    parts_status: null,
    created_at: now,
    updated_at: now,
  };
}

function isMissingOptionalRelationTable(error: unknown): boolean {
  const err = error as { code?: string; meta?: { table?: string }; message?: string };
  const table = err?.meta?.table ?? "";
  const message = err?.message ?? "";
  return (
    err?.code === "P2021" &&
    (table === "public.InsuranceClaim" ||
      table === "public.Survey" ||
      table === "public.Billing" ||
      message.includes("public.InsuranceClaim") ||
      message.includes("public.Survey") ||
      message.includes("public.Billing"))
  );
}

function filterJobs(
  jobs: BodyshopJobWithMeta[],
  search: string | undefined,
  statusSection: AnyStatusSection | "All",
  limit: number
): BodyshopJobWithMeta[] {
  let list = jobs;
  if (statusSection && statusSection !== "All") {
    list = list.filter((j) => j.status_section === statusSection);
  }
  if (search?.trim()) {
    const term = search.trim().toLowerCase();
    list = list.filter(
      (j) =>
        j.ro_no.toLowerCase().includes(term) ||
        (j.reg_no ?? "").toLowerCase().includes(term) ||
        (j.customer_name ?? "").toLowerCase().includes(term) ||
        (j.model ?? "").toLowerCase().includes(term)
    );
  }
  return list.slice(0, limit);
}

export async function GET(request: NextRequest) {
  const auth = await requireBodyshopAccess();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const countsOnly = url.searchParams.get("countsOnly") === "1" || url.searchParams.get("countsOnly") === "true";
  const search = countsOnly ? undefined : (url.searchParams.get("search") ?? undefined);
  const status = (url.searchParams.get("statusSection") ?? "All") as AnyStatusSection | "All";
  const category: JobCategory = (url.searchParams.get("category") ?? "").toLowerCase() === "service" ? "service" : "bodyshop";
  const sectionOrder = sectionOrderFor(category);
  const view = (url.searchParams.get("view") ?? "board").toLowerCase();
  const branchIdParam = (url.searchParams.get("branchId") ?? "").trim();
  const limitRaw = Number(url.searchParams.get("limit") ?? "200");
  const isBoardView = view === "board";
  // The board renders all open jobs and derives its per-stage counts client-side,
  // so it must load the complete open set or its counts drift below the sidebar
  // (which scans the whole table). Allow a high ceiling for the lightweight board
  // select; keep the heavier table view (select="*") bounded.
  const maxLimit = isBoardView ? 6000 : 400;
  const limit = countsOnly ? 2500 : (Number.isNaN(limitRaw) ? 200 : Math.min(Math.max(limitRaw, 1), maxLimit));
  const openOnlyParam = url.searchParams.get("openOnly");
  const openOnly =
    openOnlyParam == null ? true : !(openOnlyParam === "0" || openOnlyParam === "false");

  const user = auth.user;
  const branchScope = await getBranchScopeForSessionUser(user);
  const allowedBranchIds = branchScope.kind === "all" ? undefined : branchScope.ids;
  const restrictByBranch = branchScope.kind !== "all";
  const effectiveBranchIds =
    !restrictByBranch
      ? undefined
      : branchIdParam && allowedBranchIds && allowedBranchIds.includes(branchIdParam)
        ? [branchIdParam]
        : allowedBranchIds ?? [];

  if (effectiveBranchIds !== undefined && effectiveBranchIds.length === 0) {
    if (countsOnly) {
      const stages: Record<string, number> = {};
      for (const s of sectionOrder) {
        stages[s] = 0;
      }
      return NextResponse.json({ all: 0, stages });
    }
    return NextResponse.json([]);
  }

  if (countsOnly) {
    const cacheKey = `countsOnly:category=${category};openOnly=${openOnly ? 1 : 0};branch=${effectiveBranchIds?.join(",") ?? "ALL"}`;
    const cached = cacheGet<{ all: number; stages: Record<string, number> }>(cacheKey);
    if (cached) return NextResponse.json(cached);

    const stages: Record<string, number> = {};
    for (const s of sectionOrder) {
      stages[s] = 0;
    }

    const hiddenIds = new Set<string>();
    try {
      const { data: hiddenRows } = await supabaseAdmin
        .from(HIDDEN_TABLE)
        .select("job_id");
      for (const r of hiddenRows ?? []) {
        const id = (r as any)?.job_id;
        if (typeof id === "string" && id) hiddenIds.add(id);
      }
    } catch {
      // Ignore if table doesn't exist yet.
    }

    const jobs = await listBodyshopJobs({
      limit: 6000,
      statusSection: "All",
      branchIds: effectiveBranchIds,
      select: "id,ro_no,branch_id,ro_date,status_section,promised_date",
      jobCategory: category,
    });

    const byRo = new Map<string, AnyStatusSection>();
    for (const job of jobs) {
      if (hiddenIds.has(job.id) || hiddenIds.has(job.ro_no)) continue;
      byRo.set(job.ro_no, normalizeStatusSection(job.status_section, category));
    }

    if (openOnly) {
      for (const status of byRo.values()) {
        if (status === "Delivered") continue;
        stages[status] = (stages[status] ?? 0) + 1;
      }
    } else {
      for (const status of byRo.values()) {
        stages[status] = (stages[status] ?? 0) + 1;
      }
    }

    const all = openOnly
      ? Array.from(byRo.values()).filter((s) => s !== "Delivered").length
      : byRo.size;

    const payload = { all, stages };
    cacheSet(cacheKey, payload, 30000);
    return NextResponse.json(payload);
  }

  const term = search?.trim();
  const cacheKey = `list:category=${category};view=${view};openOnly=${openOnly ? 1 : 0};status=${status};limit=${limit};search=${term ?? ""};branch=${effectiveBranchIds?.join(",") ?? "ALL"}`;
  const cached = cacheGet<BodyshopJobWithMeta[]>(cacheKey);
  if (cached) return NextResponse.json(cached);

  const branchNameMapPromise =
    view === "board"
      ? getBranchNameMap().catch(() => null)
      : Promise.resolve(null);

  await ensureSeededOnce();

  // Keep board payload lightweight. Full photo arrays are fetched only on detail
  // open to avoid sending large base64/json blobs on list load.
  const boardSelect =
    "id,ro_no,branch_id,ro_date,reg_no,customer_name,model,insurance_company,service_advisor,mobile_no,status_section,job_category,work_type,promised_date,created_at,updated_at";

  const [supabaseJobs, hiddenRowsResult] = await Promise.all([
    listBodyshopJobs({
      limit: Math.min(limit * 2, countsOnly ? 5000 : isBoardView ? 6000 : 800),
      statusSection: countsOnly ? "All" : status,
      search,
      branchIds: effectiveBranchIds,
      select: isBoardView ? boardSelect : undefined,
      jobCategory: category,
    }),
    // Deleted/tombstoned IDs so refresh doesn't re-add them from Prisma.
    supabaseAdmin.from(HIDDEN_TABLE).select("job_id"),
  ]);

  const hiddenIds = new Set<string>();
  for (const r of hiddenRowsResult.data ?? []) {
    const id = (r as any)?.job_id;
    if (typeof id === "string" && id) hiddenIds.add(id);
  }

  const merged: BodyshopJobWithMeta[] = supabaseJobs.filter(
    (job) => !hiddenIds.has(job.id) && !hiddenIds.has(job.ro_no)
  );

  merged.sort((a, b) => {
    const dA = a.ro_date ? new Date(a.ro_date).getTime() : 0;
    const dB = b.ro_date ? new Date(b.ro_date).getTime() : 0;
    return dB - dA;
  });

  const openFiltered = openOnly
    ? merged.filter((j) => j.status_section !== "Delivered")
    : merged;
  const filtered = filterJobs(openFiltered, search, status, limit);

  // Attach branch_name server-side so the client can render the column without a
  // second round trip to /api/data/branches (and without the Prisma cold-start cost).
  const nameMap = await branchNameMapPromise;
  if (nameMap) {
    for (const job of filtered) {
      if (job.branch_id) job.branch_name = nameMap.get(job.branch_id) ?? null;
    }
  }

  cacheSet(cacheKey, filtered, term ? 3000 : 30000);
  return NextResponse.json(filtered);
}

export async function POST(request: NextRequest) {
  const mutationError = validateMutationRequest(request);
  if (mutationError) return mutationError;

  const auth = await requireBodyshopAccess();
  if (!auth.ok) return auth.response;
  const rateLimitError = enforceRateLimit(request, "bodyshop-create", 30, 60_000, auth.user.id ?? auth.user.email);
  if (rateLimitError) return rateLimitError;

  const parsed = await readJsonObject(request);
  if (parsed instanceof NextResponse) return parsed;
  const body = parsed;
  const branchScope = await getBranchScopeForSessionUser(auth.user);
  const userEmail = auth.user.email ?? undefined;
  if (isBypassOnlyUser(userEmail)) {
    const bid = await getBypassBranchId();
    if (!bid) {
      return NextResponse.json({ error: "Bypass branch is not configured" }, { status: 400 });
    }
    const reqB = body?.branch_id as string | null | undefined;
    if (reqB && String(reqB).trim() && String(reqB).trim() !== bid) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    body.branch_id = bid;
  }

  if (branchScope.kind === "ids") {
    const allowed = new Set(branchScope.ids);
    const requestedBranchId =
      typeof body?.branch_id === "string" && body.branch_id.trim()
        ? body.branch_id.trim()
        : null;
    if (!requestedBranchId && branchScope.ids.length === 1) {
      body.branch_id = branchScope.ids[0];
    } else if (!requestedBranchId || !allowed.has(requestedBranchId)) {
      return NextResponse.json({ error: "Forbidden branch" }, { status: 403 });
    }
  }

  const rawId = asText(body?.id ?? body?.ro_no ?? body?.roNo);
  if (!rawId) {
    return NextResponse.json(
      { error: "id (or ro_no) is required" },
      { status: 400 }
    );
  }

  // Apply compulsory branch prefix (BP/FT/DH) so per-branch 1..N series cannot
  // collide across branches. Branch name is resolved from the (already
  // permission-checked) branch_id on the request.
  const branchIdForPrefix = asText(body?.branch_id);
  const branchNameMap = await getBranchNameMap().catch(() => null);
  const branchName = branchIdForPrefix ? branchNameMap?.get(branchIdForPrefix) ?? null : null;
  const branchPrefix = getRoPrefixForBranchName(branchName);
  if (branchIdForPrefix && branchName && !branchPrefix) {
    // Branch exists but is not in the prefix table — fail loudly rather than
    // silently letting a non-prefixed RO into the system.
    return NextResponse.json(
      { error: `No RO prefix configured for branch "${branchName}". Update src/lib/ro-prefix.ts.` },
      { status: 400 }
    );
  }
  const id = applyRoPrefix(branchName, rawId);

  const now = new Date().toISOString();
  const jobCategory: JobCategory = body?.job_category === "service" ? "service" : "bodyshop";
  const requestedStatus = body?.status_section ?? sectionOrderFor(jobCategory)[0];
  if (!isValidStatusSection(requestedStatus, jobCategory)) {
    return NextResponse.json({ error: "Invalid status_section" }, { status: 400 });
  }
  const payload: Partial<BodyshopJob> & { id: string; updated_at: string } = {
    id,
    ro_no: id,
    job_category: jobCategory,
    branch_id: asText(body?.branch_id),
    ro_date: asText(body?.ro_date),
    reg_no: asText(body?.reg_no),
    customer_name: asText(body?.customer_name),
    model: asText(body?.model),
    insurance_company: asText(body?.insurance_company),
    surveyor: asText(body?.surveyor),
    service_advisor: asText(body?.service_advisor),
    mobile_no: asText(body?.mobile_no),
    photos: asPhotoList(body?.photos),
    claim_intimation_date: asText(body?.claim_intimation_date),
    claim_no: asText(body?.claim_no),
    hap_status: asText(body?.hap_status),
    survey_date: asText(body?.survey_date),
    approval_date: asText(body?.approval_date),
    advisor_remark: asText(body?.advisor_remark),
    whatsapp_date: asText(body?.whatsapp_date),
    tentative_labor: asOptionalNumber(body?.tentative_labor),
    promised_date: asText(body?.promised_date),
    general_remark: asText(body?.general_remark),
    replace_panels: asText(body?.replace_panels),
    dent_panels: asText(body?.dent_panels),
    mrs: asText(body?.mrs),
    mrs_date: asText(body?.mrs_date),
    order_no: asText(body?.order_no),
    order_date: asText(body?.order_date),
    eta_date: asText(body?.eta_date),
    received_date: asText(body?.received_date),
    status_section: requestedStatus,
    billing_status: asText(body?.billing_status),
    parts_status: asText(body?.parts_status),
    updated_at: now,
  };

  // Ensure created_at exists for Supabase row creation
  (payload as any).created_at = body?.created_at ?? now;

  // Guard against duplicate RO numbers silently overwriting an existing job.
  // Without this check the upsert below would replace the existing row.
  const { data: existing, error: existingErr } = await supabaseAdmin
    .from("bodyshop_jobs")
    .select("id")
    .eq("id", payload.id)
    .maybeSingle();
  if (existingErr) {
    return NextResponse.json({ error: existingErr.message }, { status: 500 });
  }
  if (existing) {
    return NextResponse.json(
      { error: `RO number "${payload.id}" already exists. Please use a different RO number.` },
      { status: 409 }
    );
  }

  const { error } = await supabaseAdmin
    .from("bodyshop_jobs")
    .upsert(payload as any, { onConflict: "id" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  cacheClear();

  // If this RO was previously deleted, it may be tombstoned in `bodyshop_job_hidden`.
  // Clear it so the detail endpoint doesn't 404 immediately after "re-creating" it.
  try {
    await supabaseAdmin.from(HIDDEN_TABLE).delete().eq("job_id", payload.id);
  } catch {
    // Ignore if table doesn't exist yet.
  }

  return NextResponse.json({ success: true });
}
