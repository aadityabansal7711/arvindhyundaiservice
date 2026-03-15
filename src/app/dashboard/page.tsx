"use client";
import { useSession } from "next-auth/react";
import { useState, useEffect } from "react";
import { apiGet } from "@/lib/api";
import DashboardLayout from "@/components/layout/dashboard-layout";
import {
    ClipboardList,
    Clock,
    AlertCircle,
    CheckCircle2,
    TrendingUp,
    ArrowUpRight,
    ArrowDownRight,
    LucideIcon
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

const iconMap: Record<string, LucideIcon> = {
    ClipboardList,
    Clock,
    AlertCircle,
    CheckCircle2,
    TrendingUp
};

export default function DashboardPage() {
    const { data: session } = useSession();
    const [data, setData] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchDashboardData = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const res = await apiGet<any>("/api/dashboard");
            setData(res);
        } catch (err) {
            if ((err as Error)?.message !== "Unauthorized") {
                console.error("Failed to fetch dashboard data:", err);
                setError("Failed to load dashboard. Please try again.");
            }
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchDashboardData();
    }, []);

    const agingColors = ["bg-blue-500", "bg-indigo-500", "bg-amber-500", "bg-rose-500"];

    if (isLoading) {
        return (
            <DashboardLayout>
                <div className="space-y-8">
                    <div className="space-y-2">
                        <div className="h-8 bg-slate-200/80 rounded-lg w-48 animate-pulse" />
                        <div className="h-4 bg-slate-100 rounded w-72 animate-pulse" />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                        {[1, 2, 3, 4].map(i => (
                            <div key={i} className="h-36 bg-white rounded-2xl border border-slate-200/80 shadow-sm animate-pulse" />
                        ))}
                    </div>
                </div>
            </DashboardLayout>
        );
    }

    if (error) {
        return (
            <DashboardLayout>
                <div className="space-y-8">
                    <div className="rounded-2xl border border-rose-200 bg-gradient-to-br from-rose-50 to-white p-6 text-rose-800 shadow-sm">
                        <p className="font-medium">{error}</p>
                        <button
                            onClick={fetchDashboardData}
                            className="mt-4 px-4 py-2 bg-rose-600 text-white rounded-xl text-sm font-semibold hover:bg-rose-700 transition-colors"
                        >
                            Retry
                        </button>
                    </div>
                </div>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout>
            <div className="space-y-8">
                <div>
                    <h1 className="text-2xl lg:text-3xl font-bold text-slate-900 tracking-tight">Welcome back, {session?.user?.name}</h1>
                    <p className="text-slate-500 mt-1.5 text-base">Here's what's happening in your bodyshop today.</p>
                </div>

                {/* Stats Grid - elevated cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                    {(data?.stats ?? []).map((stat: any) => {
                        const Icon = iconMap[stat.icon] || ClipboardList;
                        return (
                            <div
                                key={stat.name}
                                className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-[var(--card-shadow)] hover:shadow-[var(--card-shadow-hover)] hover:border-slate-200 transition-all duration-300 relative overflow-hidden group"
                            >
                                <div className="flex justify-between items-start">
                                    <div className={cn("p-3.5 rounded-xl text-white shadow-lg ring-2 ring-white/20", stat.color)}>
                                        <Icon className="w-6 h-6" />
                                    </div>
                                    <div className={cn(
                                        "flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg",
                                        stat.trendUp ? "text-emerald-600 bg-emerald-50" : "text-rose-600 bg-rose-50"
                                    )}>
                                        {stat.trendUp ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                                        {stat.trend}
                                    </div>
                                </div>
                                <div className="mt-5">
                                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{stat.name}</p>
                                    <h3 className="text-3xl font-bold text-slate-900 mt-1 tabular-nums">{stat.value}</h3>
                                </div>
                                <div className={cn("absolute -bottom-8 -right-8 w-32 h-32 rounded-full opacity-[0.07] group-hover:opacity-[0.12] transition-opacity", stat.color)} />
                            </div>
                        );
                    })}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2">
                        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-[var(--card-shadow)] p-6 lg:p-7">
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-lg font-bold text-slate-900">Recent Activity</h2>
                                <button className="text-blue-600 text-sm font-semibold hover:text-blue-700 transition-colors">View All</button>
                            </div>
                            <div className="space-y-3">
                                {(data?.recentActivity ?? []).length > 0 ? (
                                    (data?.recentActivity ?? []).map((activity: any) => (
                                        <div key={activity.id} className="flex items-center gap-4 p-3.5 hover:bg-slate-50/80 rounded-xl transition-colors border border-transparent hover:border-slate-100">
                                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center font-bold text-slate-600 text-sm shrink-0">
                                                {activity.user.substring(0, 2).toUpperCase()}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-semibold text-slate-900 truncate">{activity.text}</p>
                                                <p className="text-xs text-slate-500 mt-0.5">Updated by {activity.user} ({activity.role}) • {formatDistanceToNow(new Date(activity.time))} ago</p>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-center py-10 px-4 rounded-xl bg-slate-50/50 border border-dashed border-slate-200">
                                        <p className="text-slate-500 text-sm">No recent activity detected.</p>
                                        <p className="text-slate-400 text-xs mt-1">Activity will appear here as ROs are updated.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-[var(--card-shadow)] p-6 lg:p-7">
                            <h2 className="text-lg font-bold text-slate-900 mb-5">Aging Analysis</h2>
                            <div className="space-y-5">
                                {(data?.agingAnalysis ?? []).map((item: any, idx: number) => (
                                    <div key={item.range} className="space-y-2">
                                        <div className="flex justify-between text-sm">
                                            <span className="text-slate-600 font-medium">{item.range}</span>
                                            <span className="text-slate-900 font-semibold tabular-nums">{item.count} Vehicles</span>
                                        </div>
                                        <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                            <div
                                                className={cn("h-full rounded-full transition-all duration-500", agingColors[idx])}
                                                style={{ width: item.percent || "0%" }}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {data?.billingAlertsCount > 0 && (
                            <div className="bg-gradient-to-br from-rose-50 to-white rounded-2xl border border-rose-200/60 shadow-[var(--card-shadow)] p-6">
                                <div className="flex items-center gap-2 mb-4 text-rose-600">
                                    <AlertCircle className="w-5 h-5 font-bold shrink-0" />
                                    <h2 className="text-lg font-bold">Billing Alerts</h2>
                                </div>
                                <p className="text-sm text-slate-600 mb-4">You have {data.billingAlertsCount} ROs with receivable differences over ₹10,000.</p>
                                <button className="w-full py-2.5 bg-rose-600 text-white rounded-xl text-sm font-semibold shadow-lg shadow-rose-600/25 hover:bg-rose-700 hover:shadow-rose-600/30 transition-all">
                                    Investigation Report
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}

