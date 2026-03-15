import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth-options";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function GET(_req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session || !(session.user as any).permissions.includes("users.manage")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const users = await prisma.user.findMany({
            select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                active: true,
                createdAt: true,
                roleId: true,
                branchId: true,
                role: { select: { id: true, name: true } },
                branch: { select: { id: true, name: true } },
            },
            orderBy: { createdAt: "desc" },
        });

        return NextResponse.json(users);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session || !(session.user as any).permissions.includes("users.manage")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { name, email, phone, roleId, branchId, password } = body;

        if (typeof name !== "string" || !name.trim()) {
            return NextResponse.json({ error: "Name is required" }, { status: 400 });
        }
        if (typeof email !== "string" || !email.trim()) {
            return NextResponse.json({ error: "Email is required" }, { status: 400 });
        }
        if (typeof password !== "string" || password.length < 6) {
            return NextResponse.json(
                { error: "Password must be at least 6 characters" },
                { status: 400 }
            );
        }
        if (typeof roleId !== "string" || !roleId) {
            return NextResponse.json({ error: "Role is required" }, { status: 400 });
        }

        const existing = await prisma.user.findUnique({
            where: { email: email.trim().toLowerCase() },
        });
        if (existing) {
            return NextResponse.json(
                { error: "A user with this email already exists" },
                { status: 400 }
            );
        }

        const passwordHash = await bcrypt.hash(password, 10);

        const user = await prisma.user.create({
            data: {
                name: name.trim(),
                email: email.trim().toLowerCase(),
                phone: phone === "" || phone == null ? null : String(phone).trim(),
                roleId,
                branchId: branchId === "" || branchId == null ? null : branchId,
                passwordHash,
                active: true,
            },
            include: {
                role: { select: { id: true, name: true } },
                branch: { select: { id: true, name: true } },
            },
        });

        return NextResponse.json(user);
    } catch (error: any) {
        return NextResponse.json({ error: error.message ?? "Failed to create user" }, { status: 500 });
    }
}
