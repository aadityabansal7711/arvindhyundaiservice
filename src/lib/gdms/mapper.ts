/** Pure mapping helpers — no I/O, safe to unit test directly. */

import type { JobCategory } from "@/lib/bodyshop-types";

/** Subset of fields GDMS returns per RO in selectRepairOrderList.json's `data[]`. */
export type GdmsRoRow = {
  roNo: string;
  roDate: string | null;
  rgstnNo: string | null;
  custName: string | null;
  modelCode: string | null;
  insCom: string | null;
  insComName: string | null;
  saEmpName: string | null;
  promDate: string | null;
  /** GDMS's work-type code, e.g. "AR" (Accidental Repair), "RR" (Running Repair), "PS" (Paid Service). */
  workType: string | null;
  [key: string]: unknown;
};

/** The subset of bodyshop_jobs columns GDMS actually has data for. */
export type GdmsMappedFields = {
  ro_date: string | null;
  reg_no: string | null;
  customer_name: string | null;
  model: string | null;
  insurance_company: string | null;
  service_advisor: string | null;
  promised_date: string | null;
};

/**
 * GDMS date strings look like "2026-08-14 17:26:52.0". Returns "YYYY-MM-DD",
 * or null if `raw` is missing/unparseable.
 */
export function parseGdmsDateToIsoDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Fast path: leading "YYYY-MM-DD" avoids relying on Date parsing quirks entirely.
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(trimmed);
  if (match) return match[1];
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function nonEmpty(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/**
 * GDMS returns full legal insurer names (e.g. "Go Digit General Insurance
 * Ltd."); the app's insurance_company dropdown uses short in-house labels
 * (e.g. "GO DIGIT"). Matched case-insensitively by keyword against the raw
 * GDMS name — first match wins. Update this list (and the dropdown, if
 * needed) whenever GDMS returns an insurer that doesn't map cleanly yet.
 */
const INSURANCE_COMPANY_ALIASES: { keyword: string; label: string }[] = [
  { keyword: "go digit", label: "GO DIGIT" },
  { keyword: "digit", label: "GO DIGIT" },
  { keyword: "icici", label: "ICICI" },
  { keyword: "national insurance", label: "NIC" },
  { keyword: "new india", label: "New India" },
  { keyword: "united india", label: "UNITED" },
  { keyword: "oriental", label: "ORIENTAL" },
  { keyword: "cholamandalam", label: "CHOLA" },
  { keyword: "chola", label: "CHOLA" },
  { keyword: "iffco", label: "IFFCO" },
  { keyword: "future generali", label: "FUTURE" },
  { keyword: "sbi general", label: "SBI" },
  { keyword: "tata aig", label: "TATA" },
  { keyword: "reliance general", label: "RELIANCE" },
  { keyword: "kotak mahindra", label: "KOTAK" },
  { keyword: "universal sompo", label: "UNIVERSAL" },
  { keyword: "bajaj allianz", label: "BAJAJ" },
  { keyword: "liberty", label: "LIBERTY" },
  { keyword: "hdfc ergo", label: "HDFC" },
  { keyword: "raheja qbe", label: "RAHEJA" },
  { keyword: "shriram", label: "SHRI RAM" },
  { keyword: "shri ram", label: "SHRI RAM" },
  { keyword: "magma", label: "MAGMA" },
  { keyword: "edelweiss", label: "EDELWISE" },
  { keyword: "zuno", label: "Zuno" },
  { keyword: "indusind", label: "INDUSIND" },
];

/**
 * Maps a raw GDMS insurer name to the app's dropdown label when a known
 * alias matches; otherwise returns the raw name unchanged so no data is
 * silently dropped (an unmapped name is easy to spot on the board).
 */
export function normalizeInsuranceCompanyName(raw: string | null): string | null {
  if (!raw) return raw;
  const lower = raw.toLowerCase();
  for (const { keyword, label } of INSURANCE_COMPANY_ALIASES) {
    if (lower.includes(keyword)) return label;
  }
  return raw;
}

/**
 * GDMS's RO list API only returns an internal `modelCode` with the middle
 * characters masked (e.g. "QX**C" for a Venue diesel) — no human-readable
 * model field exists in that response at all. GDMS's own UI resolves these
 * codes to full descriptive text (e.g. "Venue (1.4/1.5) D") via a lookup we
 * don't have API access to, so codes were cross-referenced by hand against
 * that UI, RO by RO.
 *
 * Matched by the code's leading (unmasked) letters, longest prefix first,
 * against the app's `model` dropdown labels — trim/engine details GDMS
 * encodes in the suffix are intentionally dropped since the dropdown has no
 * such distinction (e.g. both old-gen "GS" and new-gen "SU" Creta collapse
 * to the single "Creta" option).
 */
const MODEL_CODE_PREFIXES: { prefix: string; label: string }[] = [
  { prefix: "AI3", label: "i10" }, // Grand i10 NIOS — app dropdown only has "i10"
  { prefix: "BA", label: "i10" }, // Grand i10
  { prefix: "BI3", label: "i20" },
  { prefix: "IB", label: "i20 active" },
  { prefix: "QX", label: "Venue" },
  { prefix: "QU2", label: "Venue" },
  { prefix: "SU", label: "Creta" },
  { prefix: "GS", label: "Creta" }, // old-gen Creta
  { prefix: "HC", label: "Verna" },
  { prefix: "BN7", label: "Verna" },
  { prefix: "AH", label: "Santro" },
].sort((a, b) => b.prefix.length - a.prefix.length);

/**
 * Maps a raw GDMS model code to the app's dropdown label when a known
 * prefix matches; otherwise returns the raw code unchanged so no data is
 * silently dropped (an unmapped code is easy to spot on the board — update
 * MODEL_CODE_PREFIXES once you've confirmed its model in GDMS's own UI).
 */
export function normalizeModelCode(raw: string | null): string | null {
  if (!raw) return raw;
  const upper = raw.toUpperCase();
  for (const { prefix, label } of MODEL_CODE_PREFIXES) {
    if (upper.startsWith(prefix)) return label;
  }
  return raw;
}

/**
 * GDMS's work-type code table (embedded in the GDMS site's own JS): "AR"
 * (Accidental Repair) is the only insurance/accident job — everything else
 * (RR, RB, PS, FS, AC, PD, UF, OC, ...) is a plain service visit. Default-safe
 * toward "service" for null/unrecognized codes — never call something an
 * insurance job unless GDMS explicitly says so.
 */
export function classifyJobCategory(workType: string | null): JobCategory {
  return workType === "AR" ? "bodyshop" : "service";
}

/** Full code table, straight from GDMS's own JS — used to show a human label for the RO type. */
const WORK_TYPE_LABELS: Record<string, string> = {
  AR: "Accidental Repair",
  RR: "Running Repair",
  RB: "Running Repair BodyCare",
  PS: "Paid Service",
  FS: "Free Service",
  PD: "PDI",
  AC: "Accessaries",
  UF: "UC Free Service",
  OC: "Outreach Camp",
};

/**
 * Human-readable label for a GDMS work-type code (e.g. "AR" → "Accidental
 * Repair"). Unrecognized codes pass through unchanged (not silently
 * dropped) so a gap in WORK_TYPE_LABELS is easy to spot on the board.
 */
export function getWorkTypeLabel(workType: string | null): string | null {
  if (!workType) return null;
  return WORK_TYPE_LABELS[workType] ?? workType;
}

function titleCase(raw: string): string {
  return raw
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * GDMS returns the service advisor's full name in ALL CAPS (e.g. "AKASH
 * KUMAR"); the app's service_advisor dropdown is configured per branch and
 * is sometimes just a first name (e.g. "Dheeraj"), sometimes a full name
 * (e.g. "Nitin Kushwah"). Matched whole-word (not substring) so similarly
 * spelled but different people — e.g. GDMS's "NIKHIL KUSHWAHA" vs the
 * dropdown's "Nitin Kushwah" — are never merged into the wrong advisor.
 *
 * Falls back to Title Case of the raw name (not raw ALL CAPS) when no
 * dropdown entry matches yet, so casing stays consistent even for advisors
 * not yet added to that branch's list in Admin.
 */
export function resolveServiceAdvisorName(raw: string | null, candidateLabels: string[]): string | null {
  if (!raw) return raw;
  const upper = raw.toUpperCase();
  for (const label of candidateLabels) {
    if (label.toUpperCase() === upper) return label;
  }
  for (const label of candidateLabels) {
    const escaped = label.toUpperCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const wholeWord = new RegExp(`(^|\\s)${escaped}(\\s|$)`);
    if (wholeWord.test(upper)) return label;
  }
  return titleCase(raw);
}

export function mapGdmsRowToBodyshopFields(row: GdmsRoRow): GdmsMappedFields {
  return {
    ro_date: parseGdmsDateToIsoDate(row.roDate),
    reg_no: nonEmpty(row.rgstnNo),
    customer_name: nonEmpty(row.custName),
    model: normalizeModelCode(nonEmpty(row.modelCode)),
    insurance_company: normalizeInsuranceCompanyName(nonEmpty(row.insComName)),
    service_advisor: nonEmpty(row.saEmpName),
    promised_date: parseGdmsDateToIsoDate(row.promDate),
  };
}
