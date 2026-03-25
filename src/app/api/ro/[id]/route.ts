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
    // Requirement: only this specific admin user should be able to delete ROs.
    const allowedRoDeleteEmail = "mayank.arvind.bansal@gmail.com";
    const email = (session?.user as any)?.email;
    const isAllowedAdmin = typeof email === "string" && email.toLowerCase() === allowedRoDeleteEmail;
    if (!session || !isAllowedAdmin) {
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
            include: {
                insuranceClaim: true,
                survey: true,
                vehicle: {
                    include: { customer: true },
                },
            },
        });
        if (!ro) {
            return NextResponse.json({ error: "RO Not Found" }, { status: 404 });
        }

        const body = await req.json();

        const roUpdates: Record<string, unknown> = {};

        // Basic RO fields (used by Edit RO page)
        if (body.roNo !== undefined) roUpdates.roNo = String(body.roNo).trim();
        if (body.branchId !== undefined) {
            if (body.branchId) {
                roUpdates.branch = { connect: { id: String(body.branchId).trim() } };
            } else {
                roUpdates.branch = { disconnect: true };
            }
        }
        if (body.vehicleInDate !== undefined) roUpdates.vehicleInDate = body.vehicleInDate ? new Date(body.vehicleInDate) : null;
        if (body.currentStatus !== undefined) roUpdates.currentStatus = String(body.currentStatus).trim();
        if (body.serviceAdvisorName !== undefined) roUpdates.serviceAdvisorName = body.serviceAdvisorName ? String(body.serviceAdvisorName).trim() : "";
        if (body.photos !== undefined && Array.isArray(body.photos)) roUpdates.photos = body.photos;
        if (body.workStartDate !== undefined) roUpdates.workStartDate = body.workStartDate ? new Date(body.workStartDate) : null;
        if (body.tentativeCompletionDate !== undefined) roUpdates.tentativeCompletionDate = body.tentativeCompletionDate ? new Date(body.tentativeCompletionDate) : null;
        if (body.panelsNewReplace !== undefined) roUpdates.panelsNewReplace = body.panelsNewReplace != null && body.panelsNewReplace !== "" ? Number(body.panelsNewReplace) : null;
        if (body.panelsDent !== undefined) roUpdates.panelsDent = body.panelsDent != null && body.panelsDent !== "" ? Number(body.panelsDent) : null;

        const claim = body.insuranceClaim;
        const surveyPayload = body.survey;
        const vehiclePayload = body.vehicle;

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
                if (claim.hapFlag !== undefined) {
                    // If hapFlag is explicitly null, do not overwrite the existing value with null,
                    // since the database column is non-nullable. Only update when it's a boolean.
                    if (claim.hapFlag === true || claim.hapFlag === false) {
                        claimData.hapFlag = claim.hapFlag;
                    }
                }
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
                            repairOrder: {
                                connect: { id },
                            },
                            insuranceCompany: (claim.insuranceCompany && String(claim.insuranceCompany).trim()) || "",
                            claimNo: claim.claimNo ? String(claim.claimNo).trim() : null,
                            claimIntimationDate: claim.claimIntimationDate ? new Date(claim.claimIntimationDate) : null,
                            // Only set hapFlag when it's a boolean; otherwise let DB default apply
                            ...(claim.hapFlag === true || claim.hapFlag === false
                                ? { hapFlag: claim.hapFlag }
                                : {}),
                        },
                    });
                }
            }
            if (surveyPayload && typeof surveyPayload === "object") {
                const surveyData: Record<string, unknown> = {};
                if (surveyPayload.surveyorName !== undefined) surveyData.surveyorName = surveyPayload.surveyorName ? String(surveyPayload.surveyorName).trim() : null;
                if (surveyPayload.surveyDate !== undefined) surveyData.surveyDate = surveyPayload.surveyDate ? new Date(surveyPayload.surveyDate) : null;
                if (surveyPayload.approvalDate !== undefined) surveyData.approvalDate = surveyPayload.approvalDate ? new Date(surveyPayload.approvalDate) : null;

                if (ro.survey) {
                    if (Object.keys(surveyData).length > 0) {
                        await tx.survey.update({
                            where: { id: ro.survey.id },
                            data: surveyData as Parameters<typeof tx.survey.update>[0]["data"],
                        });
                    }
                } else {
                    if (Object.keys(surveyData).length > 0) {
                        await tx.survey.create({
                            data: {
                                repairOrder: {
                                    connect: { id },
                                },
                                ...surveyData,
                            } as Parameters<typeof tx.survey.create>[0]["data"],
                        });
                    }
                }
            }

            if (vehiclePayload && typeof vehiclePayload === "object" && ro.vehicle) {
                const vehicleData: Record<string, unknown> = {};
                if (vehiclePayload.registrationNo !== undefined) vehicleData.registrationNo = vehiclePayload.registrationNo ? String(vehiclePayload.registrationNo).trim() : "";
                if (vehiclePayload.model !== undefined) vehicleData.model = vehiclePayload.model ? String(vehiclePayload.model).trim() : "";

                const customerData: Record<string, unknown> = {};
                if (vehiclePayload.customerName !== undefined) customerData.name = vehiclePayload.customerName ? String(vehiclePayload.customerName).trim() : "";
                if (vehiclePayload.customerMobile !== undefined) customerData.mobile = vehiclePayload.customerMobile ? String(vehiclePayload.customerMobile).trim() : "";

                if (Object.keys(vehicleData).length > 0) {
                    await tx.vehicle.update({
                        where: { id: ro.vehicle.id },
                        data: vehicleData as Parameters<typeof tx.vehicle.update>[0]["data"],
                    });
                }

                if (ro.vehicle.customer && Object.keys(customerData).length > 0) {
                    await tx.customer.update({
                        where: { id: ro.vehicle.customer.id },
                        data: customerData as Parameters<typeof tx.customer.update>[0]["data"],
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
