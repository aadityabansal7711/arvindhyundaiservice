import { NextRequest, NextResponse } from "next/server";
import {
    differenceInCalendarDays,
    eachMonthOfInterval,
    format,
    isValid,
    parseISO,
    startOfMonth,
    subMonths,
} from "date-fns";
import { listBodyshopJobs } from "@/lib/bodyshop-repo";
import { getBranchNameMap } from "@/lib/branch-list";
import { requireSession } from "@/lib/server-auth";
import { isOwnerUser } from "@/lib/owner-access";
import type { BodyshopJobWithMeta, JobCategory } from "@/lib/bodyshop-types";

export const dynamic = "force-dynamic";

const UNASSIGNED = "—";

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

function parseDay(value: string | null | undefined): Date | null {
    if (!value) return null;
    const d = parseISO(value);
    return isValid(d) ? d : null;
}

/** Turnaround days for a delivered job: ro_date -> updated_at (delivery proxy). */
function tatForDelivered(job: BodyshopJobWithMeta): number | null {
    const start = parseDay(job.ro_date);
    const end = parseDay(job.updated_at);
    if (!start || !end) return null;
    return Math.max(0, differenceInCalendarDays(end, start));
}

function avg(nums: number[]): number {
    if (nums.length === 0) return 0;
    return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function groupByKey(
    jobs: BodyshopJobWithMeta[],
    keyOf: (j: BodyshopJobWithMeta) => string,
): Map<string, BodyshopJobWithMeta[]> {
    const groups = new Map<string, BodyshopJobWithMeta[]>();
    for (const job of jobs) {
        const key = keyOf(job) || UNASSIGNED;
        const arr = groups.get(key);
        if (arr) arr.push(job);
        else groups.set(key, [job]);
    }
    return groups;
}

/**
 * `rangeJobs` (date-windowed) drives total/delivered/avgTat/labour/parts/share.
 * `openAllTime` (unwindowed, already status!=="Delivered") drives open,
 * so per-row "Open" matches the all-time Open ROs KPI instead of the date filter.
 */
function buildBreakdown(
    rangeJobs: BodyshopJobWithMeta[],
    openAllTime: BodyshopJobWithMeta[],
    keyOf: (j: BodyshopJobWithMeta) => string,
    labelOf: (key: string) => string,
): BreakdownRow[] {
    const rangeGroups = groupByKey(rangeJobs, keyOf);
    const openGroups = groupByKey(openAllTime, keyOf);

    const allKeys = new Set<string>([...rangeGroups.keys(), ...openGroups.keys()]);
    const total = rangeJobs.length || 1;
    const rows: BreakdownRow[] = [];
    for (const key of allKeys) {
        const list = rangeGroups.get(key) ?? [];
        const openList = openGroups.get(key) ?? [];
        const delivered = list.filter((j) => j.status_section === "Delivered");
        const tats = delivered
            .map(tatForDelivered)
            .filter((n): n is number => n != null);
        rows.push({
            key,
            label: key === UNASSIGNED ? "Unassigned" : labelOf(key),
            total: list.length,
            open: openList.length,
            delivered: delivered.length,
            avgTat: Number(avg(tats).toFixed(1)),
            labourAmount: list.reduce((sum, j) => sum + (Number(j.billed_labor_amount) || 0), 0),
            partsAmount: list.reduce((sum, j) => sum + (Number(j.billed_parts_amount) || 0), 0),
            share: Number(((list.length / total) * 100).toFixed(1)),
        });
    }
    rows.sort((a, b) => b.total - a.total);
    return rows;
}

export async function GET(req: NextRequest) {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;
    if (!isOwnerUser(auth.user)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    try {
        const url = new URL(req.url);
        const now = new Date();

        const toParam = parseDay(url.searchParams.get("to"));
        const fromParam = parseDay(url.searchParams.get("from"));
        let to = toParam ?? now;
        let from = fromParam ?? startOfMonth(subMonths(to, 11));
        // Guard against an inverted range (eachMonthOfInterval throws if start > end).
        if (from.getTime() > to.getTime()) {
            [from, to] = [to, from];
        }

        const branchFilter = url.searchParams.get("branchId") || "";
        const modelFilter = url.searchParams.get("model") || "";
        const insurerFilter = url.searchParams.get("insurer") || "";
        const advisorFilter = url.searchParams.get("advisor") || "";
        const categoryParam = url.searchParams.get("category") || "all";
        const categoryFilter: JobCategory | "all" =
            categoryParam === "bodyshop" || categoryParam === "service" ? categoryParam : "all";

        const [allJobs, branchNameMap] = await Promise.all([
            listBodyshopJobs({
                limit: 20000,
                statusSection: "All",
                jobCategory: categoryFilter,
                select:
                    "id,ro_no,branch_id,ro_date,model,insurance_company,surveyor,service_advisor,status_section,promised_date,job_category,billed_labor_amount,billed_parts_amount,created_at,updated_at",
            }),
            getBranchNameMap(),
        ]);

        // Scope filter (branch / model / insurer / advisor) — applies to every metric.
        const matchesScope = (job: BodyshopJobWithMeta) => {
            if (branchFilter && job.branch_id !== branchFilter) return false;
            if (modelFilter && (job.model || "") !== modelFilter) return false;
            if (insurerFilter && (job.insurance_company || "") !== insurerFilter) return false;
            if (advisorFilter && (job.service_advisor || "") !== advisorFilter) return false;
            return true;
        };
        const scopedJobs = allJobs.filter(matchesScope);

        // Window filter on ro_date — drives the "in range" metrics (Total, Delivered,
        // TAT, monthly trend, Labour/Parts) so the date picker actually changes those
        // numbers. Records with no parseable ro_date can't be excluded by date, so
        // they're always kept. They simply don't appear on the monthly trend.
        const fromTime = from.getTime();
        const toTime = to.getTime();
        const jobsInRange = scopedJobs.filter((job) => {
            const d = parseDay(job.ro_date);
            if (!d) return true;
            const t = d.getTime();
            return t >= fromTime && t <= toTime;
        });

        // "Currently open" metrics ignore the date window entirely — an RO created
        // before the range start but still open must still count as open, matching
        // what the Bodyshop/Service board shows right now.
        const openAllTime = scopedJobs.filter((j) => j.status_section !== "Delivered");

        const delivered = jobsInRange.filter((j) => j.status_section === "Delivered");
        const deliveredTats = delivered
            .map(tatForDelivered)
            .filter((n): n is number => n != null);

        const totals = {
            totalRos: jobsInRange.length,
            openRos: openAllTime.length,
            deliveredRos: delivered.length,
            avgTatDays: Number(avg(deliveredTats).toFixed(1)),
            avgOpenAgeDays: Number(avg(openAllTime.map((j) => j.age_days)).toFixed(1)),
            totalLabourAmount: jobsInRange.reduce((s, j) => s + (Number(j.billed_labor_amount) || 0), 0),
            totalPartsAmount: jobsInRange.reduce((s, j) => s + (Number(j.billed_parts_amount) || 0), 0),
            deliveryRate:
                jobsInRange.length > 0
                    ? Number(((delivered.length / jobsInRange.length) * 100).toFixed(1))
                    : 0,
        };

        // Monthly trend across the full window.
        const months = eachMonthOfInterval({ start: startOfMonth(from), end: to });
        const monthMap = new Map<string, MonthRow>();
        for (const m of months) {
            const key = format(m, "yyyy-MM");
            monthMap.set(key, {
                month: key,
                label: format(m, "MMM yy"),
                created: 0,
                delivered: 0,
                avgTat: 0,
                labor: 0,
                parts: 0,
            });
        }
        const monthTats = new Map<string, number[]>();
        for (const job of jobsInRange) {
            const created = parseDay(job.ro_date);
            if (created) {
                const key = format(created, "yyyy-MM");
                const row = monthMap.get(key);
                if (row) {
                    row.created += 1;
                    row.labor += Number(job.billed_labor_amount) || 0;
                    row.parts += Number(job.billed_parts_amount) || 0;
                }
            }
            if (job.status_section === "Delivered") {
                const delDate = parseDay(job.updated_at) ?? created;
                if (delDate) {
                    const key = format(delDate, "yyyy-MM");
                    const row = monthMap.get(key);
                    if (row) {
                        row.delivered += 1;
                        const tat = tatForDelivered(job);
                        if (tat != null) {
                            const list = monthTats.get(key) ?? [];
                            list.push(tat);
                            monthTats.set(key, list);
                        }
                    }
                }
            }
        }
        for (const [key, list] of monthTats) {
            const row = monthMap.get(key);
            if (row) row.avgTat = Number(avg(list).toFixed(1));
        }
        const monthly = Array.from(monthMap.values());

        // Status distribution of currently-open ROs (by stage) — all-time, not date-windowed.
        // Split by job_category: Bodyshop's 18-stage workflow and Service's 2-stage
        // workflow use completely different stage vocabularies, so lumping them into
        // one list under "Both" produced a meaningless mixed chart.
        function buildStatusDistribution(list: BodyshopJobWithMeta[]) {
            const statusCounts = new Map<string, number>();
            for (const job of list) {
                statusCounts.set(job.status_section, (statusCounts.get(job.status_section) ?? 0) + 1);
            }
            return Array.from(statusCounts.entries())
                .map(([status, count]) => ({
                    status,
                    count,
                    percent: list.length > 0 ? Number(((count / list.length) * 100).toFixed(1)) : 0,
                }))
                .sort((a, b) => b.count - a.count);
        }

        // Aging buckets for currently-open ROs — all-time, not date-windowed, split by category.
        const agingDefs = [
            { range: "0–3 days", min: 0, max: 3 },
            { range: "4–7 days", min: 4, max: 7 },
            { range: "8–15 days", min: 8, max: 15 },
            { range: "16–30 days", min: 16, max: 30 },
            { range: "30+ days", min: 31, max: Infinity },
        ];
        function buildAging(list: BodyshopJobWithMeta[]) {
            return agingDefs.map((def) => {
                const count = list.filter((j) => j.age_days >= def.min && j.age_days <= def.max).length;
                return {
                    range: def.range,
                    count,
                    percent: list.length > 0 ? Number(((count / list.length) * 100).toFixed(1)) : 0,
                };
            });
        }

        const openBodyshop = openAllTime.filter((j) => j.job_category === "bodyshop");
        const openService = openAllTime.filter((j) => j.job_category === "service");

        const statusDistribution = {
            bodyshop: buildStatusDistribution(openBodyshop),
            service: buildStatusDistribution(openService),
        };
        const aging = {
            bodyshop: buildAging(openBodyshop),
            service: buildAging(openService),
        };

        const breakdowns = {
            branch: buildBreakdown(
                jobsInRange,
                openAllTime,
                (j) => j.branch_id || "",
                (key) => branchNameMap.get(key) ?? "Unknown branch",
            ),
            model: buildBreakdown(jobsInRange, openAllTime, (j) => j.model || "", (k) => k),
            insurer: buildBreakdown(jobsInRange, openAllTime, (j) => j.insurance_company || "", (k) => k),
            advisor: buildBreakdown(jobsInRange, openAllTime, (j) => j.service_advisor || "", (k) => k),
        };

        // Filter option lists (computed over the full dataset, not the windowed set).
        const uniq = (vals: (string | null | undefined)[]) =>
            Array.from(new Set(vals.map((v) => (v || "").trim()).filter(Boolean))).sort();
        const filterOptions = {
            branches: Array.from(branchNameMap.entries())
                .map(([id, name]) => ({ id, name }))
                .sort((a, b) => a.name.localeCompare(b.name)),
            models: uniq(allJobs.map((j) => j.model)),
            insurers: uniq(allJobs.map((j) => j.insurance_company)),
            advisors: uniq(allJobs.map((j) => j.service_advisor)),
        };

        return NextResponse.json({
            range: { from: format(from, "yyyy-MM-dd"), to: format(to, "yyyy-MM-dd") },
            totals,
            monthly,
            statusDistribution,
            aging,
            breakdowns,
            filterOptions,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Failed";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
