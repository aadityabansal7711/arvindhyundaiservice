import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyJobCategory,
  mapGdmsRowToBodyshopFields,
  normalizeInsuranceCompanyName,
  normalizeModelCode,
  parseGdmsDateToIsoDate,
  resolveServiceAdvisorName,
} from "@/lib/gdms/mapper";
import type { GdmsRoRow } from "@/lib/gdms/mapper";

test("parseGdmsDateToIsoDate parses GDMS's 'YYYY-MM-DD HH:mm:ss.S' format", () => {
  assert.equal(parseGdmsDateToIsoDate("2026-08-14 17:26:52.0"), "2026-08-14");
});

test("parseGdmsDateToIsoDate returns null for missing/blank/unparseable input", () => {
  assert.equal(parseGdmsDateToIsoDate(null), null);
  assert.equal(parseGdmsDateToIsoDate(undefined), null);
  assert.equal(parseGdmsDateToIsoDate(""), null);
  assert.equal(parseGdmsDateToIsoDate("   "), null);
  assert.equal(parseGdmsDateToIsoDate("not-a-date"), null);
});

test("mapGdmsRowToBodyshopFields maps the 7 GDMS-sourced fields and trims blanks to null", () => {
  const row: GdmsRoRow = {
    roNo: "R1",
    roDate: "2026-08-14 17:26:52.0",
    rgstnNo: "  UP80HZ4457  ",
    custName: "RAMSONS",
    modelCode: "ZZ**Z", // deliberately unmapped, unrelated to model-normalization behavior
    insCom: "H",
    insComName: "   ",
    saEmpName: "MEGH SINGH",
    promDate: "2026-08-14 22:15:00.0",
    workType: "PS",
  };
  const mapped = mapGdmsRowToBodyshopFields(row);
  assert.deepEqual(mapped, {
    ro_date: "2026-08-14",
    reg_no: "UP80HZ4457",
    customer_name: "RAMSONS",
    model: "ZZ**Z",
    insurance_company: null, // blank/whitespace insComName trims to null
    service_advisor: "MEGH SINGH",
    promised_date: "2026-08-14",
  });
});

test("normalizeInsuranceCompanyName maps GDMS's full legal names to the dropdown's short labels", () => {
  assert.equal(normalizeInsuranceCompanyName("Go Digit General Insurance Ltd."), "GO DIGIT");
  assert.equal(normalizeInsuranceCompanyName("ICICI Lombard General Insurance Co. Ltd."), "ICICI");
  assert.equal(normalizeInsuranceCompanyName("Bajaj Allianz General Insurance Co. Ltd."), "BAJAJ");
  assert.equal(normalizeInsuranceCompanyName("HDFC ERGO General Insurance Co. Ltd."), "HDFC");
  assert.equal(normalizeInsuranceCompanyName("The New India Assurance Co. Ltd."), "New India");
  assert.equal(normalizeInsuranceCompanyName("Indusind General Insurance Company Limited"), "INDUSIND");
});

test("normalizeInsuranceCompanyName passes through unknown names unchanged (not silently dropped)", () => {
  assert.equal(normalizeInsuranceCompanyName("Some New Insurer Pvt. Ltd."), "Some New Insurer Pvt. Ltd.");
  assert.equal(normalizeInsuranceCompanyName(null), null);
});

test("mapGdmsRowToBodyshopFields normalizes insComName to the dropdown label", () => {
  const row: GdmsRoRow = {
    roNo: "R2",
    roDate: null,
    rgstnNo: null,
    custName: null,
    modelCode: null,
    insCom: "D",
    insComName: "Go Digit General Insurance Ltd.",
    saEmpName: null,
    promDate: null,
    workType: "AR",
  };
  assert.equal(mapGdmsRowToBodyshopFields(row).insurance_company, "GO DIGIT");
});

test("classifyJobCategory: only 'AR' (Accidental Repair) is bodyshop, everything else is service", () => {
  assert.equal(classifyJobCategory("AR"), "bodyshop");
  for (const code of ["RR", "RB", "PS", "FS", "AC", "PD", "UF", "OC"]) {
    assert.equal(classifyJobCategory(code), "service", `${code} should classify as service`);
  }
});

test("classifyJobCategory defaults to service for null/unrecognized codes (never assume insurance)", () => {
  assert.equal(classifyJobCategory(null), "service");
  assert.equal(classifyJobCategory("XX"), "service");
});

test("normalizeModelCode maps GDMS's masked model codes to the app's model dropdown labels", () => {
  assert.equal(normalizeModelCode("QX**C"), "Venue"); // Venue (1.4/1.5) D
  assert.equal(normalizeModelCode("QX**B"), "Venue"); // Venue (1.2) P
  assert.equal(normalizeModelCode("SU**D"), "Creta"); // New Creta (1.5D)
  assert.equal(normalizeModelCode("SU**B"), "Creta"); // New Creta (1.5 P)
  assert.equal(normalizeModelCode("GS**B"), "Creta"); // old-gen CRETA (D)
  assert.equal(normalizeModelCode("AI3*C"), "i10"); // Grand i10 NIOS (1.2 P)
  assert.equal(normalizeModelCode("BI3*B"), "i20"); // New i20 (1.2 P)
  assert.equal(normalizeModelCode("QU2*B"), "Venue");
  assert.equal(normalizeModelCode("QU2*A"), "Venue");
  assert.equal(normalizeModelCode("IB**C"), "i20 active");
  assert.equal(normalizeModelCode("HC**B"), "Verna");
  assert.equal(normalizeModelCode("HC**F"), "Verna");
  assert.equal(normalizeModelCode("BN7*A"), "Verna");
  assert.equal(normalizeModelCode("BA**A"), "i10"); // Grand i10
  assert.equal(normalizeModelCode("AH**C"), "Santro");
});

test("normalizeModelCode passes through unknown codes unchanged (not silently dropped)", () => {
  assert.equal(normalizeModelCode("ZZ**Z"), "ZZ**Z");
  assert.equal(normalizeModelCode(null), null);
});

test("resolveServiceAdvisorName matches GDMS's ALL CAPS full name to a dropdown label exactly or by whole word", () => {
  const candidates = ["Dheeraj", "Surya", "Nitin Kushwah"];
  assert.equal(resolveServiceAdvisorName("SURYA PRATP SINGH", candidates), "Surya");
  assert.equal(resolveServiceAdvisorName("DHEERAJ", candidates), "Dheeraj");
  assert.equal(resolveServiceAdvisorName("NITIN KUSHWAH", candidates), "Nitin Kushwah");
});

test("resolveServiceAdvisorName never merges similarly-spelled but different people", () => {
  // "NIKHIL KUSHWAHA" must NOT match the "Nitin Kushwah" candidate — different
  // first name, different last-name spelling (Kushwaha vs Kushwah).
  assert.equal(resolveServiceAdvisorName("NIKHIL KUSHWAHA", ["Nitin Kushwah"]), "Nikhil Kushwaha");
});

test("resolveServiceAdvisorName falls back to Title Case when no candidate matches", () => {
  assert.equal(resolveServiceAdvisorName("AKASH KUMAR", []), "Akash Kumar");
  assert.equal(resolveServiceAdvisorName("SAHIL ABBAS", ["Nitin Kushwah", "Sandeep Kumar"]), "Sahil Abbas");
  assert.equal(resolveServiceAdvisorName(null, ["Dheeraj"]), null);
});
