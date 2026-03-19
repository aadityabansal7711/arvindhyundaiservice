import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth-options";
import prisma from "@/lib/prisma";
import * as XLSX from "xlsx";
import { parseExcelDate } from "@/lib/date-utils";

export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    try {
        const latest = await prisma.importRun.findFirst({
            orderBy: { startTime: "desc" },
            select: {
                id: true,
                fileName: true,
                startTime: true,
                rowsImported: true,
                errors: true,
            },
        });
        if (!latest) {
            return NextResponse.json({ lastImport: null });
        }
        let errorsJson: unknown[] = [];
        try {
            errorsJson = latest.errors ? (JSON.parse(latest.errors) as unknown[]) : [];
        } catch {
            errorsJson = [];
        }
        const status = Array.isArray(errorsJson) && errorsJson.length === 0 ? "SUCCESS" : "SUCCESS_WITH_ERRORS";
        return NextResponse.json({
            lastImport: {
                id: latest.id,
                fileName: latest.fileName,
                startTime: latest.startTime,
                rowsImported: latest.rowsImported,
                errorCount: Array.isArray(errorsJson) ? errorsJson.length : 0,
                status,
            },
        });
    } catch (e) {
        console.error("GET /api/import:", e);
        return NextResponse.json({ error: "Failed to fetch last import" }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session || !(session.user as any).permissions.includes("import.manage")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const formData = await req.formData();
        const file = formData.get("file") as File;
        if (!file) {
            return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
        }

        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: "array" });

        let totalImported = 0;
        const errors: any[] = [];

        const importRun = await prisma.importRun.create({
            data: {
                fileName: file.name,
                uploadedById: (session.user as any).id,
                startTime: new Date(),
            }
        });

        // 1. Process "2026" Sheet (RO Master)
        const roSheet = workbook.Sheets["2026"];
        if (roSheet) {
            const data = XLSX.utils.sheet_to_json(roSheet) as any[];
            for (const row of data) {
                try {
                    const roNo = row["RO Number"]?.toString() || row["RO No"]?.toString();
                    if (!roNo) continue;

                    // Process and upsert
                    await processRORegisterRow(row, roNo);
                    totalImported++;
                } catch (e: any) {
                    errors.push({ sheet: "2026", row: row["RO Number"], error: e.message });
                }
            }
        }

        // 2. Process "NEW TRACKER" (Pipeline)
        const uploaderId = (session.user as any).id;
        const pipelineSheet = workbook.Sheets["NEW TRACKER"];
        if (pipelineSheet) {
            const data = XLSX.utils.sheet_to_json(pipelineSheet) as any[];
            for (const row of data) {
                try {
                    const roNo = row["R/O No"]?.toString();
                    if (!roNo) continue;
                    await processPipelineRow(row, roNo, uploaderId);
                } catch (e: any) {
                    errors.push({ sheet: "NEW TRACKER", row: row["R/O No"], error: e.message });
                }
            }
        }

        // 3. Process Parts Sheets ("Sheet150", "hp", "Sheet156")
        const partsSheets = ["Sheet150", "hp", "Sheet156"];
        for (const sheetName of partsSheets) {
            const sheet = workbook.Sheets[sheetName];
            if (sheet) {
                const data = XLSX.utils.sheet_to_json(sheet) as any[];
                for (const row of data) {
                    try {
                        const roNo = row["RO No"]?.toString() || row["R/O No"]?.toString();
                        if (!roNo) continue;
                        await processPartsRow(row, roNo);
                    } catch (e: any) {
                        errors.push({ sheet: sheetName, row: row["RO No"], error: e.message });
                    }
                }
            }
        }

        await prisma.importRun.update({
            where: { id: importRun.id },
            data: {
                rowsImported: totalImported,
                errors: JSON.stringify(errors)
            }
        });

        return NextResponse.json({ success: true, imported: totalImported, errorCount: errors.length });
    } catch (error: any) {
        console.error("Import error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

async function processRORegisterRow(row: any, roNo: string) {
    // 1. Ensure Customer & Vehicle
    const regNo =
        row["Registration No"]?.toString() ||
        row["Reg No"]?.toString() ||
        row["Reg NO"]?.toString();
    if (!regNo) return;

    const vehicle = await prisma.vehicle.upsert({
        where: { registrationNo: regNo },
        update: {
            model: row["Model"]?.toString() || "Unknown",
        },
        create: {
            registrationNo: regNo,
            model: row["Model"]?.toString() || "Unknown",
            customer: {
                create: {
                    name: row["Customer Name"]?.toString() || "WALK-IN",
                    mobile:
                        row["Mobile"]?.toString() ||
                        row["Mobile Number"]?.toString() ||
                        "0000000000",
                }
            }
        }
    });

    // 2. Upsert Repair Order
    const ro = await prisma.repairOrder.upsert({
        where: { roNo },
        update: {
            vehicleInDate:
                parseExcelDate(row["Vehicle in date"]) ||
                parseExcelDate(row["Vehicle IN"]) ||
                new Date(),
            vehicleOutDate: parseExcelDate(row["Vehicle Out-date"]),
            currentStatus:
                row["Current Status"]?.toString() ||
                row["Status"]?.toString() ||
                "DOCUMENT_PENDING",
            committedDeliveryDate: parseExcelDate(row["Committed Date of Delivery"]),
            serviceAdvisorName: row["Service advisor"]?.toString(),
            workStartDate: parseExcelDate(row["START DATE"]),
            tentativeCompletionDate: parseExcelDate(row["TENTATIVE COMPLETION"]),
            panelsNewReplace: row["PANELS NEW (REPLACE)"] ? parseInt(row["PANELS NEW (REPLACE)"]) : null,
            panelsDent: row["PANELS DENT"] ? parseInt(row["PANELS DENT"]) : null,
        },
        create: {
            roNo,
            vehicleId: vehicle.id,
            vehicleInDate:
                parseExcelDate(row["Vehicle in date"]) ||
                parseExcelDate(row["Vehicle IN"]) ||
                new Date(),
            vehicleOutDate: parseExcelDate(row["Vehicle Out-date"]),
            currentStatus:
                row["Current Status"]?.toString() ||
                row["Status"]?.toString() ||
                "DOCUMENT_PENDING",
            committedDeliveryDate: parseExcelDate(row["Committed Date of Delivery"]),
            serviceAdvisorName: row["Service advisor"]?.toString(),
            workStartDate: parseExcelDate(row["START DATE"]),
            tentativeCompletionDate: parseExcelDate(row["TENTATIVE COMPLETION"]),
            panelsNewReplace: row["PANELS NEW (REPLACE)"] ? parseInt(row["PANELS NEW (REPLACE)"]) : null,
            panelsDent: row["PANELS DENT"] ? parseInt(row["PANELS DENT"]) : null,
        }
    });

    // 3. Upsert Insurance Claim
    const insuranceCompany =
        row["Insurance Company Name"]?.toString() ||
        row["Insurance Co"]?.toString();
    if (insuranceCompany) {
        const hapRaw = (row["HAP/N HAP"] ?? row["HAP/NHAP"])
            ?.toString()
            ?.toUpperCase();
        const hapFlagValue = hapRaw
            ? hapRaw.includes("HAP")
                ? true
                : hapRaw.includes("NHAP")
                ? false
                : null
            : null;

        await prisma.insuranceClaim.upsert({
            where: { roId: ro.id },
            update: {
                insuranceCompany,
                policyNo: row["Policy Number"]?.toString(),
                claimNo: (row["Claim Number"] ?? row["CLAIM NO"])?.toString(),
                hapFlag: hapFlagValue,
                claimIntimationDate:
                    parseExcelDate(row["Claim Intimation Date"]) ||
                    parseExcelDate(row["CLAIM DATE"]),
            },
            create: {
                roId: ro.id,
                insuranceCompany,
                policyNo: row["Policy Number"]?.toString(),
                claimNo: (row["Claim Number"] ?? row["CLAIM NO"])?.toString(),
                hapFlag: hapFlagValue,
                claimIntimationDate:
                    parseExcelDate(row["Claim Intimation Date"]) ||
                    parseExcelDate(row["CLAIM DATE"]),
            }
        });
    }

    // 4. Upsert Survey
    const surveyorName =
        row["Surveyor"]?.toString() ||
        row["SURVEYOR NAME"]?.toString();
    if (surveyorName || row["Survey date"] || row["SURVEY DATE"] || row["APPROVAL DATE"]) {
        await prisma.survey.upsert({
            where: { roId: ro.id },
            update: {
                surveyorName: surveyorName || undefined,
                surveyDate:
                    parseExcelDate(row["Survey date"]) ||
                    parseExcelDate(row["SURVEY DATE"]),
                approvalDate: parseExcelDate(row["APPROVAL DATE"]),
            },
            create: {
                roId: ro.id,
                surveyorName: surveyorName || undefined,
                surveyDate:
                    parseExcelDate(row["Survey date"]) ||
                    parseExcelDate(row["SURVEY DATE"]),
                approvalDate: parseExcelDate(row["APPROVAL DATE"]),
            }
        });
    }

    // 5. Upsert Billing
    if (row["Bill No"] || row["DO Date"]) {
        await prisma.billing.upsert({
            where: { roId: ro.id },
            update: {
                doDate: parseExcelDate(row["DO Date"]),
                billNo: row["Bill No"]?.toString(),
                billAmount: parseFloat(row["Bill Amount"] || 0),
                actualLabour: parseFloat(row["Actual Labour"] || 0),
                doAmount: parseFloat(row["DO Amount"] || 0),
                receivedRef: row["Received From Customer"]?.toString(),
                customerAmount: parseFloat(row["Customer Amount"] || 0),
                difference: parseFloat(row["Difference"] || 0),
                remarks: row["Remarks"]?.toString(),
            },
            create: {
                roId: ro.id,
                doDate: parseExcelDate(row["DO Date"]),
                billNo: row["Bill No"]?.toString(),
                billAmount: parseFloat(row["Bill Amount"] || 0),
                actualLabour: parseFloat(row["Actual Labour"] || 0),
                doAmount: parseFloat(row["DO Amount"] || 0),
                receivedRef: row["Received From Customer"]?.toString(),
                customerAmount: parseFloat(row["Customer Amount"] || 0),
                difference: parseFloat(row["Difference"] || 0),
                remarks: row["Remarks"]?.toString(),
            }
        });
    }
}

async function processPipelineRow(row: any, roNo: string, createdById: string) {
    const ro = await prisma.repairOrder.findUnique({ where: { roNo } });
    if (!ro) return;

    await prisma.survey.update({
        where: { roId: ro.id },
        data: {
            approvalDate: parseExcelDate(row["Approval Date"]),
        }
    });

    if (row["Advisor Remark"]) {
        await prisma.workNote.create({
            data: {
                roId: ro.id,
                noteText: row["Advisor Remark"].toString(),
                noteDate: new Date(),
                createdById,
            }
        });
    }
}

async function processPartsRow(row: any, roNo: string) {
    const ro = await prisma.repairOrder.findUnique({ where: { roNo } });
    if (!ro) return;

    // Parts rows focus on MRS and Orders
    if (row["MRS"] || row["Order No"]) {
        await prisma.partsOrder.create({
            data: {
                roId: ro.id,
                mrsNo: row["MRS"]?.toString(),
                mrsDate: parseExcelDate(row["Date"]),
                orderNo: row["Order No"]?.toString(),
                orderDate: parseExcelDate(row["Order Date"]),
                etaDate: parseExcelDate(row["ETA Date"]),
                receivedDate: parseExcelDate(row["Received Date"]),
                storeRemark: row["Remark"]?.toString(),
            }
        });
    }
}

