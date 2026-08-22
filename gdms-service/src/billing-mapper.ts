/** Pure mapping/summing helpers for GDMS's Repair Billing screen — no I/O, safe to unit test directly. */

/** One row from `selectRepairBillingLabr.json`'s `data[]`. */
export type GdmsBillingLabourRow = {
  issTypeCode: string | null;
  labrAmt: number | null;
  dscntAmt: number | null;
  [key: string]: unknown;
};

/** One row from `selectRepairBillingPart.json`'s `data[]`. */
export type GdmsBillingPartRow = {
  issTypeCode: string | null;
  partAmt: number | null;
  [key: string]: unknown;
};

export type BillingTotals = {
  roNo: string;
  billingNo: string | null;
  /** Pre-tax labour amount summed across all issue-type lines, minus the summed discount. */
  laborAmount: number;
  laborDiscountAmount: number;
  /** Pre-tax parts amount summed across all issue-type lines (no discount applies). */
  partsAmount: number;
};

/** Sums the pre-tax "Amount" column and the "Discount Amount" column across a Labour tab's rows. */
export function sumLabourBilling(rows: GdmsBillingLabourRow[]): { amount: number; discount: number } {
  let amount = 0;
  let discount = 0;
  for (const row of rows) {
    amount += row.labrAmt ?? 0;
    discount += row.dscntAmt ?? 0;
  }
  return { amount, discount };
}

/** Sums the pre-tax "Amount" column across a Parts tab's rows — no discount column applies to parts. */
export function sumPartsBilling(rows: GdmsBillingPartRow[]): number {
  let amount = 0;
  for (const row of rows) {
    amount += row.partAmt ?? 0;
  }
  return amount;
}

export function buildBillingTotals(params: {
  roNo: string;
  billingNo: string | null;
  labourRows: GdmsBillingLabourRow[];
  partRows: GdmsBillingPartRow[];
}): BillingTotals {
  const { amount: laborRaw, discount: laborDiscountAmount } = sumLabourBilling(params.labourRows);
  const partsAmount = sumPartsBilling(params.partRows);
  return {
    roNo: params.roNo,
    billingNo: params.billingNo,
    laborAmount: laborRaw - laborDiscountAmount,
    laborDiscountAmount,
    partsAmount,
  };
}
