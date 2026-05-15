import { NextRequest, NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabase-admin";
import { canAccessBranch, requireBodyshopAccess } from "@/lib/server-auth";

const STAGE_TABLE = "bodyshop_job_stages";
const JOB_TABLE = "bodyshop_jobs";
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

  const auth = await requireBodyshopAccess();
  if (!auth.ok) return auth.response;

  const userEmail = auth.user.email ?? undefined;
  const byId = await supabaseAdmin
    .from(JOB_TABLE)
    .select("branch_id")
    .eq("id", jobId)
    .maybeSingle();
  if (byId.error) {
    return NextResponse.json({ error: byId.error.message }, { status: 500 });
  }
  const byRo =
    byId.data == null
      ? await supabaseAdmin
          .from(JOB_TABLE)
          .select("branch_id")
          .eq("ro_no", jobId)
          .maybeSingle()
      : null;
  if (byRo?.error) {
    return NextResponse.json({ error: byRo.error.message }, { status: 500 });
  }
  const job = byId.data ?? byRo?.data ?? null;
  if (!job || !(await canAccessBranch(auth.user, (job as { branch_id?: string | null }).branch_id ?? null))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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
