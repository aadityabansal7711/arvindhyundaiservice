export type StatusSection =
  | "Survey Pending"
  | "Document Pending"
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
  status_section: StatusSection;
  billing_status: string | null;
  parts_status: string | null;
  created_at: string;
  updated_at: string;
}

export interface BodyshopJobWithMeta extends BodyshopJob {
  overdue: boolean;
  age_days: number;
}

