"use client";

import { useState } from "react";
import { format, subDays } from "date-fns";
import { X, Loader2, RefreshCw } from "lucide-react";
import { apiPost } from "@/lib/api";

type Branch = { id: string; name: string };

type BillingSummary = {
  // ROs GDMS's Repair Billing screen returned for this date range.
  totalBilled: number;
  // How many existing ROs got their labour/parts amounts filled in.
  updated: number;
  // Billed ROs with no matching row yet — usually means the RO List fetch
  // above hasn't picked them up (different branch, or created outside the
  // date range searched).
  notFound: string[];
  // The Repair Billing screen itself failed to load — RO import above still
  // succeeded, just without billing data this time.
  fetchFailed: boolean;
  errors: { roNo: string; message: string }[];
};

type FetchSummary = {
  totalFetched: number;
  created: number;
  // ROs already in the app are left untouched, never overwritten — this
  // just counts how many of the fetched ROs were already tracked.
  skipped: number;
  // Already-tracked ROs whose GDMS work type disagreed with which board
  // they were on (Bodyshop vs Service) — only job_category/status_section
  // were corrected, nothing else on the record was touched.
  reclassified: number;
  errors: { roNo: string; message: string }[];
  billing: BillingSummary;
};

type Step = "setup" | "connecting" | "otp" | "verifying" | "results";

type Props = {
  branches: Branch[];
  onClose: () => void;
  onImported?: (summary: FetchSummary) => void;
};

/**
 * Rendered only while open (parent does `{isOpen && <GdmsFetchModal .../>}`,
 * same convention as the board's other modals) so each open is a fresh mount
 * with no reset-on-prop-change effect needed.
 */
