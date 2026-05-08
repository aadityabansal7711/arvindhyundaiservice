import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth-options";
import { listBodyshopJobs } from "@/lib/bodyshop-repo";
import { isBypassOnlyUser, getBypassBranchId } from "@/lib/bypass-only-user";

export async function GET(_req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const bypassOnly = isBypassOnlyUser((session.user as any)?.email);
        const bypassBid = bypassOnly ? await getBypassBranchId() : null;
        const jobs = await listBodyshopJobs({
            limit: 6000,
            statusSection: "All",
            branchIds: bypassOnly ? (bypassBid ? [bypassBid] : []) : undefined,
        });
        const openJobs = jobs.filter((job) => job.status_section !== "Delivered");
        const agingRanges = [
            { label: "0-3 Days", minDays: 0, maxDays: 3 },
            { label: "4-7 Days", minDays: 4, maxDays: 7 },
            { label: "8-15 Days", minDays: 8, maxDays: 15 },
            { label: "15+ Days", minDays: 15, maxDays: 999 },
        ];
        const agingAnalysis = agingRanges.map((range) => {
            const count = openJobs.filter((job) =>
                range.maxDays >= 999
                    ? job.age_days >= range.minDays
                    : job.age_days >= range.minDays && job.age_days <= range.maxDays
            ).length;
            return {
                range: range.label,
                count,
                percent: openJobs.length > 0 ? `${((count / openJobs.length) * 100).toFixed(0)}%` : "0%",
            };
        });

        const deliveredJobs = jobs.filter((job) => job.status_section === "Delivered");
        const avgTat =
            deliveredJobs.length > 0
                ? deliveredJobs.reduce((sum, job) => sum + job.age_days, 0) / deliveredJobs.length
                : 0;

        const res = NextResponse.json({
            stats: [
                { name: "Open ROs", value: openJobs.length.toString(), icon: "ClipboardList", color: "bg-blue-600", trend: "+0", trendUp: true },
                { name: "Avg TAT", value: `${avgTat.toFixed(1)} Days`, icon: "Clock", color: "bg-indigo-600", trend: "+0", trendUp: false },
                { name: "Pending Approval", value: jobs.filter((job) => job.status_section.includes("Approval")).length.toString(), icon: "AlertCircle", color: "bg-amber-500", trend: "+0", trendUp: true },
                { name: "Ready for Delivery", value: jobs.filter((job) => job.status_section === "Ready for Pre-Invoice").length.toString(), icon: "CheckCircle2", color: "bg-emerald-500", trend: "+0", trendUp: true },
            ],
            recentActivity: [],
            agingAnalysis,
            billingAlertsCount: 0,
        });
        res.headers.set("Cache-Control", "private, s-maxage=60, stale-while-revalidate=120");
        return res;
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
