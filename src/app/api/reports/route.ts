import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth-options";
import prisma from "@/lib/prisma";
import supabaseAdmin from "@/lib/supabase-admin";
import { ensureSeededOnce, listBodyshopJobs } from "@/lib/bodyshop-repo";

const REPORTS_OWNER_EMAIL = "mayank.arvind.bansal@gmail.com";
const HIDDEN_TABLE = "bodyshop_job_hidden";

function startOfMonth(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, months: number) {
    return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function parseDateParam(value: string | null, fallback: Date, endOfDay = false) {
    if (!value) return fallback;
    const parsed = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`);
    return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function dateFromBodyshop(value: string | null | undefined) {
    if (!value) return null;
    const parsed = new Date(`${value.slice(0, 10)}T00:00:00.000`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function monthKey(date: Date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonthLabel(key: string) {
    const [year, month] = key.split("-").map(Number);
    return new Intl.DateTimeFormat("en-IN", { month: "short", year: "numeric" }).format(
        new Date(year, month - 1, 1)
    );
}

function daysBetween(start: Date, end: Date) {
    return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86_400_000));
}

function money(value: number | null | undefined) {
    return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function round(value: number, digits = 1) {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}

export async function GET(req: NextRequest) {
    const session = await getServerSession(authOptions);
    const email = ((session?.user as any)?.email ?? "").trim().toLowerCase();

    if (!session || email !== REPORTS_OWNER_EMAIL) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const now = new Date();
    const defaultEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const defaultStart = startOfMonth(addMonths(defaultEnd, -11));
    const from = parseDateParam(searchParams.get("from"), defaultStart);
    const to = parseDateParam(searchParams.get("to"), defaultEnd, true);

    if (from > to) {
        return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
    }

    try {
        await ensureSeededOnce();
        const [jobsRaw, hiddenRowsResult, branches] = await Promise.all([
            listBodyshopJobs({ limit: 6000, statusSection: "All" }),
            supabaseAdmin.from(HIDDEN_TABLE).select("job_id"),
            prisma.branch.findMany({ select: { id: true, name: true } }),
        ]);

        const hiddenIds = new Set<string>();
        for (const row of hiddenRowsResult.data ?? []) {
            const id = (row as any)?.job_id;
            if (typeof id === "string" && id) hiddenIds.add(id);
        }

        const branchNameById = new Map(branches.map((branch) => [branch.id, branch.name]));
        const jobs = jobsRaw
            .filter((job) => !hiddenIds.has(job.id) && !hiddenIds.has(job.ro_no))
            .map((job) => ({ job, reportDate: dateFromBodyshop(job.ro_date) }))
            .filter((item): item is { job: (typeof jobsRaw)[number]; reportDate: Date } => {
                return !!item.reportDate && item.reportDate >= from && item.reportDate <= to;
            })
            .sort((a, b) => b.reportDate.getTime() - a.reportDate.getTime());

        const today = new Date();
        const monthMap = new Map<
            string,
            {
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
                totalTat: number;
                tatCount: number;
            }
        >();
        const branchMap = new Map<string, number>();
        const statusMap = new Map<string, number>();
        const insuranceMap = new Map<string, number>();
        const advisorMap = new Map<string, number>();
        const agingBuckets = [
            { label: "0-3 days", min: 0, max: 3, count: 0 },
            { label: "4-7 days", min: 4, max: 7, count: 0 },
            { label: "8-15 days", min: 8, max: 15, count: 0 },
            { label: "16+ days", min: 16, max: Number.POSITIVE_INFINITY, count: 0 },
        ];

        let delivered = 0;
        let approvalPending = 0;
        let backorders = 0;
        let overdueDelivery = 0;
        let hap = 0;
        let nhap = 0;
        let totalBill = 0;
        let totalDo = 0;
        let totalCustomer = 0;
        let totalDifference = 0;
        let totalTat = 0;
        let tatCount = 0;

        for (const { job, reportDate } of jobs) {
            const status = job.status_section || "Document Pending";
            const isDelivered = status === "Delivered";
            const key = monthKey(reportDate);
            const month = monthMap.get(key) ?? {
                month: key,
                label: formatMonthLabel(key),
                total: 0,
                delivered: 0,
                open: 0,
                approvalPending: 0,
                billAmount: 0,
                doAmount: 0,
                customerAmount: 0,
                difference: 0,
                totalTat: 0,
                tatCount: 0,
            };

            const billAmount = money(job.tentative_labor);
            const doAmount = 0;
            const customerAmount = 0;
            const difference = 0;

            month.total += 1;
            if (isDelivered) month.delivered += 1;
            else month.open += 1;
            if (status.toLowerCase().includes("approval")) month.approvalPending += 1;
            month.billAmount += billAmount;
            month.doAmount += doAmount;
            month.customerAmount += customerAmount;
            month.difference += difference;
            totalBill += billAmount;
            totalDo += doAmount;
            totalCustomer += customerAmount;
            totalDifference += difference;

            if (isDelivered) {
                delivered += 1;
                totalTat += job.age_days;
                tatCount += 1;
                month.totalTat += job.age_days;
                month.tatCount += 1;
            }
            if (status.toLowerCase().includes("approval")) approvalPending += 1;
            if ((job.hap_status ?? "").trim().toUpperCase() === "HAP") hap += 1;
            if ((job.hap_status ?? "").trim().toUpperCase().replace(/\s+/g, "") === "NHAP") nhap += 1;
            if ((job.parts_status ?? "").toLowerCase().includes("back")) backorders += 1;

            const promisedDate = dateFromBodyshop(job.promised_date);
            if (!isDelivered && promisedDate && promisedDate < today) overdueDelivery += 1;

            const branch = (job.branch_id ? branchNameById.get(job.branch_id) : null) || "No branch";
            branchMap.set(branch, (branchMap.get(branch) ?? 0) + 1);
            statusMap.set(status, (statusMap.get(status) ?? 0) + 1);
            const insurance = job.insurance_company || "Not captured";
            insuranceMap.set(insurance, (insuranceMap.get(insurance) ?? 0) + 1);
            const advisor = job.service_advisor || "Unassigned";
            advisorMap.set(advisor, (advisorMap.get(advisor) ?? 0) + 1);

            if (!isDelivered) {
                const bucket = agingBuckets.find((item) => job.age_days >= item.min && job.age_days <= item.max);
                if (bucket) bucket.count += 1;
            }

            monthMap.set(key, month);
        }

        const monthWise = Array.from(monthMap.values())
            .sort((a, b) => a.month.localeCompare(b.month))
            .map((item) => ({
                ...item,
                avgTat: item.tatCount ? round(item.totalTat / item.tatCount) : 0,
                totalTat: undefined,
                tatCount: undefined,
            }));

        const breakdown = (map: Map<string, number>) =>
            Array.from(map.entries())
                .map(([name, count]) => ({ name, count }))
                .sort((a, b) => b.count - a.count);

        return NextResponse.json(
            {
                range: { from: from.toISOString(), to: to.toISOString() },
                summary: {
                    totalRos: jobs.length,
                    openRos: jobs.length - delivered,
                    deliveredRos: delivered,
                    approvalPending,
                    overdueDelivery,
                    backorders,
                    hap,
                    nhap,
                    avgTat: tatCount ? round(totalTat / tatCount) : 0,
                    billAmount: totalBill,
                    doAmount: totalDo,
                    customerAmount: totalCustomer,
                    difference: totalDifference,
                },
                monthWise,
                breakdowns: {
                    branches: breakdown(branchMap),
                    statuses: breakdown(statusMap),
                    insuranceCompanies: breakdown(insuranceMap),
                    advisors: breakdown(advisorMap).slice(0, 10),
                    aging: agingBuckets.map(({ label, count }) => ({ name: label, count })),
                },
                rows: jobs.slice(0, 500).map(({ job, reportDate }) => ({
                    id: job.id,
                    roNo: job.ro_no,
                    vehicleInDate: reportDate,
                    vehicleOutDate: null,
                    status: job.status_section,
                    branch: (job.branch_id ? branchNameById.get(job.branch_id) : null) || "No branch",
                    registrationNo: job.reg_no || "",
                    model: job.model || "",
                    customerName: job.customer_name || "",
                    mobile: job.mobile_no || "",
                    advisor: job.service_advisor || "Unassigned",
                    insuranceCompany: job.insurance_company || "Not captured",
                    claimNo: job.claim_no || "",
                    surveyor: job.surveyor || "",
                    billAmount: money(job.tentative_labor),
                    doAmount: 0,
                    difference: 0,
                    ageDays: daysBetween(reportDate, today),
                })),
            },
            { headers: { "Cache-Control": "private, no-store" } }
        );
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to build reports";
        console.error("[GET /api/reports]", message, error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
