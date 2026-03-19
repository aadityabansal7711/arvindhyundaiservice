import { NextRequest, NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabase-admin";

const STAGE_TABLE = "bodyshop_job_stages";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const jobId = url.searchParams.get("jobId");

  if (!jobId) {
    return NextResponse.json(
      { error: "jobId is required" },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from(STAGE_TABLE)
    .select("id, from_status, to_status, changed_at, remark")
    .eq("job_id", jobId)
    .order("changed_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

