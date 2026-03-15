"use client";

import { useSession } from "next-auth/react";
import DashboardLayout from "@/components/layout/dashboard-layout";

export default function DashboardPage() {
    const { data: session } = useSession();

    return (
        <DashboardLayout>
            <div>
                <h1 className="text-2xl lg:text-3xl font-bold text-slate-900 tracking-tight">
                    Welcome back, {session?.user?.name}
                </h1>
                <p className="text-slate-500 mt-1.5 text-base">
                    Here's what's happening in your bodyshop today.
                </p>
            </div>
        </DashboardLayout>
    );
}
