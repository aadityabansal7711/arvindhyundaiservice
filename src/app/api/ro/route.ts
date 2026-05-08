import { NextResponse } from "next/server";

export async function GET() {
    return NextResponse.json([]);
}

export async function POST() {
    return NextResponse.json(
        { error: "Old RepairOrder table has been removed. Use bodyshop_jobs instead." },
        { status: 410 }
    );
}
