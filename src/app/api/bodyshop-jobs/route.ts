import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { listBodyshopJobs, ensureSeededOnce, addMeta } from "@/lib/bodyshop-repo";
import { BodyshopJob, BodyshopJobWithMeta, StatusSection } from "@/lib/bodyshop-types";
import { authOptions } from "@/lib/auth-options";
import prisma from "@/lib/prisma";
import supabaseAdmin from "@/lib/supabase-admin";

const HIDDEN_TABLE = "bodyshop_job_hidden";

type CacheEntry<T> = { value: T; expiresAt: number };
const cache = new Map<string, CacheEntry<unknown>>();
function cacheGet<T>(key: string): T | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    cache.delete(key);
    return null;
  }
  return hit.value as T;
}
function cacheSet<T>(key: string, value: T, ttlMs: number) {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

const STATUS_MAP: Record<string, StatusSection> = {
  OPEN: "Document Pending",
  DOCUMENT_PENDING: "Document Pending",
  SURVEY_PENDING: "Survey Pending",
  "Survey Pending": "Survey Pending",
  "Document Pending": "Document Pending",
  "Approval Pending": "Approval Pending",
  "Approval Hold": "Approval Hold",
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
  "No Claim": "No Claim",
  Delivered: "Delivered",
};

function mapCurrentStatusToSection(currentStatus: string): StatusSection {
  return STATUS_MAP[currentStatus] ?? "Document Pending";
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
  insuranceClaim: { insuranceCompany: string; claimNo: string | null; claimIntimationDate: Date | null; hapFlag: boolean | null } | null;
  survey: { surveyorName: string | null; surveyDate: Date | null; approvalDate: Date | null } | null;
  billing: { actualLabour: number; billAmount: number } | null;
}): BodyshopJob {
  const status_section = mapCurrentStatusToSection(ro.currentStatus);
  const now = new Date().toISOString();
  return {
    id: ro.roNo,
    ro_no: ro.roNo,
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
  insuranceClaim: { insuranceCompany: string | null } | null;
}): BodyshopJob {
  const status_section = mapCurrentStatusToSection(ro.currentStatus);
  const now = new Date().toISOString();
  return {
    id: ro.roNo,
    ro_no: ro.roNo,
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

function filterJobs(
  jobs: BodyshopJobWithMeta[],
  search: string | undefined,
  statusSection: StatusSection | "All",
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
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const countsOnly = url.searchParams.get("countsOnly") === "1" || url.searchParams.get("countsOnly") === "true";
  const search = countsOnly ? undefined : (url.searchParams.get("search") ?? undefined);
  const status = (url.searchParams.get("statusSection") ?? "All") as StatusSection | "All";
  const view = (url.searchParams.get("view") ?? "board").toLowerCase();
  const branchIdParam = (url.searchParams.get("branchId") ?? "").trim();
  const limitRaw = Number(url.searchParams.get("limit") ?? "200");
  const limit = countsOnly ? 2500 : (Number.isNaN(limitRaw) ? 200 : Math.min(Math.max(limitRaw, 1), 400));
  const openOnlyParam = url.searchParams.get("openOnly");
  const openOnly =
    openOnlyParam == null ? true : !(openOnlyParam === "0" || openOnlyParam === "false");

  const user = session.user as any;
  const permissions: string[] = Array.isArray(user?.permissions) ? user.permissions : [];
  const canViewAllBranches = permissions.includes("branches.view_all") || permissions.includes("users.manage");
  const assignedBranchIds: string[] = Array.isArray(user?.branchIds) ? user.branchIds : [];
  const primaryBranchId = typeof user?.branchId === "string" ? user.branchId : undefined;
  const allowedBranchIds =
    canViewAllBranches ? undefined : (assignedBranchIds.length > 0 ? assignedBranchIds : (primaryBranchId ? [primaryBranchId] : []));
  const effectiveBranchIds =
    canViewAllBranches
      ? undefined
      : branchIdParam && allowedBranchIds?.includes(branchIdParam)
        ? [branchIdParam]
        : allowedBranchIds;

  if (countsOnly) {
    const cacheKey = `countsOnly:openOnly=${openOnly ? 1 : 0};branch=${effectiveBranchIds?.join(",") ?? "ALL"}`;
    const cached = cacheGet<{ all: number; stages: Record<string, number> }>(cacheKey);
    if (cached) return NextResponse.json(cached);

    const stages: Record<string, number> = {};
    for (const s of [
      "Document Pending", "Survey Pending", "Approval Pending", "Approval Hold", "Approval Received",
      "PNA", "Dismantle", "Mechanical", "Cutting", "Denting", "Painting", "Fitting",
      "Ready for Pre-Invoice", "Billed but Not Ready", "DO Awaited", "Customer Awaited",
      "Total Loss / Disputed", "No Claim", "Delivered",
    ] as StatusSection[]) {
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

    // Load only the columns needed for counts.
    let sbQuery = supabaseAdmin
      .from("bodyshop_jobs")
      .select("ro_no,status_section")
      .limit(6000);
    if (effectiveBranchIds && effectiveBranchIds.length > 0) {
      sbQuery = sbQuery.in("branch_id", effectiveBranchIds);
    }
    const { data: sbRows } = await sbQuery;

    const byRo = new Map<string, StatusSection>();
    for (const row of sbRows ?? []) {
      const roNo = (row as any)?.ro_no;
      const status = (row as any)?.status_section as StatusSection | undefined;
      if (typeof roNo === "string" && roNo) {
        byRo.set(roNo, status ?? "Document Pending");
      }
    }

    const openROs = await prisma.repairOrder.findMany({
      where: {
        ...(openOnly ? { vehicleOutDate: null } : {}),
        ...(effectiveBranchIds && effectiveBranchIds.length > 0 ? { branchId: { in: effectiveBranchIds } } : {}),
      },
      select: {
        roNo: true,
        currentStatus: true,
      },
      take: 2000,
      orderBy: { vehicleInDate: "desc" },
    });

    for (const ro of openROs) {
      if (hiddenIds.has(ro.roNo)) continue;
      if (byRo.has(ro.roNo)) continue;
      byRo.set(ro.roNo, mapCurrentStatusToSection(ro.currentStatus));
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
    cacheSet(cacheKey, payload, 5000);
    return NextResponse.json(payload);
  }

  await ensureSeededOnce();

  const boardSelect =
    "id,ro_no,branch_id,ro_date,reg_no,customer_name,model,insurance_company,service_advisor,mobile_no,photos,status_section,promised_date,created_at,updated_at";

  const supabaseJobs = await listBodyshopJobs({
    limit: Math.min(limit * 2, countsOnly ? 5000 : 800),
    statusSection: countsOnly ? "All" : status,
    search,
    branchIds: effectiveBranchIds,
    select: view === "board" ? boardSelect : undefined,
  });

  // Deleted/tombstoned IDs so refresh doesn't re-add them from Prisma.
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
    // Ignore if table doesn't exist yet; rows may reappear until SQL is applied.
  }

  const term = search?.trim();
  const whereSearch =
    term && term.length > 0
      ? {
          OR: [
            { roNo: { contains: term, mode: "insensitive" as const } },
            {
              vehicle: {
                is: {
                  registrationNo: {
                    contains: term,
                    mode: "insensitive" as const,
                  },
                },
              },
            },
            {
              vehicle: {
                is: {
                  model: { contains: term, mode: "insensitive" as const },
                },
              },
            },
            {
              vehicle: {
                is: {
                  customer: {
                    is: {
                      name: { contains: term, mode: "insensitive" as const },
                    },
                  },
                },
              },
            },
          ],
        }
      : undefined;

  const cacheKey = `list:view=${view};openOnly=${openOnly ? 1 : 0};status=${status};limit=${limit};search=${term ?? ""};branch=${effectiveBranchIds?.join(",") ?? "ALL"}`;
  const cached = cacheGet<BodyshopJobWithMeta[]>(cacheKey);
  if (cached) return NextResponse.json(cached);

  const baseWhere = {
    ...(openOnly ? { vehicleOutDate: null } : {}),
    ...(whereSearch ?? {}),
    ...(effectiveBranchIds && effectiveBranchIds.length > 0 ? { branchId: { in: effectiveBranchIds } } : {}),
  };
  const take = term ? Math.min(limit * 3, 600) : 500;
  const orderBy = { vehicleInDate: "desc" as const };

  const supabaseByRo = new Map(supabaseJobs.map((j) => [j.ro_no, j]));
  const merged: BodyshopJobWithMeta[] = [...supabaseJobs];

  if (view === "board") {
    const openROsBoard = await prisma.repairOrder.findMany({
      where: baseWhere,
      select: {
        roNo: true,
        branchId: true,
        vehicleInDate: true,
        currentStatus: true,
        serviceAdvisorName: true,
        vehicle: {
          select: {
            registrationNo: true,
            model: true,
            customer: { select: { name: true, mobile: true } },
          },
        },
        insuranceClaim: { select: { insuranceCompany: true } },
      },
      orderBy,
      take,
    });

    for (const ro of openROsBoard) {
      if (hiddenIds.has(ro.roNo)) continue;
      if (supabaseByRo.has(ro.roNo)) continue;
      const job = mapROToBodyshopJobBoard(ro);
      merged.push(addMeta(job));
    }
  } else {
    const openROsFull = await prisma.repairOrder.findMany({
      where: baseWhere,
      select: {
        roNo: true,
        branchId: true,
        vehicleInDate: true,
        committedDeliveryDate: true,
        currentStatus: true,
        serviceAdvisorName: true,
        panelsNewReplace: true,
        panelsDent: true,
        vehicle: {
          select: {
            registrationNo: true,
            model: true,
            customer: { select: { name: true, mobile: true } },
          },
        },
        advisor: { select: { name: true } },
        insuranceClaim: {
          select: {
            insuranceCompany: true,
            claimNo: true,
            claimIntimationDate: true,
            hapFlag: true,
          },
        },
        survey: {
          select: { surveyorName: true, surveyDate: true, approvalDate: true },
        },
        billing: { select: { actualLabour: true, billAmount: true } },
      },
      orderBy,
      take,
    });

    for (const ro of openROsFull) {
      if (hiddenIds.has(ro.roNo)) continue;
      if (supabaseByRo.has(ro.roNo)) continue;
      const job = mapROToBodyshopJob(ro);
      merged.push(addMeta(job));
    }
  }

  merged.sort((a, b) => {
    const dA = a.ro_date ? new Date(a.ro_date).getTime() : 0;
    const dB = b.ro_date ? new Date(b.ro_date).getTime() : 0;
    return dB - dA;
  });

  const openFiltered = openOnly
    ? merged.filter((j) => j.status_section !== "Delivered")
    : merged;
  const filtered = filterJobs(openFiltered, search, status, limit);
  cacheSet(cacheKey, filtered, term ? 2000 : 5000);
  return NextResponse.json(filtered);
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const id = (body?.id ?? body?.ro_no ?? body?.roNo) as string | undefined;
  if (!id || !String(id).trim()) {
    return NextResponse.json(
      { error: "id (or ro_no) is required" },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();
  const payload: Partial<BodyshopJob> & { id: string; updated_at: string } = {
    id: String(id).trim(),
    ro_no: String(body?.ro_no ?? body?.roNo ?? id).trim(),
    branch_id: body?.branch_id ?? null,
    ro_date: body?.ro_date ?? null,
    reg_no: body?.reg_no ?? null,
    customer_name: body?.customer_name ?? null,
    model: body?.model ?? null,
    insurance_company: body?.insurance_company ?? null,
    surveyor: body?.surveyor ?? null,
    service_advisor: body?.service_advisor ?? null,
    mobile_no: body?.mobile_no ?? null,
    photos: Array.isArray(body?.photos) ? body.photos : null,
    claim_intimation_date: body?.claim_intimation_date ?? null,
    claim_no: body?.claim_no ?? null,
    hap_status: body?.hap_status ?? null,
    survey_date: body?.survey_date ?? null,
    approval_date: body?.approval_date ?? null,
    advisor_remark: body?.advisor_remark ?? null,
    whatsapp_date: body?.whatsapp_date ?? null,
    tentative_labor:
      body?.tentative_labor === "" || body?.tentative_labor == null
        ? null
        : Number(body?.tentative_labor),
    promised_date: body?.promised_date ?? null,
    general_remark: body?.general_remark ?? null,
    replace_panels: body?.replace_panels ?? null,
    dent_panels: body?.dent_panels ?? null,
    mrs: body?.mrs ?? null,
    mrs_date: body?.mrs_date ?? null,
    order_no: body?.order_no ?? null,
    order_date: body?.order_date ?? null,
    eta_date: body?.eta_date ?? null,
    received_date: body?.received_date ?? null,
    status_section:
      (body?.status_section as StatusSection | undefined) ?? "Document Pending",
    billing_status: body?.billing_status ?? null,
    parts_status: body?.parts_status ?? null,
    updated_at: now,
  };

  // Ensure created_at exists for Supabase row creation
  (payload as any).created_at = body?.created_at ?? now;

  const { error } = await supabaseAdmin
    .from("bodyshop_jobs")
    .upsert(payload as any, { onConflict: "id" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}


