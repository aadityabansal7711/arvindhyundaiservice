import DashboardLayout from "@/components/layout/dashboard-layout";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth-options";

export const dynamic = "force-dynamic";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login");
  }
  if ((session.user as { mustChangePassword?: boolean })?.mustChangePassword) {
    redirect("/set-password");
  }

  return <DashboardLayout>{children}</DashboardLayout>;
}
