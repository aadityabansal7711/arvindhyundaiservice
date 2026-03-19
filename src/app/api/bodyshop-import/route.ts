import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import supabaseAdmin from "@/lib/supabase-admin";
import { StatusSection } from "@/lib/bodyshop-types";

const TABLE_NAME = "bodyshop_jobs";

const normaliseStatus = (raw: string | null | undefined): StatusSection | "All" => {
  if (!raw) return "Document Pending";
  const v = raw.trim().toLowerCase();
  if (v.includes("survey pending")) return "Survey Pending";
  if (v.includes("document")) return "Document Pending";
  if (v.includes("approval pending")) return "Approval Pending";
  if (v.includes("approval hold")) return "Approval Hold";
  if (v.includes("approval received")) return "Approval Received";
  if (v.startsWith("pna")) return "PNA";
  if (v.includes("dismantle")) return "Dismantle";
  if (v.includes("mechanical")) return "Mechanical";
  if (v.includes("cutting")) return "Cutting";
  if (v.includes("denting")) return "Denting";
  if (v.includes("painting")) return "Painting";
  if (v.includes("fitting")) return "Fitting";
  if (v.includes("ready for pre")) return "Ready for Pre-Invoice";
  if (v.includes("billed but")) return "Billed but Not Ready";
  if (v.includes("do awaited")) return "DO Awaited";
  if (v.includes("customer awaited")) return "Customer Awaited";
  if (v.includes("total loss") || v.includes("disputed") || v.includes("investigation"))
    return "Total Loss / Disputed";
  if (v.includes("no claim")) return "No Claim";
  if (v.includes("delivered")) return "Delivered";
  return "Document Pending";
};

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Expected 'file' in multipart/form-data" },
      { status: 400 }
    );
  }

  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: null });

  const upserts = rows
    .map((row) => {
      const roNo = String(row["R/O No"] ?? row["RO No"] ?? "").trim();
      if (!roNo) return null;

      const statusRaw = (row["Status Section"] ??
        row["Bucket"] ??
        row["Status"] ??
        "") as string;

      const status_section = normaliseStatus(statusRaw);

      return {
        id: roNo,
        ro_no: roNo,
        ro_date: row["R/O Date"] ? XLSX.SSF.parse_date_code(row["R/O Date"]) : null,
        reg_no: row["Reg No"] ?? null,
        customer_name: row["Customer Name"] ?? null,
        model: row["Model"] ?? null,
        insurance_company: row["Insurance"] ?? row["Ins.Co."] ?? null,
        surveyor: row["Surveyor"] ?? null,
        service_advisor: row["Service Advisor"] ?? null,
        mobile_no: row["MOBILE NO."] ?? null,
        claim_intimation_date: row["Claim Intimation Date"] ?? null,
        claim_no: row["Claim no."] ?? null,
        hap_status: row["Hap/N Hap"] ?? row["HAP/NHAP"] ?? null,
        survey_date: row["Survey Dt."] ?? null,
        approval_date: row["Approval Date"] ?? null,
        advisor_remark: row["Advisor Remark"] ?? null,
        whatsapp_date: row["WAPP MESSAGE"] ?? null,
        tentative_labor: row["TENTITIVE LAB"] ?? null,
        promised_date: row["PROM.DT"] ?? null,
        general_remark: row["Remark"] ?? null,
        replace_panels: row["Replace Panels"] ?? null,
        dent_panels: row["Dent Panels"] ?? null,
        mrs: row["MRS"] ?? null,
        mrs_date: row["DATE"] ?? null,
        order_no: row["ORDER NO."] ?? null,
        order_date: row["ORDER DATE"] ?? null,
        eta_date: row["ETA DATE"] ?? null,
        received_date: row["RECEIVED DATE"] ?? null,
        status_section,
        billing_status: row["Billing Status"] ?? null,
        parts_status: row["PART NA"] ?? row["Store Remark"] ?? null,
        updated_at: new Date().toISOString(),
      };
    })
    .filter(Boolean);

  if (!upserts.length) {
    return NextResponse.json(
      { error: "No valid rows found in sheet" },
      { status: 400 }
    );
  }

  const { error } = await supabaseAdmin
    .from(TABLE_NAME)
    .upsert(upserts as any[], { onConflict: "id" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ imported: upserts.length });
}

