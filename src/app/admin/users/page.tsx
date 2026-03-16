"use client";

import { useState, useEffect } from "react";
import DashboardLayout from "@/components/layout/dashboard-layout";
import { UserPlus, Shield, Edit2, Trash2, Search, X } from "lucide-react";
import { apiGet, apiPatch, apiPost, apiDelete } from "@/lib/api";
import { cn } from "@/lib/utils";

type UserRow = {
    id: string;
    name: string;
    email: string;
    active: boolean;
    role: { id: string; name: string };
};

type Role = { id: string; name: string };
type Branch = { id: string; name: string };

export default function UserManagementPage() {
    const [users, setUsers] = useState<UserRow[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [editingUser, setEditingUser] = useState<UserRow | null>(null);
    const [editForm, setEditForm] = useState({ name: "", roleId: "", active: true });
    const [editSaving, setEditSaving] = useState(false);
    const [editError, setEditError] = useState("");
    const [metadata, setMetadata] = useState<{ roles: Role[]; branches: Branch[] } | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [showAddModal, setShowAddModal] = useState(false);
    const [addForm, setAddForm] = useState({
        name: "",
        email: "",
        roleId: "",
        branchId: "",
    });
    const [addSaving, setAddSaving] = useState(false);
    const [addError, setAddError] = useState("");

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

    useEffect(() => {
        fetchUsers();
        apiGet<{ roles: Role[]; branches: Branch[] }>("/api/admin/metadata")
            .then(setMetadata)
            .catch(() => setMetadata({ roles: [], branches: [] }));
    }, []);

    useEffect(() => {
        if (!editingUser) return;
        setEditForm({
            name: editingUser.name,
            roleId: editingUser.role.id,
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
        setEditSaving(true);
        setEditError("");
        try {
            await apiPatch(`/api/admin/users/${editingUser.id}`, {
                name: editForm.name.trim(),
                roleId: editForm.roleId,
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
            branchId: "",
        });
        setAddError("");
        setShowAddModal(true);
    };

    const handleAddSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setAddSaving(true);
        setAddError("");
        try {
            await apiPost("/api/admin/users", {
                name: addForm.name.trim(),
                email: addForm.email.trim(),
                roleId: addForm.roleId || undefined,
                branchId: addForm.branchId.trim() || undefined,
            });
            setShowAddModal(false);
            await fetchUsers();
        } catch (err: any) {
            setAddError(err?.message ?? "Failed to create user");
        } finally {
            setAddSaving(false);
        }
    };

    const filtered = users.filter(
        (u) =>
            !search.trim() ||
            u.name.toLowerCase().includes(search.toLowerCase()) ||
            u.email.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">User Management</h1>
                        <p className="text-slate-500 mt-1">Manage personnel and roles.</p>
                    </div>
                    <button
                        type="button"
                        onClick={handleAddOpen}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold shadow-lg shadow-blue-600/20 transition-all"
                    >
                        <UserPlus className="w-4 h-4" />
                        Add User
                    </button>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-slate-100 flex gap-4">
                        <div className="relative flex-1">
                            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                            <input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search users by name or email..."
                                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                            />
                        </div>
                    </div>
                    <div className="overflow-x-auto">
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
                                            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Branch (optional)</label>
                                            <select
                                                value={addForm.branchId}
                                                onChange={(e) => setAddForm((f) => ({ ...f, branchId: e.target.value }))}
                                                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                            >
                                                <option value="">None</option>
                                                {metadata.branches.map((b) => (
                                                    <option key={b.id} value={b.id}>{b.name}</option>
                                                ))}
                                            </select>
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

