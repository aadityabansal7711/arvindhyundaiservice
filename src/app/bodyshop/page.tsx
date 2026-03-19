"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { format } from "date-fns";
import {
  Plus,
  Search,
  FileText,
  ChevronRight,
  Camera,
  X,
} from "lucide-react";

import DashboardLayout from "@/components/layout/dashboard-layout";
import { apiGet, apiPost, apiDelete, apiPatch } from "@/lib/api";
import type { BodyshopJobWithMeta, StatusSection } from "@/lib/bodyshop-types";
import { STATUS_SECTION_ORDER } from "@/lib/bodyshop-seed";
import { compressImagesToMax100KB } from "@/lib/compress-image";

type DropdownOption = { id: string; label: string; value: string };
type Branch = { id: string; name: string };

function BodyshopDashboardPageInner() {
  const emitCountsRefresh = () => {
    window.dispatchEvent(new Event("bodyshop:counts-refresh"));
  };
  const [jobs, setJobs] = useState<BodyshopJobWithMeta[]>([]);
  const [search, setSearch] = useState("");
  const [activeStage, setActiveStage] = useState<StatusSection | "All">("All");
  const [isLoading, setIsLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const { data: session } = useSession();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [insuranceOptions, setInsuranceOptions] = useState<DropdownOption[]>([]);
  const [modelOptions, setModelOptions] = useState<DropdownOption[]>([]);
  const [serviceAdvisorOptions, setServiceAdvisorOptions] = useState<
    DropdownOption[]
  >([]);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [photoPreview, setPhotoPreview] = useState<{
    title: string;
    photos: string[];
  } | null>(null);

  const userRole = (session?.user as any)?.role as string | undefined;
  const userBranchId = (session?.user as any)?.branchId as string | undefined;
  const isManager = userRole?.toLowerCase() === "manager";

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
  const router = useRouter();
  const searchParams = useSearchParams();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    apiGet<DropdownOption[]>("/api/data/options?group=insurance_company")
      .then(setInsuranceOptions)
      .catch(() => setInsuranceOptions([]));
    apiGet<DropdownOption[]>("/api/data/options?group=model")
      .then(setModelOptions)
      .catch(() => setModelOptions([]));
    apiGet<DropdownOption[]>("/api/data/options?group=service_advisor")
      .then(setServiceAdvisorOptions)
      .catch(() => setServiceAdvisorOptions([]));
    apiGet<Branch[]>("/api/data/branches")
      .then(setBranches)
      .catch(() => setBranches([]));
  }, []);

  useEffect(() => {
    if (isManager && userBranchId) {
      setAddForm((p) => ({ ...p, branch_id: userBranchId }));
    }
  }, [isManager, userBranchId]);

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

  const handleImportChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      await apiPost("/api/bodyshop-import", formData, {
        headers: undefined, // let browser set multipart boundary
      } as any);
      await fetchJobs();
    } catch (err) {
      console.error(err);
    } finally {
      setIsImporting(false);
      event.target.value = "";
    }
  };

  const submitAdd = async () => {
    setAddSaving(true);
    setAddError(null);
    try {
      const ro = addForm.ro_no.trim();
      if (!ro) {
        setAddError("R/O No is required");
        return;
      }
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
      if (photoFiles.length === 0) {
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

      const photos = await compressImagesToMax100KB(photoFiles);
      if (photos.length === 0) {
        setAddError(
          "Selected photos could not be processed. Try JPG/PNG or a different HEIC image."
        );
        return;
      }
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
      setAddForm({
        branch_id: isManager && userBranchId ? userBranchId : "",
        ro_no: "",
        ro_date: format(new Date(), "yyyy-MM-dd"),
        reg_no: "",
        customer_name: "",
        mobile_no: "",
        model: "",
        insurance_company: "",
        service_advisor: "",
      });
      setPhotoFiles([]);
      await fetchJobs();
    } catch (e) {
      setAddError((e as Error)?.message ?? "Failed to add record");
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

  const onMoveToNextStatus = async (job: BodyshopJobWithMeta) => {
    const nextStatus = getNextStatus(job.status_section);
    if (!nextStatus) return;

    const input = window.prompt("Enter movement date (YYYY-MM-DD)");
    if (input === null) return;
    const date = input.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) {
      window.alert("Please enter a valid date in YYYY-MM-DD format.");
      return;
    }

    try {
      await apiPatch(`/api/bodyshop-jobs/${encodeURIComponent(job.id)}`, {
        status_section: nextStatus,
        remark: `Moved to ${nextStatus} on ${date}`,
      });
      setJobs((prev) =>
        prev.map((j) =>
          j.id === job.id ? { ...j, status_section: nextStatus } : j
        )
      );
      emitCountsRefresh();
    } catch (e) {
      console.error(e);
      await fetchJobs();
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
              onClick={() => setIsAdding(true)}
              className="inline-flex items-center gap-2 px-3 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700"
            >
              <Plus className="w-4 h-4" />
              Add Record
            </button>

            <label className="inline-flex items-center gap-2 px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 cursor-pointer hover:bg-slate-50">
              <FileText className="w-4 h-4" />
              {isImporting ? "Importing..." : "Import"}
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={handleImportChange}
                disabled={isImporting}
              />
            </label>
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
                            <span className="inline-flex items-center px-2 py-1 rounded-lg bg-blue-50 text-blue-700 text-xs font-semibold">
                              {job.status_section}
                            </span>
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

      {/* Add record modal */}
      {isAdding && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setIsAdding(false)}
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
                  onClick={() => setIsAdding(false)}
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
                    disabled={isManager}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white appearance-none disabled:opacity-60"
                    required
                  >
                    {!isManager && <option value="">Select branch</option>}
                    {branches.map((b) => {
                      if (isManager && userBranchId && b.id !== userBranchId)
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

              {/* Service advisor */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-black uppercase tracking-widest">
                  Service Advisor <span className="text-rose-500">*</span>
                </label>
                {serviceAdvisorOptions.length > 0 ? (
                  <select
                    value={addForm.service_advisor}
                    onChange={(e) =>
                      setAddForm((p) => ({
                        ...p,
                        service_advisor: e.target.value,
                      }))
                    }
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white appearance-none"
                    required
                  >
                    <option value="">Select service advisor</option>
                    {serviceAdvisorOptions.map((opt) => (
                      <option key={opt.id} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={addForm.service_advisor}
                    onChange={(e) =>
                      setAddForm((p) => ({
                        ...p,
                        service_advisor: e.target.value,
                      }))
                    }
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white"
                    required
                  />
                )}
              </div>

              {/* Photos */}
              <div className="space-y-3">
                <label className="block text-xs font-bold text-black uppercase tracking-widest">
                  Photos <span className="text-rose-500">*</span>
                </label>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*,.heic,.heif,image/heic,image/heif"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const files = e.target.files;
                    if (files?.length) {
                      setPhotoFiles((prev) => [...prev, ...Array.from(files)]);
                      e.target.value = "";
                    }
                  }}
                />
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => photoInputRef.current?.click()}
                    className="flex items-center gap-2 px-4 py-3 bg-slate-100 border border-slate-200 border-dashed rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-200 hover:border-slate-300 transition-colors"
                  >
                    <Camera className="w-5 h-5" />
                    Add photos
                  </button>
                  {photoFiles.length > 0 && (
                    <span className="text-slate-500 text-sm self-center">
                      {photoFiles.length} photo
                      {photoFiles.length !== 1 ? "s" : ""} selected
                    </span>
                  )}
                </div>
                {photoFiles.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {photoFiles.map((file, i) => (
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
                            setPhotoFiles((prev) =>
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