export function GdmsFetchModal({ branches, onClose, onImported }: Props) {
  const [step, setStep] = useState<Step>("setup");
  // Deliberately never pre-selected, even when a defaultBranchId is available —
  // an owner managing multiple branches can otherwise fetch the wrong branch's
  // data without noticing, since the whole session (GDMS login + import) then
  // silently proceeds end-to-end under whatever branch was left selected.
  const [branchId, setBranchId] = useState("");
  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 13), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FetchSummary | null>(null);

  const isBusy = step === "connecting" || step === "verifying";

  const handleClose = () => {
    if (isBusy) return;
    onClose();
  };

  const startConnect = async () => {
    if (!branchId) {
      setError("Please select a branch.");
      return;
    }
    if (!dateFrom || !dateTo || dateFrom > dateTo) {
      setError("Please choose a valid date range.");
      return;
    }
    setError(null);
    setStep("connecting");
    try {
      const res = await apiPost<{ sessionId: string }>("/api/gdms/login/start", { branchId });
      setSessionId(res.sessionId);
      setOtp("");
      setStep("otp");
    } catch (err) {
      setError((err as Error)?.message ?? "Failed to connect to GDMS.");
      setStep("setup");
    }
  };

  const verifyAndFetch = async () => {
    if (!sessionId) return;
    if (!/^\d{6}$/.test(otp)) {
      setError("Enter the 6-digit OTP.");
      return;
    }
    setError(null);
    setStep("verifying");
    try {
      await apiPost("/api/gdms/login/verify", { sessionId, otp });
      const summary = await apiPost<FetchSummary>("/api/gdms/fetch", {
        sessionId,
        branchId,
        dateFrom,
        dateTo,
      });
      setResult(summary);
      setStep("results");
      onImported?.(summary);
    } catch (err) {
      setError((err as Error)?.message ?? "Failed to verify OTP / fetch ROs.");
      setStep("otp");
    }
  };

  const startOver = () => {
    setSessionId(null);
    setOtp("");
    setError(null);
    setStep("setup");
  };

  const selectedBranchName = branches.find((b) => b.id === branchId)?.name ?? "";

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      onClick={handleClose}
    >
      <div
        className="bg-white w-full max-w-lg rounded-t-2xl sm:rounded-2xl border border-slate-200 shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 sm:p-6 space-y-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-lg font-bold text-slate-900">Fetch from GDMS</div>
              <div className="text-sm text-slate-500">
                {step === "setup" && "Choose a branch and date range to pull ROs from GDMS."}
                {step === "connecting" && "Connecting to GDMS and requesting an OTP..."}
                {step === "otp" && "Enter the OTP sent to the registered mobile below."}
                {step === "verifying" && "Verifying OTP and fetching ROs..."}
                {step === "results" && "Import complete."}
              </div>
            </div>
            <button
              type="button"
              disabled={isBusy}
              onClick={handleClose}
              aria-label="Close"
              className="p-2.5 -mr-1 text-slate-400 hover:text-slate-600 rounded-lg disabled:opacity-50"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {step !== "setup" && selectedBranchName && (
            <div className="text-sm font-bold text-sky-800 bg-sky-50 border border-sky-200 rounded-xl px-3 py-2">
              Branch: {selectedBranchName}
            </div>
          )}

          {error && (
            <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">
              {error}
            </div>
          )}

          {step === "setup" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="block text-xs font-bold text-black uppercase tracking-widest">
                  Branch <span className="text-rose-500">*</span>
                </label>
                <select
                  value={branchId}
                  onChange={(e) => setBranchId(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white appearance-none"
                >
                  <option value="">Select branch</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-black uppercase tracking-widest">
                    From
                  </label>
                  <input
                    type="date"
                    value={dateFrom}
                    max={dateTo}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-black uppercase tracking-widest">
                    To
                  </label>
                  <input
                    type="date"
                    value={dateTo}
                    min={dateFrom}
                    max={format(new Date(), "yyyy-MM-dd")}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white"
                  />
                </div>
              </div>

            </div>
          )}

          {(step === "connecting" || step === "verifying") && (
            <div className="flex items-center justify-center gap-2 py-8 text-slate-500 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              {step === "connecting" ? "Connecting..." : "Fetching ROs..."}
            </div>
          )}

          {step === "otp" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="block text-xs font-bold text-black uppercase tracking-widest">
                  6-digit OTP
                </label>
                <input
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  inputMode="numeric"
                  maxLength={6}
                  autoFocus
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm tracking-[0.3em] text-center focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white"
                  placeholder="••••••"
                />
              </div>
              <button
                type="button"
                onClick={startOver}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Didn&apos;t get it? Start over
              </button>
            </div>
          )}

          {step === "results" && result && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
                  <div className="text-2xl font-bold text-slate-900">{result.created}</div>
                  <div className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">
                    Created
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
                  <div className="text-2xl font-bold text-slate-900">{result.skipped}</div>
                  <div className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">
                    Already in app
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
                  <div className="text-2xl font-bold text-slate-900">{result.reclassified}</div>
                  <div className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">
                    Reclassified
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
                  <div className="text-2xl font-bold text-slate-900">{result.errors.length}</div>
                  <div className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">
                    Errors
                  </div>
                </div>
              </div>
              {result.errors.length > 0 && (
                <details className="rounded-xl border border-rose-200 bg-rose-50 p-3">
                  <summary className="text-sm font-semibold text-rose-700 cursor-pointer">
                    {result.errors.length} RO{result.errors.length !== 1 ? "s" : ""} failed to import
                  </summary>
                  <ul className="mt-2 space-y-1 text-xs text-rose-700">
                    {result.errors.map((e, i) => (
                      <li key={`${e.roNo}-${i}`}>
                        <span className="font-bold">{e.roNo}</span>: {e.message}
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              <div className="border-t border-slate-200 pt-4 space-y-3">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                  Billing (Labour + Parts)
                </div>
                {result.billing.fetchFailed ? (
                  <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3">
                    Couldn&apos;t reach GDMS&apos;s Repair Billing screen this time — RO import above still
                    completed. Try fetching again to pick up billing amounts.
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
                        <div className="text-2xl font-bold text-slate-900">{result.billing.totalBilled}</div>
                        <div className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">
                          Billed ROs found
                        </div>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
                        <div className="text-2xl font-bold text-slate-900">{result.billing.updated}</div>
                        <div className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">
                          Labour/Parts updated
                        </div>
                      </div>
                    </div>
                    {result.billing.notFound.length > 0 && (
                      <details className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                        <summary className="text-sm font-semibold text-amber-700 cursor-pointer">
                          {result.billing.notFound.length} billed RO
                          {result.billing.notFound.length !== 1 ? "s" : ""} not found in app
                        </summary>
                        <p className="mt-1 text-xs text-amber-700">
                          Run a Fetch from GDMS covering these ROs&apos; original dates first, then fetch billing
                          again.
                        </p>
                        <ul className="mt-2 space-y-1 text-xs text-amber-700">
                          {result.billing.notFound.map((roNo) => (
                            <li key={roNo} className="font-bold">
                              {roNo}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                    {result.billing.errors.length > 0 && (
                      <details className="rounded-xl border border-rose-200 bg-rose-50 p-3">
                        <summary className="text-sm font-semibold text-rose-700 cursor-pointer">
                          {result.billing.errors.length} billing lookup
                          {result.billing.errors.length !== 1 ? "s" : ""} failed
                        </summary>
                        <ul className="mt-2 space-y-1 text-xs text-rose-700">
                          {result.billing.errors.map((e, i) => (
                            <li key={`${e.roNo}-${i}`}>
                              <span className="font-bold">{e.roNo}</span>: {e.message}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="px-4 sm:px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3">
          {step === "setup" && (
            <>
              <button
                type="button"
                onClick={handleClose}
                className="px-5 py-2.5 bg-white border border-slate-200 text-slate-900 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void startConnect()}
                disabled={!branchId}
                className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold shadow-lg transition-all bg-sky-500 text-white shadow-sky-500/20 hover:bg-sky-400 disabled:opacity-50"
              >
                Connect
              </button>
            </>
          )}

          {step === "otp" && (
            <>
              <button
                type="button"
                onClick={handleClose}
                className="px-5 py-2.5 bg-white border border-slate-200 text-slate-900 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void verifyAndFetch()}
                disabled={otp.length !== 6}
                className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold shadow-lg transition-all bg-sky-500 text-white shadow-sky-500/20 hover:bg-sky-400 disabled:opacity-50"
              >
                Verify &amp; Fetch
              </button>
            </>
          )}

          {step === "results" && (
            <button
              type="button"
              onClick={handleClose}
              className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold shadow-lg transition-all bg-sky-500 text-white shadow-sky-500/20 hover:bg-sky-400"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
