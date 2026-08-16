import { NextRequest, NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabase-admin";
import { addMeta } from "@/lib/bodyshop-repo";
import { AnyStatusSection, BodyshopJob, JobCategory, ServiceStatusSection, StatusSection } from "@/lib/bodyshop-types";
import { STATUS_SECTION_ORDER } from "@/lib/bodyshop-seed";
import { SERVICE_STATUS_SECTION_ORDER } from "@/lib/service-seed";
import {
  canAccessBranch,
  enforceRateLimit,
  readJsonObject,
  rejectCrossSiteMutation,
  requireBodyshopAccess,
  requireSession,
  validateMutationRequest,
} from "@/lib/server-auth";
import { isOwnerUser } from "@/lib/owner-access";

// Ensure the job detail (including photos array) is never served stale.
export const dynamic = "force-dynamic";
export const revalidate = 0;

const TABLE_NAME = "bodyshop_jobs";
const STAGE_TABLE = "bodyshop_job_stages";
const HIDDEN_TABLE = "bodyshop_job_hidden";
const GM_EMAIL = "servicegm.hyundai@arvindgroup.in";
const JOB_DETAIL_SELECT =
  "id,ro_no,branch_id,ro_date,reg_no,customer_name,model,insurance_company,surveyor,service_advisor,mobile_no,claim_intimation_date,claim_no,hap_status,survey_date,approval_date,advisor_remark,whatsapp_date,tentative_labor,promised_date,general_remark,replace_panels,dent_panels,mrs,mrs_date,order_no,order_date,eta_date,received_date,status_section,billing_status,parts_status,job_category,work_type,created_at,updated_at";
const PATCH_BASE_SELECT = `${JOB_DETAIL_SELECT},photos`;
type CacheEntry<T> = { value: T; expiresAt: number };
const photoCache = new Map<string, CacheEntry<{ id: string; ro_no: string; photos: string[] }>>();

function getPhotoCache(id: string): { id: string; ro_no: string; photos: string[] } | null {
  const hit = photoCache.get(id);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    photoCache.delete(id);
    return null;
  }
  return hit.value;
}

function setPhotoCache(id: string, value: { id: string; ro_no: string; photos: string[] }) {
  photoCache.set(id, { value, expiresAt: Date.now() + 15000 });
}

function isGmUser(email: string | null | undefined) {
  return (email ?? "").trim().toLowerCase() === GM_EMAIL;
}

function getAllowedNextStatuses(
  current: StatusSection | null
): StatusSection[] {
  if (!current) return [STATUS_SECTION_ORDER[0]];
  if (current === "Approval Pending") {
    return ["Approval Received", "Total Loss / Disputed"];
  }
  if (current === "Customer Awaited") {
    return ["Delivered"];
  }
  const idx = (STATUS_SECTION_ORDER as readonly string[]).indexOf(current);
  if (idx < 0 || idx >= STATUS_SECTION_ORDER.length - 1) return [];
  return [STATUS_SECTION_ORDER[idx + 1]];
}

/** Service jobs have no branching (unlike Bodyshop's "Approval Pending" split) — purely linear. */
function getAllowedNextServiceStatuses(
  current: ServiceStatusSection | null
): ServiceStatusSection[] {
  if (!current) return [SERVICE_STATUS_SECTION_ORDER[0]];
  const idx = (SERVICE_STATUS_SECTION_ORDER as readonly string[]).indexOf(current);
  if (idx < 0 || idx >= SERVICE_STATUS_SECTION_ORDER.length - 1) return [];
  return [SERVICE_STATUS_SECTION_ORDER[idx + 1]];
}

