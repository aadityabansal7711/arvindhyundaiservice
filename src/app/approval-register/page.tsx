"use client";

import { useState, useEffect, useRef } from "react";
import DashboardLayout from "@/components/layout/dashboard-layout";
import { Filter, Download, Search, CheckSquare, Plus, Pencil, X } from "lucide-react";
import { apiGet, apiPatch } from "@/lib/api";
import { format } from "date-fns";

type RO = {
    id: string;
    roNo: string;
    vehicleInDate: string;
    currentStatus: string;
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

export default function ApprovalRegisterPage() {
    const [searchTerm, setSearchTerm] = useState("");
    const [ros, setRos] = useState<RO[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [editingRo, setEditingRo] = useState<RO | null>(null);
    const [form, setForm] = useState({ surveyorName: "", surveyDate: "", approvalDate: "" });
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

    const hasClaimFilled = (ro: RO) => {
        const c = ro.insuranceClaim;
        return !!(c?.claimNo && c?.claimIntimationDate != null);
    };

    const approvalList = ros.filter(hasClaimFilled);
    const filteredList = searchTerm.trim()
        ? approvalList.filter(
            (ro) =>
                ro.roNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
                ro.survey?.surveyorName?.toLowerCase().includes(searchTerm.toLowerCase())
        )
        : approvalList;

    const openEdit = (ro: RO) => {
        const s = ro.survey;
        setEditingRo(ro);
        setForm({
            surveyorName: s?.surveyorName ?? "",
            surveyDate: s?.surveyDate ? format(new Date(s.surveyDate), "yyyy-MM-dd") : "",
            approvalDate: s?.approvalDate ? format(new Date(s.approvalDate), "yyyy-MM-dd") : "",
        });
    };

    const closeEdit = () => {
        setEditingRo(null);
        setForm({ surveyorName: "", surveyDate: "", approvalDate: "" });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingRo) return;
        setSaving(true);
        try {
            await apiPatch(`/api/ro/${editingRo.id}`, {
                survey: {
                    surveyorName: form.surveyorName.trim() || null,
                    surveyDate: form.surveyDate || null,
                    approvalDate: form.approvalDate || null,
                },
            });
            closeEdit();
            fetchROs();
        } catch (err) {
            console.error(err);
        } finally {
            setSaving(false);
        }
    };

    const hasApprovalFilled = (ro: RO) => {
        const s = ro.survey;
        return !!(s?.surveyorName && s?.surveyDate != null && s?.approvalDate != null);
    };

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Approval Register</h1>
                        <p className="text-slate-500 mt-1">View and track survey and estimate approvals.</p>
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
                            placeholder="Search by RO no, approver, date..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white transition-all"
                        />
                    </div>
                    <button className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-500 hover:bg-slate-100 transition-all">
                        <Filter className="w-5 h-5" />
                    </button>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden min-h-[400px]">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-200">
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">RO No</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Surveyor Name</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Survey Date</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Approval Date</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Status</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {isLoading ? (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-12 text-center text-slate-500">Loading...</td>
                                    </tr>
                                ) : filteredList.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-12 text-center">
                                            <div className="flex flex-col items-center justify-center space-y-2 opacity-40">
                                                <CheckSquare className="w-12 h-12" />
                                                <p className="font-medium">No approvals in register</p>
                                                <p className="text-sm text-slate-500">Fill claim details in Claim Register first; then add survey/approval here.</p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    filteredList.map((ro) => (
                                        <tr key={ro.id} className="hover:bg-slate-50/50">
                                            <td className="px-6 py-3 text-sm font-medium text-slate-900">{ro.roNo}</td>
                                            <td className="px-6 py-3 text-sm text-slate-700">{ro.survey?.surveyorName ?? "—"}</td>
                                            <td className="px-6 py-3 text-sm text-slate-700">
                                                {ro.survey?.surveyDate
                                                    ? format(new Date(ro.survey.surveyDate), "dd MMM yyyy")
                                                    : "—"}
                                            </td>
                                            <td className="px-6 py-3 text-sm text-slate-700">
                                                {ro.survey?.approvalDate
                                                    ? format(new Date(ro.survey.approvalDate), "dd MMM yyyy")
                                                    : "—"}
                                            </td>
                                            <td className="px-6 py-3 text-sm">
                                                <span className={hasApprovalFilled(ro) ? "text-emerald-600 font-medium" : "text-amber-600"}>
                                                    {hasApprovalFilled(ro) ? "Filled" : "Pending"}
                                                </span>
                                            </td>
                                            <td className="px-6 py-3">
                                                <button
                                                    onClick={() => openEdit(ro)}
                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                >
                                                    {hasApprovalFilled(ro) ? <Pencil className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                                                    {hasApprovalFilled(ro) ? "Edit" : "Add"}
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
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={closeEdit}>
                    <div
                        className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md p-6"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-bold text-slate-900">
                                {hasApprovalFilled(editingRo) ? "Edit" : "Add"} approval — {editingRo.roNo}
                            </h2>
                            <button onClick={closeEdit} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Surveyor Name</label>
                                <input
                                    type="text"
                                    value={form.surveyorName}
                                    onChange={(e) => setForm((f) => ({ ...f, surveyorName: e.target.value }))}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                    placeholder="Surveyor name"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Survey Date</label>
                                <input
                                    type="date"
                                    value={form.surveyDate}
                                    onChange={(e) => setForm((f) => ({ ...f, surveyDate: e.target.value }))}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Approval Date</label>
                                <input
                                    type="date"
                                    value={form.approvalDate}
                                    onChange={(e) => setForm((f) => ({ ...f, approvalDate: e.target.value }))}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                />
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={closeEdit}
                                    className="flex-1 px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-sm font-semibold hover:bg-slate-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
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
