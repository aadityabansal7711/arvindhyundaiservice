"use client";

import { useState, useEffect, useRef } from "react";
import DashboardLayout from "@/components/layout/dashboard-layout";
import { Filter, Download, Search, BarChart3, Calendar, Shield, CheckCircle2, Wrench, ChevronRight } from "lucide-react";
import { apiGet } from "@/lib/api";
import { format } from "date-fns";

type ROListItem = {
    id: string;
    roNo: string;
    vehicleInDate: string;
    currentStatus: string;
    workStartDate: string | null;
    tentativeCompletionDate: string | null;
    vehicle: { registrationNo: string; model: string; customer: { name: string; mobile: string } };
    insuranceClaim: {
        claimNo: string | null;
        claimIntimationDate: string | null;
        hapFlag: boolean;
        insuranceCompany: string;
    } | null;
    survey: {
        surveyorName: string | null;
        surveyDate: string | null;
        approvalDate: string | null;
    } | null;
};

type RODetail = ROListItem & {
    panelsNewReplace: number | null;
    panelsDent: number | null;
    serviceAdvisorName: string | null;
    advisor: { name: string } | null;
};

export default function StatusReportPage() {
    const [searchTerm, setSearchTerm] = useState("");
    const [ros, setRos] = useState<ROListItem[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [detail, setDetail] = useState<RODetail | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [detailLoading, setDetailLoading] = useState(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const fetchROs = async () => {
        setIsLoading(true);
        try {
            const data = await apiGet<ROListItem[]>(
                `/api/ro?search=${encodeURIComponent(searchTerm)}&limit=200`
            );
            setRos(data);
            if (selectedId && !data.some((r) => r.id === selectedId)) {
                setSelectedId(null);
                setDetail(null);
            }
        } catch (err) {
            if ((err as Error)?.message !== "Unauthorized") console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => fetchROs(), 300);
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, [searchTerm]);

    useEffect(() => {
        if (!selectedId) {
            setDetail(null);
            return;
        }
        setDetailLoading(true);
        apiGet<RODetail>(`/api/ro/${selectedId}`)
            .then(setDetail)
            .catch((err) => {
                if ((err as Error)?.message !== "Unauthorized") console.error(err);
                setDetail(null);
            })
            .finally(() => setDetailLoading(false));
    }, [selectedId]);

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Status Report</h1>
                        <p className="text-slate-500 mt-1">Overview of RO status, aging and turnaround metrics. Select an RO to see combined details.</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <button className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-semibold transition-all">
                            <Download className="w-4 h-4" />
                            Export
                        </button>
                    </div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 items-center">
                    <div className="relative flex-1 w-full">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                            placeholder="Filter by status, date range, RO no..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white transition-all"
                        />
                    </div>
                    <button className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-500 hover:bg-slate-100 transition-all">
                        <Filter className="w-5 h-5" />
                    </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* RO list — in order (vehicleInDate desc from API) */}
                    <div className="lg:col-span-1 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50">
                            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-widest">ROs (in order)</h2>
                        </div>
                        <div className="overflow-y-auto max-h-[480px]">
                            {isLoading ? (
                                <div className="p-6 text-center text-slate-500 text-sm">Loading...</div>
                            ) : ros.length === 0 ? (
                                <div className="p-6 text-center">
                                    <BarChart3 className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                                    <p className="text-sm text-slate-500">No ROs found</p>
                                </div>
                            ) : (
                                <ul className="divide-y divide-slate-100">
                                    {ros.map((ro) => (
                                        <li key={ro.id}>
                                            <button
                                                type="button"
                                                onClick={() => setSelectedId(ro.id === selectedId ? null : ro.id)}
                                                className={`w-full flex items-center justify-between gap-2 px-4 py-3 text-left transition-colors ${
                                                    selectedId === ro.id ? "bg-blue-50 border-l-4 border-blue-600" : "hover:bg-slate-50"
                                                }`}
                                            >
                                                <span className="font-semibold text-slate-900">{ro.roNo}</span>
                                                <span className="text-xs text-slate-500 truncate">{ro.vehicle?.registrationNo}</span>
                                                <ChevronRight className={`w-4 h-4 flex-shrink-0 text-slate-400 ${selectedId === ro.id ? "text-blue-600" : ""}`} />
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>

                    {/* Combined detail panel */}
                    <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden min-h-[400px]">
                        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50">
                            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-widest">Combined details</h2>
                        </div>
                        <div className="p-6 overflow-y-auto max-h-[520px]">
                            {!selectedId && (
                                <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                                    <BarChart3 className="w-12 h-12 mb-3" />
                                    <p className="font-medium">Select an RO</p>
                                    <p className="text-sm mt-1">Click an RO from the list to see all details from RO, Claim, Approval and Work registers.</p>
                                </div>
                            )}
                            {selectedId && detailLoading && (
                                <div className="flex items-center justify-center py-16 text-slate-500">Loading details...</div>
                            )}
                            {selectedId && !detailLoading && detail && (
                                <div className="space-y-8">
                                    {/* RO + Vehicle + Customer */}
                                    <section>
                                        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                                            <Calendar className="w-4 h-4" /> RO & Vehicle
                                        </h3>
                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                                                <p className="text-[10px] font-bold text-slate-500 uppercase">RO No</p>
                                                <p className="text-sm font-bold text-slate-900 mt-0.5">{detail.roNo}</p>
                                            </div>
                                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                                                <p className="text-[10px] font-bold text-slate-500 uppercase">Status</p>
                                                <p className="text-sm font-bold text-slate-900 mt-0.5">{detail.currentStatus}</p>
                                            </div>
                                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                                                <p className="text-[10px] font-bold text-slate-500 uppercase">Vehicle In</p>
                                                <p className="text-sm font-bold text-slate-900 mt-0.5">{format(new Date(detail.vehicleInDate), "dd MMM yyyy")}</p>
                                            </div>
                                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                                                <p className="text-[10px] font-bold text-slate-500 uppercase">Reg No / Model</p>
                                                <p className="text-sm font-bold text-slate-900 mt-0.5">{detail.vehicle?.registrationNo} / {detail.vehicle?.model}</p>
                                            </div>
                                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 col-span-2">
                                                <p className="text-[10px] font-bold text-slate-500 uppercase">Customer</p>
                                                <p className="text-sm font-bold text-slate-900 mt-0.5">{detail.vehicle?.customer?.name} — {detail.vehicle?.customer?.mobile}</p>
                                            </div>
                                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 col-span-2">
                                                <p className="text-[10px] font-bold text-slate-500 uppercase">Service Advisor</p>
                                                <p className="text-sm font-bold text-slate-900 mt-0.5">{detail.serviceAdvisorName ?? detail.advisor?.name ?? "—"}</p>
                                            </div>
                                        </div>
                                    </section>

                                    {/* Claim */}
                                    <section>
                                        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                                            <Shield className="w-4 h-4" /> Claim Register
                                        </h3>
                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                                                <p className="text-[10px] font-bold text-slate-500 uppercase">Claim No</p>
                                                <p className="text-sm font-bold text-slate-900 mt-0.5">{detail.insuranceClaim?.claimNo ?? "—"}</p>
                                            </div>
                                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                                                <p className="text-[10px] font-bold text-slate-500 uppercase">Claim Date</p>
                                                <p className="text-sm font-bold text-slate-900 mt-0.5">
                                                    {detail.insuranceClaim?.claimIntimationDate
                                                        ? format(new Date(detail.insuranceClaim.claimIntimationDate), "dd MMM yyyy")
                                                        : "—"}
                                                </p>
                                            </div>
                                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                                                <p className="text-[10px] font-bold text-slate-500 uppercase">HAP/NHAP</p>
                                                <p className="text-sm font-bold text-slate-900 mt-0.5">{detail.insuranceClaim?.hapFlag ? "HAP" : "NHAP"}</p>
                                            </div>
                                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                                                <p className="text-[10px] font-bold text-slate-500 uppercase">Insurance Co</p>
                                                <p className="text-sm font-bold text-slate-900 mt-0.5">{detail.insuranceClaim?.insuranceCompany ?? "—"}</p>
                                            </div>
                                        </div>
                                    </section>

                                    {/* Approval / Survey */}
                                    <section>
                                        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                                            <CheckCircle2 className="w-4 h-4" /> Approval Register
                                        </h3>
                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                                                <p className="text-[10px] font-bold text-slate-500 uppercase">Surveyor Name</p>
                                                <p className="text-sm font-bold text-slate-900 mt-0.5">{detail.survey?.surveyorName ?? "—"}</p>
                                            </div>
                                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                                                <p className="text-[10px] font-bold text-slate-500 uppercase">Survey Date</p>
                                                <p className="text-sm font-bold text-slate-900 mt-0.5">
                                                    {detail.survey?.surveyDate ? format(new Date(detail.survey.surveyDate), "dd MMM yyyy") : "—"}
                                                </p>
                                            </div>
                                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                                                <p className="text-[10px] font-bold text-slate-500 uppercase">Approval Date</p>
                                                <p className="text-sm font-bold text-slate-900 mt-0.5">
                                                    {detail.survey?.approvalDate ? format(new Date(detail.survey.approvalDate), "dd MMM yyyy") : "—"}
                                                </p>
                                            </div>
                                        </div>
                                    </section>

                                    {/* Work */}
                                    <section>
                                        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                                            <Wrench className="w-4 h-4" /> Work Register
                                        </h3>
                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                                                <p className="text-[10px] font-bold text-slate-500 uppercase">Start Date</p>
                                                <p className="text-sm font-bold text-slate-900 mt-0.5">
                                                    {detail.workStartDate ? format(new Date(detail.workStartDate), "dd MMM yyyy") : "—"}
                                                </p>
                                            </div>
                                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                                                <p className="text-[10px] font-bold text-slate-500 uppercase">Tentative Completion</p>
                                                <p className="text-sm font-bold text-slate-900 mt-0.5">
                                                    {detail.tentativeCompletionDate ? format(new Date(detail.tentativeCompletionDate), "dd MMM yyyy") : "—"}
                                                </p>
                                            </div>
                                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                                                <p className="text-[10px] font-bold text-slate-500 uppercase">Panels New (Replace)</p>
                                                <p className="text-sm font-bold text-slate-900 mt-0.5">{detail.panelsNewReplace ?? "—"}</p>
                                            </div>
                                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                                                <p className="text-[10px] font-bold text-slate-500 uppercase">Panels Dent</p>
                                                <p className="text-sm font-bold text-slate-900 mt-0.5">{detail.panelsDent ?? "—"}</p>
                                            </div>
                                        </div>
                                    </section>
                                </div>
                            )}
                            {selectedId && !detailLoading && !detail && (
                                <div className="py-16 text-center text-slate-500">Could not load RO details.</div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}
