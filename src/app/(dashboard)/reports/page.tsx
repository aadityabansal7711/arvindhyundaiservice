"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import {
    AlertTriangle,
    BarChart3,
    CalendarDays,
    CarFront,
    Clock3,
    FileSpreadsheet,
    IndianRupee,
    Loader2,
    PackageOpen,
    ShieldCheck,
    TrendingUp,
} from "lucide-react";
import { apiGet } from "@/lib/api";

const REPORTS_OWNER_EMAIL = "mayank.arvind.bansal@gmail.com";

type ReportData = {
    range: { from: string; to: string };
    summary: {
        totalRos: number;
        openRos: number;
        deliveredRos: number;
        approvalPending: number;
        overdueDelivery: number;
        backorders: number;
        hap: number;
        nhap: number;
        avgTat: number;
        billAmount: number;
        doAmount: number;
        customerAmount: number;
        difference: number;
    };
    monthWise: Array<{
        month: string;
        label: string;
        total: number;
        delivered: number;
        open: number;
        approvalPending: number;
        billAmount: number;
        doAmount: number;
        customerAmount: number;
        difference: number;
        avgTat: number;
    }>;
    breakdowns: {
        branches: Array<{ name: string; count: number }>;
        statuses: Array<{ name: string; count: number }>;
        insuranceCompanies: Array<{ name: string; count: number }>;
        advisors: Array<{ name: string; count: number }>;
        aging: Array<{ name: string; count: number }>;
    };
    rows: Array<{
        id: string;
        roNo: string;
        vehicleInDate: string;
        vehicleOutDate: string | null;
        status: string;
        branch: string;
        registrationNo: string;
        model: string;
        customerName: string;
        advisor: string;
        insuranceCompany: string;
        claimNo: string;
        surveyor: string;
        billAmount: number;
        doAmount: number;
        difference: number;
        ageDays: number;
    }>;
};

function inputDate(date: Date) {
    return date.toISOString().slice(0, 10);
}

function formatNumber(value: number) {
    return new Intl.NumberFormat("en-IN").format(Math.round(value));
}

function formatMoney(value: number) {
    return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0,
    }).format(value);
}

