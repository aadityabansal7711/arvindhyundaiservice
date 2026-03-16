import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth-options";
import prisma from "@/lib/prisma";

export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await req.json();
        const {
            roNo,
            vehicleId,
            branchId,
            vehicleInDate,
            currentStatus,
            advisorId,
            serviceAdvisorName,
            committedDeliveryDate,
            insuranceCompany,
            surveyorName,
            claimIntimationDate,
            claimNo,
            hapFlag,
            photos,
        } = body;

        if (!roNo || !vehicleId || !vehicleInDate || !currentStatus) {
            return NextResponse.json(
                { error: "roNo, vehicleId, vehicleInDate and currentStatus are required" },
                { status: 400 }
            );
        }

        const vehicle = await prisma.vehicle.findUnique({
            where: { id: vehicleId },
            include: { customer: true },
        });
        if (!vehicle) {
            return NextResponse.json({ error: "Vehicle not found" }, { status: 400 });
        }

        const existing = await prisma.repairOrder.findUnique({
            where: { roNo: String(roNo).trim() },
        });
        if (existing) {
            return NextResponse.json({ error: "RO Number already exists" }, { status: 400 });
        }

        const photosArray = Array.isArray(photos)
            ? photos.filter((p: unknown) => typeof p === "string").slice(0, 20)
            : [];

        const ro = await prisma.repairOrder.create({
            data: {
                roNo: String(roNo).trim(),
                vehicleId,
                branchId: branchId && String(branchId).trim() ? String(branchId).trim() : null,
                vehicleInDate: new Date(vehicleInDate),
                currentStatus: String(currentStatus).trim(),
                advisorId: advisorId || null,
                serviceAdvisorName: serviceAdvisorName ? String(serviceAdvisorName).trim() : null,
                committedDeliveryDate: committedDeliveryDate ? new Date(committedDeliveryDate) : null,
                photos: photosArray.length > 0 ? photosArray : undefined,
            },
            include: {
                vehicle: { include: { customer: true } },
                insuranceClaim: true,
                survey: true,
                billing: true,
            },
        });

        const company = insuranceCompany ? String(insuranceCompany).trim() : "";
        const surveyor = surveyorName ? String(surveyorName).trim() : null;

        let normalizedHapFlag: boolean | null = null;
        if (hapFlag === true || hapFlag === "HAP") {
            normalizedHapFlag = true;
        } else if (hapFlag === false || hapFlag === "NHAP") {
            normalizedHapFlag = false;
        }

        const [insuranceClaimData, surveyData, billingData] = await Promise.all([
            prisma.insuranceClaim.create({
                data: {
                    repairOrder: {
                        connect: { id: ro.id },
                    },
                    insuranceCompany: company,
                    claimNo: claimNo ? String(claimNo).trim() : null,
                    claimIntimationDate: claimIntimationDate ? new Date(claimIntimationDate) : null,
                    // If normalizedHapFlag is null, let the database default apply instead of sending null
                    ...(normalizedHapFlag !== null ? { hapFlag: normalizedHapFlag } : {}),
                },
            }),
            prisma.survey.create({
                data: {
                    roId: ro.id,
                    surveyorName: surveyor || undefined,
                },
            }),
            company ? prisma.billing.create({ data: { roId: ro.id } }) : Promise.resolve(null),
        ]);

        return NextResponse.json({
            ...ro,
            insuranceClaim: insuranceClaimData,
            survey: surveyData,
            billing: billingData,
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function GET(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || "";
    const status = searchParams.get("status") || "";
    const limit = Math.min(Number(searchParams.get("limit")) || 80, 500);
    const offset = Number(searchParams.get("offset")) || 0;

    try {
        const where: Prisma.RepairOrderWhereInput = {};

        if (status) {
            where.currentStatus = status;
        }

        if (search.trim()) {
            const insensitive = { contains: search.trim(), mode: "insensitive" as const };
            where.OR = [
                { roNo: insensitive },
                { vehicle: { registrationNo: insensitive } },
                { vehicle: { customer: { name: insensitive } } },
                { insuranceClaim: { claimNo: insensitive } },
            ];
        }

        const ros = await prisma.repairOrder.findMany({
            where,
            select: {
                id: true,
                roNo: true,
                vehicleInDate: true,
                currentStatus: true,
                workStartDate: true,
                tentativeCompletionDate: true,
                panelsNewReplace: true,
                panelsDent: true,
                serviceAdvisorName: true,
                branch: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
                vehicle: {
                    select: {
                        registrationNo: true,
                        model: true,
                        customer: { select: { name: true, mobile: true } },
                    },
                },
                advisor: { select: { name: true } },
                insuranceClaim: {
                    select: {
                        insuranceCompany: true,
                        claimNo: true,
                        claimIntimationDate: true,
                        hapFlag: true,
                    },
                },
                survey: {
                    select: {
                        surveyorName: true,
                        surveyDate: true,
                        approvalDate: true,
                    },
                },
            },
            orderBy: { vehicleInDate: "desc" },
            take: limit,
            skip: offset,
        });

        return NextResponse.json(ros, {
            headers: {
                "Cache-Control": "private, s-maxage=30, stale-while-revalidate=60",
            },
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error";
        console.error("[GET /api/ro]", message, error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
