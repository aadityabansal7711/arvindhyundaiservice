"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { format } from "date-fns";
import { useSession } from "next-auth/react";
import { Calendar, FileText, Save } from "lucide-react";

import DashboardLayout from "@/components/layout/dashboard-layout";
import { apiGet, apiPatch } from "@/lib/api";
import type { BodyshopJobWithMeta, StatusSection } from "@/lib/bodyshop-types";
import { STATUS_SECTION_ORDER } from "@/lib/bodyshop-seed";

interface StageHistory {
  id: string;
  from_status: string | null;
  to_status: string;
  changed_at: string;
  remark: string | null;
  gm_remark: string | null;
}

export default function BodyshopJobDetailPage() {
  const params = useParams<{ id: string }>();
  const GM_EMAIL = "servicegm.hyundai@arvindgroup.in";
  const { data: session } = useSession();
  const isGm =
    ((session?.user as any)?.email as string | undefined)?.trim().toLowerCase() ===
    GM_EMAIL;
  const [job, setJob] = useState<BodyshopJobWithMeta | null>(null);
  const [stages, setStages] = useState<StageHistory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeStatus, setActiveStatus] = useState<StatusSection | null>(null);
  const [form, setForm] = useState<Record<string, any>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [jobData, stagesData] = await Promise.all([
          apiGet<BodyshopJobWithMeta>(`/api/bodyshop-jobs/${params.id}`),
          apiGet<StageHistory[]>(`/api/bodyshop-stages?jobId=${params.id}`),
        ]);
        setJob(jobData);
        setStages(stagesData);
        setActiveStatus(jobData.status_section);
        setForm(jobData as any);
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };
    if (params?.id) void load();
  }, [params]);

  const fieldsForStatus = useMemo(() => {
    const map: Record<StatusSection, { key: keyof BodyshopJobWithMeta; label: string; type: "text" | "date" | "number" | "textarea" | "select"; options?: string[] }[]> =
      {
        "Survey Pending": [
          { key: "surveyor", label: "Surveyor", type: "text" },
          { key: "survey_date", label: "Survey Date", type: "date" },
        ],
        "Document Pending": [
          { key: "claim_no", label: "Claim No", type: "text" },
          { key: "claim_intimation_date", label: "Claim Intimation Date", type: "date" },
          { key: "whatsapp_date", label: "Whatsapp Date", type: "date" },
          { key: "advisor_remark", label: "Advisor Remark", type: "textarea" },
        ],
        "Approval Pending": [
          { key: "hap_status", label: "HAP/NHAP", type: "select", options: ["HAP", "N HAP"] },
          { key: "approval_date", label: "Approval Date", type: "date" },
          { key: "general_remark", label: "Remark", type: "textarea" },
        ],
        "Approval Hold": [
          { key: "general_remark", label: "Hold Remark", type: "textarea" },
        ],
        "Approval Received": [
          { key: "approval_date", label: "Approval Date", type: "date" },
          { key: "general_remark", label: "Remark", type: "textarea" },
        ],
        PNA: [
          { key: "mrs", label: "MRS No", type: "text" },
          { key: "mrs_date", label: "MRS Date", type: "date" },
          { key: "order_no", label: "Order No", type: "text" },
          { key: "order_date", label: "Order Date", type: "date" },
          { key: "eta_date", label: "ETA Date", type: "date" },
          { key: "received_date", label: "Received Date", type: "date" },
          { key: "parts_status", label: "Parts/Store Remark", type: "textarea" },
        ],
        Dismantle: [
          { key: "replace_panels", label: "Replace Panels", type: "text" },
          { key: "dent_panels", label: "Dent Panels", type: "text" },
          { key: "general_remark", label: "Work Remark", type: "textarea" },
        ],
        Mechanical: [
          { key: "general_remark", label: "Mechanical Remark", type: "textarea" },
        ],
        Cutting: [
          { key: "general_remark", label: "Cutting Remark", type: "textarea" },
        ],
        Denting: [
          { key: "general_remark", label: "Denting Remark", type: "textarea" },
        ],
        Painting: [
          { key: "general_remark", label: "Painting Remark", type: "textarea" },
        ],
        Fitting: [
          { key: "general_remark", label: "Fitting Remark", type: "textarea" },
        ],
        "Ready for Pre-Invoice": [
          { key: "tentative_labor", label: "Tentative Labor", type: "number" },
          { key: "promised_date", label: "Promised Date", type: "date" },
          { key: "billing_status", label: "Billing Status", type: "text" },
        ],
        "Billed but Not Ready": [
          { key: "billing_status", label: "Billing Status", type: "text" },
          { key: "general_remark", label: "Reason / Remark", type: "textarea" },
        ],
        "DO Awaited": [
          { key: "general_remark", label: "DO Remark", type: "textarea" },
        ],
        "Customer Awaited": [
          { key: "general_remark", label: "Customer Remark", type: "textarea" },
        ],
        "Total Loss / Disputed": [
          { key: "general_remark", label: "Dispute Remark", type: "textarea" },
        ],
        "No Claim": [
          { key: "general_remark", label: "No-Claim Remark", type: "textarea" },
        ],
        Delivered: [
          { key: "general_remark", label: "Delivery Remark", type: "textarea" },
        ],
      };
    return map;
  }, []);

  const onSave = async () => {
    if (!job || !activeStatus) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const payload: Record<string, any> = {};
      // Always allow status update (users asked "status wise")
      payload.status_section = activeStatus;
      // Send only fields relevant to the current status
      for (const f of fieldsForStatus[activeStatus] ?? []) {
        payload[f.key] = form[f.key as string] ?? null;
      }
      await apiPatch(`/api/bodyshop-jobs/${job.id}`, payload);
      const refreshed = await apiGet<BodyshopJobWithMeta>(`/api/bodyshop-jobs/${job.id}`);
      setJob(refreshed);
      setForm(refreshed as any);
      setActiveStatus(refreshed.status_section);
      const stagesData = await apiGet<StageHistory[]>(`/api/bodyshop-stages?jobId=${job.id}`);
      setStages(stagesData);
    } catch (e) {
      setSaveError((e as Error)?.message ?? "Failed to save");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Bodyshop RO
          </h1>
          <p className="text-slate-500 mt-1">
            Fill details status-wise. Everyone sees the same default layout.
          </p>
        </div>

        {isLoading ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center text-slate-500">
            Loading job...
          </div>
        ) : !job ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center text-slate-500">
            Job not found.
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-4">
            <section className="lg:col-span-1 bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
              <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                RO {job.ro_no}
              </h2>
              <div className="text-sm text-slate-700 space-y-1">
                <div>
                  <span className="text-slate-500">Reg:</span> {job.reg_no ?? "—"}
                </div>
                <div>
                  <span className="text-slate-500">Customer:</span>{" "}
                  {job.customer_name ?? "—"}
                </div>
                <div>
                  <span className="text-slate-500">Model:</span> {job.model ?? "—"}
                </div>
                <div>
                  <span className="text-slate-500">RO Date:</span>{" "}
                  {job.ro_date ? format(new Date(job.ro_date), "dd MMM yyyy") : "—"}
                </div>
                <div>
                  <span className="text-slate-500">Age:</span> {job.age_days}d{" "}
                  {job.overdue ? (
                    <span className="text-rose-700 font-semibold">(Overdue)</span>
                  ) : null}
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100">
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest mb-2">
                  Status
                </p>
                <div className="space-y-1">
                  {STATUS_SECTION_ORDER.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setActiveStatus(s)}
                      className={
                        "w-full text-left px-3 py-2 rounded-xl text-sm transition-colors " +
                        (activeStatus === s
                          ? "bg-blue-50 text-blue-700 font-semibold"
                          : "hover:bg-slate-50 text-slate-700")
                      }
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <section className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-bold text-slate-900">
                  {activeStatus ?? job.status_section}
                </h2>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onSave}
                    disabled={isSaving || !activeStatus}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60"
                  >
                    <Save className="w-4 h-4" />
                    {isSaving ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>

              {saveError && (
                <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">
                  {saveError}
                </div>
              )}

              {!activeStatus ? (
                <div className="text-sm text-slate-500">Select a status.</div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Current Status
                    </label>
                    <select
                      value={activeStatus}
                      onChange={(e) => setActiveStatus(e.target.value as StatusSection)}
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white transition-all"
                    >
                      {STATUS_SECTION_ORDER.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>

                  {(fieldsForStatus[activeStatus] ?? []).map((f) => {
                    const value = form[f.key as string] ?? "";
                    const common =
                      "w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white transition-all";
                    return (
                      <div
                        key={String(f.key)}
                        className={f.type === "textarea" ? "sm:col-span-2" : ""}
                      >
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                          {f.label}
                        </label>
                        {f.type === "textarea" ? (
                          <textarea
                            value={value}
                            onChange={(e) =>
                              setForm((p) => ({ ...p, [f.key]: e.target.value }))
                            }
                            rows={3}
                            className={common}
                          />
                        ) : f.type === "select" ? (
                          <select
                            value={value}
                            onChange={(e) =>
                              setForm((p) => ({ ...p, [f.key]: e.target.value }))
                            }
                            className={common}
                          >
                            <option value="">—</option>
                            {(f.options ?? []).map((o) => (
                              <option key={o} value={o}>
                                {o}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type={f.type}
                            value={value}
                            onChange={(e) =>
                              setForm((p) => ({
                                ...p,
                                [f.key]:
                                  f.type === "number"
                                    ? e.target.value === ""
                                      ? null
                                      : Number(e.target.value)
                                    : e.target.value,
                              }))
                            }
                            className={common}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="lg:col-span-1 bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
              <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Stage History
              </h2>
              {stages.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No movement history recorded yet.
                </p>
              ) : (
                <ol className="space-y-2 text-sm">
                  {stages.map((s) => (
                    <li key={s.id} className="flex flex-col">
                      <span className="font-semibold text-slate-900">
                        {s.from_status ?? "New"} → {s.to_status}
                      </span>
                      <span className="text-[11px] text-slate-500">
                        {format(new Date(s.changed_at), "dd MMM yyyy, HH:mm")}
                      </span>
                      {s.remark && (
                        <span className="text-[11px] text-slate-500">
                          {s.remark}
                        </span>
                      )}
                      {s.gm_remark && isGm && (
                        <span className="text-[11px] text-indigo-600 font-semibold">
                          GM Remark: {s.gm_remark}
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

