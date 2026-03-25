import { BodyshopJob, StatusSection } from "./bodyshop-types";

/** No seed data – board shows only Supabase data or after Excel import. */
export const BODYSHOP_JOBS_SEED: BodyshopJob[] = [];

export const STATUS_SECTION_ORDER: StatusSection[] = [
  "Document Pending",
  "Survey Pending",
  "Approval Pending",
  "Approval Received",
  "PNA",
  "Dismantle",
  "Mechanical",
  "Cutting",
  "Denting",
  "Painting",
  "Fitting",
  "Ready for Pre-Invoice",
  "Billed but Not Ready",
  "DO Awaited",
  "Customer Awaited",
  "Total Loss / Disputed",
  "Delivered",
];

