import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth-options";
import prisma from "@/lib/prisma";

export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session || !(session.user as any).permissions?.includes("users.manage")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const [roles, branches] = await Promise.all([
            prisma.role.findMany({ orderBy: { name: "asc" } }),
            prisma.branch.findMany({ orderBy: { name: "asc" } }),
        ]);
        return NextResponse.json({ roles, branches });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