function resolveJobCategory(raw: unknown): JobCategory {
  return raw === "service" ? "service" : "bodyshop";
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
  return (STATUS_SECTION_ORDER as string[]).includes(s)
    ? (s as AnyStatusSection)
    : "Document Pending";
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireBodyshopAccess();
  if (!auth.ok) return auth.response;
  const rateLimitError = enforceRateLimit(request, "bodyshop-update", 90, 60_000, auth.user.id ?? auth.user.email);
  if (rateLimitError) return rateLimitError;

  const { id } = await context.params;
  const url = new URL(request.url);
  const photosOnly = url.searchParams.get("photosOnly") === "1";

  if (photosOnly) {
    const cached = getPhotoCache(id);
    if (cached) return NextResponse.json(cached);
  }

  // If it's been deleted/tombstoned, don't show it even if it exists in Prisma.
  try {
    const hidden = await supabaseAdmin
      .from(HIDDEN_TABLE)
      .select("job_id")
      .eq("job_id", id)
      .maybeSingle();
    if (hidden?.data) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
  } catch {
    // ignore if table doesn't exist yet
  }

  const baseSelect = photosOnly ? "id,ro_no,photos" : JOB_DETAIL_SELECT;
  const { data, error } = await supabaseAdmin
    .from(TABLE_NAME)
    .select(baseSelect)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let row = data as unknown as BodyshopJob | null;

  // Some installations treat `ro_no` as the canonical identifier (or may have
  // legacy data where `id` doesn't match the route param). Fall back to `ro_no`.
  if (!row) {
    const byRo = await supabaseAdmin
      .from(TABLE_NAME)
      .select(baseSelect)
      .eq("ro_no", id)
      .maybeSingle();
    if (byRo.error) {
      return NextResponse.json({ error: byRo.error.message }, { status: 500 });
    }
    row = (byRo.data as unknown as BodyshopJob | null) ?? null;
  }

  if (row) {
    const rawBranch = (row as { branch_id?: string | null }).branch_id;
    if (!(await canAccessBranch(auth.user, rawBranch ?? null))) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    if (photosOnly) {
      const photos = Array.isArray(row.photos)
        ? (row.photos as unknown[]).filter((p): p is string => typeof p === "string")
        : [];
      const payload = {
        id: String(row.id ?? id),
        ro_no: String(row.ro_no ?? id),
        photos,
      };
      setPhotoCache(id, payload);
      if (payload.id !== id) setPhotoCache(payload.id, payload);
      return NextResponse.json(payload);
    }
    const rowCategory = resolveJobCategory((row as { job_category?: unknown }).job_category);
    return NextResponse.json(
      addMeta({
        ...row,
        job_category: rowCategory,
        photos: null,
        status_section: normalizeStatusSection((row as any).status_section, rowCategory),
      })
    );
  }

  return NextResponse.json({ error: "Job not found" }, { status: 404 });
}

