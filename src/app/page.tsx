import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth-options";

export default async function Page() {
  const session = await getServerSession(authOptions);

  if (session) {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 p-8 bg-zinc-50">
      <h1 className="text-3xl font-semibold text-zinc-900">
        Service Portal
      </h1>
      <p className="text-zinc-600 text-center max-w-md">
        Arvind Group Service Dashboard
      </p>
      <Link
        href="/login"
        className="px-4 py-2 bg-zinc-900 text-white rounded-md hover:bg-zinc-800 transition"
      >
        Sign in
      </Link>
    </main>
  );
}
