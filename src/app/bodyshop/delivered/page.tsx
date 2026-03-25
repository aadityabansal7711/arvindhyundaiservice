"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { format } from "date-fns";
import { Search, X } from "lucide-react";

import DashboardLayout from "@/components/layout/dashboard-layout";
import { apiDelete, apiGet } from "@/lib/api";
import type { BodyshopJobWithMeta } from "@/lib/bodyshop-types";

type Branch = { id: string; name: string };

type StageHistoryRow = {
  id: string;
  from_status: string | null;
  to_status: string;
  changed_at: string;
  remark: string | null;
  gm_remark: string | null;
};

function DeliveredPageInner() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const GM_EMAIL = "servicegm.hyundai@arvindgroup.in";
  const userPermissions = ((session?.user as any)?.permissions ?? []) as string[];
  const isAdmin = userPermissions.includes("users.manage");
  const allowedRoDeleteEmail = "mayank.arvind.bansal@gmail.com";
  const canDeleteRo =
    ((session?.user as any)?.email as string | undefined)?.trim().toLowerCase() ===
    allowedRoDeleteEmail;
  const isGm =
    ((session?.user as any)?.email as string | undefined)?.trim().toLowerCase() ===
    GM_EMAIL;

  const [jobs, setJobs] = useState<BodyshopJobWithMeta[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [photoPreview, setPhotoPreview] = useState<{
    title: string;
    photos: string[];
  } | null>(null);
  const [stageViewOpen, setStageViewOpen] = useState(false);
  const [stageViewLoading, setStageViewLoading] = useState(false);
  const [stageViewError, setStageViewError] = useState<string | null>(null);
  const [stageViewRow, setStageViewRow] = useState<StageHistoryRow | null>(null);

  const fetchJobs = async (term: string) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        openOnly: "0",
        statusSection: "Delivered",
        view: "board",
        limit: "500",
      });
      if (term.trim()) params.set("search", term.trim());
      const data = await apiGet<BodyshopJobWithMeta[]>(
        `/api/bodyshop-jobs?${params.toString()}`
      );
      setJobs(data);
    } catch (err) {
      console.error(err);
      setJobs([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (status === "loading") return;
    if (!session) return;
    if (!isAdmin) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void fetchJobs(search);
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [session, status, isAdmin, search]);

  useEffect(() => {
    if (status === "loading") return;
    if (!session) return;
    if (!isAdmin) return;

    apiGet<Branch[]>("/api/data/branches")
      .then(setBranches)
      .catch(() => setBranches([]));
  }, [session, status, isAdmin]);

  const derived = useMemo(() => {
    const total = jobs.length;
    return { total };
  }, [jobs]);

  const branchNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const b of branches) map.set(String(b.id), b.name);
    return map;
  }, [branches]);

  const onDelete = async (id: string) => {
    const prev = jobs;
    setJobs((p) => p.filter((j) => j.id !== id));
    setPhotoPreview(null);
    setStageViewOpen(false);
    setStageViewError(null);
    setStageViewRow(null);

    try {
      await apiDelete(`/api/bodyshop-jobs/${encodeURIComponent(id)}`);
      // Refresh list to keep ordering/search results correct.
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
    setStageViewRow(null);
    try {
      const rows = await apiGet<StageHistoryRow[]>(
        `/api/bodyshop-stages?jobId=${encodeURIComponent(jobId)}`
      );
      setStageViewRow((rows ?? [])[0] ?? null);
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
    setStageViewRow(null);
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
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Delivered
          </h1>
          <p className="text-slate-500 mt-1">
            All delivered vehicles are listed here (admin only).
          </p>
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
            <div className="p-8 text-center text-slate-500 text-sm">
              Loading...
            </div>
          ) : jobs.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-sm">
              No delivered records found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-widest">
                      R/O No
                    </th>
                    <th className="px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-widest">
                      Date
                    </th>
                    <th className="px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-widest">
                      Branch
                    </th>
                    <th className="px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-widest">
                      Photos
                    </th>
                    <th className="px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-widest">
                      Reg No
                    </th>
                    <th className="px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-widest">
                      Customer
                    </th>
                    <th className="px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-widest">
                      Model
                    </th>
                    <th className="px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-widest">
                      Insurance
                    </th>
                    <th className="px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-widest">
                      Advisor
                    </th>
                    <th className="px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-widest">
                      Status
                    </th>
                    <th className="px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-widest">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {jobs.map((job) => (
                    <tr key={job.id} className="hover:bg-slate-50/50">
                      <td
                        className="px-5 py-3 text-sm font-semibold text-slate-900 cursor-pointer"
                        onClick={() =>
                          router.push(
                            `/bodyshop/job/${encodeURIComponent(job.id)}`
                          )
                        }
                      >
                        {job.ro_no}
                      </td>
                      <td className="px-5 py-3 text-sm text-slate-700">
                        {job.ro_date
                          ? format(new Date(job.ro_date), "dd.MM.yyyy")
                          : "—"}
                      </td>
                      <td className="px-5 py-3 text-sm text-slate-700">
                        {job.branch_id
                          ? branchNameById.get(String(job.branch_id)) ??
                            job.branch_id
                          : "—"}
                      </td>
                      <td className="px-5 py-3 text-sm text-slate-700">
                        {Array.isArray(job.photos) && job.photos.length > 0 ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void (async () => {
                                try {
                                  const refreshed = await apiGet<BodyshopJobWithMeta>(
                                    `/api/bodyshop-jobs/${encodeURIComponent(job.id)}`
                                  );
                                  const photos = Array.isArray(refreshed.photos)
                                    ? refreshed.photos
                                    : [];
                                  setPhotoPreview({
                                    title: `RO ${refreshed.ro_no} photos`,
                                    photos,
                                  });
                                } catch {
                                  setPhotoPreview({
                                    title: `RO ${job.ro_no} photos`,
                                    photos: job.photos as string[],
                                  });
                                }
                              })();
                            }}
                            className="inline-flex items-center px-2 py-1 rounded-lg bg-slate-100 text-slate-700 text-xs font-semibold hover:bg-slate-200"
                          >
                            View ({job.photos.length})
                          </button>
                        ) : (
                          <span className="text-slate-400 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-sm text-slate-700">
                        {job.reg_no ?? "—"}
                      </td>
                      <td className="px-5 py-3 text-sm text-slate-900 font-medium">
                        {job.customer_name ?? "—"}
                      </td>
                      <td className="px-5 py-3 text-sm text-slate-700">
                        {job.model ?? "—"}
                      </td>
                      <td className="px-5 py-3 text-sm text-slate-700">
                        {job.insurance_company ?? "—"}
                      </td>
                      <td className="px-5 py-3 text-sm text-slate-700">
                        {job.service_advisor ?? "—"}
                      </td>
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

      {/* Photo preview modal */}
      {photoPreview && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setPhotoPreview(null)}
        >
          <div
            className="bg-white w-full max-w-3xl rounded-t-2xl sm:rounded-2xl border border-slate-200 shadow-xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 sm:p-6 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-bold text-slate-900">
                    {photoPreview.title}
                  </div>
                  <div className="text-sm text-slate-500">
                    {photoPreview.photos.length} photo
                    {photoPreview.photos.length !== 1 ? "s" : ""}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPhotoPreview(null)}
                  aria-label="Close"
                  className="p-2.5 -mr-1 text-slate-400 hover:text-slate-600 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {photoPreview.photos.map((src, idx) => (
                  <a
                    key={`${idx}`}
                    href={src}
                    target="_blank"
                    rel="noreferrer"
                    className="group block rounded-xl overflow-hidden border border-slate-200 bg-slate-50"
                    title="Open full size"
                  >
                    <img
                      src={src}
                      alt={`Photo ${idx + 1}`}
                      className="w-full h-40 object-cover group-hover:opacity-95"
                      loading="lazy"
                    />
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Movement details modal */}
      {stageViewOpen && (
        <div
          className="fixed inset-0 z-55 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={closeStageView}
        >
          <div
            className="bg-white w-full max-w-xl rounded-t-2xl sm:rounded-2xl border border-slate-200 shadow-xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 sm:p-6 space-y-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-bold text-slate-900">
                    Movement Details
                  </div>
                  <div className="text-sm text-slate-500">
                    Timestamp and remark for this move
                  </div>
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
                <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">
                  {stageViewError}
                </div>
              )}

              {!stageViewLoading && !stageViewError && (
                <>
                  {!stageViewRow ? (
                    <div className="text-sm text-slate-500">
                      No movement history recorded yet.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <div className="text-xs font-bold text-slate-700 uppercase tracking-widest">
                          Movement
                        </div>
                        <div className="text-sm text-slate-900 font-semibold mt-1">
                          {stageViewRow.from_status ?? "New"} → {stageViewRow.to_status}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1">
                          {stageViewRow.changed_at
                            ? format(new Date(stageViewRow.changed_at), "dd MMM yyyy, HH:mm")
                            : "—"}
                        </div>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <div className="text-xs font-bold text-slate-700 uppercase tracking-widest">
                          Remark
                        </div>
                        <div className="text-sm text-slate-700 whitespace-pre-wrap mt-1">
                          {stageViewRow.remark ?? "—"}
                        </div>
                      </div>

                      {isGm && stageViewRow.gm_remark && (
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                          <div className="text-xs font-bold text-indigo-700 uppercase tracking-widest">
                            GM Remark
                          </div>
                          <div className="text-sm text-indigo-700 font-semibold whitespace-pre-wrap mt-1">
                            {stageViewRow.gm_remark}
                          </div>
                        </div>
                      )}
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

export default function DeliveredPage() {
  return (
    <Suspense
      fallback={
        <DashboardLayout>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center text-slate-500">
            Loading delivered vehicles...
          </div>
        </DashboardLayout>
      }
    >
      <DashboardLayout>
        <DeliveredPageInner />
      </DashboardLayout>
    </Suspense>
  );
}

