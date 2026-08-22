import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBillingTotals, sumLabourBilling, sumPartsBilling } from "../../src/billing-mapper";

test("sumLabourBilling sums the pre-tax amount and discount across issue-type lines", () => {
  const totals = sumLabourBilling([
    { issTypeCode: "B", labrAmt: 101, dscntAmt: 0 },
    { issTypeCode: "B", labrAmt: 0, dscntAmt: 0 },
    { issTypeCode: "I", labrAmt: 500, dscntAmt: 50 },
  ]);
  assert.deepEqual(totals, { amount: 601, discount: 50 });
});

test("sumLabourBilling treats missing amount/discount fields as zero", () => {
  const totals = sumLabourBilling([{ issTypeCode: "B", labrAmt: null, dscntAmt: null }]);
  assert.deepEqual(totals, { amount: 0, discount: 0 });
});

test("sumPartsBilling sums the pre-tax amount across issue-type lines, ignoring discount entirely", () => {
  const total = sumPartsBilling([
    { issTypeCode: "B", partAmt: 6994.92 },
    { issTypeCode: "B", partAmt: 570.34 },
  ]);
  assert.equal(total, 7565.26);
});

test("buildBillingTotals nets labour amount against discount, leaves parts undiscounted", () => {
  const totals = buildBillingTotals({
    roNo: "R202600500",
    billingNo: "B202600512",
    labourRows: [
      { issTypeCode: "B", labrAmt: 101, dscntAmt: 0 },
      { issTypeCode: "B", labrAmt: 0, dscntAmt: 0 },
    ],
    partRows: [
      { issTypeCode: "B", partAmt: 6994.92 },
      { issTypeCode: "B", partAmt: 570.34 },
    ],
  });
  assert.deepEqual(totals, {
    roNo: "R202600500",
    billingNo: "B202600512",
    laborAmount: 101,
    laborDiscountAmount: 0,
    partsAmount: 7565.26,
  });
});

test("buildBillingTotals subtracts a real discount from the labour total", () => {
  const totals = buildBillingTotals({
    roNo: "R1",
    billingNo: "B1",
    labourRows: [{ issTypeCode: "B", labrAmt: 500, dscntAmt: 50 }],
    partRows: [],
  });
  assert.equal(totals.laborAmount, 450);
  assert.equal(totals.laborDiscountAmount, 50);
  assert.equal(totals.partsAmount, 0);
});
