import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import supabaseAdmin from "@/lib/supabase-admin";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth-options";
import { addMeta } from "@/lib/bodyshop-repo";
import { BodyshopJob, StatusSection } from "@/lib/bodyshop-types";

const TABLE_NAME = "bodyshop_jobs";
const STAGE_TABLE = "bodyshop_job_stages";
const HIDDEN_TABLE = "bodyshop_job_hidden";

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

function mapROToBodyshopJob(ro: {
  roNo: string;
  branchId: string | null;
  vehicleInDate: Date;
  committedDeliveryDate: Date | null;
  currentStatus: string;
  serviceAdvisorName: string | null;
  panelsNewReplace: number | null;
  panelsDent: number | null;
  vehicle: {
    registrationNo: string;
    model: string;
    customer: { name: string; mobile: string };
  };
  advisor: { name: string } | null;
  insuranceClaim: {
    insuranceCompany: string;
    claimNo: string | null;
    claimIntimationDate: Date | null;
    hapFlag: boolean | null;
  } | null;
  survey: {
    surveyorName: string | null;
    surveyDate: Date | null;
    approvalDate: Date | null;
  } | null;
  billing: { actualLabour: number; billAmount: number } | null;
}): BodyshopJob {
  const status_section = STATUS_MAP[ro.currentStatus] ?? "Document Pending";
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
    claim_intimation_date:
      ro.insuranceClaim?.claimIntimationDate?.toISOString().slice(0, 10) ?? null,
    claim_no: ro.insuranceClaim?.claimNo ?? null,
    hap_status:
      ro.insuranceClaim?.hapFlag === true
        ? "HAP"
        : ro.insuranceClaim?.hapFlag === false
          ? "N HAP"
          : null,
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

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

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

  const { data, error } = await supabaseAdmin
    .from(TABLE_NAME)
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (data) {
    return NextResponse.json(addMeta(data as BodyshopJob));
  }

  const ro = await prisma.repairOrder.findUnique({
    where: { roNo: id },
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
      survey: { select: { surveyorName: true, surveyDate: true, approvalDate: true } },
      billing: { select: { actualLabour: true, billAmount: true } },
    },
  });

  if (!ro) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  return NextResponse.json(addMeta(mapROToBodyshopJob(ro)));
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const body = await request.json();

  const toStatus = body.status_section as StatusSection | undefined;
  const remark = (body.remark as string | undefined) ?? null;
  const changedBy = (body.changed_by as string | undefined) ?? null;

  const { data: existing, error: fetchError } = await supabaseAdmin
    .from(TABLE_NAME)
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json(
      { error: fetchError.message },
      { status: 500 }
    );
  }

  const fromStatus = (existing?.status_section as string | null) ?? null;

  const now = new Date().toISOString();
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

  const patch: Partial<BodyshopJob> = {};
  for (const k of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(body, k)) {
      (patch as any)[k] = body[k];
    }
  }

  // Ensure id + timestamps are present for upsert
  (patch as any).id = id;
  (patch as any).ro_no = (patch as any).ro_no ?? id;
  (patch as any).updated_at = now;
  if (!existing) {
    (patch as any).created_at = now;
  }

  const { error: updateError } = await supabaseAdmin
    .from(TABLE_NAME)
    .upsert(patch as any, { onConflict: "id" });

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message },
      { status: 500 }
    );
  }

  if (toStatus && toStatus !== fromStatus) {
    const { error: stageError } = await supabaseAdmin.from(STAGE_TABLE).insert({
      job_id: id,
      from_status: fromStatus,
      to_status: toStatus,
      remark,
      changed_by: changedBy,
    });

    if (stageError) {
      // Log but don't fail the main request.
      console.warn(
        "Failed to insert bodyshop stage history:",
        stageError.message
      );
    }
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

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

