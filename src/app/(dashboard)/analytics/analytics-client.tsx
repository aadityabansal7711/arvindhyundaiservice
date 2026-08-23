"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format, startOfMonth, startOfYear, subDays, subMonths } from "date-fns";
import {
    Activity,
    BarChart3,
    Building2,
    Car,
    CheckCircle2,
    ClipboardList,
    Clock,
    Download,
    Gauge,
    Package,
    RefreshCw,
    TrendingUp,
    UserCog,
    Users,
    Wallet,
} from "lucide-react";
import { apiGet } from "@/lib/api";
import { cn } from "@/lib/utils";

type BreakdownRow = {
    key: string;
    label: string;
    total: number;
    open: number;
    delivered: number;
    avgTat: number;
    labourAmount: number;
    partsAmount: number;
    share: number;
};

type MonthRow = {
    month: string;
    label: string;
    created: number;
    delivered: number;
    avgTat: number;
    labor: number;
    parts: number;
};

type Analytics = {
    range: { from: string; to: string };
    totals: {
        totalRos: number;
        openRos: number;
        deliveredRos: number;
        avgTatDays: number;
        avgOpenAgeDays: number;
        totalLabourAmount: number;
        totalPartsAmount: number;
        deliveryRate: number;
    };
    monthly: MonthRow[];
    statusDistribution: {
        bodyshop: { status: string; count: number; percent: number }[];
        service: { status: string; count: number; percent: number }[];
    };
    aging: {
        bodyshop: { range: string; count: number; percent: number }[];
        service: { range: string; count: number; percent: number }[];
    };
    breakdowns: {
        branch: BreakdownRow[];
        model: BreakdownRow[];
        insurer: BreakdownRow[];
        advisor: BreakdownRow[];
    };
    filterOptions: {
        branches: { id: string; name: string }[];
        models: string[];
        insurers: string[];
        advisors: string[];
    };
};

type DimKey = "branch" | "model" | "insurer" | "advisor";

const DIMENSIONS: { key: DimKey; label: string; icon: typeof Building2 }[] = [
    { key: "branch", label: "Branch", icon: Building2 },
    { key: "advisor", label: "Service Advisor", icon: UserCog },
    { key: "model", label: "Model", icon: Car },
    { key: "insurer", label: "Insurer", icon: Users },
];

const num = (n: number) => new Intl.NumberFormat("en-IN").format(n || 0);
const currency = (n: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n || 0);
const compactCurrency = (n: number) =>
    new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        notation: "compact",
        maximumFractionDigits: 1,
    }).format(n || 0);

type CategoryFilter = "all" | "bodyshop" | "service";
const CATEGORIES: { id: CategoryFilter; label: string }[] = [
    { id: "all", label: "Both" },
    { id: "bodyshop", label: "Bodyshop" },
    { id: "service", label: "Service" },
];

function todayStr() {
    return format(new Date(), "yyyy-MM-dd");
}

type Preset = { id: string; label: string; from: () => Date; to: () => Date };
const PRESETS: Preset[] = [
    { id: "this_month", label: "This Month", from: () => startOfMonth(new Date()), to: () => new Date() },
    { id: "last_month", label: "Last Month", from: () => startOfMonth(subMonths(new Date(), 1)), to: () => subDays(startOfMonth(new Date()), 1) },
    { id: "3m", label: "Last 3 Months", from: () => startOfMonth(subMonths(new Date(), 2)), to: () => new Date() },
    { id: "6m", label: "Last 6 Months", from: () => startOfMonth(subMonths(new Date(), 5)), to: () => new Date() },
    { id: "12m", label: "Last 12 Months", from: () => startOfMonth(subMonths(new Date(), 11)), to: () => new Date() },
    { id: "ytd", label: "Year to Date", from: () => startOfYear(new Date()), to: () => new Date() },
];

