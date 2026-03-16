import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import supabaseAdmin from "@/lib/supabase-admin";

/**
 * GET /api/supabase-verify
 * Checks that the app can reach Supabase DB (via Prisma) and Supabase Auth.
 * Use this to confirm "everything is in Supabase" (see SUPABASE.md).
 */
export async function GET() {
    const result: { database: string; auth: string; ok: boolean } = {
        database: "unknown",
        auth: "unknown",
        ok: false,
    };

    try {
        await prisma.$queryRaw`SELECT 1`;
        result.database = "ok";
    } catch (e) {
        result.database = "error";
        const msg = e instanceof Error ? e.message : String(e);
        return NextResponse.json(
            { ...result, message: `Database: ${msg}. Ensure DATABASE_URL points to Supabase and migrations are deployed.` },
            { status: 503 }
        );
    }

    try {
        const { error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1 });
        if (error) {
            result.auth = "error";
            return NextResponse.json(
                { ...result, message: `Auth: ${error.message}. Check NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.` },
                { status: 503 }
            );
        }
        result.auth = "ok";
    } catch (e) {
        result.auth = "error";
        const msg = e instanceof Error ? e.message : String(e);
        return NextResponse.json(
            { ...result, message: `Auth: ${msg}. Check Supabase env vars.` },
            { status: 503 }
        );
    }

    result.ok = true;
    return NextResponse.json(result);
}
