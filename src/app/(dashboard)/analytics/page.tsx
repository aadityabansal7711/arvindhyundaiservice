import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth-options";
import { isOwnerUser } from "@/lib/owner-access";
import AnalyticsClient from "./analytics-client";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
    const session = await getServerSession(authOptions);
    if (!session) redirect("/login");
    if (!isOwnerUser(session.user)) redirect("/bodyshop");

    return <AnalyticsClient />;
}
