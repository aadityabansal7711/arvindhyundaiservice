"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import DashboardLayout from "@/components/layout/dashboard-layout";
import {
    Shield,
    Package,
    Receipt,
    MessageSquare,
    History,
    ArrowLeft,
    Calendar,
    User,
    CheckCircle2,
    Clock
} from "lucide-react";
import { apiGet } from "@/lib/api";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

export default function RODetailPage() {
    const { id } = useParams();
    const [ro, setRo] = useState<any>(null);
    const [activeTab, setActiveTab] = useState("claim");
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchRO = async () => {
            try {
                const data = await apiGet<any>(`/api/ro/${id}`);
                setRo(data);
            } catch (err) {
                if ((err as Error)?.message !== "Unauthorized") console.error(err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchRO();
    }, [id]);

    if (isLoading) return <DashboardLayout><div className="flex items-center justify-center h-full text-slate-400">Loading RO details...</div></DashboardLayout>;
    if (!ro) return <DashboardLayout><div className="text-center py-20 text-slate-500 font-bold">RO Not Found</div></DashboardLayout>;

    return (
        <DashboardLayout>
            <div className="space-y-6 max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                    <div className="space-y-1">
                        <button onClick={() => window.history.back()} className="flex items-center gap-1 text-xs font-bold text-slate-400 hover:text-blue-600 mb-2 transition-colors">
                            <ArrowLeft className="w-3 h-3" /> Back to Register
                        </button>
                        <h1 className="text-3xl font-bold text-slate-900 tracking-tighter flex items-center gap-3">
                            {ro.roNo}
                            <span className="text-sm px-3 py-1 bg-blue-50 text-blue-600 rounded-full font-bold uppercase tracking-widest">{ro.currentStatus}</span>
                        </h1>
                        <p className="text-slate-500 font-medium">{ro.vehicle.registrationNo} • {ro.vehicle.model} • {ro.vehicle.customer.name}</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <button className="px-5 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-bold shadow-xl shadow-slate-900/10 hover:bg-slate-800 transition-all">
                            Update Status
                        </button>
                    </div>
                </div>

                {/* Info Grid */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {[
                        { label: "Vehicle In", value: format(new Date(ro.vehicleInDate), "dd MMM yyyy"), icon: Calendar },
                        { label: "Promised Date", value: ro.committedDeliveryDate ? format(new Date(ro.committedDeliveryDate), "dd MMM yyyy") : "TBD", icon: Clock },
                        { label: "Advisor", value: ro.serviceAdvisorName ?? ro.advisor?.name ?? "Unassigned", icon: User },
                        { label: "Insurance", value: ro.insuranceClaim?.insuranceCompany || "OWNER CASH", icon: Shield },
                    ].map((item, i) => (
                        <div key={i} className="bg-white p-4 rounded-xl border border-slate-200 flex items-center gap-3">
                            <div className="w-10 h-10 bg-slate-50 rounded-lg flex items-center justify-center text-slate-400">
                                <item.icon className="w-5 h-5" />
                            </div>
                            <div>
                                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{item.label}</p>
                                <p className="text-sm font-bold text-slate-900">{item.value}</p>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Tabs */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden min-h-[500px] flex flex-col">
                    <div className="flex border-b border-slate-100 px-2 bg-slate-50/50">
                        {[
                            { id: "claim", label: "Claim & Survey", icon: Shield },
                            { id: "parts", label: "Parts Tracking", icon: Package },
                            { id: "billing", label: "Billing & DO", icon: Receipt },
                            { id: "notes", label: "Work Notes", icon: MessageSquare },
                            { id: "timeline", label: "Timeline", icon: History },
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={cn(
                                    "flex items-center gap-2 px-6 py-4 text-sm font-bold transition-all relative",
                                    activeTab === tab.id
                                        ? "text-blue-600"
                                        : "text-slate-400 hover:text-slate-600"
                                )}
                            >
                                <tab.icon className="w-4 h-4" />
                                {tab.label}
                                {activeTab === tab.id && (
                                    <div className="absolute bottom-0 left-0 w-full h-1 bg-blue-600 rounded-t-full" />
                                )}
                            </button>
                        ))}
                    </div>

                    <div className="p-8 flex-1">
                        {activeTab === "claim" && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                                <div className="space-y-6">
                                    <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                                        <Shield className="w-5 h-5 text-blue-600" /> Insurance Claim
                                    </h3>
                                    <div className="grid grid-cols-2 gap-y-6">
                                        <div>
                                            <p className="text-xs font-bold text-slate-500 uppercase">Policy Number</p>
                                            <p className="text-sm font-semibold mt-1">{ro.insuranceClaim?.policyNo || "N/A"}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs font-bold text-slate-500 uppercase">Claim Number</p>
                                            <p className="text-sm font-semibold mt-1">{ro.insuranceClaim?.claimNo || "N/A"}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs font-bold text-slate-500 uppercase">Intimation Date</p>
                                            <p className="text-sm font-semibold mt-1">{ro.insuranceClaim?.claimIntimationDate ? format(new Date(ro.insuranceClaim.claimIntimationDate), "dd MMM yyyy") : "N/A"}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs font-bold text-slate-500 uppercase">HAP Status</p>
                                            <span className={cn("inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold", ro.insuranceClaim?.hapFlag ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600")}>
                                                {ro.insuranceClaim?.hapFlag ? "HAP" : "NON-HAP"}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div className="space-y-6 border-t md:border-t-0 md:border-l border-slate-100 md:pl-12 pt-6 md:pt-0">
                                    <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                                        <CheckCircle2 className="w-5 h-5 text-emerald-600" /> Survey Details
                                    </h3>
                                    <div className="grid grid-cols-2 gap-y-6">
                                        <div>
                                            <p className="text-xs font-bold text-slate-500 uppercase">Surveyor Name</p>
                                            <p className="text-sm font-semibold mt-1">{ro.survey?.surveyorName || "Pending"}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs font-bold text-slate-500 uppercase">Survey Date</p>
                                            <p className="text-sm font-semibold mt-1">{ro.survey?.surveyDate ? format(new Date(ro.survey.surveyDate), "dd MMM yyyy") : "Pending"}</p>
                                        </div>
                                        <div className="col-span-2">
                                            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                                                <p className="text-xs font-bold text-slate-500 uppercase mb-2">Approval Status</p>
                                                <div className="flex items-center gap-3">
                                                    {ro.survey?.approvalDate ? (
                                                        <>
                                                            <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600"><CheckCircle2 className="w-5 h-5" /></div>
                                                            <div>
                                                                <p className="text-sm font-bold text-emerald-700 italic">Approved on {format(new Date(ro.survey.approvalDate), "dd MMM yyyy")}</p>
                                                            </div>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-600"><Clock className="w-5 h-5" /></div>
                                                            <p className="text-sm font-bold text-amber-600 italic">Awaiting Approval</p>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                        {/* Remaining tabs would have similar premium layouts */}
                        <div className="text-slate-400 text-center py-20 italic">
                            {activeTab !== "claim" && `Content for ${activeTab} view will appear here.`}
                        </div>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}

