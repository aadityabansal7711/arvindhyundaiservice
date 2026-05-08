import { NextResponse } from "next/server";

export async function GET() {
    return NextResponse.json(
        { error: "Old RepairOrder table has been removed. Use bodyshop_jobs instead." },
        { status: 410 }
    );
}

export async function PATCH() {
    return NextResponse.json(
        { error: "Old RepairOrder table has been removed. Use bodyshop_jobs instead." },
        { status: 410 }
    );
}

export async function DELETE() {
    return NextResponse.json(
        { error: "Old RepairOrder table has been removed. Use bodyshop_jobs instead." },
        { status: 410 }
    );
}
