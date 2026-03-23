import { NextRequest, NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabase-admin";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth-options";

const STAGE_TABLE = "bodyshop_job_stages";
const GM_EMAIL = "servicegm.hyundai@arvindgroup.in";

function isGmUser(email: string | null | undefined) {
  return (email ?? "").trim().toLowerCase() === GM_EMAIL;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const jobId = url.searchParams.get("jobId");

  if (!jobId) {
    return NextResponse.json(
      { error: "jobId is required" },
      { status: 400 }
    );
  }

  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userEmail = (session.user as any)?.email as string | undefined;
  const isGm = isGmUser(userEmail);

  const { data, error } = await supabaseAdmin
    .from(STAGE_TABLE)
    .select("id, from_status, to_status, changed_at, remark, gm_remark")
    .eq("job_id", jobId)
    .order("changed_at", { ascending: false });

  if (error) {
    // Backward compatibility if `gm_remark` column is not applied yet.
    if (String(error.message ?? "").toLowerCase().includes("gm_remark")) {
      const { data: legacyData, error: legacyError } = await supabaseAdmin
        .from(STAGE_TABLE)
        .select("id, from_status, to_status, changed_at, remark")
        .eq("job_id", jobId)
        .order("changed_at", { ascending: false });

      if (legacyError) {
        return NextResponse.json({ error: legacyError.message }, { status: 500 });
      }

      return NextResponse.json(
        (legacyData ?? []).map((row: any) => ({ ...row, gm_remark: null }))
      );
    }

    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const safeData = (data ?? []).map((row: any) => ({
    ...row,
    gm_remark: isGm ? row.gm_remark ?? null : null,
  }));

  return NextResponse.json(safeData);
}

