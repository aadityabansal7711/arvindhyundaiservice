import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth-options";
import prisma from "@/lib/prisma";

export async function GET() {
    const session = await getServerSession(authOptions);
    const permissions = Array.isArray((session?.user as { permissions?: string[] } | undefined)?.permissions)
        ? ((session?.user as { permissions?: string[] }).permissions ?? [])
        : [];
    if (!session || !permissions.includes("users.manage")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const options = await prisma.dropdownOption.findMany({
            where: { groupKey: "service_advisor" },
            include: { branch: { select: { id: true, name: true } } },
            orderBy: [{ label: "asc" }],
        });
        return NextResponse.json(options);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    const permissions = Array.isArray((session?.user as { permissions?: string[] } | undefined)?.permissions)
        ? ((session?.user as { permissions?: string[] }).permissions ?? [])
        : [];
    if (!session || !permissions.includes("users.manage")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await req.json();
        const rows = Array.isArray(body?.rows) ? body.rows : [];
        if (rows.length === 0) {
            return NextResponse.json({ error: "rows are required" }, { status: 400 });
        }

        const branches = await prisma.branch.findMany({ select: { id: true, name: true } });
        const branchIdByName = new Map(branches.map((b) => [b.name.trim().toLowerCase(), b.id]));

        let created = 0;
        const failed: Array<{ row: number; label: string; reason: string }> = [];

        for (let i = 0; i < rows.length; i += 1) {
            const item = rows[i] as { label?: string; branchName?: string };
            const label = String(item?.label ?? "").trim();
            const branchName = String(item?.branchName ?? "").trim();
            if (!label || !branchName) {
                failed.push({ row: i + 1, label, reason: "Label and branch are required" });
                continue;
            }

            const key = branchName.toLowerCase();
            const branchId = branchIdByName.get(key);
            if (!branchId) {
                failed.push({ row: i + 1, label, reason: `Branch not found: ${branchName}` });
                continue;
            }
            const existing = await prisma.dropdownOption.findFirst({
                where: { groupKey: "service_advisor", label, branchId },
                select: { id: true },
            });
            if (existing) continue;
            await prisma.dropdownOption.create({
                data: {
                    groupKey: "service_advisor",
                    label,
                    value: label,
                    branchId,
                },
            });
            created += 1;
        }

        return NextResponse.json({ created, failed });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
