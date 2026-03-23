"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import DashboardLayout from "@/components/layout/dashboard-layout";
import { ArrowLeft, ClipboardList, Loader2, Camera, X } from "lucide-react";
import { apiGet, apiPost } from "@/lib/api";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { compressImagesToMax100KB } from "@/lib/compress-image";

type DropdownOption = { id: string; label: string; value: string };
type Branch = { id: string; name: string };

export default function NewROPage() {
    const router = useRouter();
    const { data: session } = useSession();
    const [roNo, setRoNo] = useState("");
    const [branchId, setBranchId] = useState("");
    const [newRegNo, setNewRegNo] = useState("");
    const [newModel, setNewModel] = useState("");
    const [newCustomerName, setNewCustomerName] = useState("");
    const [newCustomerMobile, setNewCustomerMobile] = useState("");
    const [vehicleInDate, setVehicleInDate] = useState(format(new Date(), "yyyy-MM-dd"));
    const [serviceAdvisorName, setServiceAdvisorName] = useState("");
    const [insuranceCompany, setInsuranceCompany] = useState("");
    const [insuranceOptions, setInsuranceOptions] = useState<DropdownOption[]>([]);
    const [modelOptions, setModelOptions] = useState<DropdownOption[]>([]);
    const [serviceAdvisorOptions, setServiceAdvisorOptions] = useState<DropdownOption[]>([]);
    const [branches, setBranches] = useState<Branch[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [photoFiles, setPhotoFiles] = useState<File[]>([]);
    const photoInputRef = useRef<HTMLInputElement>(null);

    const userRole = (session?.user as any)?.role as string | undefined;
    const userBranchId = (session?.user as any)?.branchId as string | undefined;
    const isManager = userRole?.toLowerCase() === "manager";

    useEffect(() => {
        apiGet<DropdownOption[]>("/api/data/options?group=insurance_company").then(setInsuranceOptions).catch(() => setInsuranceOptions([]));
        apiGet<DropdownOption[]>("/api/data/options?group=model").then(setModelOptions).catch(() => setModelOptions([]));
        apiGet<Branch[]>("/api/data/branches").then(setBranches).catch(() => setBranches([]));
    }, []);

    useEffect(() => {
        if (isManager && userBranchId) {
            setBranchId(userBranchId);
        }
    }, [isManager, userBranchId]);

    // Load service advisors; when a branch is selected, request branch-specific options.
    useEffect(() => {
        const branch = branchId.trim();
        const url = branch
            ? `/api/data/options?group=service_advisor&branchId=${encodeURIComponent(branch)}`
            : "/api/data/options?group=service_advisor";

        void apiGet<DropdownOption[]>(
            url
        )
            .then((opts) => {
                setServiceAdvisorOptions(opts);
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
            setError("No branches configured. Please add at least one branch in Data Page.");
            return;
        }
        if (!branchId.trim()) {
            setError("Please select a branch.");
            return;
        }

        if (photoFiles.length === 0) {
            setError("Please add at least one photo before creating a new RO.");
            return;
        }

        if (!newRegNo.trim() || !newModel.trim() || !newCustomerName.trim() || !newCustomerMobile.trim()) {
            setError("Please fill all vehicle fields (Reg No, Model, Customer Name, Mobile).");
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

        let vehicleId: string;
        setIsSubmitting(true);
        try {
            const v = await apiPost<{ id: string }>("/api/vehicles", {
                registrationNo: newRegNo.trim(),
                model: newModel.trim(),
                customerName: newCustomerName.trim(),
                customerMobile: newCustomerMobile.trim(),
            });
            vehicleId = v.id;
        } catch (err: any) {
            setError(err?.message || "Failed to create vehicle.");
            setIsSubmitting(false);
            return;
        }

        if (!roNo.trim()) {
            setError("RO Number is required.");
            setIsSubmitting(false);
            return;
        }

        setIsSubmitting(true);
        try {
            let photos: string[] = [];
            if (photoFiles.length > 0) {
                photos = await compressImagesToMax100KB(photoFiles);
                if (photos.length === 0) {
                    setError("Selected photos could not be processed. Try JPG/PNG or a different HEIC image.");
                    setIsSubmitting(false);
                    return;
                }
            }
            const payload: any = {
                roNo: roNo.trim(),
                vehicleId,
                branchId: branchId.trim(),
                vehicleInDate,
                currentStatus: "DOCUMENT_PENDING",
                insuranceCompany: insuranceCompany.trim(),
                serviceAdvisorName: serviceAdvisorName.trim(),
                ...(photos.length > 0 ? { photos } : {}),
            };

            const res = await apiPost<{ id?: string }>("/api/ro", payload);
            const id = res?.id;
            if (!id) {
                setError("Invalid response from server. Please try again.");
                setIsSubmitting(false);
                return;
            }
            router.push("/ro");
        } catch (err: any) {
            setError(err?.message || "Failed to create RO.");
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
                        New Repair Order
                    </h1>
                    <p className="text-slate-600 mt-1 text-sm sm:text-base">Create a new RO and link it to a vehicle.</p>
                </div>

                <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-4 sm:p-6 space-y-6">
                        {error && (
                            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-sm font-medium">
                                {error}
                            </div>
                        )}

                        {/* Branch (required, at top) */}
                        <div>
                            <label className="block text-xs font-bold text-black uppercase tracking-widest mb-2">
                                Branch <span className="text-rose-500">*</span>
                            </label>
                            {branches.length > 0 ? (
                                <select
                                    value={branchId}
                                    onChange={(e) => setBranchId(e.target.value)}
                                    disabled={isManager}
                                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white appearance-none disabled:opacity-60"
                                    required
                                >
                                    {!isManager && <option value="">Select branch</option>}
                                    {branches.map((b) => {
                                        if (isManager && userBranchId && b.id !== userBranchId) return null;
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
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-black uppercase tracking-widest mb-2">
                                    R/O No <span className="text-rose-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={roNo}
                                    onChange={(e) => setRoNo(e.target.value)}
                                    placeholder=""
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

                        {/* Vehicle & customer (required) */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-black uppercase tracking-widest mb-2">
                                    Registration No <span className="text-rose-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={newRegNo}
                                    onChange={(e) => setNewRegNo(e.target.value.toUpperCase())}
                                    placeholder=""
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
                                        value={newModel}
                                        onChange={(e) => setNewModel(e.target.value)}
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
                                        value={newModel}
                                        onChange={(e) => setNewModel(e.target.value)}
                                        placeholder=""
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
                                    value={newCustomerName}
                                    onChange={(e) => setNewCustomerName(e.target.value)}
                                    placeholder=""
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
                                    value={newCustomerMobile}
                                    onChange={(e) => setNewCustomerMobile(e.target.value)}
                                    placeholder=""
                                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white"
                                    required
                                />
                            </div>
                        </div>

                        {/* Insurance - Insurance Company Name (from Data page options) */}
                        <div>
                            <label className="block text-xs font-bold text-black uppercase tracking-widest mb-2">
                                INSURANCE COMPANY NAME <span className="text-rose-500">*</span>
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
                                    onChange={(e) => setInsuranceCompany(e.target.value)}
                                    placeholder=""
                                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white"
                                    required
                                />
                            )}
                        </div>

                        {/* Service Advisor (filtered by RO branch and user's assigned branch) */}
                        <div>
                            <label className="block text-xs font-bold text-black uppercase tracking-widest mb-2">
                                Service Advisor <span className="text-rose-500">*</span>
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

                        {/* Photos (required) */}
                        <div>
                            <label className="block text-xs font-bold text-black uppercase tracking-widest mb-2">
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
                                        {photoFiles.length} photo{photoFiles.length !== 1 ? "s" : ""} selected
                                    </span>
                                )}
                            </div>
                            {photoFiles.length > 0 && (
                                <div className="mt-3 flex flex-wrap gap-2">
                                    {photoFiles.map((file, i) => (
                                        <div
                                            key={`${file.name}-${file.size}-${file.lastModified}-${i}`}
                                            className="relative group flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 rounded-lg text-sm text-slate-700"
                                        >
                                            <span className="truncate max-w-[140px]">{file.name}</span>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setPhotoFiles((prev) => prev.filter((_, j) => j !== i))
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

                    <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3">
                        <Link
                            href="/ro"
                            className="px-5 py-2.5 bg-white border border-slate-200 text-black rounded-xl text-sm font-semibold hover:bg-slate-50 transition-colors"
                        >
                            Cancel
                        </Link>
                        <button
                            type="submit"
                            aria-disabled={isSubmitting}
                            className={cn(
                                "inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold shadow-lg transition-all select-none",
                                "bg-blue-600 text-white shadow-blue-600/20 hover:bg-blue-700",
                                isSubmitting && "opacity-50 cursor-not-allowed pointer-events-none",
                                "min-w-[140px]"
                            )}
                            style={{ userSelect: "none", WebkitUserSelect: "none" }}
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin select-none" />
                                    <span className="pointer-events-none select-none">Creating...</span>
                                </>
                            ) : (
                                <span className="pointer-events-none select-none">Create RO</span>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </DashboardLayout>
    );
}
