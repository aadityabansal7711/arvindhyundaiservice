import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth-options";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import supabaseAdmin from "@/lib/supabase-admin";

export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    const userId = session?.user && "id" in session.user ? (session.user as { id: string }).id : null;
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { newPassword } = body;

        if (typeof newPassword !== "string" || newPassword.length < 6) {
            return NextResponse.json(
                { error: "Password must be at least 6 characters" },
                { status: 400 }
            );
        }

        const passwordHash = await bcrypt.hash(newPassword, 10);

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { supabaseAuthId: true },
        });

        // Update Supabase first so they can sign in with new password there; then Prisma
        if (user?.supabaseAuthId) {
            const { error: supabaseError } = await supabaseAdmin.auth.admin.updateUserById(user.supabaseAuthId, {
                password: newPassword,
            });
            if (supabaseError) {
                console.error("Supabase password update failed:", supabaseError);
                return NextResponse.json(
                    { error: "Password updated in app but Supabase sync failed. Please try again or contact support." },
                    { status: 500 }
                );
            }
        }

        await prisma.user.update({
            where: { id: userId },
            data: { passwordHash },
        });

        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to update password";
        return NextResponse.json(
            { error: message },
            { status: 500 }
        );
    }
}
