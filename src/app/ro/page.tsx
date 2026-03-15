"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import DashboardLayout from "@/components/layout/dashboard-layout";
import {
    Plus,
    Download,
    Search,
    ClipboardList
} from "lucide-react";
import { apiGet } from "@/lib/api";
import { format } from "date-fns";

export default function RORegisterPage() {
    const [ros, setRos] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const initialMount = useRef(true);

    const fetchROs = async () => {
        setIsLoading(true);
        try {
            const data = await apiGet<any[]>(`/api/ro?search=${encodeURIComponent(searchTerm)}&limit=80`);
            setRos(data);
        } catch (err) {
            if ((err as Error)?.message !== "Unauthorized") console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (initialMount.current) {
            initialMount.current = false;
            fetchROs();
            return;
        }
        const delayDebounce = setTimeout(() => fetchROs(), 300);
        return () => clearTimeout(delayDebounce);
    }, [searchTerm]);

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-xl sm:text-2xl font-bold text-black tracking-tight">RO Register</h1>
                        <p className="text-slate-600 mt-1 text-sm sm:text-base">Manage and track all repair orders in real-time.</p>
                    </div>
                    <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                        <button className="flex items-center gap-2 px-3 py-2.5 sm:px-4 sm:py-2 min-h-[44px] sm:min-h-0 bg-slate-100 hover:bg-slate-200 text-black rounded-xl text-sm font-semibold transition-all touch-manipulation">
                            <Download className="w-4 h-4" />
                            Export
                        </button>
                        <Link href="/ro/new" className="flex items-center gap-2 px-3 py-2.5 sm:px-4 sm:py-2 min-h-[44px] sm:min-h-0 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold shadow-lg shadow-blue-600/20 transition-all touch-manipulation">
                            <Plus className="w-4 h-4" />
                            New RO
                        </Link>
                    </div>
                </div>

                <div className="bg-white p-2 rounded-2xl border border-slate-200 shadow-sm w-full sm:w-fit">
                    <div className="relative w-full max-w-md">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                            placeholder="Search RO, Reg No, Customer..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-black placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white transition-all"
                        />
                    </div>
                </div>

                {/* Mobile: card list */}
                <div className="md:hidden space-y-3">
                    {isLoading ? (
                        Array.from({ length: 5 }).map((_, i) => (
                            <div key={i} className="animate-pulse bg-white rounded-2xl border border-slate-200 p-4">
                                <div className="h-4 bg-slate-100 rounded w-1/3 mb-3" />
                                <div className="h-3 bg-slate-100 rounded w-full mb-2" />
                                <div className="h-3 bg-slate-100 rounded w-2/3" />
                            </div>
                        ))
                    ) : ros.length === 0 ? (
                        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
                            <div className="flex flex-col items-center justify-center space-y-2 opacity-40">
                                <ClipboardList className="w-12 h-12 text-black" />
                                <p className="font-medium text-black">No repair orders found</p>
                            </div>
                        </div>
                    ) : (
                        ros.map((ro) => (
                            <Link
                                key={ro.id}
                                href={`/ro/${ro.id}`}
                                className="block bg-white rounded-2xl border border-slate-200 shadow-sm p-4 active:bg-slate-50 transition-colors touch-manipulation"
                            >
                                <div className="flex justify-between items-start gap-2">
                                    <span className="font-semibold text-black">{ro.roNo}</span>
                                    <span className="text-xs text-slate-500 shrink-0">{format(new Date(ro.vehicleInDate), "dd MMM yyyy")}</span>
                                </div>
                                <p className="text-sm font-medium text-slate-800 uppercase mt-1">{ro.vehicle?.registrationNo ?? "—"}</p>
                                <p className="text-sm text-slate-600 mt-0.5">{ro.vehicle?.model ?? "—"}</p>
                                <p className="text-sm text-slate-700 mt-1 truncate">{ro.vehicle?.customer?.name ?? "—"}</p>
                                <p className="text-xs text-slate-500 mt-0.5">{ro.insuranceClaim?.insuranceCompany || "OWNER CASH"}</p>
                            </Link>
                        ))
                    )}
                </div>

                {/* Desktop: table */}
                <div className="hidden md:block bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-200">
                                    <th className="px-4 py-3 text-xs font-bold text-black uppercase tracking-widest whitespace-nowrap">R/O NO</th>
                                    <th className="px-4 py-3 text-xs font-bold text-black uppercase tracking-widest whitespace-nowrap">R/O DATE</th>
                                    <th className="px-4 py-3 text-xs font-bold text-black uppercase tracking-widest whitespace-nowrap">REGISTRATION NO</th>
                                    <th className="px-4 py-3 text-xs font-bold text-black uppercase tracking-widest whitespace-nowrap">MODEL</th>
                                    <th className="px-4 py-3 text-xs font-bold text-black uppercase tracking-widest whitespace-nowrap">CUSTOMER NAME</th>
                                    <th className="px-4 py-3 text-xs font-bold text-black uppercase tracking-widest whitespace-nowrap">MOBILE</th>
                                    <th className="px-4 py-3 text-xs font-bold text-black uppercase tracking-widest whitespace-nowrap">INSURANCE COMPANY NAME</th>
                                    <th className="px-4 py-3 text-xs font-bold text-black uppercase tracking-widest whitespace-nowrap">SERVICE ADVISOR</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {isLoading ? (
                                    Array.from({ length: 5 }).map((_, i) => (
                                        <tr key={i} className="animate-pulse">
                                            <td colSpan={8} className="px-4 py-6"><div className="h-4 bg-slate-100 rounded w-full"></div></td>
                                        </tr>
                                    ))
                                ) : ros.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} className="px-4 py-12 text-center">
                                            <div className="flex flex-col items-center justify-center space-y-2 opacity-40">
                                                <ClipboardList className="w-12 h-12 text-black" />
                                                <p className="font-medium text-black">No repair orders found</p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    ros.map((ro) => (
                                        <tr key={ro.id} className="hover:bg-slate-50/50 transition-colors">
                                            <td className="px-4 py-3 text-sm font-semibold text-black whitespace-nowrap">{ro.roNo}</td>
                                            <td className="px-4 py-3 text-sm text-black whitespace-nowrap">{format(new Date(ro.vehicleInDate), "dd MMM yyyy")}</td>
                                            <td className="px-4 py-3 text-sm font-medium text-black uppercase whitespace-nowrap">{ro.vehicle?.registrationNo ?? "—"}</td>
                                            <td className="px-4 py-3 text-sm text-black whitespace-nowrap">{ro.vehicle?.model ?? "—"}</td>
                                            <td className="px-4 py-3 text-sm text-black whitespace-nowrap">{ro.vehicle?.customer?.name ?? "—"}</td>
                                            <td className="px-4 py-3 text-sm text-black whitespace-nowrap">{ro.vehicle?.customer?.mobile ?? "—"}</td>
                                            <td className="px-4 py-3 text-sm text-black whitespace-nowrap">{ro.insuranceClaim?.insuranceCompany || "OWNER CASH"}</td>
                                            <td className="px-4 py-3 text-sm text-black whitespace-nowrap">{ro.serviceAdvisorName ?? ro.advisor?.name ?? "—"}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}

