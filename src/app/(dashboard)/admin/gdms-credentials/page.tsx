"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { KeyRound, Trash2, X } from "lucide-react";
import { apiGet, apiPost, apiDelete } from "@/lib/api";
import { isOwnerUser } from "@/lib/owner-access";

type CredentialRow = {
  branchId: string;
  branchName: string;
  isConfigured: boolean;
  gdmsUserIdMasked: string | null;
  updatedAt: string | null;
};

export default function GdmsCredentialsPage() {
  const { data: session } = useSession();
  const isOwner = isOwnerUser(session?.user);

  const [rows, setRows] = useState<CredentialRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingBranch, setEditingBranch] = useState<CredentialRow | null>(null);
  const [form, setForm] = useState({ gdmsUserId: "", gdmsPassword: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRows = async () => {
    setIsLoading(true);
    try {
      const data = await apiGet<CredentialRow[]>("/api/admin/gdms-credentials");
      setRows(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchRows();
  }, []);

  if (!isOwner) {
    return (
      <div className="panel-surface p-6 rounded-2xl text-sm text-slate-600">
        You don&apos;t have access to this page.
      </div>
    );
  }

  const openEdit = (row: CredentialRow) => {
    setEditingBranch(row);
    setForm({ gdmsUserId: "", gdmsPassword: "" });
    setError(null);
  };

  const closeEdit = () => {
    if (saving) return;
    setEditingBranch(null);
    setError(null);
  };

  const submit = async () => {
    if (!editingBranch) return;
    if (!form.gdmsUserId.trim() || !form.gdmsPassword.trim()) {
      setError("Both GDMS User ID and Password are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiPost("/api/admin/gdms-credentials", {
        branchId: editingBranch.branchId,
        gdmsUserId: form.gdmsUserId.trim(),
        gdmsPassword: form.gdmsPassword,
      });
      setEditingBranch(null);
      await fetchRows();
    } catch (err) {
      setError((err as Error)?.message ?? "Failed to save credentials");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: CredentialRow) => {
    if (!window.confirm(`Remove stored GDMS credentials for ${row.branchName}?`)) return;
    try {
      await apiDelete(`/api/admin/gdms-credentials/${encodeURIComponent(row.branchId)}`);
      await fetchRows();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-5">
      <div className="panel-surface p-4 sm:p-5 rounded-2xl">
        <div className="text-lg font-bold text-slate-900">GDMS Credentials</div>
        <div className="text-sm text-slate-500 mt-1">
          Store each branch&apos;s GDMS (Hyundai NDMS) login so &quot;Fetch from GDMS&quot; can sign in
          on your behalf. Passwords are encrypted at rest and never shown again after saving.
        </div>
      </div>

      <div className="panel-surface rounded-2xl overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-slate-500 text-sm">Loading...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/90 border-b border-slate-200">
                  <th className="px-5 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-[0.14em]">
                    Branch
                  </th>
                  <th className="px-5 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-[0.14em]">
                    GDMS User ID
                  </th>
                  <th className="px-5 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-[0.14em]">
                    Status
                  </th>
                  <th className="px-5 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-[0.14em]">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <tr key={row.branchId} className="hover:bg-sky-50/35 transition-colors">
                    <td className="px-5 py-4 text-sm font-bold text-slate-950">{row.branchName}</td>
                    <td className="px-5 py-3 text-sm text-slate-700">
                      {row.gdmsUserIdMasked ?? "—"}
                    </td>
                    <td className="px-5 py-3 text-sm">
                      <span
                        className={
                          "inline-flex items-center px-2.5 py-1.5 rounded-lg text-xs font-bold ring-1 " +
                          (row.isConfigured
                            ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
                            : "bg-slate-100 text-slate-700 ring-slate-200")
                        }
                      >
                        {row.isConfigured ? "Configured" : "Not configured"}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-sm">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(row)}
                          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sky-700 hover:bg-sky-50 font-bold text-xs transition-colors"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                          {row.isConfigured ? "Update" : "Set up"}
                        </button>
                        {row.isConfigured && (
                          <button
                            type="button"
                            onClick={() => void remove(row)}
                            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-rose-600 hover:bg-rose-50 font-bold text-xs transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Remove
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editingBranch && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          onClick={closeEdit}
        >
          <div
            className="bg-white w-full max-w-md rounded-t-2xl sm:rounded-2xl border border-slate-200 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 sm:p-6 space-y-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-bold text-slate-900">{editingBranch.branchName}</div>
                  <div className="text-sm text-slate-500">GDMS login for this branch</div>
                </div>
                <button
                  type="button"
                  disabled={saving}
                  onClick={closeEdit}
                  aria-label="Close"
                  className="p-2.5 -mr-1 text-slate-400 hover:text-slate-600 rounded-lg disabled:opacity-50"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {error && (
                <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <label className="block text-xs font-bold text-black uppercase tracking-widest">
                  GDMS User ID
                </label>
                <input
                  value={form.gdmsUserId}
                  onChange={(e) => setForm((p) => ({ ...p, gdmsUserId: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white"
                  autoComplete="off"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-bold text-black uppercase tracking-widest">
                  GDMS Password
                </label>
                <input
                  type="password"
                  value={form.gdmsPassword}
                  onChange={(e) => setForm((p) => ({ ...p, gdmsPassword: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white"
                  autoComplete="new-password"
                  placeholder={editingBranch.isConfigured ? "Leave — enter to replace" : ""}
                />
              </div>
            </div>

            <div className="px-4 sm:px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={saving}
                onClick={closeEdit}
                className="px-5 py-2.5 bg-white border border-slate-200 text-slate-900 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-colors disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={saving}
                className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold shadow-lg transition-all bg-sky-500 text-white shadow-sky-500/20 hover:bg-sky-400 disabled:opacity-60 min-w-[100px]"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
