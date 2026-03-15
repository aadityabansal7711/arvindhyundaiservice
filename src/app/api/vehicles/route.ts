import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth-options";
import prisma from "@/lib/prisma";

export async function GET(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const search = (searchParams.get("search") || "").trim();

    try {
        if (!search) {
            return NextResponse.json([]);
        }

        const vehicles = await prisma.vehicle.findMany({
            where: {
                OR: [
                    { registrationNo: { contains: search, mode: "insensitive" } },
                    { model: { contains: search, mode: "insensitive" } },
                    { customer: { name: { contains: search, mode: "insensitive" } } },
                    { customer: { mobile: { contains: search, mode: "insensitive" } } },
                ],
            },
            include: { customer: true },
            take: 20,
            orderBy: { registrationNo: "asc" },
        });

        return NextResponse.json(vehicles);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { registrationNo, model, customerName, customerMobile } = body;

        if (!registrationNo || !model || !customerName || !customerMobile) {
            return NextResponse.json(
                { error: "registrationNo, model, customerName and customerMobile are required" },
                { status: 400 }
            );
        }

        const vehicle = await prisma.vehicle.upsert({
            where: { registrationNo: registrationNo.trim().toUpperCase() },
            update: {
                model: (model as string).trim(),
                customer: {
                    update: {
                        name: (customerName as string).trim(),
                        mobile: (customerMobile as string).trim(),
                    },
                },
            },
            create: {
                registrationNo: registrationNo.trim().toUpperCase(),
                model: (model as string).trim(),
                customer: {
                    create: {
                        name: (customerName as string).trim(),
                        mobile: (customerMobile as string).trim(),
                    },
                },
            },
            include: { customer: true },
        });

        return NextResponse.json(vehicle);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