function formatDate(value: string | null) {
    if (!value) return "-";
    return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function MetricCard({
    label,
    value,
    helper,
    icon: Icon,
    tone,
}: {
    label: string;
    value: string;
    helper: string;
    icon: typeof BarChart3;
    tone: "blue" | "emerald" | "amber" | "rose" | "slate";
}) {
    const tones = {
        blue: "bg-blue-50 text-blue-700 ring-blue-100",
        emerald: "bg-emerald-50 text-emerald-700 ring-emerald-100",
        amber: "bg-amber-50 text-amber-700 ring-amber-100",
        rose: "bg-rose-50 text-rose-700 ring-rose-100",
        slate: "bg-slate-100 text-slate-700 ring-slate-200",
    };

    return (
        <div className="panel-surface rounded-2xl p-4 sm:p-5 min-h-[142px] flex flex-col justify-between">
            <div className="flex items-start justify-between gap-3">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{label}</p>
                <span className={`flex h-10 w-10 items-center justify-center rounded-xl ring-1 ${tones[tone]}`}>
                    <Icon className="h-5 w-5" />
                </span>
            </div>
            <div>
                <p className="text-2xl sm:text-3xl font-black tracking-tight text-slate-950">{value}</p>
                <p className="mt-1 text-sm text-slate-500">{helper}</p>
            </div>
        </div>
    );
}

function Breakdown({
    title,
    items,
    tone = "bg-sky-500",
}: {
    title: string;
    items: Array<{ name: string; count: number }>;
    tone?: string;
}) {
    const max = Math.max(1, ...items.map((item) => item.count));
    return (
        <section className="panel-surface rounded-2xl p-4 sm:p-5">
            <h2 className="text-sm font-black uppercase tracking-[0.14em] text-slate-700">{title}</h2>
            <div className="mt-4 space-y-3">
                {items.length === 0 ? (
                    <p className="text-sm text-slate-500">No data in this range.</p>
                ) : (
                    items.slice(0, 8).map((item) => (
                        <div key={item.name}>
                            <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                                <span className="font-semibold text-slate-700 truncate">{item.name}</span>
                                <span className="font-black text-slate-950">{item.count}</span>
                            </div>
                            <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                                <div
                                    className={`h-full rounded-full ${tone}`}
                                    style={{ width: `${Math.max(5, (item.count / max) * 100)}%` }}
                                />
                            </div>
                        </div>
                    ))
                )}
            </div>
        </section>
    );
}

export default function ReportsPage() {
    const { data: session, status } = useSession();
    const today = useMemo(() => new Date(), []);
    const [from, setFrom] = useState(inputDate(new Date(today.getFullYear(), today.getMonth() - 11, 1)));
    const [to, setTo] = useState(inputDate(today));
    const [data, setData] = useState<ReportData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState("");

    const isAllowed =
        ((session?.user as any)?.email as string | undefined)?.trim().toLowerCase() === REPORTS_OWNER_EMAIL;

    useEffect(() => {
        if (status === "loading") return;
        if (!isAllowed) {
            setIsLoading(false);
            return;
        }

        const controller = new AbortController();
        setIsLoading(true);
        setError("");
        apiGet<ReportData>(`/api/reports?from=${from}&to=${to}`, { signal: controller.signal })
            .then(setData)
            .catch((err) => {
                if ((err as Error).name !== "AbortError") setError((err as Error).message);
            })
            .finally(() => setIsLoading(false));

        return () => controller.abort();
    }, [from, to, status, isAllowed]);

    const maxMonthly = Math.max(1, ...(data?.monthWise.map((month) => month.total) ?? [1]));
    const peakMonth = data?.monthWise.reduce((best, item) => (item.total > best.total ? item : best), data.monthWise[0]);

    if (status !== "loading" && !isAllowed) {
        return (
            <div className="min-h-[70vh] grid place-items-center">
                <div className="max-w-md rounded-2xl border border-rose-100 bg-white p-6 text-center shadow-sm">
                    <ShieldCheck className="mx-auto h-11 w-11 text-rose-500" />
                    <h1 className="mt-4 text-xl font-black text-slate-950">Reports are private</h1>
                    <p className="mt-2 text-sm text-slate-500">
                        This page is only available to {REPORTS_OWNER_EMAIL}.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="relative overflow-hidden rounded-[1.75rem] bg-slate-950 px-5 py-6 sm:px-7 sm:py-8 shadow-2xl shadow-slate-950/[0.12]">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_18%,rgba(14,165,233,0.32),transparent_18rem),radial-gradient(circle_at_86%_8%,rgba(16,185,129,0.22),transparent_18rem),linear-gradient(135deg,rgba(255,255,255,0.08),transparent_46%)]" />
                <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                    <div className="max-w-3xl">
                        <div className="text-xs font-bold uppercase tracking-[0.22em] text-sky-200/80">Owner analytics</div>
                        <h1 className="mt-3 text-2xl font-black tracking-tight text-white sm:text-4xl">Deep Service Reports</h1>
                        <p className="mt-2 max-w-2xl text-sm sm:text-base text-slate-300">
                            Month-wise performance, date-range analytics, advisor movement, insurance mix, aging pressure, billing value and every RO row in one view.
                        </p>
                    </div>
                    <div className="grid grid-cols-1 gap-3 rounded-2xl bg-white/[0.08] p-3 ring-1 ring-white/10 sm:grid-cols-[1fr_1fr]">
                        <label className="text-xs font-bold uppercase tracking-[0.12em] text-slate-300">
                            From
                            <input
                                type="date"
                                value={from}
                                onChange={(event) => setFrom(event.target.value)}
                                className="mt-1 block w-full rounded-xl border border-white/10 bg-white/95 px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-sky-300"
                            />
                        </label>
                        <label className="text-xs font-bold uppercase tracking-[0.12em] text-slate-300">
                            To
                            <input
                                type="date"
                                value={to}
                                onChange={(event) => setTo(event.target.value)}
                                className="mt-1 block w-full rounded-xl border border-white/10 bg-white/95 px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-sky-300"
                            />
                        </label>
                    </div>
                </div>
            </div>

            {isLoading && (
                <div className="panel-surface rounded-2xl p-8 text-center text-slate-500">
                    <Loader2 className="mx-auto h-7 w-7 animate-spin text-sky-600" />
                    <p className="mt-3 text-sm font-semibold">Building reports...</p>
                </div>
            )}

            {error && !isLoading && (
                <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4 text-sm font-semibold text-rose-700">
                    {error}
                </div>
            )}

            {data && !isLoading && (
                <>
                    <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]">
                        <MetricCard label="Total ROs" value={formatNumber(data.summary.totalRos)} helper="Opened in selected date range" icon={CarFront} tone="blue" />
                        <MetricCard label="Open ROs" value={formatNumber(data.summary.openRos)} helper={`${formatNumber(data.summary.overdueDelivery)} overdue deliveries`} icon={AlertTriangle} tone={data.summary.overdueDelivery ? "rose" : "slate"} />
                        <MetricCard label="Delivered" value={formatNumber(data.summary.deliveredRos)} helper={`${data.summary.avgTat} days average TAT`} icon={Clock3} tone="emerald" />
                        <MetricCard label="Approval" value={formatNumber(data.summary.approvalPending)} helper="ROs waiting in approval flow" icon={ShieldCheck} tone="amber" />
                        <MetricCard label="Billing" value={formatMoney(data.summary.billAmount)} helper={`DO ${formatMoney(data.summary.doAmount)}`} icon={IndianRupee} tone="slate" />
                        <MetricCard label="Parts Risk" value={formatNumber(data.summary.backorders)} helper="Open backorder flags" icon={PackageOpen} tone={data.summary.backorders ? "amber" : "emerald"} />
                    </div>

                    <section className="panel-surface rounded-2xl p-4 sm:p-5">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                            <div>
                                <h2 className="text-lg font-black text-slate-950">Month-wise movement</h2>
                                <p className="text-sm text-slate-500">
                                    Peak: {peakMonth ? `${peakMonth.label} with ${peakMonth.total} ROs` : "No data"}
                                </p>
                            </div>
                            <div className="flex items-center gap-2 text-sm font-bold text-slate-600">
                                <TrendingUp className="h-4 w-4 text-emerald-600" />
                                {formatDate(data.range.from)} to {formatDate(data.range.to)}
                            </div>
                        </div>
                        <div className="mt-5 grid min-h-[260px] grid-cols-[repeat(auto-fit,minmax(72px,1fr))] items-end gap-3">
                            {data.monthWise.map((month) => (
                                <div key={month.month} className="flex min-h-[240px] flex-col justify-end gap-2">
                                    <div className="flex flex-1 items-end rounded-xl bg-slate-50 p-2 ring-1 ring-slate-100">
                                        <div className="flex w-full items-end gap-1.5">
                                            <div
                                                className="w-full rounded-t-lg bg-sky-500 shadow-lg shadow-sky-500/20"
                                                style={{ height: `${Math.max(8, (month.total / maxMonthly) * 190)}px` }}
                                                title={`${month.total} total`}
                                            />
                                            <div
                                                className="w-full rounded-t-lg bg-emerald-500 shadow-lg shadow-emerald-500/20"
                                                style={{ height: `${Math.max(6, (month.delivered / maxMonthly) * 190)}px` }}
                                                title={`${month.delivered} delivered`}
                                            />
                                        </div>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-xs font-black text-slate-950">{month.total}</p>
                                        <p className="text-[11px] font-semibold text-slate-500">{month.label}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>

                    <div className="grid gap-5 xl:grid-cols-4">
                        <Breakdown title="Branch split" items={data.breakdowns.branches} tone="bg-sky-500" />
                        <Breakdown title="Status split" items={data.breakdowns.statuses} tone="bg-indigo-500" />
                        <Breakdown title="Insurance split" items={data.breakdowns.insuranceCompanies} tone="bg-emerald-500" />
                        <Breakdown title="Aging pressure" items={data.breakdowns.aging} tone="bg-amber-500" />
                    </div>

                    <section className="panel-surface overflow-hidden rounded-2xl">
                        <div className="flex flex-col gap-2 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                            <div>
                                <h2 className="text-lg font-black text-slate-950">RO detail register</h2>
                                <p className="text-sm text-slate-500">Showing latest {data.rows.length} rows from the selected range.</p>
                            </div>
                            <div className="flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700">
                                <FileSpreadsheet className="h-4 w-4" />
                                Date range data
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="min-w-[1180px] w-full text-left text-sm">
                                <thead className="bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-500">
                                    <tr>
                                        <th className="px-4 py-3">RO</th>
                                        <th className="px-4 py-3">Date</th>
                                        <th className="px-4 py-3">Vehicle</th>
                                        <th className="px-4 py-3">Customer</th>
                                        <th className="px-4 py-3">Status</th>
                                        <th className="px-4 py-3">Advisor</th>
                                        <th className="px-4 py-3">Insurance</th>
                                        <th className="px-4 py-3 text-right">Bill</th>
                                        <th className="px-4 py-3 text-right">Diff</th>
                                        <th className="px-4 py-3 text-right">Age</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 bg-white">
                                    {data.rows.map((row) => (
                                        <tr key={row.id} className="hover:bg-slate-50/70">
                                            <td className="px-4 py-3 font-black text-slate-950">{row.roNo}</td>
                                            <td className="px-4 py-3 text-slate-600">{formatDate(row.vehicleInDate)}</td>
                                            <td className="px-4 py-3">
                                                <p className="font-bold text-slate-800">{row.registrationNo}</p>
                                                <p className="text-xs text-slate-500">{row.model}</p>
                                            </td>
                                            <td className="px-4 py-3 font-semibold text-slate-700">{row.customerName}</td>
                                            <td className="px-4 py-3">
                                                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-700">
                                                    {row.status}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-slate-600">{row.advisor}</td>
                                            <td className="px-4 py-3 text-slate-600">{row.insuranceCompany}</td>
                                            <td className="px-4 py-3 text-right font-bold text-slate-800">{formatMoney(row.billAmount)}</td>
                                            <td className="px-4 py-3 text-right font-bold text-slate-800">{formatMoney(row.difference)}</td>
                                            <td className="px-4 py-3 text-right font-black text-slate-950">{row.ageDays}d</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>
                </>
            )}
        </div>
    );
}