async function loadPatchBaseRow(
  id: string,
  existing: Record<string, unknown> | null
): Promise<Record<string, unknown> | null> {
  if (existing) {
    return { ...existing };
  }
  return null;
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const mutationError = validateMutationRequest(request);
  if (mutationError) return mutationError;

  const auth = await requireBodyshopAccess();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  photoCache.delete(id);
  const parsed = await readJsonObject(request);
  if (parsed instanceof NextResponse) return parsed;
  const body = parsed;

  const userEmail = auth.user.email ?? undefined;
  const isGm = isGmUser(userEmail);

  const toStatus = body.status_section as AnyStatusSection | undefined;
  // Cheap sanity check only ("is this any known stage at all") — we don't yet
  // know this job's category (bodyshop vs service), so the real, category-correct
  // transition check happens later once `mergedBase.job_category` is available.
  if (
    toStatus &&
    !(STATUS_SECTION_ORDER as readonly string[]).includes(toStatus) &&
    !(SERVICE_STATUS_SECTION_ORDER as readonly string[]).includes(toStatus)
  ) {
    return NextResponse.json({ error: "Invalid status_section" }, { status: 400 });
  }
  // `remark` is the legacy column. Treat it as "inputer remark" for backward compatibility.
  const inputerRemark =
    (body.inputer_remark as string | undefined) ??
    (body.remark as string | undefined) ??
    null;
  const gmRemark = isGm ? ((body.gm_remark as string | undefined) ?? null) : null;
  const changedBy = (body.changed_by as string | undefined) ?? null;
  const photosAppend = Array.isArray(body.photos_append)
    ? (body.photos_append as unknown[]).filter(
        (p): p is string => typeof p === "string" && p.length > 0
      )
    : [];
  const photosRemoveIndex =
    typeof body.photos_remove_index === "number" && Number.isInteger(body.photos_remove_index)
      ? body.photos_remove_index
      : null;
  if (photosRemoveIndex !== null && !isOwnerUser(auth.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const movement_at_raw =
    typeof body.movement_at === "string" ? body.movement_at.trim() : "";
  let changed_at: string | null = null;
  if (movement_at_raw) {
    const movementDate = new Date(movement_at_raw);
    if (Number.isNaN(movementDate.getTime())) {
      return NextResponse.json(
        { error: "Invalid movement_at. Expected datetime-local value." },
        { status: 400 }
      );
    }
    changed_at = movementDate.toISOString();
  }

  const needsPhotos =
    photosAppend.length > 0 ||
    photosRemoveIndex !== null ||
    Object.prototype.hasOwnProperty.call(body, "photos");
  const { data: existing, error: fetchError } = await supabaseAdmin
    .from(TABLE_NAME)
    .select(needsPhotos ? PATCH_BASE_SELECT : JOB_DETAIL_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json(
      { error: fetchError.message },
      { status: 500 }
    );
  }

  const now = new Date().toISOString();
  const mergedBase = await loadPatchBaseRow(
    id,
    existing as Record<string, unknown> | null
  );
  if (!mergedBase) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const baseBranchId = (mergedBase.branch_id as string | null) ?? null;
  const hasNextBranch = Object.prototype.hasOwnProperty.call(body, "branch_id");
  const nextBid = hasNextBranch
    ? body.branch_id
      ? String(body.branch_id).trim()
      : null
    : null;
  const [baseAllowed, nextAllowed] = await Promise.all([
    canAccessBranch(auth.user, baseBranchId),
    hasNextBranch ? canAccessBranch(auth.user, nextBid) : Promise.resolve(true),
  ]);
  if (!baseAllowed) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  if (hasNextBranch && !nextAllowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const merged: Record<string, unknown> = { ...mergedBase };
  const fromStatus = (merged.status_section as string | null) ?? null;
  const jobCategory = resolveJobCategory(mergedBase.job_category);

  if (toStatus && toStatus !== fromStatus) {
    const allowedTargets: AnyStatusSection[] =
      jobCategory === "service"
        ? getAllowedNextServiceStatuses(fromStatus as ServiceStatusSection | null)
        : getAllowedNextStatuses(fromStatus as StatusSection | null);
    if (!allowedTargets.includes(toStatus)) {
      return NextResponse.json(
        {
          error: `Invalid stage transition: "${fromStatus ?? "(none)"}" → "${toStatus}". Allowed next: ${allowedTargets.length ? allowedTargets.join(", ") : "(none)"}.`,
        },
        { status: 400 }
      );
    }
  }

  const allowedFields: (keyof BodyshopJob)[] = [
    "ro_no",
    "branch_id",
    "ro_date",
    "reg_no",
    "customer_name",
    "model",
    "insurance_company",
    "surveyor",
    "service_advisor",
    "mobile_no",
    "photos",
    "claim_intimation_date",
    "claim_no",
    "hap_status",
    "survey_date",
    "approval_date",
    "advisor_remark",
    "whatsapp_date",
    "tentative_labor",
    "promised_date",
    "general_remark",
    "replace_panels",
    "dent_panels",
    "mrs",
    "mrs_date",
    "order_no",
    "order_date",
    "eta_date",
    "received_date",
    "status_section",
    "billing_status",
    "parts_status",
  ];

  for (const k of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(body, k)) {
      merged[k] = (body as Record<string, unknown>)[k as string];
    }
  }
  if (photosAppend.length > 0 || photosRemoveIndex !== null) {
    let existingPhotos = Array.isArray(merged.photos)
      ? (merged.photos as unknown[]).filter(
          (p): p is string => typeof p === "string" && p.length > 0
        )
      : [];
    if (
      photosRemoveIndex !== null &&
      photosRemoveIndex >= 0 &&
      photosRemoveIndex < existingPhotos.length
    ) {
      existingPhotos = existingPhotos.filter((_, i) => i !== photosRemoveIndex);
    }
    merged.photos = [...existingPhotos, ...photosAppend];
  }

  merged.id = id;
  merged.ro_no = String(merged.ro_no || id).trim() || id;
  merged.updated_at = now;
  if (!existing) {
    merged.created_at = (merged.created_at as string) || now;
  }

  const { data: updatedRows, error: updateError } = await supabaseAdmin
    .from(TABLE_NAME)
    .update(merged as unknown as BodyshopJob)
    .eq("id", id)
    .select(JOB_DETAIL_SELECT);

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message },
      { status: 500 }
    );
  }
  const updated = updatedRows?.[0];

  if (toStatus && toStatus !== fromStatus) {
    const baseStagePayload: Record<string, unknown> = {
      job_id: id,
      from_status: fromStatus,
      to_status: toStatus,
      remark: inputerRemark,
      changed_by: changedBy,
      ...(changed_at ? { changed_at } : {}),
    };

    if (gmRemark != null) {
      baseStagePayload.gm_remark = gmRemark;
    }

    let { error: stageError } = await supabaseAdmin
      .from(STAGE_TABLE)
      .insert(baseStagePayload);

    // Retry without optional history columns for older Supabase installs.
    for (const optionalColumn of ["gm_remark", "changed_by"] as const) {
      if (
        stageError &&
        Object.prototype.hasOwnProperty.call(baseStagePayload, optionalColumn) &&
        String(stageError.message ?? "").toLowerCase().includes(optionalColumn)
      ) {
        delete baseStagePayload[optionalColumn];
        const retry = await supabaseAdmin.from(STAGE_TABLE).insert(baseStagePayload);
        stageError = retry.error;
      }
    }

    if (stageError) {
      // Log but don't fail the main request.
      console.warn(
        "Failed to insert bodyshop stage history:",
        stageError.message
      );
    }
  }

  return NextResponse.json({
    success: true,
    job: updated ? addMeta(updated as BodyshopJob) : null,
  });
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const mutationError = rejectCrossSiteMutation(request);
  if (mutationError) return mutationError;

  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  const rateLimitError = enforceRateLimit(request, "bodyshop-delete", 15, 60_000, auth.user.id ?? auth.user.email);
  if (rateLimitError) return rateLimitError;

  // Requirement: only this specific admin user should be able to delete ROs.
  // This endpoint tombstones + deletes the bodyshop record, which represents an RO in the board UI.
  const allowedRoDeleteEmail = "mayank.arvind.bansal@gmail.com";
  const email = auth.user.email;
  const isAllowedAdmin =
    typeof email === "string" && email.toLowerCase() === allowedRoDeleteEmail;
  if (!isAllowedAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  photoCache.delete(id);

  // Tombstone first so refresh won't re-add this RO from Prisma open ROs.
  try {
    await supabaseAdmin.from(HIDDEN_TABLE).upsert({ job_id: id }, { onConflict: "job_id" });
  } catch {
    // ignore if table doesn't exist yet
  }

  const stagesDel = await supabaseAdmin.from(STAGE_TABLE).delete().eq("job_id", id);
  if (stagesDel.error) {
    // don't fail; try deleting main record
    console.warn("Failed to delete bodyshop stage history:", stagesDel.error.message);
  }

  const { error } = await supabaseAdmin.from(TABLE_NAME).delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
