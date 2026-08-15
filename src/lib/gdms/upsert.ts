import prisma from "@/lib/prisma";
import supabaseAdmin from "@/lib/supabase-admin";
import { applyRoPrefix, getRoPrefixForBranchName } from "@/lib/ro-prefix";
import { SERVICE_STATUS_SECTION_ORDER } from "@/lib/service-seed";
import type { JobCategory } from "@/lib/bodyshop-types";
import {
  classifyJobCategory,
  mapGdmsRowToBodyshopFields,
  resolveServiceAdvisorName,
  type GdmsRoRow,
} from "./mapper";

const TABLE_NAME = "bodyshop_jobs";
const DEFAULT_STATUS_SECTION = "Document Pending";

/**
 * Billing totals for one RO, as returned by gdms-service's Repair Billing
 * fetch (see gdms-service/src/billing-mapper.ts, where this shape is
 * actually computed — this app never talks to GDMS directly, so it just
 * mirrors the wire shape here).
 */
export type BillingTotals = {
  roNo: string;
  billingNo: string | null;
  laborAmount: number;
  laborDiscountAmount: number;
  partsAmount: number;
};

export type GdmsUpsertResult = {
  created: number;
  skipped: number;
  reclassified: number;
  errors: { roNo: string; message: string }[];
};

/**
 * The full row sent for a brand-new RO — mapped GDMS fields plus every
 * workflow field explicitly nulled out and status_section defaulted.
 * Pure/no I/O so it's directly unit-testable.
 */
export function buildInsertPayload(
  row: GdmsRoRow,
  id: string,
  branchId: string,
  now: string,
  advisorCandidates: string[] = []
) {
  const jobCategory = classifyJobCategory(row.workType);
  const statusSection = jobCategory === "service" ? SERVICE_STATUS_SECTION_ORDER[0] : DEFAULT_STATUS_SECTION;
  const mapped = mapGdmsRowToBodyshopFields(row);
  return {
    id,
    ro_no: id,
    branch_id: branchId,
    job_category: jobCategory,
    work_type: row.workType,
    ...mapped,
    service_advisor: resolveServiceAdvisorName(mapped.service_advisor, advisorCandidates),
    surveyor: null,
    mobile_no: null,
    photos: null,
    claim_intimation_date: null,
    claim_no: null,
    hap_status: null,
    survey_date: null,
    approval_date: null,
    advisor_remark: null,
    whatsapp_date: null,
    tentative_labor: null,
    general_remark: null,
    replace_panels: null,
    dent_panels: null,
    mrs: null,
    mrs_date: null,
    order_no: null,
    order_date: null,
    eta_date: null,
    received_date: null,
    status_section: statusSection,
    billing_status: null,
    parts_status: null,
    billed_labor_amount: null,
    labor_discount_amount: null,
    billed_parts_amount: null,
    billing_no: null,
    billing_fetched_at: null,
    created_at: now,
    updated_at: now,
  };
}

/**
 * For an RO that already exists: decides whether GDMS's real work type
 * disagrees with the category we have it under, and if so, exactly what to
 * patch. Returns null (no-op) when the category already matches — every
 * other field on the row stays completely untouched either way.
 *
 * Pure/no I/O so it's directly unit-testable.
 */
export function decideReclassification(
  existing: { job_category: string | null; status_section: string | null },
  newCategory: JobCategory
): { job_category: JobCategory; status_section: string } | null {
  const currentCategory: JobCategory = existing.job_category === "service" ? "service" : "bodyshop";
  if (currentCategory === newCategory) return null;

  // A stage name from the old category's workflow doesn't mean anything in
  // the new one — except "Delivered", which is still true either way.
  const statusSection =
    existing.status_section === "Delivered"
      ? "Delivered"
      : newCategory === "service"
        ? SERVICE_STATUS_SECTION_ORDER[0]
        : DEFAULT_STATUS_SECTION;

  return { job_category: newCategory, status_section: statusSection };
}

/**
 * Inserts ROs that aren't already tracked in bodyshop_jobs. For ROs that
 * already exist, every field is left untouched EXCEPT work_type (always
 * refreshed — it's pure GDMS metadata nobody edits by hand, purely
 * informational for the "Type" column) and job_category/status_section,
 * which only change when `decideReclassification` says the category is
 * actually wrong.
 *
 * This is deliberate: an RO already open in the app is being worked on by
 * staff (status, remarks, claim info, etc. all edited manually), so
 * re-fetching it from GDMS must never write over that in-progress record —
 * it would look like duplicated/reset data to whoever is tracking it. The
 * narrow exceptions (work type label, and which board it belongs on) are
 * safe because GDMS is the sole source of truth for both and staff never
 * edit them directly.
 */
