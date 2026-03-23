"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { format } from "date-fns";
import {
  Plus,
  Search,
  ChevronRight,
  Camera,
  X,
} from "lucide-react";

import DashboardLayout from "@/components/layout/dashboard-layout";
import { apiGet, apiPost, apiDelete, apiPatch } from "@/lib/api";
import type { BodyshopJobWithMeta, StatusSection } from "@/lib/bodyshop-types";
import { STATUS_SECTION_ORDER } from "@/lib/bodyshop-seed";
import {
  compressImageToMax100KB,
  compressImagesToMax100KB,
} from "@/lib/compress-image";

type DropdownOption = { id: string; label: string; value: string };
type Branch = { id: string; name: string };
type StageHistoryRow = {
  id: string;
  from_status: string | null;
  to_status: string;
  changed_at: string;
  remark: string | null;
  gm_remark: string | null;
};

function BodyshopDashboardPageInner() {
  const GM_EMAIL = "servicegm.hyundai@arvindgroup.in";
  const emitCountsRefresh = () => {
    window.dispatchEvent(new Event("bodyshop:counts-refresh"));
  };
  const [jobs, setJobs] = useState<BodyshopJobWithMeta[]>([]);
  const [search, setSearch] = useState("");
  const [activeStage, setActiveStage] = useState<StatusSection | "All">("All");
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [moveJob, setMoveJob] = useState<BodyshopJobWithMeta | null>(null);
  const [moveToStatus, setMoveToStatus] = useState<StatusSection | null>(null);
  const [moveViewOpen, setMoveViewOpen] = useState(false);
  const [stageViewOpen, setStageViewOpen] = useState(false);
  const [stageViewJobId, setStageViewJobId] = useState<string | null>(null);
  const [stageViewLoading, setStageViewLoading] = useState(false);
  const [stageViewError, setStageViewError] = useState<string | null>(null);
  const [stageViewRow, setStageViewRow] = useState<StageHistoryRow | null>(null);
  const [moveForm, setMoveForm] = useState<{
    movement_at: string;
    inputer_remark: string;
    gm_remark: string;
  }>({ movement_at: "", inputer_remark: "", gm_remark: "" });
  const [moveSaving, setMoveSaving] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [moveDebug, setMoveDebug] = useState<string | null>(null);
  const { data: session } = useSession();
  const isGm =
    ((session?.user as any)?.email as string | undefined)?.trim().toLowerCase() ===
    GM_EMAIL;
  const [branches, setBranches] = useState<Branch[]>([]);
  const [insuranceOptions, setInsuranceOptions] = useState<DropdownOption[]>([]);
  const [modelOptions, setModelOptions] = useState<DropdownOption[]>([]);
  const [serviceAdvisorOptions, setServiceAdvisorOptions] = useState<
    DropdownOption[]
  >([]);
  const [addPhotoFiles, setAddPhotoFiles] = useState<File[]>([]);
  const [movePhotoFiles, setMovePhotoFiles] = useState<File[]>([]);
  const addPhotoInputRef = useRef<HTMLInputElement>(null);
  const movePhotoInputRef = useRef<HTMLInputElement>(null);
  const [photoPreview, setPhotoPreview] = useState<{
    title: string;
    photos: string[];
  } | null>(null);

  const userPermissions = ((session?.user as any)?.permissions ?? []) as string[];
  const userBranchId = (session?.user as any)?.branchId as string | undefined;
  const canViewAllBranches =
    userPermissions.includes("branches.view_all") ||
    userPermissions.includes("users.manage");
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
    insurance_company: "",
    service_advisor: "",
  });
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addDebug, setAddDebug] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pad2 = (n: number) => String(n).padStart(2, "0");
  const toLocalDatetimeInputValue = (d: Date) => {
    // `datetime-local` expects `YYYY-MM-DDTHH:mm` in the user's local time.
    const yyyy = d.getFullYear();
    const mm = pad2(d.getMonth() + 1);
    const dd = pad2(d.getDate());
    const HH = pad2(d.getHours());
    const MM = pad2(d.getMinutes());
    return `${yyyy}-${mm}-${dd}T${HH}:${MM}`;
  };

  useEffect(() => {
    apiGet<DropdownOption[]>("/api/data/options?group=insurance_company")
      .then(setInsuranceOptions)
      .catch(() => setInsuranceOptions([]));
    apiGet<DropdownOption[]>("/api/data/options?group=model")
      .then(setModelOptions)
      .catch(() => setModelOptions([]));
    apiGet<Branch[]>("/api/data/branches")
      .then(setBranches)
      .catch(() => setBranches([]));
  }, []);

  useEffect(() => {
    if (branchLocked && userBranchId) {
      setAddForm((p) => ({ ...p, branch_id: userBranchId }));
    }
  }, [branchLocked, userBranchId]);

  // Service advisors must be filtered by the branch currently selected in the form.
  useEffect(() => {
    const effectiveBranchId = addForm.branch_id || userBranchId;
    if (!effectiveBranchId) {
      setServiceAdvisorOptions([]);
      return;
    }

    void apiGet<DropdownOption[]>(
      `/api/data/options?group=service_advisor&branchId=${encodeURIComponent(
        effectiveBranchId
      )}`
    )
      .then((opts) => {
        setServiceAdvisorOptions(opts);
        // If the current selection doesn't belong to this branch, clear it.
        setAddForm((prev) => {
          if (!prev.service_advisor) return prev;
          const stillValid = opts.some((o) => o.value === prev.service_advisor);
          return stillValid ? prev : { ...prev, service_advisor: "" };
        });
      })
      .catch(() => {
        setServiceAdvisorOptions([]);
        setAddForm((prev) => ({ ...prev, service_advisor: "" }));
      });
  }, [addForm.branch_id, userBranchId]);

  // Sync activeStage with URL so sidebar stage selection filters the page
  useEffect(() => {
    const stageParam = searchParams.get("stage");
    if (stageParam && STATUS_SECTION_ORDER.includes(stageParam as StatusSection)) {
      setActiveStage(stageParam as StatusSection);
    } else {
      setActiveStage("All");
    }
  }, [searchParams]);

  const fetchJobs = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        search,
        limit: "500",
        openOnly: "1",
        view: "board",
      });
      const data = await apiGet<BodyshopJobWithMeta[]>(
        `/api/bodyshop-jobs?${params.toString()}`
      );
      setJobs(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void fetchJobs();
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search]);

  const derived = useMemo(() => {
    const stageCounts = STATUS_SECTION_ORDER.reduce<Record<StatusSection, number>>(
      (acc, s) => {
        acc[s] = 0;
        return acc;
      },
      {} as Record<StatusSection, number>
    );
    for (const j of jobs) stageCounts[j.status_section] += 1;

    const filtered =
      activeStage === "All"
        ? jobs
        : jobs.filter((j) => j.status_section === activeStage);

    return {
      stageCounts,
      filtered,
    };
  }, [jobs, activeStage]);

  const branchNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const b of branches) map.set(b.id, b.name);
    return map;
  }, [branches]);

  const submitAdd = async () => {
    setAddSaving(true);
    setAddError(null);
    setAddDebug(null);
    try {
      const ro = addForm.ro_no.trim();
      if (!ro) {
        setAddError("R/O No is required");
        return;
      }
      setAddDebug("Preparing payload...");
      if (branches.length === 0) {
        setAddError(
          "No branches configured. Please add at least one branch in Data Page."
        );
        return;
      }
      if (!addForm.branch_id.trim()) {
        setAddError("Please select a branch.");
        return;
      }
      if (addPhotoFiles.length === 0) {
        setAddError("Please add at least one photo before creating a new RO.");
        return;
      }
      if (
        !addForm.reg_no.trim() ||
        !addForm.model.trim() ||
        !addForm.customer_name.trim() ||
        !addForm.mobile_no.trim()
      ) {
        setAddError(
          "Please fill all vehicle fields (Registration No, Model, Customer Name, Mobile)."
        );
        return;
      }
      if (!addForm.insurance_company.trim()) {
        setAddError("Please enter Insurance Company Name.");
        return;
      }
      if (!addForm.service_advisor.trim()) {
        setAddError("Please enter Service Advisor.");
        return;
      }

      const photos = await compressImagesToMax100KB(addPhotoFiles);
      if (photos.length === 0) {
        setAddError(
          "Selected photos could not be processed. Try JPG/PNG or a different HEIC image."
        );
        return;
      }
      setAddDebug(`Uploading ${photos.length} photo(s)...`);
      await apiPost("/api/bodyshop-jobs", {
        id: ro,
        ro_no: ro,
        branch_id: addForm.branch_id.trim(),
        ro_date: addForm.ro_date || null,
        reg_no: addForm.reg_no.trim().toUpperCase(),
        model: addForm.model.trim(),
        customer_name: addForm.customer_name.trim(),
        mobile_no: addForm.mobile_no.trim(),
        insurance_company: addForm.insurance_company.trim(),
        service_advisor: addForm.service_advisor.trim(),
        photos,
        status_section: "Document Pending",
      });
      emitCountsRefresh();
      setIsAdding(false);
      setAddDebug(null);
      setAddForm({
        branch_id: branchLocked && userBranchId ? userBranchId : "",
        ro_no: "",
        ro_date: format(new Date(), "yyyy-MM-dd"),
        reg_no: "",
        customer_name: "",
        mobile_no: "",
        model: "",
        insurance_company: "",
        service_advisor: "",
      });
      setAddPhotoFiles([]);
      await fetchJobs();
    } catch (e) {
      setAddError((e as Error)?.message ?? "Failed to add record");
      setAddDebug(`Failed: ${(e as Error)?.message ?? "Unknown error"}`);
    } finally {
      setAddSaving(false);
    }
  };

  const onDelete = async (id: string) => {
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

  const getNextStatus = (current: StatusSection): StatusSection | null => {
    const idx = STATUS_SECTION_ORDER.indexOf(current);
    if (idx < 0 || idx >= STATUS_SECTION_ORDER.length - 1) return null;
    return STATUS_SECTION_ORDER[idx + 1];
  };

  const openStageView = async (jobId: string) => {
    setStageViewOpen(true);
    setStageViewJobId(jobId);
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
    setStageViewJobId(null);
    setStageViewLoading(false);
    setStageViewError(null);
    setStageViewRow(null);
  };

  const onMoveToNextStatus = (job: BodyshopJobWithMeta) => {
    const nextStatus = getNextStatus(job.status_section);
    if (!nextStatus) return;

    const now = new Date();
    const movement_at = toLocalDatetimeInputValue(now);
    const inputerRemark = `Moved to ${nextStatus} on ${format(
      now,
      "yyyy-MM-dd HH:mm"
    )}`;

    setMoveJob(job);
    setMoveToStatus(nextStatus);
    setMoveViewOpen(false);
    setMoveError(null);
    setMoveSaving(false);
    setMoveDebug(null);
    setMoveForm({ movement_at, inputer_remark: inputerRemark, gm_remark: "" });
    setMovePhotoFiles([]);
  };

  const submitMove = async () => {
    if (!moveJob || !moveToStatus) return;
    setMoveDebug("Clicked Move");

    const movementAtRaw = moveForm.movement_at.trim();
    const movementAtDate = movementAtRaw
      ? new Date(movementAtRaw)
      : null;
    if (!movementAtDate || Number.isNaN(movementAtDate.getTime())) {
      setMoveError("Please provide a valid movement date/time.");
      return;
    }

    const inputerRemark = moveForm.inputer_remark.trim();
    if (!inputerRemark) {
      setMoveError("Please enter an inputer remark.");
      return;
    }

    setMoveSaving(true);
    setMoveError(null);
    try {
      setMoveDebug("Sending status update...");
      // 1) Always move status first so this action never gets blocked by image processing.
      await apiPatch(`/api/bodyshop-jobs/${encodeURIComponent(moveJob.id)}`, {
        status_section: moveToStatus,
        movement_at: movementAtRaw,
        inputer_remark: inputerRemark,
        gm_remark: isGm ? moveForm.gm_remark.trim() || null : null,
      });
      setMoveDebug("Status updated");

      // 2) Photo upload path for move modal: append one-by-one to avoid giant payloads.
      let appendedPhotos: string[] = [];
      if (movePhotoFiles.length > 0) {
        for (let i = 0; i < movePhotoFiles.length; i += 1) {
          const file = movePhotoFiles[i];
          setMoveDebug(`Uploading photo ${i + 1}/${movePhotoFiles.length}...`);
          const encoded = await compressImageToMax100KB(file);
          await apiPatch(`/api/bodyshop-jobs/${encodeURIComponent(moveJob.id)}`, {
            photos_append: [encoded],
          });
          appendedPhotos.push(encoded);
        }
        setMoveDebug("All photos saved");
      }

      setJobs((prev) =>
        prev.map((j) =>
          j.id === moveJob.id
            ? {
                ...j,
                status_section: moveToStatus,
                ...(appendedPhotos.length > 0
                  ? {
                      photos: [
                        ...(Array.isArray(j.photos) ? j.photos : []),
                        ...appendedPhotos,
                      ],
                    }
                  : {}),
              }
            : j
        )
      );
      emitCountsRefresh();

      setMoveJob(null);
      setMoveToStatus(null);
      setMovePhotoFiles([]);
      setMoveViewOpen(false);
      setMoveDebug(null);
    } catch (e) {
      console.error(e);
      await fetchJobs();
      setMoveError((e as Error)?.message ?? "Failed to move record");
      setMoveDebug(`Failed: ${(e as Error)?.message ?? "Unknown error"}`);
    } finally {
      setMoveSaving(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Bodyshop Board
            </h1>
            <p className="text-slate-500 mt-1">
              Active vehicles. Filter by stage and manage records.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setIsAdding(true);
                setAddError(null);
                setAddDebug(null);
                setAddPhotoFiles([]);
              }}
              className="inline-flex items-center gap-2 px-3 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700"
            >
              <Plus className="w-4 h-4" />
              Add Record
            </button>
          </div>
        </div>

        <div className="space-y-4">
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
                <div className="text-slate-900 font-bold">
                  {activeStage === "All" ? "All Vehicles" : activeStage}
                </div>
                <div className="text-sm text-slate-500">
                  {derived.filtered.length} records
                </div>
              </div>

              {isLoading ? (
                <div className="p-8 text-center text-slate-500 text-sm">
                  Loading...
                </div>
              ) : derived.filtered.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-sm">
                  No records found.
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
                          Photos
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
                      {derived.filtered.map((job) => (
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
                              ? (branchNameById.get(job.branch_id) ?? job.branch_id)
                              : "—"}
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
                          <td className="px-5 py-3 text-sm text-slate-700">
                            {Array.isArray(job.photos) && job.photos.length > 0 ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPhotoPreview({
                                    title: `RO ${job.ro_no} photos`,
                                    photos: job.photos as string[],
                                  });
                                }}
                                className="inline-flex items-center px-2 py-1 rounded-lg bg-slate-100 text-slate-700 text-xs font-semibold hover:bg-slate-200"
                              >
                                View ({job.photos.length})
                              </button>
                            ) : (
                              <span className="text-slate-400 text-xs">—</span>
                            )}
                          </td>
                          <td className="px-5 py-3 text-sm">
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center px-2 py-1 rounded-lg bg-blue-50 text-blue-700 text-xs font-semibold">
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
                            <div className="flex items-center gap-3">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  router.push(
                                    `/bodyshop/job/${encodeURIComponent(job.id)}`
                                  );
                                }}
                                className="text-blue-600 hover:text-blue-700 font-semibold text-xs"
                              >
                                Edit
                              </button>
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
                              {getNextStatus(job.status_section) && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void onMoveToNextStatus(job);
                                  }}
                                  className="text-indigo-600 hover:text-indigo-700 font-semibold text-xs"
                                >
                                  {getNextStatus(job.status_section)}
                                </button>
                              )}
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
                    key={idx}
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

      {/* Move status modal */}
      {moveJob && moveToStatus && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => {
            setMoveJob(null);
            setMoveToStatus(null);
            setMovePhotoFiles([]);
            setMoveDebug(null);
            setMoveViewOpen(false);
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
                    Move to {moveToStatus}
                  </div>
                  <div className="text-sm text-slate-500">
                    Enter movement date/time and add a remark.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setMoveJob(null);
                    setMoveToStatus(null);
                    setMovePhotoFiles([]);
                    setMoveDebug(null);
                    setMoveViewOpen(false);
                  }}
                  aria-label="Close"
                  className="p-2.5 -mr-1 text-slate-400 hover:text-slate-600 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {moveError && (
                <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">
                  {moveError}
                </div>
              )}
              {moveDebug && (
                <div className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-xl p-3">
                  {moveDebug}
                </div>
              )}

              <div className="space-y-2">
                <label className="block text-xs font-bold text-black uppercase tracking-widest mb-2">
                  Movement Date/Time
                </label>
                <input
                  type="datetime-local"
                  value={moveForm.movement_at}
                  onChange={(e) =>
                    setMoveForm((p) => ({ ...p, movement_at: e.target.value }))
                  }
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-bold text-black uppercase tracking-widest mb-2">
                  Inputer Remark
                </label>
                <textarea
                  value={moveForm.inputer_remark}
                  onChange={(e) =>
                    setMoveForm((p) => ({ ...p, inputer_remark: e.target.value }))
                  }
                  rows={4}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white"
                  placeholder="e.g. Moved to Painting on 2026-03-20 14:30"
                  required
                />
              </div>

              {isGm && (
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-black uppercase tracking-widest mb-2">
                    GM Remark
                  </label>
                  <textarea
                    value={moveForm.gm_remark}
                    onChange={(e) =>
                      setMoveForm((p) => ({ ...p, gm_remark: e.target.value }))
                    }
                    rows={4}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white"
                    placeholder="GM-only remark (private)"
                  />
                </div>
              )}

              <div className="space-y-3">
                <label className="block text-xs font-bold text-black uppercase tracking-widest">
                  Photos <span className="text-slate-400 normal-case tracking-normal font-medium">(optional)</span>
                </label>
                <input
                  ref={movePhotoInputRef}
                  type="file"
                  accept="image/*,.heic,.heif,image/heic,image/heif"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const files = e.target.files;
                    if (files?.length) {
                      setMovePhotoFiles((prev) => [
                        ...prev,
                        ...Array.from(files),
                      ]);
                      e.target.value = "";
                    }
                  }}
                />
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => movePhotoInputRef.current?.click()}
                    className="flex items-center gap-2 px-4 py-3 bg-slate-100 border border-slate-200 border-dashed rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-200 hover:border-slate-300 transition-colors"
                  >
                    <Camera className="w-5 h-5" />
                    Add photos
                  </button>
                  {movePhotoFiles.length > 0 && (
                    <span className="text-slate-500 text-sm self-center">
                      {movePhotoFiles.length} photo
                      {movePhotoFiles.length !== 1 ? "s" : ""} selected
                    </span>
                  )}
                </div>
                {movePhotoFiles.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {movePhotoFiles.map((file, i) => (
                      <div
                        key={`${file.name}-${i}`}
                        className="relative group flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 rounded-lg text-sm text-slate-700"
                      >
                        <span className="truncate max-w-[140px]">
                          {file.name}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setMovePhotoFiles((prev) =>
                              prev.filter((_, j) => j !== i)
                            )
                          }
                          className="p-0.5 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                          aria-label="Remove photo"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="px-4 sm:px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setMoveJob(null);
                  setMoveToStatus(null);
                  setMovePhotoFiles([]);
                  setMoveDebug(null);
                  setMoveViewOpen(false);
                }}
                className="px-5 py-2.5 bg-white border border-slate-200 text-slate-900 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => setMoveViewOpen(true)}
                disabled={moveSaving}
                className="px-5 py-2.5 bg-white border border-slate-200 text-slate-900 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-colors disabled:opacity-60"
              >
                View
              </button>
              <button
                type="button"
                onClick={() => void submitMove()}
                disabled={moveSaving}
                className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold shadow-lg transition-all bg-indigo-600 text-white shadow-indigo-600/20 hover:bg-indigo-700 disabled:opacity-60 min-w-[140px]"
                style={{ userSelect: "none", WebkitUserSelect: "none" }}
              >
                <span className="pointer-events-none">
                  {moveSaving ? "Moving..." : "Move"}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View movement modal */}
      {moveJob && moveToStatus && moveViewOpen && (
        <div
          className="fixed inset-0 z-60 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setMoveViewOpen(false)}
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
                    Timestamp and remark you are submitting
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setMoveViewOpen(false)}
                  aria-label="Close"
                  className="p-2.5 -mr-1 text-slate-400 hover:text-slate-600 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {(() => {
                const raw = moveForm.movement_at;
                const d = raw ? new Date(raw) : null;
                const formatted =
                  d && !Number.isNaN(d.getTime())
                    ? format(d, "dd MMM yyyy, HH:mm")
                    : raw || "—";

                const inputerRemark = moveForm.inputer_remark?.trim() || "—";
                const gmRemark = moveForm.gm_remark?.trim();

                return (
                  <div className="space-y-3">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="text-xs font-bold text-slate-700 uppercase tracking-widest">
                        Timestamp
                      </div>
                      <div className="text-sm text-slate-700 font-semibold mt-1">
                        {formatted}
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="text-xs font-bold text-slate-700 uppercase tracking-widest">
                        Remark
                      </div>
                      <div className="text-sm text-slate-700 whitespace-pre-wrap mt-1">
                        {inputerRemark}
                      </div>
                    </div>

                    {isGm && gmRemark && (
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <div className="text-xs font-bold text-indigo-700 uppercase tracking-widest">
                          GM Remark
                        </div>
                        <div className="text-sm text-indigo-700 font-semibold mt-1">
                          {gmRemark}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setMoveViewOpen(false)}
                  className="px-5 py-2.5 bg-white border border-slate-200 text-slate-900 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Movement info modal (for View button beside status) */}
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

              {stageViewLoading && (
                <div className="text-sm text-slate-500">Loading...</div>
              )}

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
                          {stageViewRow.from_status ?? "New"} →{" "}
                          {stageViewRow.to_status}
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

      {/* Add record modal */}
      {isAdding && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => {
            setIsAdding(false);
            setAddError(null);
            setAddDebug(null);
            setAddPhotoFiles([]);
          }}
        >
          <div
            className="bg-white w-full max-w-2xl rounded-t-2xl sm:rounded-2xl border border-slate-200 shadow-xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 sm:p-6 space-y-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-bold text-slate-900">
                    Create RO
                  </div>
                  <div className="text-sm text-slate-500">
                    Create a bodyshop record with required details.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsAdding(false);
                    setAddError(null);
                    setAddDebug(null);
                    setAddPhotoFiles([]);
                  }}
                  aria-label="Close"
                  className="p-2.5 -mr-1 text-slate-400 hover:text-slate-600 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {addError && (
                <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">
                  {addError}
                </div>
              )}
              {addDebug && (
                <div className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-xl p-3">
                  {addDebug}
                </div>
              )}

              {/* Branch */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-black uppercase tracking-widest mb-2">
                  Branch <span className="text-rose-500">*</span>
                </label>
                {branches.length > 0 ? (
                  <select
                    value={addForm.branch_id}
                    onChange={(e) =>
                      setAddForm((p) => ({ ...p, branch_id: e.target.value }))
                    }
                    disabled={branchLocked}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white appearance-none disabled:opacity-60"
                    required
                  >
                    {!branchLocked && <option value="">Select branch</option>}
                    {branches.map((b) => {
                      if (branchLocked && userBranchId && b.id !== userBranchId)
                        return null;
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

              {/* R/O No & R/O Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-6">
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-black uppercase tracking-widest">
                    R/O No <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={addForm.ro_no}
                    onChange={(e) =>
                      setAddForm((p) => ({ ...p, ro_no: e.target.value }))
                    }
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-black uppercase tracking-widest">
                    R/O Date <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={addForm.ro_date}
                    onChange={(e) =>
                      setAddForm((p) => ({ ...p, ro_date: e.target.value }))
                    }
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white"
                    required
                  />
                </div>
              </div>

              {/* Vehicle & customer */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-6">
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-black uppercase tracking-widest">
                    Registration No <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={addForm.reg_no}
                    onChange={(e) =>
                      setAddForm((p) => ({
                        ...p,
                        reg_no: e.target.value.toUpperCase(),
                      }))
                    }
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
                      onChange={(e) =>
                        setAddForm((p) => ({ ...p, model: e.target.value }))
                      }
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
                      onChange={(e) =>
                        setAddForm((p) => ({ ...p, model: e.target.value }))
                      }
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
                    onChange={(e) =>
                      setAddForm((p) => ({
                        ...p,
                        customer_name: e.target.value,
                      }))
                    }
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
                    onChange={(e) =>
                      setAddForm((p) => ({ ...p, mobile_no: e.target.value }))
                    }
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white"
                    required
                  />
                </div>
              </div>

              {/* Insurance company */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-black uppercase tracking-widest">
                  INSURANCE COMPANY NAME <span className="text-rose-500">*</span>
                </label>
                {insuranceOptions.length > 0 ? (
                  <select
                    value={addForm.insurance_company}
                    onChange={(e) =>
                      setAddForm((p) => ({
                        ...p,
                        insurance_company: e.target.value,
                      }))
                    }
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white appearance-none"
                    required
                  >
                    <option value="">Select insurance company</option>
                    {insuranceOptions.map((opt) => (
                      <option key={opt.id} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={addForm.insurance_company}
                    onChange={(e) =>
                      setAddForm((p) => ({
                        ...p,
                        insurance_company: e.target.value,
                      }))
                    }
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white"
                    required
                  />
                )}
              </div>

              {/* Service advisor — options load after a branch is chosen (advisors are stored per branch). */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-black uppercase tracking-widest">
                  Service Advisor <span className="text-rose-500">*</span>
                </label>
                <select
                  value={addForm.service_advisor}
                  onChange={(e) =>
                    setAddForm((p) => ({
                      ...p,
                      service_advisor: e.target.value,
                    }))
                  }
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
                  <p className="text-xs text-slate-500">
                    Select a branch first — service advisors are listed per branch.
                  </p>
                ) : serviceAdvisorOptions.length === 0 ? (
                  <p className="text-xs text-amber-700">
                    No advisors for this branch yet. Add them under Admin → User Management → Service Advisors.
                  </p>
                ) : null}
              </div>

              {/* Photos */}
              <div className="space-y-3">
                <label className="block text-xs font-bold text-black uppercase tracking-widest">
                  Photos <span className="text-rose-500">*</span>
                </label>
                <input
                  ref={addPhotoInputRef}
                  type="file"
                  accept="image/*,.heic,.heif,image/heic,image/heif"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const files = e.target.files;
                    if (files?.length) {
                      setAddPhotoFiles((prev) => [
                        ...prev,
                        ...Array.from(files),
                      ]);
                      e.target.value = "";
                    }
                  }}
                />
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => addPhotoInputRef.current?.click()}
                    className="flex items-center gap-2 px-4 py-3 bg-slate-100 border border-slate-200 border-dashed rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-200 hover:border-slate-300 transition-colors"
                  >
                    <Camera className="w-5 h-5" />
                    Add photos
                  </button>
                  {addPhotoFiles.length > 0 && (
                    <span className="text-slate-500 text-sm self-center">
                      {addPhotoFiles.length} photo
                      {addPhotoFiles.length !== 1 ? "s" : ""} selected
                    </span>
                  )}
                </div>
                {addPhotoFiles.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {addPhotoFiles.map((file, i) => (
                      <div
                        key={`${file.name}-${i}`}
                        className="relative group flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 rounded-lg text-sm text-slate-700"
                      >
                        <span className="truncate max-w-[140px]">
                          {file.name}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setAddPhotoFiles((prev) =>
                              prev.filter((_, j) => j !== i)
                            )
                          }
                          className="p-0.5 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                          aria-label="Remove photo"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>

            <div className="px-4 sm:px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                className="px-5 py-2.5 bg-white border border-slate-200 text-slate-900 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitAdd}
                disabled={addSaving}
                className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold shadow-lg transition-all bg-blue-600 text-white shadow-blue-600/20 hover:bg-blue-700 disabled:opacity-60 min-w-[140px]"
                style={{ userSelect: "none", WebkitUserSelect: "none" }}
              >
                <span className="pointer-events-none">
                  {addSaving ? "Creating..." : "Create RO"}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

export default function BodyshopDashboardPage() {
  return (
    <Suspense
      fallback={
        <DashboardLayout>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center text-slate-500">
            Loading bodyshop board...
          </div>
        </DashboardLayout>
      }
    >
      <BodyshopDashboardPageInner />
    </Suspense>
  );
}

