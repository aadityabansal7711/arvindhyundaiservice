"use client";

import { useState, useEffect } from "react";
import DashboardLayout from "@/components/layout/dashboard-layout";
import { UserPlus, Shield, Edit2, Trash2, Search, X, Upload } from "lucide-react";
import { apiGet, apiPatch, apiPost, apiDelete } from "@/lib/api";
import { cn } from "@/lib/utils";

type UserRow = {
    id: string;
    name: string;
    email: string;
    active: boolean;
    role: { id: string; name: string };
    branch?: { id: string; name: string } | null;
    branchId?: string | null;
    branches?: { branchId: string }[];
};

type Role = { id: string; name: string };
type Branch = { id: string; name: string };
type BulkAdvisorRow = { label: string; branchName: string };
type AdvisorOption = {
    id: string;
    label: string;
    value?: string | null;
    branchId?: string | null;
    branch?: { id: string; name: string } | null;
};

export default function UserManagementPage() {
    const [users, setUsers] = useState<UserRow[]>([]);
    const [advisors, setAdvisors] = useState<AdvisorOption[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [view, setView] = useState<"all" | "advisors">("all");
    const [editingUser, setEditingUser] = useState<UserRow | null>(null);
    const [editForm, setEditForm] = useState({
        name: "",
        roleId: "",
        branchIds: [] as string[],
        active: true,
    });
    const [editSaving, setEditSaving] = useState(false);
    const [editError, setEditError] = useState("");
    const [metadata, setMetadata] = useState<{ roles: Role[]; branches: Branch[] } | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [showAddModal, setShowAddModal] = useState(false);
    const [addForm, setAddForm] = useState({
        name: "",
        email: "",
        roleId: "",
        branchIds: [] as string[],
    });
    const [addSaving, setAddSaving] = useState(false);
    const [addError, setAddError] = useState("");
    const [showBulkAdvisorModal, setShowBulkAdvisorModal] = useState(false);
    const [bulkAdvisorText, setBulkAdvisorText] = useState("");
    const [bulkSaving, setBulkSaving] = useState(false);
    const [bulkResult, setBulkResult] = useState<null | {
        created: number;
        failed: Array<{ row: number; label: string; reason: string }>;
    }>(null);
    const [bulkError, setBulkError] = useState("");
    const [showAdvisorModal, setShowAdvisorModal] = useState(false);
    const [editingAdvisor, setEditingAdvisor] = useState<AdvisorOption | null>(null);
    const [advisorForm, setAdvisorForm] = useState({ label: "", branchId: "" });
    const [advisorSaving, setAdvisorSaving] = useState(false);
    const [advisorError, setAdvisorError] = useState("");

    const fetchUsers = async () => {
        try {
            const data = await apiGet<UserRow[]>("/api/admin/users");
            setUsers(data);
        } catch (err) {
            if ((err as Error)?.message !== "Unauthorized") console.error(err);
        } finally {
            setIsLoading(false);
        }
    };
    const fetchAdvisors = async () => {
        try {
            const data = await apiGet<AdvisorOption[]>("/api/data/options/service-advisors");
            setAdvisors(data);
        } catch (err) {
            if ((err as Error)?.message !== "Unauthorized") console.error(err);
        }
    };

    useEffect(() => {
        fetchUsers();
        fetchAdvisors();
        apiGet<{ roles: Role[]; branches: Branch[] }>("/api/admin/metadata")
            .then(setMetadata)
            .catch(() => setMetadata({ roles: [], branches: [] }));
    }, []);

    useEffect(() => {
        if (!editingUser) return;
        setEditForm({
            name: editingUser.name,
            roleId: editingUser.role.id,
            branchIds:
                (editingUser.branches?.map((b) => b.branchId).filter(Boolean) as string[]) ??
                ((editingUser.branchId ?? editingUser.branch?.id) ? [String(editingUser.branchId ?? editingUser.branch?.id)] : []),
            active: editingUser.active,
        });
        setEditError("");
    }, [editingUser]);

    const handleEditClick = (u: UserRow) => {
        setEditingUser(u);
    };

    const handleEditSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingUser) return;
        if (!editForm.branchIds || editForm.branchIds.length === 0) {
            setEditError("At least one branch must be selected.");
            return;
        }
        setEditSaving(true);
        setEditError("");
        try {
            await apiPatch(`/api/admin/users/${editingUser.id}`, {
                name: editForm.name.trim(),
                roleId: editForm.roleId,
                branchIds: editForm.branchIds,
                active: editForm.active,
            });
            setEditingUser(null);
            await fetchUsers();
        } catch (err: any) {
            setEditError(err?.message ?? "Failed to update user");
        } finally {
            setEditSaving(false);
        }
    };

    const handleDeleteClick = async (u: UserRow) => {
        if (!confirm(`Delete user "${u.name}" (${u.email})? This cannot be undone.`)) return;
        setDeletingId(u.id);
        try {
            await apiDelete(`/api/admin/users/${u.id}`);
            await fetchUsers();
        } catch (err: any) {
            alert(err?.message ?? "Failed to delete user");
        } finally {
            setDeletingId(null);
        }
    };

    const handleAddOpen = () => {
        setAddForm({
            name: "",
            email: "",
            roleId: metadata?.roles?.[0]?.id ?? "",
            branchIds: metadata?.branches?.[0]?.id ? [metadata.branches[0].id] : [],
        });
        setAddError("");
        setShowAddModal(true);
    };

    const handleAddSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!addForm.branchIds || addForm.branchIds.length === 0) {
            setAddError("At least one branch must be selected.");
            return;
        }
        setAddSaving(true);
        setAddError("");
        try {
            await apiPost("/api/admin/users", {
                name: addForm.name.trim(),
                email: addForm.email.trim(),
                roleId: addForm.roleId || undefined,
                branchIds: addForm.branchIds,
            });
            setShowAddModal(false);
            await fetchUsers();
        } catch (err: any) {
            setAddError(err?.message ?? "Failed to create user");
        } finally {
            setAddSaving(false);
        }
    };

    const openAddAdvisor = () => {
        setEditingAdvisor(null);
        setAdvisorForm({ label: "", branchId: metadata?.branches?.[0]?.id ?? "" });
        setAdvisorError("");
        setShowAdvisorModal(true);
    };

    const openEditAdvisor = (advisor: AdvisorOption) => {
        setEditingAdvisor(advisor);
        setAdvisorForm({ label: advisor.label ?? "", branchId: advisor.branchId ?? "" });
        setAdvisorError("");
        setShowAdvisorModal(true);
    };

    const handleSaveAdvisor = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!advisorForm.label.trim() || !advisorForm.branchId.trim()) {
            setAdvisorError("Advisor name and branch are required.");
            return;
        }
        setAdvisorSaving(true);
        setAdvisorError("");
        try {
            if (editingAdvisor) {
                await apiPatch(`/api/data/options/${editingAdvisor.id}`, {
                    label: advisorForm.label.trim(),
                    value: advisorForm.label.trim(),
                    branchId: advisorForm.branchId.trim(),
                });
            } else {
                await apiPost("/api/data/options", {
                    groupKey: "service_advisor",
                    label: advisorForm.label.trim(),
                    value: advisorForm.label.trim(),
                    branchId: advisorForm.branchId.trim(),
                });
            }
            setShowAdvisorModal(false);
            await fetchAdvisors();
        } catch (err: any) {
            setAdvisorError(err?.message ?? "Failed to save advisor");
        } finally {
            setAdvisorSaving(false);
        }
    };

    const handleDeleteAdvisor = async (advisor: AdvisorOption) => {
        if (!confirm(`Delete service advisor "${advisor.label}"?`)) return;
        try {
            await apiDelete(`/api/data/options/${advisor.id}`);
            await fetchAdvisors();
        } catch (err: any) {
            alert(err?.message ?? "Failed to delete advisor");
        }
    };

    const parseBulkAdvisorRows = (raw: string): BulkAdvisorRow[] => {
        const lines = raw
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean);
        if (lines.length === 0) return [];

        const rows = [...lines];
        const first = rows[0].toLowerCase();
        if (first.includes("name") || first.includes("advisor")) {
            rows.shift();
        }

        return rows
            .map((line) => line.split(",").map((x) => x.trim()))
            .filter((parts) => parts.length >= 2)
            .map((parts) => ({
                label: parts[0] ?? "",
                branchName: (parts[1] ?? "").trim(),
            }))
            .filter((row) => row.label && row.branchName);
    };

    const handleBulkAdvisorSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const rows = parseBulkAdvisorRows(bulkAdvisorText);
        if (rows.length === 0) {
            setBulkError("No valid rows found. Use: advisor_name,branch");
            return;
        }
        setBulkSaving(true);
        setBulkError("");
        setBulkResult(null);
        try {
            const res = await apiPost<{
                created: number;
                failed: Array<{ row: number; label: string; reason: string }>;
            }>("/api/data/options/service-advisors", { rows });
            setBulkResult(res);
            await fetchAdvisors();
        } catch (err: any) {
            setBulkError(err?.message ?? "Bulk upload failed");
        } finally {
            setBulkSaving(false);
        }
    };

    const handleBulkCsvFile = async (file: File) => {
        const text = await file.text();
        setBulkAdvisorText(text);
    };

    const visibleUsers = users;
    const filtered = visibleUsers.filter(
        (u) =>
            !search.trim() ||
            u.name.toLowerCase().includes(search.toLowerCase()) ||
            u.email.toLowerCase().includes(search.toLowerCase())
    );
    const filteredAdvisors = advisors.filter(
        (a) =>
            !search.trim() ||
            a.label.toLowerCase().includes(search.toLowerCase()) ||
            (a.branch?.name ?? "").toLowerCase().includes(search.toLowerCase())
    );

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">User Management</h1>
                        <p className="text-slate-500 mt-1">
                            {view === "advisors"
                                ? "Manage service advisors with branch access."
                                : "Manage personnel and roles."}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        {view === "advisors" && (
                            <button
                                type="button"
                                onClick={() => {
                                    setBulkAdvisorText("");
                                    setBulkError("");
                                    setBulkResult(null);
                                    setShowBulkAdvisorModal(true);
                                }}
                                className="flex items-center gap-2 px-4 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-xl text-sm font-semibold transition-all"
                            >
                                <Upload className="w-4 h-4" />
                                Bulk Upload
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => {
                                if (view === "advisors") {
                                    openAddAdvisor();
                                } else {
                                    handleAddOpen();
                                }
                            }}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold shadow-lg shadow-blue-600/20 transition-all"
                        >
                            <UserPlus className="w-4 h-4" />
                            {view === "advisors" ? "Add Dropdown Advisor" : "Add User"}
                        </button>
                    </div>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-4 pt-4 flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setView("all")}
                            className={cn(
                                "px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors",
                                view === "all"
                                    ? "bg-blue-600 text-white border-blue-600"
                                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                            )}
                        >
                            All Users
                        </button>
                        <button
                            type="button"
                            onClick={() => setView("advisors")}
                            className={cn(
                                "px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors",
                                view === "advisors"
                                    ? "bg-blue-600 text-white border-blue-600"
                                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                            )}
                        >
                            Service Advisors
                        </button>
                    </div>
                    <div className="p-4 border-b border-slate-100 flex gap-4">
                        <div className="relative flex-1">
                            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                            <input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder={
                                    view === "advisors"
                                        ? "Search advisors by name or branch..."
                                        : "Search users by name or email..."
                                }
                                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                            />
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        {view === "all" ? (
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-widest">
                                    <th className="px-6 py-4">User</th>
                                    <th className="px-6 py-4">Role</th>
                                    <th className="px-6 py-4">Status</th>
                                    <th className="px-6 py-4 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {isLoading ? (
                                    <tr><td colSpan={4} className="px-6 py-8 text-center text-slate-400">Loading users...</td></tr>
                                ) : filtered.map((u) => (
                                    <tr key={u.id} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 font-bold">
                                                    {u.name.charAt(0)}
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-bold text-slate-900">{u.name}</span>
                                                    <span className="text-xs text-slate-500">{u.email}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 uppercase tracking-tighter text-xs font-bold text-blue-600">
                                            <div className="flex items-center gap-1.5">
                                                <Shield className="w-3.5 h-3.5" />
                                                {u.role.name}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={cn("px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider", u.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400")}>
                                                {u.active ? "Active" : "Inactive"}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => handleEditClick(u)}
                                                    className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-400 hover:text-blue-600"
                                                    aria-label="Edit user"
                                                >
                                                    <Edit2 className="w-4 h-4" />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleDeleteClick(u)}
                                                    disabled={deletingId === u.id}
                                                    className="p-2 hover:bg-rose-50 rounded-lg transition-colors text-slate-400 hover:text-rose-600 disabled:opacity-50"
                                                    aria-label="Delete user"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        ) : (
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-widest">
                                    <th className="px-6 py-4">Service Advisor</th>
                                    <th className="px-6 py-4">Branch</th>
                                    <th className="px-6 py-4 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {isLoading ? (
                                    <tr><td colSpan={3} className="px-6 py-8 text-center text-slate-400">Loading advisors...</td></tr>
                                ) : filteredAdvisors.map((a) => (
                                    <tr key={a.id} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="px-6 py-4">
                                            <span className="text-sm font-bold text-slate-900">{a.label}</span>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-slate-700">{a.branch?.name ?? "-"}</td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => openEditAdvisor(a)}
                                                    className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-400 hover:text-blue-600"
                                                    aria-label="Edit advisor"
                                                >
                                                    <Edit2 className="w-4 h-4" />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleDeleteAdvisor(a)}
                                                    className="p-2 hover:bg-rose-50 rounded-lg transition-colors text-slate-400 hover:text-rose-600"
                                                    aria-label="Delete advisor"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        )}
                    </div>
                </div>
            </div>

            {/* Add user modal */}
            {showAddModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => !addSaving && setShowAddModal(false)}>
                    <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-lg font-bold text-slate-900">Add User</h2>
                            <button type="button" onClick={() => !addSaving && setShowAddModal(false)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <form onSubmit={handleAddSubmit} className="space-y-4">
                            {addError && (
                                <p className="text-sm text-rose-600 bg-rose-50 px-3 py-2 rounded-lg">{addError}</p>
                            )}
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Name</label>
                                <input
                                    type="text"
                                    value={addForm.name}
                                    onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Email</label>
                                <input
                                    type="email"
                                    value={addForm.email}
                                    onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                    required
                                />
                            </div>
                            <div>
                            </div>
                            {metadata && (
                                <>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Role</label>
                                        <select
                                            value={addForm.roleId}
                                            onChange={(e) => setAddForm((f) => ({ ...f, roleId: e.target.value }))}
                                            className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                            required
                                        >
                                            <option value="">Select role</option>
                                            {metadata.roles.map((r) => (
                                                <option key={r.id} value={r.id}>{r.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    {metadata.branches?.length > 0 && (
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                                                Branch (required, select one or more)
                                            </label>
                                            <div className="space-y-1 rounded-xl border border-slate-200 px-3 py-2 bg-white">
                                                {metadata.branches.map((b) => {
                                                    const checked = addForm.branchIds.includes(b.id);
                                                    return (
                                                        <label
                                                            key={b.id}
                                                            className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none"
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                                                checked={checked}
                                                                onChange={(e) => {
                                                                    setAddForm((f) => {
                                                                        const next = new Set(f.branchIds);
                                                                        if (e.target.checked) next.add(b.id);
                                                                        else next.delete(b.id);
                                                                        return { ...f, branchIds: Array.from(next) };
                                                                    });
                                                                }}
                                                            />
                                                            <span>{b.name}</span>
                                                        </label>
                                                    );
                                                })}
                                            </div>
                                            <p className="mt-1 text-xs text-slate-500">
                                                Tick one or more branches for this user.
                                            </p>
                                        </div>
                                    )}
                                </>
                            )}
                            <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5 text-sm text-amber-800">
                                New users get temporary password <strong>admin123</strong>. They must change it on first login; the new password is saved in Supabase instantly.
                            </div>
                            <div className="flex gap-2 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setShowAddModal(false)}
                                    className="flex-1 px-4 py-2 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={addSaving}
                                    className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold"
                                >
                                    {addSaving ? "Creating…" : "Create User"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {showAdvisorModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => !advisorSaving && setShowAdvisorModal(false)}>
                    <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-lg font-bold text-slate-900">
                                {editingAdvisor ? "Edit Service Advisor" : "Add Service Advisor"}
                            </h2>
                            <button type="button" onClick={() => !advisorSaving && setShowAdvisorModal(false)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <form onSubmit={handleSaveAdvisor} className="space-y-4">
                            {advisorError && (
                                <p className="text-sm text-rose-600 bg-rose-50 px-3 py-2 rounded-lg">{advisorError}</p>
                            )}
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Advisor Name</label>
                                <input
                                    type="text"
                                    value={advisorForm.label}
                                    onChange={(e) => setAdvisorForm((f) => ({ ...f, label: e.target.value }))}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Branch</label>
                                <select
                                    value={advisorForm.branchId}
                                    onChange={(e) => setAdvisorForm((f) => ({ ...f, branchId: e.target.value }))}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                    required
                                >
                                    <option value="">Select branch</option>
                                    {(metadata?.branches ?? []).map((b) => (
                                        <option key={b.id} value={b.id}>{b.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex gap-2 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setShowAdvisorModal(false)}
                                    className="flex-1 px-4 py-2 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={advisorSaving}
                                    className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold"
                                >
                                    {advisorSaving ? "Saving…" : "Save Advisor"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Bulk advisor upload modal */}
            {showBulkAdvisorModal && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
                    onClick={() => !bulkSaving && setShowBulkAdvisorModal(false)}
                >
                    <div
                        className="bg-white rounded-2xl shadow-xl max-w-2xl w-full p-6"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-lg font-bold text-slate-900">Bulk Upload Service Advisors</h2>
                            <button
                                type="button"
                                onClick={() => !bulkSaving && setShowBulkAdvisorModal(false)}
                                className="p-2 hover:bg-slate-100 rounded-lg text-slate-500"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleBulkAdvisorSubmit} className="space-y-4">
                            {bulkError && (
                                <p className="text-sm text-rose-600 bg-rose-50 px-3 py-2 rounded-lg">{bulkError}</p>
                            )}
                            <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5 text-xs text-slate-600">
                                Format: <strong>advisor_name,branch</strong><br />
                                Example: <strong>Rahul,Bypass</strong>
                            </div>
                            <div className="flex items-center gap-3">
                                <label className="text-sm font-medium text-slate-700">Upload CSV</label>
                                <input
                                    type="file"
                                    accept=".csv,text/csv"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) void handleBulkCsvFile(file);
                                    }}
                                    className="text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                                    CSV text
                                </label>
                                <textarea
                                    value={bulkAdvisorText}
                                    onChange={(e) => setBulkAdvisorText(e.target.value)}
                                    className="w-full h-48 px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                    placeholder={"name,branch\nRahul,Bypass"}
                                />
                            </div>
                            {bulkResult && (
                                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                                    Created: <strong>{bulkResult.created}</strong> | Failed: <strong>{bulkResult.failed.length}</strong>
                                    {bulkResult.failed.length > 0 && (
                                        <div className="mt-2 text-xs text-rose-600 max-h-32 overflow-auto">
                                            {bulkResult.failed.map((f, idx) => (
                                                <div key={`${f.row}-${idx}`}>
                                                    Row {f.row} ({f.label || "no-label"}): {f.reason}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                            <div className="flex gap-2 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setShowBulkAdvisorModal(false)}
                                    className="flex-1 px-4 py-2 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50"
                                >
                                    Close
                                </button>
                                <button
                                    type="submit"
                                    disabled={bulkSaving}
                                    className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold"
                                >
                                    {bulkSaving ? "Uploading…" : "Upload Advisors"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Edit user modal */}
            {editingUser && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => !editSaving && setEditingUser(null)}>
                    <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-lg font-bold text-slate-900">Edit User</h2>
                            <button type="button" onClick={() => !editSaving && setEditingUser(null)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <p className="text-xs text-slate-500 mb-4">Editing {editingUser.email}</p>
                        <form onSubmit={handleEditSubmit} className="space-y-4">
                            {editError && (
                                <p className="text-sm text-rose-600 bg-rose-50 px-3 py-2 rounded-lg">{editError}</p>
                            )}
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Name</label>
                                <input
                                    type="text"
                                    value={editForm.name}
                                    onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                    required
                                />
                            </div>
                            {metadata && (
                                <>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Role</label>
                                        <select
                                            value={editForm.roleId}
                                            onChange={(e) => setEditForm((f) => ({ ...f, roleId: e.target.value }))}
                                            className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                            required
                                        >
                                            {metadata.roles.map((r) => (
                                                <option key={r.id} value={r.id}>{r.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    {metadata.branches?.length > 0 && (
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                                                Branch access (select one or more)
                                            </label>
                                            <div className="space-y-1 rounded-xl border border-slate-200 px-3 py-2 bg-white">
                                                {metadata.branches.map((b) => {
                                                    const checked = editForm.branchIds.includes(b.id);
                                                    return (
                                                        <label
                                                            key={b.id}
                                                            className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none"
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                                                checked={checked}
                                                                onChange={(e) => {
                                                                    setEditForm((f) => {
                                                                        const next = new Set(f.branchIds);
                                                                        if (e.target.checked) next.add(b.id);
                                                                        else next.delete(b.id);
                                                                        return { ...f, branchIds: Array.from(next) };
                                                                    });
                                                                }}
                                                            />
                                                            <span>{b.name}</span>
                                                        </label>
                                                    );
                                                })}
                                            </div>
                                            <p className="mt-1 text-xs text-slate-500">
                                                If you select multiple branches, this user can see data for all selected branches (if their role has multi-branch access).
                                            </p>
                                        </div>
                                    )}
                                </>
                            )}
                            <div className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    id="edit-active"
                                    checked={editForm.active}
                                    onChange={(e) => setEditForm((f) => ({ ...f, active: e.target.checked }))}
                                    className="rounded border-slate-300"
                                />
                                <label htmlFor="edit-active" className="text-sm font-medium text-slate-700">Active</label>
                            </div>
                            <div className="flex gap-2 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setEditingUser(null)}
                                    className="flex-1 px-4 py-2 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={editSaving}
                                    className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold"
                                >
                                    {editSaving ? "Saving…" : "Save"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </DashboardLayout>
    );
}

