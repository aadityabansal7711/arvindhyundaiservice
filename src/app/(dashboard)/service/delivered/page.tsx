"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { format } from "date-fns";
import { Search, X } from "lucide-react";

import { apiDelete, apiGet } from "@/lib/api";
import type { BodyshopJobWithMeta } from "@/lib/bodyshop-types";
import { getWorkTypeLabel } from "@/lib/gdms/mapper";

type Branch = { id: string; name: string };

type StageHistoryRow = {
  id: string;
  from_status: string | null;
  to_status: string;
  changed_at: string;
  remark: string | null;
};

function ServiceDeliveredPageInner() {
  const { data: session, status } = useSession();
  const userPermissions = ((session?.user as any)?.permissions ?? []) as string[];
  const isAdmin = userPermissions.includes("users.manage");
  const allowedRoDeleteEmail = "mayank.arvind.bansal@gmail.com";
  const canDeleteRo =
    ((session?.user as any)?.email as string | undefined)?.trim().toLowerCase() === allowedRoDeleteEmail;

  const [jobs, setJobs] = useState<BodyshopJobWithMeta[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didFetchOnceRef = useRef(false);
  const [stageViewOpen, setStageViewOpen] = useState(false);
  const [stageViewLoading, setStageViewLoading] = useState(false);
  const [stageViewError, setStageViewError] = useState<string | null>(null);
  const [stageViewRows, setStageViewRows] = useState<StageHistoryRow[]>([]);

  const fetchJobs = useCallback(async (term: string, signal?: AbortSignal) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        openOnly: "0",
        statusSection: "Delivered",
        view: "board",
        limit: "500",
        category: "service",
      });
      if (term.trim()) params.set("search", term.trim());
      const data = await apiGet<BodyshopJobWithMeta[]>(
        `/api/bodyshop-jobs?${params.toString()}`,
        { cacheMs: term.trim() ? 3_000 : 15_000, signal }
      );
      setJobs(data);
    } catch (err) {
      if ((err as DOMException)?.name === "AbortError") return;
      console.error(err);
      setJobs([]);
    } finally {
      if (!signal?.aborted) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "loading") return;
    if (!session) return;
    if (!isAdmin) return;

    const controller = new AbortController();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const delay = didFetchOnceRef.current ? 180 : 0;
    didFetchOnceRef.current = true;
    debounceRef.current = setTimeout(() => {
      void fetchJobs(search, controller.signal);
    }, delay);
    return () => {
      controller.abort();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [session, status, isAdmin, search, fetchJobs]);

  useEffect(() => {
    if (status === "loading") return;
    if (!session) return;
    if (!isAdmin) return;

    apiGet<Branch[]>("/api/data/branches", { cacheMs: 300_000 })
      .then(setBranches)
      .catch(() => setBranches([]));
  }, [session, status, isAdmin]);

  const derived = useMemo(() => ({ total: jobs.length }), [jobs]);

  const branchNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const b of branches) map.set(String(b.id), b.name);
    return map;
  }, [branches]);

  const onDelete = async (id: string) => {
    if (!window.confirm("Delete this delivered RO? This cannot be undone.")) return;
    const prev = jobs;
    setJobs((p) => p.filter((j) => j.id !== id));
    setStageViewOpen(false);
    setStageViewError(null);
    setStageViewRows([]);

    try {
      await apiDelete(`/api/bodyshop-jobs/${encodeURIComponent(id)}`);
      await fetchJobs(search);
    } catch (e) {
      console.error(e);
      setJobs(prev);
    }
  };

  const openStageView = async (jobId: string) => {
    setStageViewOpen(true);
    setStageViewLoading(true);
    setStageViewError(null);
    setStageViewRows([]);
    try {
      const rows = await apiGet<StageHistoryRow[]>(`/api/bodyshop-stages?jobId=${encodeURIComponent(jobId)}`);
      setStageViewRows(rows ?? []);
    } catch (e) {
      console.error(e);
      setStageViewError((e as Error)?.message ?? "Failed to load movement details");
    } finally {
      setStageViewLoading(false);
    }
  };

  const closeStageView = () => {
    setStageViewOpen(false);
    setStageViewLoading(false);
    setStageViewError(null);
    setStageViewRows([]);
  };

  if (status === "loading") {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center text-slate-500">
        Loading...
      </div>
    );
  }

  if (!session) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center text-slate-500">
        Please login.
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center text-slate-500">
        You do not have access to this page.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Service Delivered</h1>
          <p className="text-slate-500 mt-1">All delivered service vehicles are listed here (admin only).</p>
        </div>
      </div>

      <section className="space-y-3">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-3 md:items-center">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, reg, R/O..."
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white transition-all"
            />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <div className="text-slate-900 font-bold">Delivered vehicles</div>
            <div className="text-sm text-slate-500">{derived.total} records</div>
          </div>

          {isLoading ? (
            <div className="p-8 text-center text-slate-500 text-sm">Loading...</div>
          ) : jobs.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-sm">No delivered records found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-widest">R/O No</th>
                    <th className="px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-widest">Date</th>
                    <th className="px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-widest">Branch</th>
                    <th className="px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-widest">Reg No</th>
                    <th className="px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-widest">Customer</th>
                    <th className="px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-widest">Model</th>
                    <th className="px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-widest">Type</th>
                    <th className="px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-widest">Labour Amt</th>
                    <th className="px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-widest">Parts Amt</th>
                    <th className="px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-widest">Advisor</th>
                    <th className="px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-widest">Status</th>
                    <th className="px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-widest">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {jobs.map((job) => (
                    <tr key={job.id} className="hover:bg-slate-50/50">
                      <td className="px-5 py-3 text-sm font-semibold text-slate-900">{job.ro_no}</td>
                      <td className="px-5 py-3 text-sm text-slate-700">
                        {job.ro_date ? format(new Date(job.ro_date), "dd.MM.yyyy") : "—"}
                      </td>
                      <td className="px-5 py-3 text-sm text-slate-700">
                        {(job as any).branch_name ?? (job.branch_id ? branchNameById.get(String(job.branch_id)) ?? "—" : "—")}
                      </td>
                      <td className="px-5 py-3 text-sm text-slate-700">{job.reg_no ?? "—"}</td>
                      <td className="px-5 py-3 text-sm text-slate-900 font-medium">{job.customer_name ?? "—"}</td>
                      <td className="px-5 py-3 text-sm text-slate-700">{job.model ?? "—"}</td>
                      <td className="px-5 py-3 text-sm text-slate-700">{getWorkTypeLabel(job.work_type) ?? "—"}</td>
                      <td className="px-5 py-3 text-sm text-slate-700">
                        {job.billed_labor_amount != null
                          ? `₹${job.billed_labor_amount.toLocaleString("en-IN")}`
                          : "—"}
                      </td>
                      <td className="px-5 py-3 text-sm text-slate-700">
                        {job.billed_parts_amount != null
                          ? `₹${job.billed_parts_amount.toLocaleString("en-IN")}`
                          : "—"}
                      </td>
                      <td className="px-5 py-3 text-sm text-slate-700">{job.service_advisor ?? "—"}</td>
                      <td className="px-5 py-3 text-sm">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-semibold">
                            {job.status_section}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void openStageView(job.id);
                            }}
                            className="px-2 py-1 rounded-lg text-xs font-semibold bg-indigo-50 border border-indigo-100 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-100 transition-colors"
                          >
                            View
                          </button>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-sm">
                        {canDeleteRo && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void onDelete(job.id);
                            }}
                            className="text-rose-600 hover:text-rose-700 font-semibold text-xs"
                          >
                            Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* Movement details modal */}
      {stageViewOpen && (
        <div
          className="fixed inset-0 z-[55] bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          onClick={closeStageView}
        >
          <div
            className="bg-white w-full max-w-xl rounded-t-2xl sm:rounded-2xl border border-slate-200 shadow-xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 sm:p-6 space-y-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-bold text-slate-900">Movement Details</div>
                  <div className="text-sm text-slate-500">Full movement history for this job</div>
                </div>
                <button
                  type="button"
                  onClick={closeStageView}
                  aria-label="Close"
                  className="p-2.5 -mr-1 text-slate-400 hover:text-slate-600 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {stageViewLoading && <div className="text-sm text-slate-500">Loading...</div>}
              {stageViewError && (
                <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">{stageViewError}</div>
              )}

              {!stageViewLoading && !stageViewError && (
                <>
                  {stageViewRows.length === 0 ? (
                    <div className="text-sm text-slate-500">No movement history recorded yet.</div>
                  ) : (
                    <div className="space-y-3">
                      {stageViewRows.map((row) => (
                        <div key={row.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-3">
                          <div>
                            <div className="text-xs font-bold text-slate-700 uppercase tracking-widest">Movement</div>
                            <div className="text-sm text-slate-900 font-semibold mt-1">
                              {row.from_status ?? "New"} → {row.to_status}
                            </div>
                            <div className="text-[11px] text-slate-500 mt-1">
                              {row.changed_at ? format(new Date(row.changed_at), "dd MMM yyyy, HH:mm") : "—"}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs font-bold text-slate-700 uppercase tracking-widest">Remark</div>
                            <div className="text-sm text-slate-700 whitespace-pre-wrap mt-1">{row.remark ?? "—"}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeStageView}
                  className="px-5 py-2.5 bg-white border border-slate-200 text-slate-900 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ServiceDeliveredPage() {
  return (
    <Suspense
      fallback={
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center text-slate-500">
          Loading delivered vehicles...
        </div>
      }
    >
      <ServiceDeliveredPageInner />
    </Suspense>
  );
}
