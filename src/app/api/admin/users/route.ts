import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth-options";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import supabaseAdmin from "@/lib/supabase-admin";

/** Every new user gets this temporary password; they must change it on first login. */
const INITIAL_PASSWORD = "admin123";

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
                branches: { select: { branchId: true } },
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
        const { name, email, phone, roleId, branchId, branchIds } = body;

        if (typeof name !== "string" || !name.trim()) {
            return NextResponse.json({ error: "Name is required" }, { status: 400 });
        }
        if (typeof email !== "string" || !email.trim()) {
            return NextResponse.json({ error: "Email is required" }, { status: 400 });
        }
        if (typeof roleId !== "string" || !roleId) {
            return NextResponse.json({ error: "Role is required" }, { status: 400 });
        }

        let effectiveBranchId: string | null = null;
        if (Array.isArray(branchIds) && branchIds.length > 0) {
            effectiveBranchId = String(branchIds[0]);
        } else if (typeof branchId === "string" && branchId.trim()) {
            effectiveBranchId = branchId.trim();
        }

        if (!effectiveBranchId) {
            return NextResponse.json({ error: "At least one branch is required" }, { status: 400 });
        }

        const assignedBranchIds = Array.from(
            new Set(
                (Array.isArray(branchIds) && branchIds.length > 0
                    ? branchIds
                    : [effectiveBranchId]
                )
                    .map((b: any) => String(b).trim())
                    .filter(Boolean)
            )
        );

        const existing = await prisma.user.findUnique({
            where: { email: email.trim().toLowerCase() },
        });
        if (existing) {
            return NextResponse.json(
                { error: "A user with this email already exists" },
                { status: 400 }
            );
        }

        const emailNorm = email.trim().toLowerCase();
        const passwordHash = await bcrypt.hash(INITIAL_PASSWORD, 10);

        const user = await prisma.user.create({
            data: {
                name: name.trim(),
                email: emailNorm,
                phone: phone === "" || phone == null ? null : String(phone).trim(),
                roleId,
                branchId: effectiveBranchId,
                passwordHash,
                active: true,
                branches: {
                    create: assignedBranchIds.map((bid) => ({ branchId: bid })),
                },
            },
            include: {
                role: { select: { id: true, name: true } },
                branch: { select: { id: true, name: true } },
            },
        });

        // Create same user in Supabase Auth so they can sign in via Supabase
        try {
            const { data: authUser } = await supabaseAdmin.auth.admin.createUser({
                email: emailNorm,
                password: INITIAL_PASSWORD,
                email_confirm: true,
            });
            if (authUser?.user?.id) {
                await prisma.user.update({
                    where: { id: user.id },
                    data: { supabaseAuthId: authUser.user.id },
                });
                (user as { supabaseAuthId?: string }).supabaseAuthId = authUser.user.id;
            }
        } catch (supabaseErr: unknown) {
            // User exists in Prisma; log and continue (they can use legacy bcrypt until migrated)
            console.error("Supabase Auth create user failed:", supabaseErr);
        }

        return NextResponse.json(user);
    } catch (error: any) {
        return NextResponse.json({ error: error.message ?? "Failed to create user" }, { status: 500 });
    }
}
