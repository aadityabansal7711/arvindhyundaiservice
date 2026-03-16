import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth-options";
import * as XLSX from "xlsx";

export async function GET(_req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session || !(session.user as any).permissions?.includes("import.manage")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Workbook and sheets that match the current import logic
    const wb = XLSX.utils.book_new();

    // 1. Main RO sheet ("2026") – grouped headers to match RO, Claim, Approval & Work registers
    const roHeaders = [
        "RO No",
        "Status",
        "Vehicle IN",
        "Reg NO",
        "Model",
        "Customer Name",
        "Mobile Number",
        "Service advisor",
        "CLAIM NO",
        "CLAIM DATE",
        "HAP/NHAP",
        "Insurance Co",
        "SURVEYOR NAME",
        "SURVEY DATE",
        "APPROVAL DATE",
        "START DATE",
        "TENTATIVE COMPLETION",
        "PANELS NEW (REPLACE)",
        "PANELS DENT",
    ];

    // Second row just for visual grouping in Excel – actual import only reads by column header (row 1)
    const roGroupRow = [
        "RO & VEHICLE",
        "RO & VEHICLE",
        "RO & VEHICLE",
        "RO & VEHICLE",
        "RO & VEHICLE",
        "RO & VEHICLE",
        "RO & VEHICLE",
        "RO & VEHICLE",
        "CLAIM REGISTER",
        "CLAIM REGISTER",
        "CLAIM REGISTER",
        "CLAIM REGISTER",
        "APPROVAL REGISTER",
        "APPROVAL REGISTER",
        "APPROVAL REGISTER",
        "WORK REGISTER",
        "WORK REGISTER",
        "WORK REGISTER",
        "WORK REGISTER",
    ];

    const roSheet = XLSX.utils.aoa_to_sheet([roHeaders, roGroupRow]);
    XLSX.utils.book_append_sheet(wb, roSheet, "2026");

    // 2. Pipeline sheet ("NEW TRACKER") – approval & advisor remarks
    const pipelineHeaders = ["R/O No", "Approval Date", "Advisor Remark"];
    const pipelineSheet = XLSX.utils.aoa_to_sheet([pipelineHeaders]);
    XLSX.utils.book_append_sheet(wb, pipelineSheet, "NEW TRACKER");

    // 3. Parts sheets – mapped to current parts import
    const partsHeaders = [
        "RO No",
        "R/O No",
        "MRS",
        "Date",
        "Order No",
        "Order Date",
        "ETA Date",
        "Received Date",
        "Remark",
    ];
    const partsSheet150 = XLSX.utils.aoa_to_sheet([partsHeaders]);
    const partsSheetHp = XLSX.utils.aoa_to_sheet([partsHeaders]);
    const partsSheet156 = XLSX.utils.aoa_to_sheet([partsHeaders]);

    XLSX.utils.book_append_sheet(wb, partsSheet150, "Sheet150");
    XLSX.utils.book_append_sheet(wb, partsSheetHp, "hp");
    XLSX.utils.book_append_sheet(wb, partsSheet156, "Sheet156");

    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    return new NextResponse(buffer, {
        status: 200,
        headers: {
            "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Content-Disposition": 'attachment; filename="BODYSHOP_IMPORT_TEMPLATE.xlsx"',
        },
    });
}