export async function upsertBodyshopJobsFromGdms(
  rows: GdmsRoRow[],
  branchId: string,
  branchName: string | null
): Promise<GdmsUpsertResult> {
  const result: GdmsUpsertResult = { created: 0, skipped: 0, reclassified: 0, errors: [] };

  const branchPrefix = getRoPrefixForBranchName(branchName);
  if (branchName && !branchPrefix) {
    // Mirrors the guard in POST /api/bodyshop-jobs — fail loudly rather than
    // letting a non-prefixed RO into the system for a branch that should have one.
    for (const row of rows) {
      result.errors.push({
        roNo: row.roNo,
        message: `No RO prefix configured for branch "${branchName}". Update src/lib/ro-prefix.ts.`,
      });
    }
    return result;
  }

  // Fetched once per batch — every RO in this fetch is for the same branch,
  // so there's no reason to re-query per row. Includes branch-agnostic
  // (branchId: null) options alongside this branch's own.
  const advisorOptions = await prisma.dropdownOption.findMany({
    where: { groupKey: "service_advisor", OR: [{ branchId }, { branchId: null }] },
    select: { label: true },
  });
  const advisorCandidates = advisorOptions.map((o) => o.label);

  const CHUNK_SIZE = 10;
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    await Promise.all(chunk.map((row) => upsertOne(row, branchId, branchName, advisorCandidates, result)));
  }

  return result;
}

async function upsertOne(
  row: GdmsRoRow,
  branchId: string,
  branchName: string | null,
  advisorCandidates: string[],
  result: GdmsUpsertResult
): Promise<void> {
  const rawRoNo = row.roNo?.trim();
  if (!rawRoNo) {
    result.errors.push({ roNo: "(missing)", message: "GDMS row has no RO number" });
    return;
  }

  const id = applyRoPrefix(branchName, rawRoNo);
  const now = new Date().toISOString();

  try {
    const { data: existing, error: existingErr } = await supabaseAdmin
      .from(TABLE_NAME)
      .select("id,job_category,status_section")
      .eq("id", id)
      .maybeSingle();
    if (existingErr) throw new Error(existingErr.message);

    if (existing) {
      const reclassifyPatch = decideReclassification(existing, classifyJobCategory(row.workType));
      const { error: updateErr } = await supabaseAdmin
        .from(TABLE_NAME)
        .update({ work_type: row.workType, updated_at: now, ...(reclassifyPatch ?? {}) })
        .eq("id", id);
      if (updateErr) throw new Error(updateErr.message);
      if (reclassifyPatch) {
        result.reclassified += 1;
      } else {
        result.skipped += 1;
      }
      return;
    }

    const { error: insertErr } = await supabaseAdmin
      .from(TABLE_NAME)
      .insert(buildInsertPayload(row, id, branchId, now, advisorCandidates));
    if (insertErr) throw new Error(insertErr.message);
    result.created += 1;
  } catch (err) {
    result.errors.push({
      roNo: rawRoNo,
      message: err instanceof Error ? err.message : "Unknown error",
    });
  }
}

export type GdmsBillingApplyResult = {
  updated: number;
  /** ROs GDMS billing returned that have no matching row in bodyshop_jobs yet — run an RO List fetch for them first. */
  notFound: string[];
  errors: { roNo: string; message: string }[];
};

/**
 * Writes labour/parts billing totals onto existing bodyshop_jobs rows,
 * matched by RO number (with the branch's RO prefix applied). Unlike
 * `upsertBodyshopJobsFromGdms`, this never creates a new row — a billed RO
 * with no existing record means the RO List fetch hasn't picked it up yet,
 * so it's reported in `notFound` rather than inserted half-populated.
 *
 * Billing fields are always overwritten (GDMS is the sole source of truth
 * here and staff never edit them by hand), unlike the rest of a job's
 * fields, which upsertBodyshopJobsFromGdms deliberately never touches once set.
 */
export async function applyBillingToBodyshopJobs(
  totals: BillingTotals[],
  branchName: string | null
): Promise<GdmsBillingApplyResult> {
  const result: GdmsBillingApplyResult = { updated: 0, notFound: [], errors: [] };
  const now = new Date().toISOString();

  const CHUNK_SIZE = 10;
  for (let i = 0; i < totals.length; i += CHUNK_SIZE) {
    const chunk = totals.slice(i, i + CHUNK_SIZE);
    await Promise.all(
      chunk.map(async (billing) => {
        const rawRoNo = billing.roNo?.trim();
        if (!rawRoNo) return;
        const id = applyRoPrefix(branchName, rawRoNo);

        try {
          const { data: existing, error: existingErr } = await supabaseAdmin
            .from(TABLE_NAME)
            .select("id")
            .eq("id", id)
            .maybeSingle();
          if (existingErr) throw new Error(existingErr.message);

          if (!existing) {
            result.notFound.push(rawRoNo);
            return;
          }

          const { error: updateErr } = await supabaseAdmin
            .from(TABLE_NAME)
            .update({
              billed_labor_amount: billing.laborAmount,
              labor_discount_amount: billing.laborDiscountAmount,
              billed_parts_amount: billing.partsAmount,
              billing_no: billing.billingNo,
              billing_fetched_at: now,
              updated_at: now,
            })
            .eq("id", id);
          if (updateErr) throw new Error(updateErr.message);
          result.updated += 1;
        } catch (err) {
          result.errors.push({
            roNo: rawRoNo,
            message: err instanceof Error ? err.message : "Unknown error",
          });
        }
      })
    );
  }

  return result;
}
