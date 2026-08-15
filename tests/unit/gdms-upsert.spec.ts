import { test } from "node:test";
import assert from "node:assert/strict";
import { buildInsertPayload, decideReclassification } from "@/lib/gdms/upsert";
import type { GdmsRoRow } from "@/lib/gdms/mapper";

const sampleRow: GdmsRoRow = {
  roNo: "R202606824",
  roDate: "2026-08-14 17:26:52.0",
  rgstnNo: "UP80HZ4457",
  custName: "RAMSONS",
  modelCode: "QU2*B",
  insCom: null,
  insComName: "ICICI Lombard",
  saEmpName: "MEGH SINGH",
  promDate: "2026-08-14 22:15:00.0",
  workType: "AR",
};

test("buildInsertPayload maps GDMS fields and defaults workflow fields for a brand-new RO", () => {
  const now = "2026-08-15T00:00:00.000Z";
  const payload = buildInsertPayload(sampleRow, "BP-R202606824", "branch-1", now);

  assert.equal(payload.id, "BP-R202606824");
  assert.equal(payload.ro_no, "BP-R202606824");
  assert.equal(payload.branch_id, "branch-1");
  assert.equal(payload.job_category, "bodyshop"); // workType "AR" = Accidental Repair
  assert.equal(payload.ro_date, "2026-08-14");
  assert.equal(payload.reg_no, "UP80HZ4457");
  assert.equal(payload.customer_name, "RAMSONS");
  assert.equal(payload.model, "Venue"); // normalized from GDMS's "QU2*B" to match the dropdown
  assert.equal(payload.insurance_company, "ICICI"); // normalized from GDMS's "ICICI Lombard" to match the dropdown
  assert.equal(payload.service_advisor, "Megh Singh"); // no candidates passed -> falls back to Title Case
  assert.equal(payload.promised_date, "2026-08-14");
  assert.equal(payload.status_section, "Document Pending");

  // Every pure in-app workflow field must start out null on a fresh import.
  for (const field of [
    "surveyor",
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
    "general_remark",
    "replace_panels",
    "dent_panels",
    "mrs",
    "mrs_date",
    "order_no",
    "order_date",
    "eta_date",
    "received_date",
    "billing_status",
    "parts_status",
  ] as const) {
    assert.equal(payload[field], null, `${field} should default to null on insert`);
  }
});

test("buildInsertPayload tolerates missing GDMS fields as null", () => {
  const sparse: GdmsRoRow = {
    roNo: "R1",
    roDate: null,
    rgstnNo: null,
    custName: null,
    modelCode: null,
    insCom: null,
    insComName: null,
    saEmpName: null,
    promDate: null,
    workType: null,
  };
  const now = "2026-08-15T00:00:00.000Z";
  const insertPayload = buildInsertPayload(sparse, "BP-R1", "branch-1", now);

  assert.equal(insertPayload.ro_date, null);
  assert.equal(insertPayload.reg_no, null);
});

test("buildInsertPayload resolves service_advisor against the branch's dropdown candidates", () => {
  const now = "2026-08-15T00:00:00.000Z";
  const advisorRow: GdmsRoRow = { ...sampleRow, roNo: "R202606826", saEmpName: "MEGH SINGH" };
  const payload = buildInsertPayload(advisorRow, "BP-R202606826", "branch-1", now, [
    "Dheeraj",
    "Megh Singh",
  ]);
  assert.equal(payload.service_advisor, "Megh Singh");
});

test("buildInsertPayload classifies a non-AR work type as service, with the service default stage", () => {
  const now = "2026-08-15T00:00:00.000Z";
  const serviceRow: GdmsRoRow = { ...sampleRow, roNo: "R202606825", workType: "PS" };
  const payload = buildInsertPayload(serviceRow, "FT-R202606825", "branch-1", now);

  assert.equal(payload.job_category, "service");
  assert.equal(payload.status_section, "Job Open");
});

test("decideReclassification: category already matches → no-op (null)", () => {
  assert.equal(
    decideReclassification({ job_category: "bodyshop", status_section: "Painting" }, "bodyshop"),
    null
  );
  assert.equal(
    decideReclassification({ job_category: "service", status_section: "In Progress" }, "service"),
    null
  );
});

test("decideReclassification: bodyshop → service resets an in-progress bodyshop stage to Job Open", () => {
  const patch = decideReclassification({ job_category: "bodyshop", status_section: "Painting" }, "service");
  assert.deepEqual(patch, { job_category: "service", status_section: "Job Open" });
});

test("decideReclassification: bodyshop → service keeps Delivered as Delivered", () => {
  const patch = decideReclassification({ job_category: "bodyshop", status_section: "Delivered" }, "service");
  assert.deepEqual(patch, { job_category: "service", status_section: "Delivered" });
});

test("decideReclassification: service → bodyshop (reverse direction) resets to Document Pending", () => {
  const patch = decideReclassification({ job_category: "service", status_section: "In Progress" }, "bodyshop");
  assert.deepEqual(patch, { job_category: "bodyshop", status_section: "Document Pending" });
});

test("decideReclassification: service → bodyshop keeps Delivered as Delivered", () => {
  const patch = decideReclassification({ job_category: "service", status_section: "Delivered" }, "bodyshop");
  assert.deepEqual(patch, { job_category: "bodyshop", status_section: "Delivered" });
});

test("decideReclassification: treats a null/missing existing job_category as bodyshop", () => {
  // Rows created before job_category existed have it defaulted to 'bodyshop' by
  // the DB column default, but this guards the in-memory decision logic too.
  const patch = decideReclassification({ job_category: null, status_section: "Document Pending" }, "service");
  assert.deepEqual(patch, { job_category: "service", status_section: "Job Open" });
});
