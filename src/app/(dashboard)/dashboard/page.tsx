"use client";

import { useSession } from "next-auth/react";
import { AlertTriangle, CalendarCheck, CarFront, ClipboardList } from "lucide-react";

export default function DashboardPage() {
    const { data: session } = useSession();

    // TODO: Replace these hard-coded values with real API data when available
    const stats = [
        {
            label: "Open RO today",
            value: "12",
            trend: "+3 vs yesterday",
            tone: "positive" as const,
            icon: ClipboardList,
        },
        {
            label: "Claims awaiting approval",
            value: "5",
            trend: "2 overdue",
            tone: "warning" as const,
            icon: AlertTriangle,
        },
        {
            label: "Cars in workshop",
            value: "18",
            trend: "Avg. cycle 3.2 days",
            tone: "neutral" as const,
            icon: CarFront,
        },
        {
            label: "Delivery today",
            value: "9",
            trend: "+4 booked",
            tone: "positive" as const,
            icon: CalendarCheck,
        },
    ];

    return (
            <div className="space-y-6">
                <div className="relative overflow-hidden rounded-[1.75rem] bg-slate-950 px-5 py-6 sm:px-7 sm:py-8 shadow-2xl shadow-slate-950/[0.12]">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_15%,rgba(14,165,233,0.34),transparent_19rem),radial-gradient(circle_at_92%_10%,rgba(245,158,11,0.18),transparent_18rem)]" />
                    <div className="relative max-w-3xl">
                        <div className="text-xs font-bold uppercase tracking-[0.2em] text-sky-200/80">
                            Live workshop view
                        </div>
                        <h1 className="mt-3 text-2xl lg:text-4xl font-bold text-white tracking-tight">
                            Welcome back, {session?.user?.name ?? "team"}
                        </h1>
                        <p className="text-slate-300 mt-2 text-base max-w-2xl">
                            Track active jobs, insurance flow, workshop movement, and today&apos;s delivery work from one place.
                        </p>
                    </div>
                </div>

                <div className="grid gap-4 md:gap-5 [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]">
                    {stats.map((stat) => {
                        const Icon = stat.icon;
                        return (
                        <div
                            key={stat.label}
                            className="panel-surface rounded-2xl px-4 py-4 md:px-5 md:py-5 flex flex-col justify-between min-h-[128px] transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-[var(--card-shadow-hover)]"
                        >
                            <div className="flex items-start justify-between gap-3">
                                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                                    {stat.label}
                                </p>
                                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                                    <Icon className="h-4 w-4" />
                                </span>
                            </div>
                            <div className="mt-2 flex items-baseline justify-between gap-2">
                                <span className="text-3xl md:text-4xl font-bold text-slate-950 tracking-tight">
                                    {stat.value}
                                </span>
                                <span
                                    className={
                                        "text-xs font-medium px-2 py-1 rounded-full whitespace-nowrap " +
                                        (stat.tone === "positive"
                                            ? "bg-emerald-50 text-emerald-700"
                                            : stat.tone === "warning"
                                            ? "bg-amber-50 text-amber-700"
                                            : "bg-slate-50 text-slate-600")
                                    }
                                >
                                    {stat.trend}
                                </span>
                            </div>
                        </div>
                    )})}
                </div>
            </div>
    );
}
