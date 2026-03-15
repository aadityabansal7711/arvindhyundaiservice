"use client";

import { useState, useEffect, useRef } from "react";
import DashboardLayout from "@/components/layout/dashboard-layout";
import { Filter, Download, Search, Wrench, Plus, Pencil, X } from "lucide-react";
import { apiGet, apiPatch } from "@/lib/api";
import { format } from "date-fns";

type RO = {
    id: string;
    roNo: string;
    vehicleInDate: string;
    currentStatus: string;
    workStartDate: string | null;
    tentativeCompletionDate: string | null;
    panelsNewReplace: number | null;
    panelsDent: number | null;
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

export default function WorkRegisterPage() {
    const [searchTerm, setSearchTerm] = useState("");
    const [ros, setRos] = useState<RO[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [editingRo, setEditingRo] = useState<RO | null>(null);
    const [form, setForm] = useState({
        workStartDate: "",
        tentativeCompletionDate: "",
        panelsNewReplace: "",
        panelsDent: "",
    });
    const [saving, setSaving] = useState(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const fetchROs = async () => {
        setIsLoading(true);
        try {
            const data = await apiGet<RO[]>(
                `/api/ro?search=${encodeURIComponent(searchTerm)}&limit=200`
            );
            setRos(data);
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

    const hasApprovalFilled = (ro: RO) => {
        const s = ro.survey;
        return !!(s?.surveyorName && s?.surveyDate != null && s?.approvalDate != null);
    };

    const workList = ros.filter(hasApprovalFilled);
    const filteredList = searchTerm.trim()
        ? workList.filter((ro) => ro.roNo.toLowerCase().includes(searchTerm.toLowerCase()))
        : workList;

    const openEdit = (ro: RO) => {
        setEditingRo(ro);
        setForm({
            workStartDate: ro.workStartDate ? format(new Date(ro.workStartDate), "yyyy-MM-dd") : "",
            tentativeCompletionDate: ro.tentativeCompletionDate ? format(new Date(ro.tentativeCompletionDate), "yyyy-MM-dd") : "",
            panelsNewReplace: ro.panelsNewReplace != null ? String(ro.panelsNewReplace) : "",
            panelsDent: ro.panelsDent != null ? String(ro.panelsDent) : "",
        });
    };

    const closeEdit = () => {
        setEditingRo(null);
        setForm({ workStartDate: "", tentativeCompletionDate: "", panelsNewReplace: "", panelsDent: "" });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingRo) return;
        setSaving(true);
        try {
            await apiPatch(`/api/ro/${editingRo.id}`, {
                workStartDate: form.workStartDate || null,
                tentativeCompletionDate: form.tentativeCompletionDate || null,
                panelsNewReplace: form.panelsNewReplace !== "" ? Number(form.panelsNewReplace) : null,
                panelsDent: form.panelsDent !== "" ? Number(form.panelsDent) : null,
            });
            closeEdit();
            fetchROs();
        } catch (err) {
            console.error(err);
        } finally {
            setSaving(false);
        }
    };

    const hasWorkFilled = (ro: RO) =>
        ro.workStartDate != null &&
        ro.tentativeCompletionDate != null &&
        ro.panelsNewReplace != null &&
        ro.panelsDent != null;

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Work Register</h1>
                        <p className="text-slate-500 mt-1 text-sm sm:text-base">Track work orders, job cards and workshop progress.</p>
                    </div>
                    <div className="flex items-center gap-2 sm:gap-3">
                        <button className="flex items-center gap-2 px-3 py-2.5 sm:px-4 sm:py-2 min-h-[44px] sm:min-h-0 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-semibold transition-all touch-manipulation">
                            <Download className="w-4 h-4" />
                            Export
                        </button>
                    </div>
                </div>

                <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-3 sm:gap-4 items-center">
                    <div className="relative flex-1 w-full">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                            placeholder="Search by RO no, job type, bay..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white transition-all"
                        />
                    </div>
                    <button className="p-3 sm:p-2.5 min-h-[44px] sm:min-h-0 bg-slate-50 border border-slate-200 rounded-xl text-slate-500 hover:bg-slate-100 transition-all touch-manipulation">
                        <Filter className="w-5 h-5" />
                    </button>
                </div>

                {/* Mobile: card list */}
                <div className="md:hidden space-y-3">
                    {isLoading ? (
                        Array.from({ length: 4 }).map((_, i) => (
                            <div key={i} className="animate-pulse bg-white rounded-2xl border border-slate-200 p-4">
                                <div className="h-4 bg-slate-100 rounded w-1/3 mb-3" />
                                <div className="h-3 bg-slate-100 rounded w-full mb-2" />
                                <div className="h-3 bg-slate-100 rounded w-2/3" />
                            </div>
                        ))
                    ) : filteredList.length === 0 ? (
                        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
                            <div className="flex flex-col items-center justify-center space-y-2 opacity-40">
                                <Wrench className="w-12 h-12" />
                                <p className="font-medium">No work entries in register</p>
                                <p className="text-sm text-slate-500">Fill approval details in Approval Register first; then add work dates and panels here.</p>
                            </div>
                        </div>
                    ) : (
                        filteredList.map((ro) => (
                            <div key={ro.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                                <div className="flex justify-between items-start gap-2">
                                    <span className="font-semibold text-slate-900">{ro.roNo}</span>
                                    <span className={hasWorkFilled(ro) ? "text-emerald-600 text-sm font-medium" : "text-amber-600 text-sm"}>
                                        {hasWorkFilled(ro) ? "Filled" : "Pending"}
                                    </span>
                                </div>
                                <p className="text-sm text-slate-700 mt-1">
                                    Start: {ro.workStartDate ? format(new Date(ro.workStartDate), "dd MMM yyyy") : "—"}
                                </p>
                                <p className="text-sm text-slate-700">Completion: {ro.tentativeCompletionDate ? format(new Date(ro.tentativeCompletionDate), "dd MMM yyyy") : "—"}</p>
                                <p className="text-xs text-slate-500 mt-0.5">Panels replace: {ro.panelsNewReplace ?? "—"} · Dent: {ro.panelsDent ?? "—"}</p>
                                <button
                                    onClick={() => openEdit(ro)}
                                    className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 px-3 text-sm font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors touch-manipulation min-h-[44px]"
                                >
                                    {hasWorkFilled(ro) ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                                    {hasWorkFilled(ro) ? "Edit" : "Add"}
                                </button>
                            </div>
                        ))
                    )}
                </div>

                {/* Desktop: table */}
                <div className="hidden md:block bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden min-h-[400px]">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-200">
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">RO No</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Start Date</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Tentative Completion</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Panels New (Replace)</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Panels Dent</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Status</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {isLoading ? (
                                    <tr>
                                        <td colSpan={7} className="px-6 py-12 text-center text-slate-500">Loading...</td>
                                    </tr>
                                ) : filteredList.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="px-6 py-12 text-center">
                                            <div className="flex flex-col items-center justify-center space-y-2 opacity-40">
                                                <Wrench className="w-12 h-12" />
                                                <p className="font-medium">No work entries in register</p>
                                                <p className="text-sm text-slate-500">Fill approval details in Approval Register first; then add work dates and panels here.</p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    filteredList.map((ro) => (
                                        <tr key={ro.id} className="hover:bg-slate-50/50">
                                            <td className="px-6 py-3 text-sm font-medium text-slate-900">{ro.roNo}</td>
                                            <td className="px-6 py-3 text-sm text-slate-700">
                                                {ro.workStartDate ? format(new Date(ro.workStartDate), "dd MMM yyyy") : "—"}
                                            </td>
                                            <td className="px-6 py-3 text-sm text-slate-700">
                                                {ro.tentativeCompletionDate ? format(new Date(ro.tentativeCompletionDate), "dd MMM yyyy") : "—"}
                                            </td>
                                            <td className="px-6 py-3 text-sm text-slate-700">{ro.panelsNewReplace ?? "—"}</td>
                                            <td className="px-6 py-3 text-sm text-slate-700">{ro.panelsDent ?? "—"}</td>
                                            <td className="px-6 py-3 text-sm">
                                                <span className={hasWorkFilled(ro) ? "text-emerald-600 font-medium" : "text-amber-600"}>
                                                    {hasWorkFilled(ro) ? "Filled" : "Pending"}
                                                </span>
                                            </td>
                                            <td className="px-6 py-3">
                                                <button
                                                    onClick={() => openEdit(ro)}
                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                >
                                                    {hasWorkFilled(ro) ? <Pencil className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                                                    {hasWorkFilled(ro) ? "Edit" : "Add"}
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {editingRo && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/40" onClick={closeEdit}>
                    <div
                        className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl border border-slate-200 w-full max-w-md max-h-[90vh] overflow-y-auto p-4 sm:p-6 safe-bottom"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-base sm:text-lg font-bold text-slate-900 pr-2">
                                {hasWorkFilled(editingRo) ? "Edit" : "Add"} work — {editingRo.roNo}
                            </h2>
                            <button type="button" onClick={closeEdit} aria-label="Close" className="p-2.5 -mr-1 text-slate-400 hover:text-slate-600 rounded-lg touch-manipulation">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Start Date</label>
                                <input
                                    type="date"
                                    value={form.workStartDate}
                                    onChange={(e) => setForm((f) => ({ ...f, workStartDate: e.target.value }))}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Tentative Completion Date</label>
                                <input
                                    type="date"
                                    value={form.tentativeCompletionDate}
                                    onChange={(e) => setForm((f) => ({ ...f, tentativeCompletionDate: e.target.value }))}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">No of panels new to be replaced</label>
                                <input
                                    type="number"
                                    min={0}
                                    value={form.panelsNewReplace}
                                    onChange={(e) => setForm((f) => ({ ...f, panelsNewReplace: e.target.value }))}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">No of panels to be dented</label>
                                <input
                                    type="number"
                                    min={0}
                                    value={form.panelsDent}
                                    onChange={(e) => setForm((f) => ({ ...f, panelsDent: e.target.value }))}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                />
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={closeEdit}
                                    className="flex-1 px-4 py-3 min-h-[44px] border border-slate-200 text-slate-700 rounded-xl text-sm font-semibold hover:bg-slate-50 touch-manipulation"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="flex-1 px-4 py-3 min-h-[44px] bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 touch-manipulation"
                                >
                                    {saving ? "Saving..." : "Save"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </DashboardLayout>
    );
}
