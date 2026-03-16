"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import DashboardLayout from "@/components/layout/dashboard-layout";
import {
    Plus,
    Pencil,
    Trash2,
    Users,
    Building2,
    ListOrdered,
    X,
    Loader2,
} from "lucide-react";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";
import { cn } from "@/lib/utils";

type Role = { id: string; name: string };
type Branch = { id: string; name: string };
type DropdownOption = { id: string; groupKey: string; label: string; value: string | null; sortOrder: number };

const OPTION_GROUPS: { key: string; label: string }[] = [
    { key: "insurance_company", label: "Insurance Company" },
    { key: "service_advisor", label: "Service Advisor" },
];

export default function DataPage() {
    const { update: updateSession } = useSession();
    const [activeTab, setActiveTab] = useState<"roles" | "branches" | "options">("roles");

    const [roles, setRoles] = useState<Role[]>([]);
    const [branches, setBranches] = useState<Branch[]>([]);
    const [options, setOptions] = useState<DropdownOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    const [roleForm, setRoleForm] = useState({ name: "" });
    const [branchForm, setBranchForm] = useState({ name: "" });
    const [optionForm, setOptionForm] = useState({ groupKey: "insurance_company", label: "", value: "", sortOrder: 0 });
    const [editingRole, setEditingRole] = useState<Role | null>(null);
    const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
    const [editingOption, setEditingOption] = useState<DropdownOption | null>(null);
    const [showRoleModal, setShowRoleModal] = useState(false);
    const [showBranchModal, setShowBranchModal] = useState(false);
    const [showOptionModal, setShowOptionModal] = useState(false);

    const [loadedRoles, setLoadedRoles] = useState(false);
    const [loadedBranches, setLoadedBranches] = useState(false);
    const [loadedOptions, setLoadedOptions] = useState(false);

    const fetchRoles = () => apiGet<Role[]>("/api/data/roles").then(setRoles).catch(() => setRoles([]));
    const fetchBranches = () => apiGet<Branch[]>("/api/data/branches").then(setBranches).catch(() => setBranches([]));
    const fetchOptions = () => apiGet<DropdownOption[]>("/api/data/options").then(setOptions).catch(() => setOptions([]));

    // Lazy-load only the active tab's data to speed up initial page load
    useEffect(() => {
        if (activeTab === "roles" && !loadedRoles) {
            setLoading(true);
            fetchRoles().finally(() => {
                setLoadedRoles(true);
                setLoading(false);
            });
        } else if (activeTab === "branches" && !loadedBranches) {
            setLoading(true);
            fetchBranches().finally(() => {
                setLoadedBranches(true);
                setLoading(false);
            });
        } else if (activeTab === "options" && !loadedOptions) {
            setLoading(true);
            fetchOptions().finally(() => {
                setLoadedOptions(true);
                setLoading(false);
            });
        } else {
            setLoading(false);
        }
    }, [activeTab, loadedRoles, loadedBranches, loadedOptions]);

    const refetch = () => {
        if (activeTab === "roles") fetchRoles();
        if (activeTab === "branches") fetchBranches();
        if (activeTab === "options") fetchOptions();
    };

    const handleSaveRole = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setSaving(true);
        try {
            if (editingRole) {
                await apiPatch(`/api/data/roles/${editingRole.id}`, { name: roleForm.name });
            } else {
                await apiPost("/api/data/roles", { name: roleForm.name });
            }
            setShowRoleModal(false);
            setEditingRole(null);
            setRoleForm({ name: "" });
            fetchRoles();
            await updateSession(); // refresh sidebar role label after rename
        } catch (err: any) {
            setError(err?.message || "Failed to save role");
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteRole = async (r: Role) => {
        setError("");
        // Optimistic UI: remove role immediately for instant feedback
        setRoles((prev) => prev.filter((role) => role.id !== r.id));
        try {
            await apiDelete(`/api/data/roles/${r.id}`);
        } catch (err: any) {
            // On error, refetch to restore correct state and show message
            fetchRoles();
            setError(err?.message || "Failed to delete role");
        }
    };

    const handleSaveBranch = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setSaving(true);
        try {
            if (editingBranch) {
                await apiPatch(`/api/data/branches/${editingBranch.id}`, { name: branchForm.name });
            } else {
                await apiPost("/api/data/branches", { name: branchForm.name });
            }
            setShowBranchModal(false);
            setEditingBranch(null);
            setBranchForm({ name: "" });
            fetchBranches();
        } catch (err: any) {
            setError(err?.message || "Failed to save branch");
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteBranch = async (b: Branch) => {
        if (!confirm(`Delete branch "${b.name}"?`)) return;
        setError("");
        try {
            await apiDelete(`/api/data/branches/${b.id}`);
            fetchBranches();
        } catch (err: any) {
            setError(err?.message || "Failed to delete branch");
        }
    };

    const handleSaveOption = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setSaving(true);
        try {
            const payload = {
                groupKey: optionForm.groupKey,
                label: optionForm.label.trim(),
                value: optionForm.value.trim() || null,
                sortOrder: optionForm.sortOrder,
            };
            if (editingOption) {
                await apiPatch(`/api/data/options/${editingOption.id}`, {
                    label: payload.label,
                    value: payload.value,
                    sortOrder: payload.sortOrder,
                });
            } else {
                await apiPost("/api/data/options", payload);
            }
            setShowOptionModal(false);
            setEditingOption(null);
            setOptionForm({ groupKey: "insurance_company", label: "", value: "", sortOrder: 0 });
            fetchOptions();
        } catch (err: any) {
            setError(err?.message || "Failed to save option");
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteOption = async (o: DropdownOption) => {
        if (!confirm(`Delete "${o.label}"?`)) return;
        setError("");
        try {
            await apiDelete(`/api/data/options/${o.id}`);
            fetchOptions();
        } catch (err: any) {
            setError(err?.message || "Failed to delete option");
        }
    };

    const openRoleEdit = (r: Role) => {
        setEditingRole(r);
        setRoleForm({ name: r.name });
        setShowRoleModal(true);
    };
    const openBranchEdit = (b: Branch) => {
        setEditingBranch(b);
        setBranchForm({ name: b.name });
        setShowBranchModal(true);
    };
    const openOptionEdit = (o: DropdownOption) => {
        setEditingOption(o);
        setOptionForm({
            groupKey: o.groupKey,
            label: o.label,
            value: o.value ?? "",
            sortOrder: o.sortOrder,
        });
        setShowOptionModal(true);
    };

    const optionsByGroup = (groupKey: string) =>
        options.filter((o) => o.groupKey === groupKey);

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Data Page</h1>
                </div>

                {error && (
                    <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-sm font-medium">
                        {error}
                    </div>
                )}

                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="flex border-b border-slate-100 bg-slate-50/50">
                        {[
                            { id: "roles" as const, label: "Roles", icon: Users },
                            { id: "branches" as const, label: "Branches", icon: Building2 },
                            { id: "options" as const, label: "Dropdown options", icon: ListOrdered },
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={cn(
                                    "flex items-center gap-2 px-6 py-4 text-sm font-bold transition-all relative",
                                    activeTab === tab.id ? "text-blue-600 bg-white border-b-2 border-blue-600" : "text-slate-500 hover:text-slate-700"
                                )}
                            >
                                <tab.icon className="w-4 h-4" />
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    <div className="p-6 min-h-[320px]">
                        {loading ? (
                            <div className="flex items-center justify-center py-12">
                                <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
                            </div>
                        ) : (
                            <>
                                {activeTab === "roles" && (
                                    <div className="space-y-4">
                                        <div className="flex justify-end">
                                            <button
                                                onClick={() => {
                                                    setEditingRole(null);
                                                    setRoleForm({ name: "" });
                                                    setShowRoleModal(true);
                                                }}
                                                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700"
                                            >
                                                <Plus className="w-4 h-4" /> Add role
                                            </button>
                                        </div>
                                        <table className="w-full text-left border-collapse">
                                            <thead>
                                                <tr className="border-b border-slate-200">
                                                    <th className="pb-3 text-xs font-bold text-slate-500 uppercase">Name</th>
                                                    <th className="pb-3 text-right text-xs font-bold text-slate-500 uppercase">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {roles.map((r) => (
                                                    <tr key={r.id} className="hover:bg-slate-50/50">
                                                        <td className="py-3 font-medium text-slate-900">{r.name}</td>
                                                        <td className="py-3 text-right">
                                                            <button onClick={() => openRoleEdit(r)} className="p-2 text-slate-400 hover:text-blue-600 rounded-lg"><Pencil className="w-4 h-4" /></button>
                                                            <button onClick={() => handleDeleteRole(r)} className="p-2 text-slate-400 hover:text-rose-600 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                        {roles.length === 0 && (
                                            <p className="text-slate-500 text-sm py-4">No roles. Add one to use in User Management.</p>
                                        )}
                                    </div>
                                )}

                                {activeTab === "branches" && (
                                    <div className="space-y-4">
                                        <div className="flex justify-end">
                                            <button
                                                onClick={() => {
                                                    setEditingBranch(null);
                                                    setBranchForm({ name: "" });
                                                    setShowBranchModal(true);
                                                }}
                                                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700"
                                            >
                                                <Plus className="w-4 h-4" /> Add branch
                                            </button>
                                        </div>
                                        <table className="w-full text-left border-collapse">
                                            <thead>
                                                <tr className="border-b border-slate-200">
                                                    <th className="pb-3 text-xs font-bold text-slate-500 uppercase">Name</th>
                                                    <th className="pb-3 text-right text-xs font-bold text-slate-500 uppercase">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {branches.map((b) => (
                                                    <tr key={b.id} className="hover:bg-slate-50/50">
                                                        <td className="py-3 font-medium text-slate-900">{b.name}</td>
                                                        <td className="py-3 text-right">
                                                            <button onClick={() => openBranchEdit(b)} className="p-2 text-slate-400 hover:text-blue-600 rounded-lg"><Pencil className="w-4 h-4" /></button>
                                                            <button onClick={() => handleDeleteBranch(b)} className="p-2 text-slate-400 hover:text-rose-600 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}

                                {activeTab === "options" && (
                                    <div className="space-y-8">
                                        {OPTION_GROUPS.map((group) => {
                                            const items = optionsByGroup(group.key);
                                            return (
                                                <div key={group.key} className="border border-slate-200 rounded-xl overflow-hidden">
                                                    <div className="bg-slate-50 px-4 py-3 flex items-center justify-between">
                                                        <span className="font-bold text-slate-800">{group.label}</span>
                                                        <button
                                                            onClick={() => {
                                                                setEditingOption(null);
                                                                setOptionForm({
                                                                    groupKey: group.key,
                                                                    label: "",
                                                                    value: "",
                                                                    sortOrder: items.length,
                                                                });
                                                                setShowOptionModal(true);
                                                            }}
                                                            className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700"
                                                        >
                                                            <Plus className="w-3.5 h-3.5" /> Add
                                                        </button>
                                                    </div>
                                                    <table className="w-full text-left border-collapse">
                                                        <thead>
                                                            <tr className="bg-slate-100/50 border-b border-slate-200">
                                                                <th className="px-4 py-2 text-xs font-bold text-slate-500 uppercase">Label</th>
                                                                <th className="px-4 py-2 text-xs font-bold text-slate-500 uppercase">Value</th>
                                                                <th className="px-4 py-2 text-xs font-bold text-slate-500 uppercase">Order</th>
                                                                <th className="px-4 py-2 text-right text-xs font-bold text-slate-500 uppercase">Actions</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-slate-100">
                                                            {items.map((o) => (
                                                                <tr key={o.id} className="hover:bg-slate-50/50">
                                                                    <td className="px-4 py-2 font-medium text-slate-900">{o.label}</td>
                                                                    <td className="px-4 py-2 text-slate-600">{o.value ?? o.label}</td>
                                                                    <td className="px-4 py-2 text-slate-500">{o.sortOrder}</td>
                                                                    <td className="px-4 py-2 text-right">
                                                                        <button onClick={() => openOptionEdit(o)} className="p-1.5 text-slate-400 hover:text-blue-600 rounded-lg"><Pencil className="w-4 h-4" /></button>
                                                                        <button onClick={() => handleDeleteOption(o)} className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                    {items.length === 0 && (
                                                        <p className="px-4 py-3 text-slate-500 text-sm">No options. Add one to show in dropdowns.</p>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Role modal */}
            {showRoleModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
                    <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold text-slate-900">{editingRole ? "Edit role" : "Add role"}</h3>
                            <button onClick={() => setShowRoleModal(false)} className="p-2 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5" /></button>
                        </div>
                        <form onSubmit={handleSaveRole} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Name</label>
                                <input
                                    value={roleForm.name}
                                    onChange={(e) => setRoleForm({ name: e.target.value })}
                                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm"
                                    placeholder="e.g. Advisor"
                                    required
                                />
                            </div>
                            <div className="flex justify-end gap-2">
                                <button type="button" onClick={() => setShowRoleModal(false)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 font-semibold">Cancel</button>
                                <button type="submit" disabled={saving} className="px-4 py-2 rounded-xl bg-blue-600 text-white font-semibold disabled:opacity-50 flex items-center gap-2">
                                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                    Save
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Branch modal */}
            {showBranchModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
                    <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold text-slate-900">{editingBranch ? "Edit branch" : "Add branch"}</h3>
                            <button onClick={() => setShowBranchModal(false)} className="p-2 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5" /></button>
                        </div>
                        <form onSubmit={handleSaveBranch} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Name</label>
                                <input
                                    value={branchForm.name}
                                    onChange={(e) => setBranchForm((f) => ({ ...f, name: e.target.value }))}
                                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm"
                                    placeholder="Branch name"
                                    required
                                />
                            </div>
                            <div className="flex justify-end gap-2">
                                <button type="button" onClick={() => setShowBranchModal(false)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 font-semibold">Cancel</button>
                                <button type="submit" disabled={saving} className="px-4 py-2 rounded-xl bg-blue-600 text-white font-semibold disabled:opacity-50 flex items-center gap-2">
                                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                    Save
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Option modal */}
            {showOptionModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
                    <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold text-slate-900">{editingOption ? "Edit option" : "Add option"}</h3>
                            <button onClick={() => setShowOptionModal(false)} className="p-2 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5" /></button>
                        </div>
                        <form onSubmit={handleSaveOption} className="space-y-4">
                            {!editingOption && (
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Group</label>
                                    <select
                                        value={optionForm.groupKey}
                                        onChange={(e) => setOptionForm((f) => ({ ...f, groupKey: e.target.value }))}
                                        className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm"
                                    >
                                        {OPTION_GROUPS.map((g) => (
                                            <option key={g.key} value={g.key}>{g.label}</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Label (shown in dropdown)</label>
                                <input
                                    value={optionForm.label}
                                    onChange={(e) => setOptionForm((f) => ({ ...f, label: e.target.value }))}
                                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm"
                                    placeholder="e.g. HDFC Ergo"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Value (optional; if empty, label is used)</label>
                                <input
                                    value={optionForm.value}
                                    onChange={(e) => setOptionForm((f) => ({ ...f, value: e.target.value }))}
                                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm"
                                    placeholder="Stored value"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Sort order</label>
                                <input
                                    type="number"
                                    value={optionForm.sortOrder}
                                    onChange={(e) => setOptionForm((f) => ({ ...f, sortOrder: parseInt(e.target.value, 10) || 0 }))}
                                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm"
                                />
                            </div>
                            <div className="flex justify-end gap-2">
                                <button type="button" onClick={() => setShowOptionModal(false)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 font-semibold">Cancel</button>
                                <button type="submit" disabled={saving} className="px-4 py-2 rounded-xl bg-blue-600 text-white font-semibold disabled:opacity-50 flex items-center gap-2">
                                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                    Save
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </DashboardLayout>
    );
}
