import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth-options";
import prisma from "@/lib/prisma";

export async function GET(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const group = req.nextUrl.searchParams.get("group");
    const permissions = (session.user as any)?.permissions || [];

    try {
        if (group) {
            // Single group: allow anyone with ro.view (for forms) or users.manage
            if (!permissions.includes("ro.view") && !permissions.includes("users.manage")) {
                return NextResponse.json({ error: "Forbidden" }, { status: 403 });
            }
            const options = await prisma.dropdownOption.findMany({
                where: { groupKey: group },
                orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
            });
            return NextResponse.json(
                options.map((o) => ({ id: o.id, label: o.label, value: o.value ?? o.label }))
            );
        }

        // All groups: Data page only (users.manage)
        if (!permissions.includes("users.manage")) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        const options = await prisma.dropdownOption.findMany({
            orderBy: [{ groupKey: "asc" }, { sortOrder: "asc" }, { label: "asc" }],
        });
        return NextResponse.json(options);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session || !(session.user as any).permissions?.includes("users.manage")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { groupKey, label, value, sortOrder } = body;
        if (!groupKey || !label) {
            return NextResponse.json(
                { error: "groupKey and label are required" },
                { status: 400 }
            );
        }
        const option = await prisma.dropdownOption.create({
            data: {
                groupKey: String(groupKey).trim(),
                label: String(label).trim(),
                value: value != null && value !== "" ? String(value).trim() : null,
                sortOrder: typeof sortOrder === "number" ? sortOrder : 0,
            },
        });
        return NextResponse.json(option);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
