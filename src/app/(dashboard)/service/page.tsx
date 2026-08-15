"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { format } from "date-fns";
import { Plus, Search, X, Info } from "lucide-react";

import { apiGet, apiPost, apiDelete, apiPatch } from "@/lib/api";
import type { BodyshopJobWithMeta, ServiceStatusSection } from "@/lib/bodyshop-types";
import { SERVICE_STATUS_SECTION_ORDER } from "@/lib/service-seed";
import { isOwnerUser } from "@/lib/owner-access";
import { getRoPrefixForBranchName, RO_PREFIX_SEPARATOR } from "@/lib/ro-prefix";
import { getWorkTypeLabel } from "@/lib/gdms/mapper";

type DropdownOption = { id: string; label: string; value: string; branchId?: string | null };
type Branch = { id: string; name: string };

const statusPillClass = (status: ServiceStatusSection) => {
  if (status === "Delivered") return "bg-emerald-50 text-emerald-800 ring-emerald-200";
  return "bg-slate-100 text-slate-700 ring-slate-200";
};

function getMoveTarget(current: ServiceStatusSection): ServiceStatusSection | null {
  const idx = SERVICE_STATUS_SECTION_ORDER.indexOf(current);
  if (idx < 0 || idx >= SERVICE_STATUS_SECTION_ORDER.length - 1) return null;
  return SERVICE_STATUS_SECTION_ORDER[idx + 1];
}

