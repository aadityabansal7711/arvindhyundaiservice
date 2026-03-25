'use client';

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import DashboardLayout from "@/components/layout/dashboard-layout";
import { ArrowLeft, Camera, ClipboardList, Loader2, X } from "lucide-react";
import { apiGet, apiPatch } from "@/lib/api";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { compressImagesToMax100KB } from "@/lib/compress-image";

type DropdownOption = { id: string; label: string; value: string };
type Branch = { id: string; name: string };

export default function EditROPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();

  const [roNo, setRoNo] = useState("");
  const [branchId, setBranchId] = useState("");
  const [regNo, setRegNo] = useState("");
  const [model, setModel] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerMobile, setCustomerMobile] = useState("");
  const [vehicleInDate, setVehicleInDate] = useState("");
  const [serviceAdvisorName, setServiceAdvisorName] = useState("");
  const [insuranceCompany, setInsuranceCompany] = useState("");
  const [insuranceOptions, setInsuranceOptions] = useState<DropdownOption[]>([]);
  const [modelOptions, setModelOptions] = useState<DropdownOption[]>([]);
  const [serviceAdvisorOptions, setServiceAdvisorOptions] = useState<DropdownOption[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [existingPhotosCount, setExistingPhotosCount] = useState(0);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

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
    const fetchRO = async () => {
      setIsLoading(true);
      try {
        const ro = await apiGet<any>(`/api/ro/${id}`);
        setRoNo(ro.roNo ?? "");
        setBranchId(ro.branchId ?? ro.branch?.id ?? "");
        setVehicleInDate(
          ro.vehicleInDate ? format(new Date(ro.vehicleInDate), "yyyy-MM-dd") : "",
        );

        setRegNo(ro.vehicle?.registrationNo ?? "");
        setModel(ro.vehicle?.model ?? "");
        setCustomerName(ro.vehicle?.customer?.name ?? "");
        setCustomerMobile(ro.vehicle?.customer?.mobile ?? "");

        setInsuranceCompany(
          ro.insuranceCompany ??
            ro.insuranceClaim?.insuranceCompany ??
            "",
        );
        setServiceAdvisorName(
          ro.serviceAdvisorName ?? ro.advisor?.name ?? "",
        );

        if (Array.isArray(ro.photos)) {
          setExistingPhotosCount(ro.photos.length);
        }
      } catch (err: any) {
        setError(err?.message || "Failed to load RO.");
      } finally {
        setIsLoading(false);
      }
    };

    if (id) {
      fetchRO();
    }
  }, [id]);

  // Load service advisors; when a branch is selected, request branch-specific options.
  useEffect(() => {
    const branch = branchId.trim();
    const url = branch
      ? `/api/data/options?group=service_advisor&branchId=${encodeURIComponent(
          branch
        )}`
      : "/api/data/options?group=service_advisor";

    void apiGet<DropdownOption[]>(
      url
    )
      .then((opts) => {
        setServiceAdvisorOptions(opts);
        // Ensure the current selection still belongs to this branch.
        setServiceAdvisorName((prev) => {
          if (!prev.trim()) return prev;
          return opts.some((o) => o.value === prev) ? prev : "";
        });
      })
      .catch(() => {
        setServiceAdvisorOptions([]);
        setServiceAdvisorName("");
      });
  }, [branchId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setError("");

    if (branches.length === 0) {
      setError(
        "No branches configured. Please add at least one branch in Data Page.",
      );
      return;
    }
    if (!branchId.trim()) {
      setError("Please select a branch.");
      return;
    }

    if (!regNo.trim() || !model.trim() || !customerName.trim() || !customerMobile.trim()) {
      setError(
        "Please fill all vehicle fields (Reg No, Model, Customer Name, Mobile).",
      );
      return;
    }
    if (!insuranceCompany.trim()) {
      setError("Please enter Insurance Company Name.");
      return;
    }
    if (!serviceAdvisorName.trim()) {
      setError("Please enter Service Advisor.");
      return;
    }
    if (!roNo.trim()) {
      setError("RO Number is required.");
      return;
    }

    setIsSubmitting(true);
    try {
      let photos: string[] | undefined;
      if (photoFiles.length > 0) {
        photos = await compressImagesToMax100KB(photoFiles);
      }

      const payload: any = {
        roNo: roNo.trim(),
        branchId: branchId.trim(),
        vehicleInDate,
        serviceAdvisorName: serviceAdvisorName.trim(),
        vehicle: {
          registrationNo: regNo.trim(),
          model: model.trim(),
          customerName: customerName.trim(),
          customerMobile: customerMobile.trim(),
        },
        insuranceClaim: {
          insuranceCompany: insuranceCompany.trim(),
        },
      };

      if (photos && photos.length > 0) {
        payload.photos = photos;
      }

      await apiPatch(`/api/ro/${id}`, payload);
      router.push("/ro");
    } catch (err: any) {
      setError(err?.message || "Failed to update RO.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto space-y-4 sm:space-y-6">
        <div>
          <Link
            href="/ro"
            className="inline-flex items-center gap-1 text-sm font-bold text-black hover:text-blue-600 mb-2 py-2 -ml-1 rounded-lg touch-manipulation"
          >
            <ArrowLeft className="w-4 h-4" /> Back to RO Register
          </Link>
          <h1 className="text-xl sm:text-2xl font-bold text-black tracking-tight flex items-center gap-2">
            <ClipboardList className="w-6 h-6 sm:w-7 sm:h-7 text-blue-600" />
            Edit Repair Order
          </h1>
          <p className="text-slate-600 mt-1 text-sm sm:text-base">
            Update RO and linked vehicle details.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
        >
          <div className="p-4 sm:p-6 space-y-6">
            {error && (
              <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-sm font-medium">
                {error}
              </div>
            )}

            {isLoading ? (
              <div className="py-10 text-center text-sm text-slate-500">
                Loading RO details...
              </div>
            ) : (
              <>
                {/* Branch */}
                <div>
                  <label className="block text-xs font-bold text-black uppercase tracking-widest mb-2">
                    Branch <span className="text-rose-500">*</span>
                  </label>
                  {branches.length > 0 ? (
                    <select
                      value={branchId}
                      onChange={(e) => setBranchId(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white appearance-none"
                      required
                    >
                      <option value="">Select branch</option>
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="px-4 py-2.5 text-slate-500 text-sm border border-slate-200 rounded-xl bg-slate-50">
                      No branches configured. Add branches in Data Page.
                    </p>
                  )}
                </div>

                {/* R/O No & Date */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-black uppercase tracking-widest mb-2">
                      R/O No <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={roNo}
                      onChange={(e) => setRoNo(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-black uppercase tracking-widest mb-2">
                      R/O Date <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={vehicleInDate}
                      onChange={(e) => setVehicleInDate(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white"
                      required
                    />
                  </div>
                </div>

                {/* Vehicle & customer */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-black uppercase tracking-widest mb-2">
                      Registration No <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={regNo}
                      onChange={(e) =>
                        setRegNo(e.target.value.toUpperCase())
                      }
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-black uppercase tracking-widest mb-2">
                      Model <span className="text-rose-500">*</span>
                    </label>
                    {modelOptions.length > 0 ? (
                      <select
                        value={model}
                        onChange={(e) => setModel(e.target.value)}
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
                        value={model}
                        onChange={(e) => setModel(e.target.value)}
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white"
                        required
                      />
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-black uppercase tracking-widest mb-2">
                      Customer Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-black uppercase tracking-widest mb-2">
                      Mobile <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={customerMobile}
                      onChange={(e) => setCustomerMobile(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white"
                      required
                    />
                  </div>
                </div>

                {/* Insurance company */}
                <div>
                  <label className="block text-xs font-bold text-black uppercase tracking-widest mb-2">
                    INSURANCE COMPANY NAME{" "}
                    <span className="text-rose-500">*</span>
                  </label>
                  {insuranceOptions.length > 0 ? (
                    <select
                      value={insuranceCompany}
                      onChange={(e) => setInsuranceCompany(e.target.value)}
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
                      value={insuranceCompany}
                      onChange={(e) =>
                        setInsuranceCompany(e.target.value)
                      }
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white"
                      required
                    />
                  )}
                </div>

                {/* Service advisor */}
                <div>
                  <label className="block text-xs font-bold text-black uppercase tracking-widest mb-2">
                    Service Advisor{" "}
                    <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={serviceAdvisorName}
                    onChange={(e) => setServiceAdvisorName(e.target.value)}
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
                </div>

                {/* Photos */}
                <div>
                  <label className="block text-xs font-bold text-black uppercase tracking-widest mb-2">
                    Photos
                  </label>
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*,.heic,.heif,image/heic,image/heif"
                    multiple
                    className="hidden"
                    onChange={async (e) => {
                      const inputEl = e.currentTarget;
                      const rawFiles = inputEl.files;
                      if (!rawFiles || rawFiles.length === 0) return;
                      const fileArr = Array.from(rawFiles);
                      inputEl.value = "";
                      const detached = await Promise.all(
                        fileArr.map(async (f) => {
                          try {
                            const buf = await f.arrayBuffer();
                            return new File([buf], f.name, { type: f.type, lastModified: f.lastModified });
                          } catch {
                            return f;
                          }
                        })
                      );
                      setPhotoFiles((prev) => [...prev, ...detached]);
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
                    {(existingPhotosCount > 0 || photoFiles.length > 0) && (
                      <span className="text-slate-500 text-sm self-center">
                        {existingPhotosCount > 0
                          ? `${existingPhotosCount} existing`
                          : ""}
                        {existingPhotosCount > 0 && photoFiles.length > 0
                          ? " · "
                          : ""}
                        {photoFiles.length > 0
                          ? `${photoFiles.length} new selected`
                          : ""}
                      </span>
                    )}
                  </div>
                  {photoFiles.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
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
                                prev.filter((_, j) => j !== i),
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
              </>
            )}
          </div>

          <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3">
            <Link
              href="/ro"
              className="px-5 py-2.5 bg-white border border-slate-200 text-black rounded-xl text-sm font-semibold hover:bg-slate-50 transition-colors"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={isSubmitting || isLoading}
              className={cn(
                "inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold shadow-lg transition-all",
                "bg-blue-600 text-white shadow-blue-600/20 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed",
                "min-w-[140px]",
              )}
              style={{ userSelect: "none", WebkitUserSelect: "none" }}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="pointer-events-none">Saving...</span>
                </>
              ) : (
                <span className="pointer-events-none">Save Changes</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
}

