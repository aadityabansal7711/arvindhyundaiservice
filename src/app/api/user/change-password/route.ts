import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth-options";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import supabaseAdmin from "@/lib/supabase-admin";
import { enforceRateLimit, readJsonObject, validateMutationRequest } from "@/lib/server-auth";
import { logEvent } from "@/lib/server-log";

export async function POST(req: NextRequest) {
    const mutationError = validateMutationRequest(req);
    if (mutationError) return mutationError;

    const session = await getServerSession(authOptions);
    const userId = session?.user && "id" in session.user ? (session.user as { id: string }).id : null;
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const rateLimitError = enforceRateLimit(req, "change-password", 5, 10 * 60 * 1000, userId);
    if (rateLimitError) return rateLimitError;

    try {
        const body = await readJsonObject(req);
        if (body instanceof NextResponse) return body;
        const { newPassword } = body;
        const normalizedPassword = typeof newPassword === "string" ? newPassword : "";

        if (normalizedPassword.length < 8) {
            return NextResponse.json(
                { error: "Password must be at least 8 characters" },
                { status: 400 }
            );
        }
        if (normalizedPassword === "admin123") {
            return NextResponse.json(
                { error: "Choose a password different from the temporary password" },
                { status: 400 }
            );
        }

        const passwordHash = await bcrypt.hash(normalizedPassword, 10);

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { supabaseAuthId: true },
        });

        // Update Supabase first so they can sign in with new password there; then Prisma
        if (user?.supabaseAuthId) {
            const { error: supabaseError } = await supabaseAdmin.auth.admin.updateUserById(user.supabaseAuthId, {
                password: normalizedPassword,
            });
            if (supabaseError) {
                logEvent("error", "password.supabase_sync_failed", {
                    userId,
                    message: supabaseError.message,
                });
                return NextResponse.json(
                    { error: "Password sync failed. Please try again or contact support." },
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
