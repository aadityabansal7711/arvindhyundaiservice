import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth-options";
import prisma from "@/lib/prisma";
export async function GET(_req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const now = new Date();
        const agingRanges = [
            { label: "0-3 Days", minDays: 0, maxDays: 3 },
            { label: "4-7 Days", minDays: 4, maxDays: 7 },
            { label: "8-15 Days", minDays: 8, maxDays: 15 },
            { label: "15+ Days", minDays: 15, maxDays: 999 },
        ];

        // Run all independent DB queries in parallel
        const [
            openROsCount,
            pendingApprovalCount,
            readyForDeliveryCount,
            avgTatResult,
            recentNotes,
            billingAlertsCount,
            ...agingCounts
        ] = await Promise.all([
            prisma.repairOrder.count({
                where: { NOT: { currentStatus: { in: ["DELIVERED", "CLOSED"] } } }
            }),
            prisma.repairOrder.count({
                where: { currentStatus: { in: ["APPROVAL_PENDING", "PENDING_APPROVAL"] } }
            }),
            prisma.repairOrder.count({
                where: { currentStatus: "READY_FOR_DELIVERY" }
            }),
            prisma.$queryRaw<[{ avg_tat: number | null }]>`
                SELECT AVG(EXTRACT(EPOCH FROM ("vehicleOutDate" - "vehicleInDate")) / 86400) AS avg_tat
                FROM "RepairOrder"
                WHERE "vehicleOutDate" IS NOT NULL
            `,
            prisma.workNote.findMany({
                take: 5,
                orderBy: { noteDate: "desc" },
                include: {
                    repairOrder: { select: { roNo: true } },
                    createdBy: { select: { name: true, role: { select: { name: true } } } }
                }
            }),
            prisma.billing.count({
                where: { difference: { gt: 10000 } }
            }),
            // Aging: open ROs only, by days in shop (vehicleInDate)
            ...agingRanges.map(({ minDays, maxDays }) => {
                const rangeStart = new Date(now);
                rangeStart.setDate(rangeStart.getDate() - maxDays);
                rangeStart.setHours(0, 0, 0, 0);
                const rangeEnd = new Date(now);
                rangeEnd.setDate(rangeEnd.getDate() - minDays);
                rangeEnd.setHours(23, 59, 59, 999);
                return prisma.repairOrder.count({
                    where: {
                        vehicleOutDate: null,
                        NOT: { currentStatus: { in: ["DELIVERED", "CLOSED"] } },
                        vehicleInDate: maxDays >= 999 ? { lte: rangeEnd } : { gte: rangeStart, lte: rangeEnd }
                    }
                });
            })
        ]);

        const avgTat = Number(avgTatResult[0]?.avg_tat ?? 0);

        const totalOpenForAging = agingCounts.reduce((a, b) => a + b, 0);
        const agingAnalysis = agingRanges.map((range, i) => ({
            range: range.label,
            count: agingCounts[i],
            percent: totalOpenForAging > 0 ? `${((agingCounts[i] / totalOpenForAging) * 100).toFixed(0)}%` : "0%"
        }));

        const res = NextResponse.json({
            stats: [
                { name: "Open ROs", value: openROsCount.toString(), icon: "ClipboardList", color: "bg-blue-600", trend: "+0", trendUp: true },
                { name: "Avg TAT", value: `${avgTat.toFixed(1)} Days`, icon: "Clock", color: "bg-indigo-600", trend: "+0", trendUp: false },
                { name: "Pending Approval", value: pendingApprovalCount.toString(), icon: "AlertCircle", color: "bg-amber-500", trend: "+0", trendUp: true },
                { name: "Ready for Delivery", value: readyForDeliveryCount.toString(), icon: "CheckCircle2", color: "bg-emerald-500", trend: "+0", trendUp: true },
            ],
            recentActivity: recentNotes.map(note => ({
                id: note.id,
                text: `RO ${note.repairOrder.roNo}: ${note.noteText}`,
                user: note.createdBy.name,
                role: note.createdBy.role.name,
                time: note.noteDate
            })),
            agingAnalysis,
            billingAlertsCount
        });
        res.headers.set("Cache-Control", "private, s-maxage=60, stale-while-revalidate=120");
        return res;
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
