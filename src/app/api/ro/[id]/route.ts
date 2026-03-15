import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth-options";
import prisma from "@/lib/prisma";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const session = await getServerSession(authOptions);
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    try {
        const ro = await prisma.repairOrder.findUnique({
            where: { id },
            include: {
                vehicle: { include: { customer: true } },
                insuranceClaim: true,
                survey: true,
                billing: true,
                partsOrders: true,
                workNotes: {
                    include: { createdBy: { select: { id: true, name: true, role: { select: { name: true } } } } },
                    orderBy: { noteDate: "desc" }
                },
            },
        });

        if (!ro) {
            return NextResponse.json({ error: "RO Not Found" }, { status: 404 });
        }

        return NextResponse.json(ro);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const session = await getServerSession(authOptions);
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    try {
        const ro = await prisma.repairOrder.findUnique({ where: { id } });
        if (!ro) {
            return NextResponse.json({ error: "RO Not Found" }, { status: 404 });
        }

        await prisma.$transaction([
            prisma.workNote.deleteMany({ where: { roId: id } }),
            prisma.partsOrder.deleteMany({ where: { roId: id } }),
            prisma.survey.deleteMany({ where: { roId: id } }),
            prisma.billing.deleteMany({ where: { roId: id } }),
            prisma.insuranceClaim.deleteMany({ where: { roId: id } }),
            prisma.repairOrder.delete({ where: { id } }),
        ]);

        return NextResponse.json({ ok: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const session = await getServerSession(authOptions);
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    try {
        const ro = await prisma.repairOrder.findUnique({
            where: { id },
            include: { insuranceClaim: true, survey: true },
        });
        if (!ro) {
            return NextResponse.json({ error: "RO Not Found" }, { status: 404 });
        }

        const body = await req.json();

        const roUpdates: Record<string, unknown> = {};
        if (body.workStartDate !== undefined) roUpdates.workStartDate = body.workStartDate ? new Date(body.workStartDate) : null;
        if (body.tentativeCompletionDate !== undefined) roUpdates.tentativeCompletionDate = body.tentativeCompletionDate ? new Date(body.tentativeCompletionDate) : null;
        if (body.panelsNewReplace !== undefined) roUpdates.panelsNewReplace = body.panelsNewReplace != null && body.panelsNewReplace !== "" ? Number(body.panelsNewReplace) : null;
        if (body.panelsDent !== undefined) roUpdates.panelsDent = body.panelsDent != null && body.panelsDent !== "" ? Number(body.panelsDent) : null;

        const claim = body.insuranceClaim;
        const surveyPayload = body.survey;

        await prisma.$transaction(async (tx) => {
            if (Object.keys(roUpdates).length > 0) {
                await tx.repairOrder.update({
                    where: { id },
                    data: roUpdates as Parameters<typeof tx.repairOrder.update>[0]["data"],
                });
            }
            if (claim && typeof claim === "object") {
                const claimData: Record<string, unknown> = {};
                if (claim.claimNo !== undefined) claimData.claimNo = claim.claimNo ? String(claim.claimNo).trim() : null;
                if (claim.claimIntimationDate !== undefined) claimData.claimIntimationDate = claim.claimIntimationDate ? new Date(claim.claimIntimationDate) : null;
                if (claim.hapFlag !== undefined) claimData.hapFlag = Boolean(claim.hapFlag);
                if (claim.insuranceCompany !== undefined) claimData.insuranceCompany = claim.insuranceCompany ? String(claim.insuranceCompany).trim() : "";
                if (ro.insuranceClaim) {
                    if (Object.keys(claimData).length > 0) {
                        await tx.insuranceClaim.update({
                            where: { id: ro.insuranceClaim.id },
                            data: claimData as Parameters<typeof tx.insuranceClaim.update>[0]["data"],
                        });
                    }
                } else {
                    await tx.insuranceClaim.create({
                        data: {
                            roId: id,
                            insuranceCompany: (claim.insuranceCompany && String(claim.insuranceCompany).trim()) || "",
                            claimNo: claim.claimNo ? String(claim.claimNo).trim() : null,
                            claimIntimationDate: claim.claimIntimationDate ? new Date(claim.claimIntimationDate) : null,
                            hapFlag: Boolean(claim.hapFlag),
                        },
                    });
                }
            }
            if (surveyPayload && typeof surveyPayload === "object" && ro.survey) {
                const surveyData: Record<string, unknown> = {};
                if (surveyPayload.surveyorName !== undefined) surveyData.surveyorName = surveyPayload.surveyorName ? String(surveyPayload.surveyorName).trim() : null;
                if (surveyPayload.surveyDate !== undefined) surveyData.surveyDate = surveyPayload.surveyDate ? new Date(surveyPayload.surveyDate) : null;
                if (surveyPayload.approvalDate !== undefined) surveyData.approvalDate = surveyPayload.approvalDate ? new Date(surveyPayload.approvalDate) : null;
                if (Object.keys(surveyData).length > 0) {
                    await tx.survey.update({
                        where: { id: ro.survey!.id },
                        data: surveyData as Parameters<typeof tx.survey.update>[0]["data"],
                    });
                }
            }
        });

        const updated = await prisma.repairOrder.findUnique({
            where: { id },
            include: {
                vehicle: { include: { customer: true } },
                insuranceClaim: true,
                survey: true,
                billing: true,
                partsOrders: true,
                workNotes: {
                    include: { createdBy: { select: { id: true, name: true, role: { select: { name: true } } } } },
                    orderBy: { noteDate: "desc" },
                },
            },
        });
        return NextResponse.json(updated);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