function ServiceDashboardPageInner() {
  const emitCountsRefresh = () => {
    window.dispatchEvent(new Event("service:counts-refresh"));
  };
  const [jobs, setJobs] = useState<BodyshopJobWithMeta[]>([]);
  const [search, setSearch] = useState("");
  const [activeStage, setActiveStage] = useState<ServiceStatusSection | "All">("All");
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [moveJob, setMoveJob] = useState<BodyshopJobWithMeta | null>(null);
  const [moveForm, setMoveForm] = useState<{ movement_at: string; inputer_remark: string }>({
    movement_at: "",
    inputer_remark: "",
  });
  const [moveSaving, setMoveSaving] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);
  const { data: session } = useSession();
  const canEditRo = isOwnerUser(session?.user);
  const canDeleteRo = canEditRo;
  const [branches, setBranches] = useState<Branch[]>([]);
  const [modelOptions, setModelOptions] = useState<DropdownOption[]>([]);
  const [allServiceAdvisors, setAllServiceAdvisors] = useState<DropdownOption[]>([]);

  const sessionUser = session?.user as { permissions?: string[]; branchId?: string } | undefined;
  const userPermissions = sessionUser?.permissions ?? [];
  const userBranchId = sessionUser?.branchId;
  const canViewAllBranches =
    userPermissions.includes("branches.view_all") || userPermissions.includes("users.manage");
  const canViewMultiBranches = userPermissions.includes("branches.view_multi");
  const branchLocked = !canViewAllBranches && !canViewMultiBranches;

  const [addForm, setAddForm] = useState({
    branch_id: "",
    ro_no: "",
    ro_date: format(new Date(), "yyyy-MM-dd"),
    reg_no: "",
    customer_name: "",
    mobile_no: "",
    model: "",
    service_advisor: "",
  });
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didFetchOnceRef = useRef(false);
  const addSubmittingRef = useRef(false);
  const moveSubmittingRef = useRef(false);

  const pad2 = (n: number) => String(n).padStart(2, "0");
  const toLocalDatetimeInputValue = (d: Date) => {
    const yyyy = d.getFullYear();
    const mm = pad2(d.getMonth() + 1);
    const dd = pad2(d.getDate());
    const HH = pad2(d.getHours());
    const MM = pad2(d.getMinutes());
    return `${yyyy}-${mm}-${dd}T${HH}:${MM}`;
  };

  useEffect(() => {
    apiGet<Branch[]>("/api/data/branches", { cacheMs: 300_000 })
      .then(setBranches)
      .catch(() => setBranches([]));
  }, []);

  useEffect(() => {
    if (!isAdding) return;
    if (modelOptions.length === 0) {
      apiGet<DropdownOption[]>("/api/data/options?group=model", { cacheMs: 300_000 })
        .then(setModelOptions)
        .catch(() => setModelOptions([]));
    }
    void apiGet<DropdownOption[]>("/api/data/options?group=service_advisor", { cacheMs: 300_000 })
      .then(setAllServiceAdvisors)
      .catch(() => setAllServiceAdvisors([]));
  }, [isAdding, modelOptions.length]);

  useEffect(() => {
    if (branchLocked && userBranchId) {
      setAddForm((p) => ({ ...p, branch_id: userBranchId }));
    }
  }, [branchLocked, userBranchId]);

  const serviceAdvisorOptions = useMemo(() => {
    const effectiveBranchId = addForm.branch_id || userBranchId;
    if (!effectiveBranchId) return [] as DropdownOption[];
    return allServiceAdvisors.filter((a) => a.branchId === effectiveBranchId);
  }, [allServiceAdvisors, addForm.branch_id, userBranchId]);

  useEffect(() => {
    setAddForm((prev) => {
      if (!prev.service_advisor) return prev;
      const stillValid = serviceAdvisorOptions.some((o) => o.value === prev.service_advisor);
      return stillValid ? prev : { ...prev, service_advisor: "" };
    });
  }, [serviceAdvisorOptions]);

  useEffect(() => {
    const stageParam = searchParams.get("stage");
    if (stageParam && SERVICE_STATUS_SECTION_ORDER.includes(stageParam as ServiceStatusSection)) {
      setActiveStage(stageParam as ServiceStatusSection);
    } else {
      setActiveStage("All");
    }
  }, [searchParams]);

  const fetchJobs = useCallback(async (signal?: AbortSignal) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        search,
        limit: "6000",
        openOnly: "1",
        view: "board",
        category: "service",
      });
      const data = await apiGet<BodyshopJobWithMeta[]>(
        `/api/bodyshop-jobs?${params.toString()}`,
        { cacheMs: search.trim() ? 3_000 : 15_000, signal }
      );
      setJobs(data);
    } catch (err) {
      if ((err as DOMException)?.name === "AbortError") return;
      console.error(err);
    } finally {
      if (!signal?.aborted) setIsLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const controller = new AbortController();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const delay = didFetchOnceRef.current ? 180 : 0;
    didFetchOnceRef.current = true;
    debounceRef.current = setTimeout(() => {
      void fetchJobs(controller.signal);
    }, delay);
    return () => {
      controller.abort();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [fetchJobs]);

  const derived = useMemo(() => {
    const filtered =
      activeStage === "All" ? jobs : jobs.filter((j) => j.status_section === activeStage);
    return { filtered };
  }, [jobs, activeStage]);

  const branchNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const b of branches) map.set(b.id, b.name);
    return map;
  }, [branches]);
  const activeStageLabel = activeStage === "All" ? "All Vehicles" : activeStage;
  const activeStageCount = derived.filtered.length;

  const submitAdd = async () => {
    if (addSubmittingRef.current) return;
    addSubmittingRef.current = true;
    setAddSaving(true);
    setAddError(null);
    try {
      const rawRo = addForm.ro_no.trim();
      if (!rawRo) {
        setAddError("R/O No is required");
        return;
      }
      if (branches.length === 0) {
        setAddError("No branches configured. Please add at least one branch in Data Page.");
        return;
      }
      if (!addForm.branch_id.trim()) {
        setAddError("Please select a branch.");
        return;
      }
      const selectedBranchName = branchNameById.get(addForm.branch_id) ?? null;
      const branchPrefix = getRoPrefixForBranchName(selectedBranchName);
      const ro = branchPrefix ? `${branchPrefix}${RO_PREFIX_SEPARATOR}${rawRo}` : rawRo;
      if (
        !addForm.reg_no.trim() ||
        !addForm.model.trim() ||
        !addForm.customer_name.trim() ||
        !addForm.mobile_no.trim()
      ) {
        setAddError("Please fill all vehicle fields (Registration No, Model, Customer Name, Mobile).");
        return;
      }
      if (!addForm.service_advisor.trim()) {
        setAddError("Please enter Service Advisor.");
        return;
      }

      await apiPost("/api/bodyshop-jobs", {
        id: ro,
        ro_no: ro,
        job_category: "service",
        branch_id: addForm.branch_id.trim(),
        ro_date: addForm.ro_date || null,
        reg_no: addForm.reg_no.trim().toUpperCase(),
        model: addForm.model.trim(),
        customer_name: addForm.customer_name.trim(),
        mobile_no: addForm.mobile_no.trim(),
        service_advisor: addForm.service_advisor.trim(),
        status_section: SERVICE_STATUS_SECTION_ORDER[0],
      });
      emitCountsRefresh();
      setIsAdding(false);
      setAddForm({
        branch_id: branchLocked && userBranchId ? userBranchId : "",
        ro_no: "",
        ro_date: format(new Date(), "yyyy-MM-dd"),
        reg_no: "",
        customer_name: "",
        mobile_no: "",
        model: "",
        service_advisor: "",
      });
      void fetchJobs();
    } catch (e) {
      setAddError((e as Error)?.message ?? "Failed to add record");
    } finally {
      addSubmittingRef.current = false;
      setAddSaving(false);
    }
  };

  const onDelete = async (id: string) => {
    if (!window.confirm("Delete this RO? This cannot be undone.")) return;
    const prev = jobs;
    setJobs((p) => p.filter((j) => j.id !== id));
    try {
      await apiDelete(`/api/bodyshop-jobs/${encodeURIComponent(id)}`);
      emitCountsRefresh();
    } catch (e) {
      console.error(e);
      setJobs(prev);
    }
  };

  const onMoveToNextStatus = (job: BodyshopJobWithMeta) => {
    const target = getMoveTarget(job.status_section as ServiceStatusSection);
    if (!target) return;
    const now = new Date();
    const movement_at = toLocalDatetimeInputValue(now);
    setMoveJob(job);
    setMoveError(null);
    setMoveSaving(false);
    setMoveForm({
      movement_at,
      inputer_remark: `Moved to ${target} on ${format(now, "yyyy-MM-dd HH:mm")}`,
    });
  };

  const submitMove = async () => {
    if (!moveJob) return;
    const target = getMoveTarget(moveJob.status_section as ServiceStatusSection);
    if (!target) return;
    setMoveError(null);

    const movementAtRaw = moveForm.movement_at.trim();
    const movementAtDate = movementAtRaw ? new Date(movementAtRaw) : null;
    if (!movementAtDate || Number.isNaN(movementAtDate.getTime())) {
      setMoveError("Please provide a valid movement date/time.");
      return;
    }
    const inputerRemark = moveForm.inputer_remark.trim();
    if (!inputerRemark) {
      setMoveError("Please enter a remark.");
      return;
    }

    if (moveSubmittingRef.current) return;
    moveSubmittingRef.current = true;
    setMoveSaving(true);
    try {
      await apiPatch(`/api/bodyshop-jobs/${encodeURIComponent(moveJob.id)}`, {
        status_section: target,
        movement_at: movementAtRaw,
        inputer_remark: inputerRemark,
      });
      setJobs((prev) =>
        prev.map((j) => (j.id === moveJob.id ? { ...j, status_section: target } : j))
      );
      emitCountsRefresh();
      void fetchJobs();
      setMoveJob(null);
    } catch (e) {
      console.error(e);
      await fetchJobs();
      setMoveError((e as Error)?.message ?? "Failed to move record");
    } finally {
      moveSubmittingRef.current = false;
      setMoveSaving(false);
    }
  };

  return (
    <>
      <div className="space-y-5">
        <div className="space-y-4">
          <section className="space-y-3">
            <div className="panel-surface p-3 sm:p-4 rounded-2xl space-y-3">
              <div className="flex items-start gap-2 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>
                  New service ROs also arrive automatically via the Bodyshop board&apos;s
                  &quot;Fetch from GDMS&quot; — no separate fetch button needed here.
                </span>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by name, reg, R/O..."
                    className="focus-ring w-full pl-10 pr-4 py-2.5 bg-slate-50/90 border border-slate-200 rounded-xl text-sm focus:bg-white"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsAdding(true);
                    setAddError(null);
                  }}
                  className="inline-flex min-h-10 items-center justify-center gap-2 px-4 py-2 rounded-xl bg-sky-500 text-white text-sm font-bold shadow-sm shadow-sky-500/20 hover:bg-sky-400 active:bg-sky-600 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add Record
                </button>
              </div>
            </div>

            <div className="panel-surface rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200/70">
                <div>
                  <div className="text-slate-950 font-bold">{activeStageLabel}</div>
                  <div className="text-sm text-slate-500">{activeStageCount} records</div>
                </div>
              </div>

              {isLoading ? (
                <div className="p-8 text-center text-slate-500 text-sm">Loading...</div>
              ) : derived.filtered.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-sm">No records found.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50/90 border-b border-slate-200">
                        <th className="px-5 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-[0.14em]">R/O No</th>
                        <th className="px-5 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-[0.14em]">Date</th>
                        <th className="px-5 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-[0.14em]">Branch</th>
                        <th className="px-5 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-[0.14em]">Reg No</th>
                        <th className="px-5 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-[0.14em]">Customer</th>
                        <th className="px-5 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-[0.14em]">Model</th>
                        <th className="px-5 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-[0.14em]">Type</th>
                        <th className="px-5 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-[0.14em]">Advisor</th>
                        <th className="px-5 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-[0.14em]">Status</th>
                        <th className="px-5 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-[0.14em]">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {derived.filtered.map((job) => (
                        <tr key={job.id} className="group hover:bg-sky-50/35 transition-colors">
                          <td className="px-5 py-4 text-sm font-bold text-slate-950">{job.ro_no}</td>
                          <td className="px-5 py-3 text-sm text-slate-700">
                            {job.ro_date ? format(new Date(job.ro_date), "dd.MM.yyyy") : "—"}
                          </td>
                          <td className="px-5 py-3 text-sm text-slate-700">
                            {job.branch_name ?? (job.branch_id ? (branchNameById.get(job.branch_id) ?? "—") : "—")}
                          </td>
                          <td className="px-5 py-3 text-sm text-slate-700">{job.reg_no ?? "—"}</td>
                          <td className="px-5 py-3 text-sm text-slate-900 font-medium">{job.customer_name ?? "—"}</td>
                          <td className="px-5 py-3 text-sm text-slate-700">{job.model ?? "—"}</td>
                          <td className="px-5 py-3 text-sm text-slate-700">{getWorkTypeLabel(job.work_type) ?? "—"}</td>
                          <td className="px-5 py-3 text-sm text-slate-700">{job.service_advisor ?? "—"}</td>
                          <td className="px-5 py-3 text-sm">
                            <span
                              className={`inline-flex items-center px-2.5 py-1.5 rounded-lg text-xs font-bold ring-1 ${statusPillClass(job.status_section as ServiceStatusSection)}`}
                            >
                              {job.status_section}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-sm">
                            <div className="flex items-center gap-2">
                              {canDeleteRo && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void onDelete(job.id);
                                  }}
                                  className="rounded-lg px-2.5 py-1.5 text-rose-600 hover:bg-rose-50 font-bold text-xs transition-colors"
                                >
                                  Delete
                                </button>
                              )}
                              {(() => {
                                const target = getMoveTarget(job.status_section as ServiceStatusSection);
                                if (!target) return null;
                                return (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onMoveToNextStatus(job);
                                    }}
                                    className="inline-flex items-center rounded-lg px-2.5 py-1.5 bg-slate-950 text-white hover:bg-slate-800 font-bold text-xs transition-colors"
                                  >
                                    {target}
                                  </button>
                                );
                              })()}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* Move status modal */}
      {moveJob && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => {
            if (moveSaving) return;
            setMoveJob(null);
          }}
        >
          <div
            className="bg-white w-full max-w-xl rounded-t-2xl sm:rounded-2xl border border-slate-200 shadow-xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 sm:p-6 space-y-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-bold text-slate-900">
                    Move to {getMoveTarget(moveJob.status_section as ServiceStatusSection)}
                  </div>
                  <div className="text-sm text-slate-500">Enter movement date/time and a remark.</div>
                </div>
                <button
                  type="button"
                  disabled={moveSaving}
                  onClick={() => setMoveJob(null)}
                  aria-label="Close"
                  className="p-2.5 -mr-1 text-slate-400 hover:text-slate-600 rounded-lg disabled:opacity-50"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {moveError && (
                <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">{moveError}</div>
              )}

              <div className="space-y-2">
                <label className="block text-xs font-bold text-black uppercase tracking-widest mb-2">Movement Date/Time</label>
                <input
                  type="datetime-local"
                  value={moveForm.movement_at}
                  onChange={(e) => setMoveForm((p) => ({ ...p, movement_at: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-bold text-black uppercase tracking-widest mb-2">Remark</label>
                <textarea
                  value={moveForm.inputer_remark}
                  onChange={(e) => setMoveForm((p) => ({ ...p, inputer_remark: e.target.value }))}
                  rows={4}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white"
                  required
                />
              </div>
            </div>

            <div className="px-4 sm:px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={moveSaving}
                onClick={() => setMoveJob(null)}
                className="px-5 py-2.5 bg-white border border-slate-200 text-slate-900 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-colors disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submitMove()}
                disabled={moveSaving}
                className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold shadow-lg transition-all bg-indigo-600 text-white shadow-indigo-600/20 hover:bg-indigo-700 disabled:opacity-60 min-w-[140px]"
              >
                {moveSaving ? "Moving..." : "Move"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add record modal */}
      {isAdding && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => {
            if (addSaving) return;
            setIsAdding(false);
            setAddError(null);
          }}
        >
          <div
            className="bg-white w-full max-w-2xl rounded-t-2xl sm:rounded-2xl border border-slate-200 shadow-xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 sm:p-6 space-y-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-bold text-slate-900">Create Service RO</div>
                  <div className="text-sm text-slate-500">Create a service record with required details.</div>
                </div>
                <button
                  type="button"
                  disabled={addSaving}
                  onClick={() => {
                    setIsAdding(false);
                    setAddError(null);
                  }}
                  aria-label="Close"
                  className="p-2.5 -mr-1 text-slate-400 hover:text-slate-600 rounded-lg disabled:opacity-50"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {addError && (
                <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">{addError}</div>
              )}

              <div className="space-y-2">
                <label className="block text-xs font-bold text-black uppercase tracking-widest mb-2">
                  Branch <span className="text-rose-500">*</span>
                </label>
                {branches.length > 0 ? (
                  <select
                    value={addForm.branch_id}
                    onChange={(e) => setAddForm((p) => ({ ...p, branch_id: e.target.value }))}
                    disabled={branchLocked}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white appearance-none disabled:opacity-60"
                    required
                  >
                    {!branchLocked && <option value="">Select branch</option>}
                    {branches.map((b) => {
                      if (branchLocked && userBranchId && b.id !== userBranchId) return null;
                      return (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      );
                    })}
                  </select>
                ) : (
                  <p className="px-4 py-2.5 text-slate-500 text-sm border border-slate-200 rounded-xl bg-slate-50">
                    No branches configured. Add branches in Data Page.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-6">
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-black uppercase tracking-widest">
                    R/O No <span className="text-rose-500">*</span>
                  </label>
                  {(() => {
                    const selectedBranchName = branchNameById.get(addForm.branch_id) ?? null;
                    const prefix = getRoPrefixForBranchName(selectedBranchName);
                    return (
                      <div className="flex items-stretch w-full bg-slate-50 border border-slate-200 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:bg-white">
                        {prefix && (
                          <span className="px-3 py-2.5 text-sm font-semibold text-slate-700 bg-slate-100 border-r border-slate-200 select-none">
                            {prefix}
                            {RO_PREFIX_SEPARATOR}
                          </span>
                        )}
                        <input
                          type="text"
                          value={addForm.ro_no}
                          onChange={(e) => setAddForm((p) => ({ ...p, ro_no: e.target.value }))}
                          placeholder={prefix ? "123" : "Select branch first"}
                          className="flex-1 px-4 py-2.5 bg-transparent text-sm focus:outline-none"
                          required
                        />
                      </div>
                    );
                  })()}
                </div>
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-black uppercase tracking-widest">
                    R/O Date <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={addForm.ro_date}
                    onChange={(e) => setAddForm((p) => ({ ...p, ro_date: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-6">
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-black uppercase tracking-widest">
                    Registration No <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={addForm.reg_no}
                    onChange={(e) => setAddForm((p) => ({ ...p, reg_no: e.target.value.toUpperCase() }))}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-black uppercase tracking-widest">
                    Model <span className="text-rose-500">*</span>
                  </label>
                  {modelOptions.length > 0 ? (
                    <select
                      value={addForm.model}
                      onChange={(e) => setAddForm((p) => ({ ...p, model: e.target.value }))}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white appearance-none"
                      required
                    >
                      <option value="">Select model</option>
                      {modelOptions.map((opt) => (
                        <option key={opt.id} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={addForm.model}
                      onChange={(e) => setAddForm((p) => ({ ...p, model: e.target.value }))}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white"
                      required
                    />
                  )}
                </div>
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-black uppercase tracking-widest">
                    Customer Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={addForm.customer_name}
                    onChange={(e) => setAddForm((p) => ({ ...p, customer_name: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-black uppercase tracking-widest">
                    Mobile <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={addForm.mobile_no}
                    onChange={(e) => setAddForm((p) => ({ ...p, mobile_no: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-bold text-black uppercase tracking-widest">
                  Service Advisor <span className="text-rose-500">*</span>
                </label>
                <select
                  value={addForm.service_advisor}
                  onChange={(e) => setAddForm((p) => ({ ...p, service_advisor: e.target.value }))}
                  disabled={!(addForm.branch_id || userBranchId)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white appearance-none disabled:opacity-60"
                  required
                >
                  <option value="">Select service advisor</option>
                  {serviceAdvisorOptions.map((opt) => (
                    <option key={opt.id} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                {!(addForm.branch_id || userBranchId) ? (
                  <p className="text-xs text-slate-500">Select a branch first — service advisors are listed per branch.</p>
                ) : serviceAdvisorOptions.length === 0 ? (
                  <p className="text-xs text-amber-700">
                    No advisors for this branch yet. Add them under Admin → User Management → Service Advisors.
                  </p>
                ) : null}
              </div>
            </div>

            <div className="px-4 sm:px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={addSaving}
                onClick={() => setIsAdding(false)}
                className="px-5 py-2.5 bg-white border border-slate-200 text-slate-900 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-colors disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitAdd}
                disabled={addSaving}
                className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold shadow-lg transition-all bg-blue-600 text-white shadow-blue-600/20 hover:bg-blue-700 disabled:opacity-60 min-w-[140px]"
              >
                {addSaving ? "Saving..." : "Create RO"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function ServiceDashboardPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-500 text-sm">Loading...</div>}>
      <ServiceDashboardPageInner />
    </Suspense>
  );
}
