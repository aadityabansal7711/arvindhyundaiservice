import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth-options";
import { listBodyshopJobs } from "@/lib/bodyshop-repo";
import { getBranchScopeForSessionUser } from "@/lib/bypass-only-user";

type DashboardPayload = {
    stats: {
        name: string;
        value: string;
        icon: string;
        color: string;
        trend: string;
        trendUp: boolean;
    }[];
    recentActivity: never[];
    agingAnalysis: {
        range: string;
        count: number;
        percent: string;
    }[];
    billingAlertsCount: number;
};

type CacheEntry = { value: DashboardPayload; expiresAt: number };
const dashboardCache = new Map<string, CacheEntry>();

function getCachedDashboard(key: string): DashboardPayload | null {
    const hit = dashboardCache.get(key);
    if (!hit) return null;
    if (Date.now() > hit.expiresAt) {
        dashboardCache.delete(key);
        return null;
    }
    return hit.value;
}

function setCachedDashboard(key: string, value: DashboardPayload) {
    dashboardCache.set(key, { value, expiresAt: Date.now() + 30_000 });
}

export async function GET(_req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const scope = await getBranchScopeForSessionUser(session.user as any);
        const cacheKey =
            scope.kind === "all" ? "dashboard:all" : `dashboard:${scope.ids.join(",")}`;
        const cached = getCachedDashboard(cacheKey);
        if (cached) {
            const res = NextResponse.json(cached);
            res.headers.set("Cache-Control", "private, max-age=30, stale-while-revalidate=120");
            return res;
        }

        const jobs = await listBodyshopJobs({
            limit: 6000,
            statusSection: "All",
            branchIds: scope.kind === "all" ? undefined : scope.ids,
            select: "id,ro_no,branch_id,ro_date,status_section,promised_date",
        });
        let openCount = 0;
        let deliveredCount = 0;
        let deliveredAgeTotal = 0;
        let pendingApprovalCount = 0;
        let readyForDeliveryCount = 0;
        const agingRanges = [
            { label: "0-3 Days", minDays: 0, maxDays: 3 },
            { label: "4-7 Days", minDays: 4, maxDays: 7 },
            { label: "8-15 Days", minDays: 8, maxDays: 15 },
            { label: "15+ Days", minDays: 15, maxDays: 999 },
        ];
        const agingCounts = agingRanges.map(() => 0);

        for (const job of jobs) {
            if (job.status_section.includes("Approval")) {
                pendingApprovalCount += 1;
            }
            if (job.status_section === "Ready for Pre-Invoice") {
                readyForDeliveryCount += 1;
            }
            if (job.status_section === "Delivered") {
                deliveredCount += 1;
                deliveredAgeTotal += job.age_days;
                continue;
            }

            openCount += 1;
            agingRanges.forEach((range, index) => {
                const inRange =
                    range.maxDays >= 999
                        ? job.age_days >= range.minDays
                        : job.age_days >= range.minDays && job.age_days <= range.maxDays;
                if (inRange) agingCounts[index] += 1;
            });
        }

        const agingAnalysis = agingRanges.map((range, index) => {
            const count = agingCounts[index] ?? 0;
            return {
                range: range.label,
                count,
                percent: openCount > 0 ? `${((count / openCount) * 100).toFixed(0)}%` : "0%",
            };
        });

        const avgTat = deliveredCount > 0 ? deliveredAgeTotal / deliveredCount : 0;

        const payload: DashboardPayload = {
            stats: [
                { name: "Open ROs", value: openCount.toString(), icon: "ClipboardList", color: "bg-blue-600", trend: "+0", trendUp: true },
                { name: "Avg TAT", value: `${avgTat.toFixed(1)} Days`, icon: "Clock", color: "bg-indigo-600", trend: "+0", trendUp: false },
                { name: "Pending Approval", value: pendingApprovalCount.toString(), icon: "AlertCircle", color: "bg-amber-500", trend: "+0", trendUp: true },
                { name: "Ready for Delivery", value: readyForDeliveryCount.toString(), icon: "CheckCircle2", color: "bg-emerald-500", trend: "+0", trendUp: true },
            ],
            recentActivity: [],
            agingAnalysis,
            billingAlertsCount: 0,
        };
        setCachedDashboard(cacheKey, payload);

        const res = NextResponse.json(payload);
        res.headers.set("Cache-Control", "private, max-age=30, stale-while-revalidate=120");
        return res;
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
