export type StatusSection =
  | "Survey Pending"
  | "Document Pending"
  | "Claim Intimation Pending"
  | "Approval Pending"
  | "Approval Received"
  | "PNA"
  | "Dismantle"
  | "Mechanical"
  | "Cutting"
  | "Denting"
  | "Painting"
  | "Fitting"
  | "Ready for Pre-Invoice"
  | "Billed but Not Ready"
  | "DO Awaited"
  | "Customer Awaited"
  | "Total Loss / Disputed"
  | "Delivered";

/** Plain (non-insurance) service visits, tracked with a simpler linear workflow. */
export type ServiceStatusSection = "Job Open" | "Delivered";

/** Whether a job is an insurance/accident claim (Bodyshop) or a plain visit (Service). */
export type JobCategory = "bodyshop" | "service";

/** `bodyshop_jobs.status_section` stores either category's stage strings. */
export type AnyStatusSection = StatusSection | ServiceStatusSection;

/**
 * A row in `bodyshop_jobs`. Despite the name, this table (and this type) now
 * represents either category of job — `job_category` says which.
 */
export interface BodyshopJob {
  id: string;
  ro_no: string;
  branch_id: string | null;
  ro_date: string | null;
  reg_no: string | null;
  customer_name: string | null;
  model: string | null;
  insurance_company: string | null;
  surveyor: string | null;
  service_advisor: string | null;
  mobile_no: string | null;
  photos: string[] | null;
  claim_intimation_date: string | null;
  claim_no: string | null;
  hap_status: string | null;
  survey_date: string | null;
  approval_date: string | null;
  advisor_remark: string | null;
  whatsapp_date: string | null;
  tentative_labor: number | null;
  promised_date: string | null;
  general_remark: string | null;
  replace_panels: string | null;
  dent_panels: string | null;
  mrs: string | null;
  mrs_date: string | null;
  order_no: string | null;
  order_date: string | null;
  eta_date: string | null;
  received_date: string | null;
  status_section: AnyStatusSection;
  billing_status: string | null;
  parts_status: string | null;
  job_category: JobCategory;
  /** Raw GDMS work-type code (e.g. "AR", "PS") — null for manually-added records or rows never re-touched since this column was added. Use `getWorkTypeLabel()` to display it. */
  work_type: string | null;
  /** Pre-tax labour total minus discount, from GDMS's Repair Billing screen. Null until a billing fetch has matched this RO. */
  billed_labor_amount: number | null;
  /** Discount subtracted from the raw labour total to get `billed_labor_amount`. */
  labor_discount_amount: number | null;
  /** Pre-tax parts total from GDMS's Repair Billing screen (no discount applies to parts). */
  billed_parts_amount: number | null;
  /** GDMS's own billing number (`bilngNo`) for this RO, e.g. "B202600512". */
  billing_no: string | null;
  billing_fetched_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface BodyshopJobWithMeta extends BodyshopJob {
  age_days: number;
  branch_name?: string | null;
}

