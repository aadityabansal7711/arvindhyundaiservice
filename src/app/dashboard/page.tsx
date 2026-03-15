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
                <div className="space-y-8 animate-pulse">
                    <div className="h-8 bg-slate-200 rounded w-1/4" />
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                        {[1, 2, 3, 4].map(i => <div key={i} className="h-32 bg-slate-100 rounded-2xl" />)}
                    </div>
                </div>
            </DashboardLayout>
        );
    }

    if (error) {
        return (
            <DashboardLayout>
                <div className="space-y-8">
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-800">
                        <p className="font-medium">{error}</p>
                        <button onClick={fetchDashboardData} className="mt-3 text-sm font-semibold text-rose-600 hover:underline">
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
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Welcome back, {session?.user?.name}</h1>
                    <p className="text-slate-500 mt-1">Here's what's happening in your bodyshop today.</p>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    {(data?.stats ?? []).map((stat: any) => {
                        const Icon = iconMap[stat.icon] || ClipboardList;
                        return (
                            <div key={stat.name} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
                                <div className="flex justify-between items-start">
                                    <div className={cn("p-3 rounded-xl text-white shadow-lg", stat.color)}>
                                        <Icon className="w-6 h-6" />
                                    </div>
                                    <div className={cn(
                                        "flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg",
                                        stat.trendUp ? "text-emerald-600 bg-emerald-50" : "text-rose-600 bg-rose-50"
                                    )}>
                                        {stat.trendUp ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                                        {stat.trend}
                                    </div>
                                </div>
                                <div className="mt-4">
                                    <p className="text-sm font-medium text-slate-500 uppercase tracking-wider">{stat.name}</p>
                                    <div className="flex items-baseline gap-2 mt-1">
                                        <h3 className="text-3xl font-bold text-slate-900">{stat.value}</h3>
                                    </div>
                                </div>
                                <div className={cn("absolute -bottom-6 -right-6 w-24 h-24 rounded-full opacity-5 group-hover:scale-110 transition-transform", stat.color)} />
                            </div>
                        );
                    })}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-2 space-y-6">
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-lg font-bold text-slate-900">Recent Activity</h2>
                                <button className="text-blue-600 text-sm font-semibold hover:underline">View All</button>
                            </div>
                            <div className="space-y-4">
                                {(data?.recentActivity ?? []).length > 0 ? (
                                    (data?.recentActivity ?? []).map((activity: any) => (
                                        <div key={activity.id} className="flex items-center gap-4 p-3 hover:bg-slate-50 rounded-xl transition-colors border border-transparent hover:border-slate-100">
                                            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-500 text-xs">
                                                {activity.user.substring(0, 2).toUpperCase()}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-semibold text-slate-900 truncate">{activity.text}</p>
                                                <p className="text-xs text-slate-500">Updated by {activity.user} ({activity.role}) • {formatDistanceToNow(new Date(activity.time))} ago</p>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <p className="text-slate-500 text-sm text-center py-4 italic">No recent activity detected.</p>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                            <h2 className="text-lg font-bold text-slate-900 mb-4">Aging Analysis</h2>
                            <div className="space-y-4">
                                {(data?.agingAnalysis ?? []).map((item: any, idx: number) => (
                                    <div key={item.range} className="space-y-1.5">
                                        <div className="flex justify-between text-xs font-semibold">
                                            <span className="text-slate-600">{item.range}</span>
                                            <span className="text-slate-900">{item.count} Vehicles</span>
                                        </div>
                                        <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                                            <div className={cn("h-full rounded-full", agingColors[idx])} style={{ width: item.percent }} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {data?.billingAlertsCount > 0 && (
                            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 bg-gradient-to-br from-rose-50/50 to-white">
                                <div className="flex items-center gap-2 mb-4 text-rose-600">
                                    <AlertCircle className="w-5 h-5 font-bold" />
                                    <h2 className="text-lg font-bold">Billing Alerts</h2>
                                </div>
                                <p className="text-sm text-slate-600 mb-4">You have {data.billingAlertsCount} ROs with receivable differences over ₹10,000.</p>
                                <button className="w-full py-2.5 bg-rose-600 text-white rounded-xl text-sm font-semibold shadow-lg shadow-rose-600/20 hover:bg-rose-700 transition-all">
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

