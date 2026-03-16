"use client";

import { useSession } from "next-auth/react";
import DashboardLayout from "@/components/layout/dashboard-layout";

export default function DashboardPage() {
    const { data: session } = useSession();

    // TODO: Replace these hard-coded values with real API data when available
    const stats = [
        {
            label: "Open RO today",
            value: "12",
            trend: "+3 vs yesterday",
            tone: "positive" as const,
        },
        {
            label: "Claims awaiting approval",
            value: "5",
            trend: "2 overdue",
            tone: "warning" as const,
        },
        {
            label: "Cars in workshop",
            value: "18",
            trend: "Avg. cycle 3.2 days",
            tone: "neutral" as const,
        },
        {
            label: "Delivery today",
            value: "9",
            trend: "+4 booked",
            tone: "positive" as const,
        },
    ];

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div>
                    <h1 className="text-2xl lg:text-3xl font-bold text-slate-900 tracking-tight">
                        Welcome back, {session?.user?.name}
                    </h1>
                    <p className="text-slate-500 mt-1.5 text-base">
                        Here's what's happening in your bodyshop today.
                    </p>
                </div>

                <div className="grid gap-4 md:gap-5 grid-template-cols-[repeat(auto-fit,minmax(180px,1fr))]">
                    {stats.map((stat) => (
                        <div
                            key={stat.label}
                            className="rounded-2xl border border-slate-200 bg-white shadow-sm px-4 py-4 md:px-5 md:py-5 flex flex-col justify-between min-h-[110px]"
                        >
                            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                                {stat.label}
                            </p>
                            <div className="mt-2 flex items-baseline justify-between gap-2">
                                <span className="text-2xl md:text-3xl font-bold text-slate-900">
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
                    ))}
                </div>
            </div>
        </DashboardLayout>
    );
}