export default function AnalyticsClient() {
    const [from, setFrom] = useState(() => format(startOfMonth(subMonths(new Date(), 11)), "yyyy-MM-dd"));
    const [to, setTo] = useState(todayStr);
    const [activePreset, setActivePreset] = useState("12m");

    const [branchId, setBranchId] = useState("");
    const [model, setModel] = useState("");
    const [insurer, setInsurer] = useState("");
    const [advisor, setAdvisor] = useState("");
    const [category, setCategory] = useState<CategoryFilter>("all");

    const [data, setData] = useState<Analytics | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [dim, setDim] = useState<DimKey>("branch");
    const [sortBy, setSortBy] = useState<keyof BreakdownRow>("total");

    const fetchData = useCallback(
        async (signal?: AbortSignal) => {
            setLoading(true);
            setError(null);
            try {
                const params = new URLSearchParams({ from, to, category });
                if (branchId) params.set("branchId", branchId);
                if (model) params.set("model", model);
                if (insurer) params.set("insurer", insurer);
                if (advisor) params.set("advisor", advisor);
                const res = await apiGet<Analytics>(`/api/analytics?${params.toString()}`, { signal });
                setData(res);
            } catch (err) {
                if ((err as DOMException)?.name === "AbortError") return;
                setError((err as Error)?.message ?? "Failed to load analytics");
            } finally {
                if (!signal?.aborted) setLoading(false);
            }
        },
        [from, to, branchId, model, insurer, advisor, category],
    );

    useEffect(() => {
        const controller = new AbortController();
        void fetchData(controller.signal);
        return () => controller.abort();
    }, [fetchData]);

    const applyPreset = (p: Preset) => {
        setActivePreset(p.id);
        setFrom(format(p.from(), "yyyy-MM-dd"));
        setTo(format(p.to(), "yyyy-MM-dd"));
    };

    const resetFilters = () => {
        setBranchId("");
        setModel("");
        setInsurer("");
        setAdvisor("");
    };

    const hasFilters = !!(branchId || model || insurer || advisor);

    const rows = useMemo(() => {
        if (!data) return [];
        const list = [...data.breakdowns[dim]];
        list.sort((a, b) => {
            const av = a[sortBy];
            const bv = b[sortBy];
            if (typeof av === "number" && typeof bv === "number") return bv - av;
            return String(av).localeCompare(String(bv));
        });
        return list;
    }, [data, dim, sortBy]);

    const exportCsv = () => {
        if (!data) return;
        const header = ["label", "total", "open", "delivered", "avgTat", "labourAmount", "partsAmount", "share%"];
        const lines = [header.join(",")];
        for (const r of rows) {
            lines.push(
                [
                    `"${r.label.replace(/"/g, '""')}"`,
                    r.total,
                    r.open,
                    r.delivered,
                    r.avgTat,
                    r.labourAmount,
                    r.partsAmount,
                    r.share,
                ].join(","),
            );
        }
        const blob = new Blob([lines.join("\n")], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `analytics-${dim}-${category}-${from}_to_${to}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="space-y-5 max-w-[1600px] mx-auto">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-sky-500/25 ring-1 ring-white/40">
                        <BarChart3 className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold tracking-tight text-slate-900">Analytics</h1>
                        <p className="text-xs text-slate-500">
                            Deep performance insights · Owner view
                            {data && (
                                <span className="ml-1 text-slate-400">
                                    · {data.range.from} → {data.range.to}
                                </span>
                            )}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <div className="inline-flex items-center gap-0.5 p-1 rounded-xl bg-slate-100 ring-1 ring-slate-200">
                        {CATEGORIES.map((c) => (
                            <button
                                key={c.id}
                                onClick={() => setCategory(c.id)}
                                className={cn(
                                    "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
                                    category === c.id
                                        ? "bg-white text-slate-900 shadow-sm"
                                        : "text-slate-500 hover:text-slate-700",
                                )}
                            >
                                {c.label}
                            </button>
                        ))}
                    </div>
                    <button
                        onClick={() => fetchData()}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium text-slate-600 bg-white/80 ring-1 ring-slate-200 hover:bg-white transition-colors"
                    >
                        <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
                        <span className="hidden sm:inline">Refresh</span>
                    </button>
                </div>
            </div>

            {/* Date range + presets */}
            <div className="panel-surface rounded-2xl p-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                    {PRESETS.map((p) => (
                        <button
                            key={p.id}
                            onClick={() => applyPreset(p)}
                            className={cn(
                                "px-3 py-1.5 rounded-full text-xs font-semibold transition-all",
                                activePreset === p.id
                                    ? "bg-slate-900 text-white shadow"
                                    : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                            )}
                        >
                            {p.label}
                        </button>
                    ))}
                    <div className="flex items-center gap-2 ml-auto">
                        <span
                            className={cn(
                                "text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full",
                                activePreset === "custom"
                                    ? "bg-sky-100 text-sky-700"
                                    : "bg-slate-100 text-slate-400",
                            )}
                        >
                            Custom
                        </span>
                        <label className="flex items-center gap-1.5">
                            <span className="text-[11px] font-semibold text-slate-400">From</span>
                            <input
                                type="date"
                                value={from}
                                max={to}
                                onChange={(e) => {
                                    if (!e.target.value) return;
                                    setFrom(e.target.value);
                                    setActivePreset("custom");
                                }}
                                className="text-xs font-medium text-slate-700 bg-white ring-1 ring-slate-200 rounded-lg px-2 py-1.5 outline-none focus:ring-sky-400 cursor-pointer"
                            />
                        </label>
                        <span className="text-slate-300 text-xs">→</span>
                        <label className="flex items-center gap-1.5">
                            <span className="text-[11px] font-semibold text-slate-400">To</span>
                            <input
                                type="date"
                                value={to}
                                min={from}
                                max={todayStr()}
                                onChange={(e) => {
                                    if (!e.target.value) return;
                                    setTo(e.target.value);
                                    setActivePreset("custom");
                                }}
                                className="text-xs font-medium text-slate-700 bg-white ring-1 ring-slate-200 rounded-lg px-2 py-1.5 outline-none focus:ring-sky-400 cursor-pointer"
                            />
                        </label>
                    </div>
                </div>

                {/* Filters */}
                <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100">
                    <FilterSelect
                        label="Branch"
                        value={branchId}
                        onChange={setBranchId}
                        options={(data?.filterOptions.branches ?? []).map((b) => ({ value: b.id, label: b.name }))}
                    />
                    <FilterSelect
                        label="Advisor"
                        value={advisor}
                        onChange={setAdvisor}
                        options={(data?.filterOptions.advisors ?? []).map((v) => ({ value: v, label: v }))}
                    />
                    <FilterSelect
                        label="Model"
                        value={model}
                        onChange={setModel}
                        options={(data?.filterOptions.models ?? []).map((v) => ({ value: v, label: v }))}
                    />
                    <FilterSelect
                        label="Insurer"
                        value={insurer}
                        onChange={setInsurer}
                        options={(data?.filterOptions.insurers ?? []).map((v) => ({ value: v, label: v }))}
                    />
                    {hasFilters && (
                        <button
                            onClick={resetFilters}
                            className="text-xs font-semibold text-rose-600 hover:text-rose-700 px-2 py-1.5"
                        >
                            Clear filters
                        </button>
                    )}
                </div>
            </div>

            {error && (
                <div className="rounded-2xl bg-rose-50 ring-1 ring-rose-200 px-4 py-3 text-sm text-rose-700">
                    {error}
                </div>
            )}

            {/* KPI cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <KpiCard icon={ClipboardList} label="Total ROs" value={num(data?.totals.totalRos ?? 0)} sub="in range" tint="sky" loading={loading} />
                <KpiCard icon={Activity} label="Open ROs" value={num(data?.totals.openRos ?? 0)} sub="current" tint="amber" loading={loading} />
                <KpiCard icon={CheckCircle2} label="Delivered" value={num(data?.totals.deliveredRos ?? 0)} sub={`${data?.totals.deliveryRate ?? 0}% delivery rate`} tint="emerald" loading={loading} />
                <KpiCard icon={Clock} label="Avg TAT (delivered)" value={`${data?.totals.avgTatDays ?? 0} d`} sub="in range" tint="indigo" loading={loading} />
                <KpiCard icon={Gauge} label="Avg Age (open)" value={`${data?.totals.avgOpenAgeDays ?? 0} d`} sub="current" tint="violet" loading={loading} />
                <KpiCard icon={TrendingUp} label="Delivery Rate" value={`${data?.totals.deliveryRate ?? 0}%`} sub="in range" tint="cyan" loading={loading} />
                <KpiCard icon={Wallet} label="Total Labour" value={currency(data?.totals.totalLabourAmount ?? 0)} sub="billed · in range" tint="teal" loading={loading} />
                <KpiCard icon={Package} label="Total Parts" value={currency(data?.totals.totalPartsAmount ?? 0)} sub="billed · in range" tint="orange" loading={loading} />
            </div>

            {/* Monthly trend */}
            <div className="panel-surface rounded-2xl p-4 sm:p-5">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h2 className="text-sm font-bold text-slate-900">Monthly Throughput</h2>
                        <p className="text-xs text-slate-500">Created vs delivered ROs, with average TAT</p>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                        <Legend color="bg-sky-500" label="Created" />
                        <Legend color="bg-emerald-500" label="Delivered" />
                        <Legend color="bg-amber-400" label="Avg TAT / mo" />
                    </div>
                </div>
                <MonthlyChart months={data?.monthly ?? []} loading={loading} />
            </div>

            {/* Billing trend: Labour vs Parts */}
            <div className="panel-surface rounded-2xl p-4 sm:p-5">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h2 className="text-sm font-bold text-slate-900">Billing Trend</h2>
                        <p className="text-xs text-slate-500">Labour vs parts billed, per month</p>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                        <Legend color="bg-teal-500" label="Labour" />
                        <Legend color="bg-orange-500" label="Parts" />
                    </div>
                </div>
                <MonthlyBillingChart months={data?.monthly ?? []} loading={loading} />
            </div>

            {/* Status + Aging — split by category: Bodyshop's 18-stage workflow and
                Service's 2-stage workflow don't share a stage vocabulary, so each gets
                its own panel instead of being lumped into one mixed chart. */}
            {(category === "all" || category === "bodyshop") && (
                <StageAgingSection
                    title="Bodyshop"
                    statusItems={(data?.statusDistribution.bodyshop ?? []).map((s) => ({
                        label: s.status,
                        value: s.count,
                        percent: s.percent,
                    }))}
                    agingItems={(data?.aging.bodyshop ?? []).map((a) => ({
                        label: a.range,
                        value: a.count,
                        percent: a.percent,
                    }))}
                    loading={loading}
                />
            )}
            {(category === "all" || category === "service") && (
                <StageAgingSection
                    title="Service"
                    statusItems={(data?.statusDistribution.service ?? []).map((s) => ({
                        label: s.status,
                        value: s.count,
                        percent: s.percent,
                    }))}
                    agingItems={(data?.aging.service ?? []).map((a) => ({
                        label: a.range,
                        value: a.count,
                        percent: a.percent,
                    }))}
                    loading={loading}
                />
            )}

            {/* Breakdown by dimension */}
            <div className="panel-surface rounded-2xl p-4 sm:p-5">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                    <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-1">
                        {DIMENSIONS.map((d) => (
                            <button
                                key={d.key}
                                onClick={() => setDim(d.key)}
                                className={cn(
                                    "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all",
                                    dim === d.key
                                        ? "bg-slate-900 text-white shadow"
                                        : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                                )}
                            >
                                <d.icon className="w-3.5 h-3.5" />
                                {d.label}
                            </button>
                        ))}
                    </div>
                    <div className="flex items-center gap-2">
                        <select
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value as keyof BreakdownRow)}
                            className="text-xs font-medium text-slate-700 bg-slate-100 rounded-xl px-2.5 py-1.5 outline-none"
                        >
                            <option value="total">Sort: Total ROs</option>
                            <option value="open">Sort: Open</option>
                            <option value="delivered">Sort: Delivered</option>
                            <option value="avgTat">Sort: Avg TAT</option>
                            <option value="labourAmount">Sort: Labour</option>
                            <option value="partsAmount">Sort: Parts</option>
                        </select>
                        <button
                            onClick={exportCsv}
                            disabled={!data || rows.length === 0}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 transition-colors"
                        >
                            <Download className="w-3.5 h-3.5" />
                            CSV
                        </button>
                    </div>
                </div>
                <p className="text-[11px] text-slate-400 -mt-2 mb-3">
                    Open reflects current status; Total, Delivered, Avg TAT, Labour &amp; Parts reflect the selected date range.
                </p>

                <div className="mb-5">
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400">
                            Billing by {DIMENSIONS.find((d) => d.key === dim)?.label}
                        </h3>
                        <div className="flex items-center gap-3 text-xs">
                            <Legend color="bg-teal-500" label="Labour" />
                            <Legend color="bg-orange-500" label="Parts" />
                        </div>
                    </div>
                    <BillingBarList rows={rows} loading={loading} />
                </div>

                <BreakdownTable rows={rows} loading={loading} />
            </div>
        </div>
    );
}

function FilterSelect({
    label,
    value,
    onChange,
    options,
}: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    options: { value: string; label: string }[];
}) {
    return (
        <div className="relative">
            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className={cn(
                    "appearance-none text-xs font-medium rounded-xl pl-2.5 pr-7 py-1.5 outline-none ring-1 transition-colors cursor-pointer",
                    value
                        ? "bg-sky-50 text-sky-700 ring-sky-300"
                        : "bg-slate-100 text-slate-600 ring-transparent hover:bg-slate-200",
                )}
            >
                <option value="">{label}: All</option>
                {options.map((o) => (
                    <option key={o.value} value={o.value}>
                        {o.label}
                    </option>
                ))}
            </select>
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-[10px]">▼</span>
        </div>
    );
}

const TINTS: Record<string, { bg: string; text: string; ring: string }> = {
    sky: { bg: "bg-sky-50", text: "text-sky-600", ring: "ring-sky-100" },
    amber: { bg: "bg-amber-50", text: "text-amber-600", ring: "ring-amber-100" },
    emerald: { bg: "bg-emerald-50", text: "text-emerald-600", ring: "ring-emerald-100" },
    rose: { bg: "bg-rose-50", text: "text-rose-600", ring: "ring-rose-100" },
    indigo: { bg: "bg-indigo-50", text: "text-indigo-600", ring: "ring-indigo-100" },
    violet: { bg: "bg-violet-50", text: "text-violet-600", ring: "ring-violet-100" },
    teal: { bg: "bg-teal-50", text: "text-teal-600", ring: "ring-teal-100" },
    cyan: { bg: "bg-cyan-50", text: "text-cyan-600", ring: "ring-cyan-100" },
    orange: { bg: "bg-orange-50", text: "text-orange-600", ring: "ring-orange-100" },
};

function KpiCard({
    icon: Icon,
    label,
    value,
    sub,
    tint,
    loading,
}: {
    icon: typeof ClipboardList;
    label: string;
    value: string;
    sub?: string;
    tint: keyof typeof TINTS | string;
    loading?: boolean;
}) {
    const t = TINTS[tint] ?? TINTS.sky;
    return (
        <div className="panel-surface rounded-2xl p-4 flex items-start gap-3 hover:shadow-lg transition-shadow">
            <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ring-1", t.bg, t.ring)}>
                <Icon className={cn("w-5 h-5", t.text)} />
            </div>
            <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 truncate">{label}</p>
                {loading ? (
                    <div className="h-7 w-16 mt-1 rounded bg-slate-100 animate-pulse" />
                ) : (
                    <p className="text-2xl font-bold text-slate-900 leading-tight tabular-nums">{value}</p>
                )}
                {sub && !loading && <p className="text-[11px] text-slate-400 truncate mt-0.5">{sub}</p>}
            </div>
        </div>
    );
}

function Legend({ color, label, line }: { color: string; label: string; line?: boolean }) {
    return (
        <span className="inline-flex items-center gap-1.5 text-slate-500">
            <span className={cn(color, line ? "w-3 h-0.5" : "w-2.5 h-2.5 rounded-sm")} />
            {label}
        </span>
    );
}

function MonthlyChart({ months, loading }: { months: MonthRow[]; loading?: boolean }) {
    if (loading) return <div className="h-64 rounded-xl bg-slate-50 animate-pulse" />;
    if (months.length === 0) return <EmptyState label="No data in this range" height="h-64" />;

    const TRACK = 200; // px height of the plot area
    const maxCount = Math.max(1, ...months.map((m) => Math.max(m.created, m.delivered)));
    const barPx = (v: number) => (v > 0 ? Math.max(4, Math.round((v / maxCount) * TRACK)) : 0);

    return (
        <div className="w-full overflow-x-auto custom-scrollbar pb-1">
            <div
                className="flex items-end justify-center gap-5 sm:gap-7 min-w-full px-2"
                style={{ minHeight: TRACK + 56 }}
            >
                {months.map((m) => (
                    <div key={m.month} className="flex flex-col items-center shrink-0" style={{ width: 64 }}>
                        {/* Plot area */}
                        <div className="flex items-end justify-center gap-1.5" style={{ height: TRACK }}>
                            <BarColumn value={m.created} heightPx={barPx(m.created)} barClass="bg-sky-500" />
                            <BarColumn value={m.delivered} heightPx={barPx(m.delivered)} barClass="bg-emerald-500" />
                        </div>
                        {/* Axis label */}
                        <div className="mt-2 text-center">
                            <div className="text-xs font-semibold text-slate-600 whitespace-nowrap">{m.label}</div>
                            <div className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600 ring-1 ring-amber-100">
                                {m.avgTat}d TAT
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function BarColumn({
    value,
    heightPx,
    barClass,
    label,
    title,
}: {
    value: number;
    heightPx: number;
    barClass: string;
    label?: string;
    title?: string;
}) {
    return (
        <div className="flex flex-col items-center justify-end h-full" title={title}>
            <span className="mb-1 text-[11px] font-bold text-slate-700 tabular-nums leading-none whitespace-nowrap">
                {label ?? value}
            </span>
            <div
                className={cn("w-6 rounded-t-md transition-all duration-500", value > 0 ? barClass : "bg-slate-200")}
                style={{ height: `${Math.max(heightPx, value > 0 ? heightPx : 3)}px` }}
            />
        </div>
    );
}

function MonthlyBillingChart({ months, loading }: { months: MonthRow[]; loading?: boolean }) {
    if (loading) return <div className="h-64 rounded-xl bg-slate-50 animate-pulse" />;
    if (months.length === 0) return <EmptyState label="No data in this range" height="h-64" />;

    const TRACK = 200; // px height of the plot area
    const maxAmount = Math.max(1, ...months.map((m) => Math.max(m.labor, m.parts)));
    const barPx = (v: number) => (v > 0 ? Math.max(4, Math.round((v / maxAmount) * TRACK)) : 0);

    return (
        <div className="w-full overflow-x-auto custom-scrollbar pb-1">
            <div
                className="flex items-end justify-center gap-5 sm:gap-7 min-w-full px-2"
                style={{ minHeight: TRACK + 40 }}
            >
                {months.map((m) => (
                    <div key={m.month} className="flex flex-col items-center shrink-0" style={{ width: 64 }}>
                        {/* Plot area */}
                        <div className="flex items-end justify-center gap-1.5" style={{ height: TRACK }}>
                            <BarColumn
                                value={m.labor}
                                heightPx={barPx(m.labor)}
                                barClass="bg-teal-500"
                                label={compactCurrency(m.labor)}
                                title={`Labour · ${currency(m.labor)}`}
                            />
                            <BarColumn
                                value={m.parts}
                                heightPx={barPx(m.parts)}
                                barClass="bg-orange-500"
                                label={compactCurrency(m.parts)}
                                title={`Parts · ${currency(m.parts)}`}
                            />
                        </div>
                        {/* Axis label */}
                        <div className="mt-2 text-center">
                            <div className="text-xs font-semibold text-slate-600 whitespace-nowrap">{m.label}</div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function BillingBarList({ rows, loading }: { rows: BreakdownRow[]; loading?: boolean }) {
    if (loading)
        return (
            <div className="space-y-2.5">
                {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-7 rounded-lg bg-slate-50 animate-pulse" />
                ))}
            </div>
        );
    if (rows.length === 0) return <EmptyState label="No data" height="h-40" />;

    const top = rows.slice(0, 8);
    const maxTotalAmount = Math.max(1, ...top.map((r) => r.labourAmount + r.partsAmount));

    return (
        <div className="space-y-2.5">
            {top.map((r) => {
                const totalAmount = r.labourAmount + r.partsAmount;
                const trackWidth = (totalAmount / maxTotalAmount) * 100;
                const labourShare = totalAmount > 0 ? (r.labourAmount / totalAmount) * 100 : 0;
                const partsShare = totalAmount > 0 ? (r.partsAmount / totalAmount) * 100 : 0;
                return (
                    <div key={r.key} className="group">
                        <div className="flex items-center justify-between text-xs mb-1">
                            <span className="font-medium text-slate-700 truncate pr-2">{r.label}</span>
                            <span className="text-slate-400 tabular-nums shrink-0">{currency(totalAmount)}</span>
                        </div>
                        <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden flex" style={{ width: `${trackWidth}%`, minWidth: totalAmount > 0 ? "2%" : 0 }}>
                            {r.labourAmount > 0 && (
                                <div
                                    className="h-full bg-teal-500 first:rounded-l-full"
                                    style={{ width: `${labourShare}%` }}
                                    title={`Labour · ${currency(r.labourAmount)}`}
                                />
                            )}
                            {r.partsAmount > 0 && (
                                <div
                                    className="h-full bg-orange-500 last:rounded-r-full"
                                    style={{ width: `${partsShare}%`, marginLeft: r.labourAmount > 0 ? 2 : 0 }}
                                    title={`Parts · ${currency(r.partsAmount)}`}
                                />
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

function StageAgingSection({
    title,
    statusItems,
    agingItems,
    loading,
}: {
    title: string;
    statusItems: { label: string; value: number; percent: number }[];
    agingItems: { label: string; value: number; percent: number }[];
    loading?: boolean;
}) {
    return (
        <div className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wide text-slate-400">{title}</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="panel-surface rounded-2xl p-4 sm:p-5">
                    <h3 className="text-sm font-bold text-slate-900 mb-1">Open ROs by Stage</h3>
                    <p className="text-xs text-slate-500 mb-4">Currently open {title} ROs, by stage (not limited by the date range)</p>
                    <BarList items={statusItems} color="bg-gradient-to-r from-sky-500 to-indigo-500" loading={loading} />
                </div>
                <div className="panel-surface rounded-2xl p-4 sm:p-5">
                    <h3 className="text-sm font-bold text-slate-900 mb-1">Aging of Open ROs</h3>
                    <p className="text-xs text-slate-500 mb-4">How long open {title} jobs have been in the shop</p>
                    <BarList items={agingItems} color="bg-gradient-to-r from-amber-400 to-rose-500" loading={loading} />
                </div>
            </div>
        </div>
    );
}

function BarList({
    items,
    color,
    loading,
}: {
    items: { label: string; value: number; percent: number }[];
    color: string;
    loading?: boolean;
}) {
    if (loading)
        return (
            <div className="space-y-2.5">
                {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-7 rounded-lg bg-slate-50 animate-pulse" />
                ))}
            </div>
        );
    if (items.length === 0) return <EmptyState label="No data" height="h-40" />;
    const max = Math.max(1, ...items.map((i) => i.value));
    return (
        <div className="space-y-2.5 max-h-[420px] overflow-y-auto custom-scrollbar pr-1">
            {items.map((item) => (
                <div key={item.label} className="group">
                    <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-medium text-slate-700 truncate pr-2">{item.label}</span>
                        <span className="text-slate-400 tabular-nums shrink-0">
                            {num(item.value)} <span className="text-slate-300">·</span> {item.percent}%
                        </span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div
                            className={cn("h-full rounded-full transition-all duration-500", color)}
                            style={{ width: `${(item.value / max) * 100}%` }}
                        />
                    </div>
                </div>
            ))}
        </div>
    );
}

function BreakdownTable({ rows, loading }: { rows: BreakdownRow[]; loading?: boolean }) {
    if (loading)
        return (
            <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-11 rounded-lg bg-slate-50 animate-pulse" />
                ))}
            </div>
        );
    if (rows.length === 0) return <EmptyState label="No records for this selection" height="h-40" />;
    const maxTotal = Math.max(1, ...rows.map((r) => r.total));

    return (
        <div className="overflow-x-auto custom-scrollbar -mx-1">
            <table className="w-full text-sm min-w-[860px]">
                <thead>
                    <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400 border-b border-slate-100">
                        <th className="py-2 px-2">Name</th>
                        <th className="py-2 px-2 w-[22%]">Volume</th>
                        <th className="py-2 px-2 text-right">Open</th>
                        <th className="py-2 px-2 text-right">Delivered</th>
                        <th className="py-2 px-2 text-right">Avg TAT</th>
                        <th className="py-2 px-2 text-right">Labour</th>
                        <th className="py-2 px-2 text-right">Parts</th>
                        <th className="py-2 px-2 text-right">Share</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((r) => (
                        <tr key={r.key} className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors">
                            <td className="py-2.5 px-2 font-medium text-slate-800 max-w-[200px] truncate">{r.label}</td>
                            <td className="py-2.5 px-2">
                                <div className="flex items-center gap-2">
                                    <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                                        <div
                                            className="h-full rounded-full bg-gradient-to-r from-sky-500 to-indigo-500"
                                            style={{ width: `${(r.total / maxTotal) * 100}%` }}
                                        />
                                    </div>
                                    <span className="tabular-nums text-slate-700 font-semibold w-8 text-right">{r.total}</span>
                                </div>
                            </td>
                            <td className="py-2.5 px-2 text-right tabular-nums text-amber-600 font-medium">{r.open}</td>
                            <td className="py-2.5 px-2 text-right tabular-nums text-emerald-600 font-medium">{r.delivered}</td>
                            <td className="py-2.5 px-2 text-right tabular-nums text-slate-700">{r.avgTat} d</td>
                            <td className="py-2.5 px-2 text-right tabular-nums text-teal-600 font-medium">{currency(r.labourAmount)}</td>
                            <td className="py-2.5 px-2 text-right tabular-nums text-orange-600 font-medium">{currency(r.partsAmount)}</td>
                            <td className="py-2.5 px-2 text-right tabular-nums text-slate-500">{r.share}%</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function EmptyState({ label, height }: { label: string; height: string }) {
    return (
        <div className={cn("flex items-center justify-center rounded-xl bg-slate-50/60 text-sm text-slate-400", height)}>
            {label}
        </div>
    );
}
