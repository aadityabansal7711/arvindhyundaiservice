"use client";

import { useState, useEffect, ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
    LayoutDashboard,
    ClipboardList,
    Users,
    Upload,
    LogOut,
    Search,
    User as UserIcon,
    Menu,
    X,
    Car,
    FileCheck,
    CheckSquare,
    Wrench,
    BarChart3,
    Database
} from "lucide-react";
import { cn } from "@/lib/utils";


const sidebarItems = [
    { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard, permission: "dashboard.view" },
    { name: "RO Register", href: "/ro", icon: ClipboardList, permission: "ro.view" },
    { name: "Claim Register", href: "/claim-register", icon: FileCheck, permission: "ro.view" },
    { name: "Approval Register", href: "/approval-register", icon: CheckSquare, permission: "ro.view" },
    { name: "Work Register", href: "/work-register", icon: Wrench, permission: "ro.view" },
    { name: "Status Report", href: "/status-report", icon: BarChart3, permission: "ro.view" },
    { name: "User Management", href: "/admin/users", icon: Users, permission: "users.manage" },
    { name: "Data Page", href: "/data", icon: Database, permission: "users.manage" },
];

export default function DashboardLayout({ children }: { children: ReactNode }) {
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const pathname = usePathname();
    const router = useRouter();
    const { data: session } = useSession();

    useEffect(() => {
        if (session && (session.user as any)?.mustChangePassword) {
            router.replace("/set-password");
        }
    }, [session, router]);

    const userRole = (session?.user as any)?.role as string | undefined;
    const userPermissions = (session?.user as any)?.permissions || [];
    const isManager = userRole?.toLowerCase() === "manager";

    const managerAllowedRoots = new Set([
        "/dashboard",
        "/ro",
        "/approval-register",
        "/work-register",
        "/status-report",
        "/data",
    ]);

    const filteredSidebarItems = sidebarItems.filter((item) => {
        if (item.permission && !userPermissions.includes(item.permission)) {
            return false;
        }
        if (isManager) {
            const root = "/" + item.href.split("/")[1];
            if (!managerAllowedRoots.has(root)) return false;
        }
        return true;
    });

    useEffect(() => {
        if (!session || !isManager) return;
        const root = "/" + pathname.split("/")[1];
        if (!managerAllowedRoots.has(root)) {
            router.replace("/dashboard");
        }
    }, [session, isManager, pathname, router]);

    return (
        <div className="min-h-screen bg-[var(--background)] flex">
            {/* Mobile Menu Overlay */}
            {isMobileMenuOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-sm"
                    onClick={() => setIsMobileMenuOpen(false)}
                />
            )}

            {/* Sidebar - dark theme */}
            <aside
                className={cn(
                    "bg-[var(--sidebar-bg)] z-50 transition-all duration-300 flex flex-col fixed lg:static inset-y-0 left-0 shadow-xl lg:shadow-none pt-[env(safe-area-inset-top)]",
                    {
                        "w-[min(20rem,85vw)] lg:w-20": isSidebarCollapsed,
                        "w-[min(20rem,85vw)] lg:w-64": !isSidebarCollapsed,
                    },
                    isMobileMenuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
                )}
            >
                <div className="p-3 sm:p-4 flex items-center justify-between min-h-14 sm:h-16 border-b border-white/10">
                    <div className={cn("flex items-center gap-3 overflow-hidden", isSidebarCollapsed && "lg:justify-center w-full")}>
                        <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center shrink-0 shadow-lg shadow-blue-500/30 ring-2 ring-white/10">
                            <Car className="text-white w-5 h-5" />
                        </div>
                        {!isSidebarCollapsed && (
                            <span className="font-bold text-white truncate text-lg tracking-tight">Arvind Hyundai</span>
                        )}
                    </div>
                    <button
                        className="lg:hidden p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                        onClick={() => setIsMobileMenuOpen(false)}
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
                    {filteredSidebarItems.map((item) => (
                        <Link
                            key={item.name}
                            href={item.href}
                            onClick={() => setIsMobileMenuOpen(false)}
                            className={cn(
                                "flex items-center gap-3 px-3 py-3 min-h-[44px] sm:min-h-0 rounded-xl transition-all duration-200 group touch-manipulation",
                                pathname.startsWith(item.href)
                                    ? "bg-white/10 text-white font-medium shadow-inner"
                                    : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                            )}
                        >
                            <item.icon className={cn(
                                "w-5 h-5 shrink-0",
                                pathname.startsWith(item.href) ? "text-blue-300" : "text-slate-500 group-hover:text-slate-300"
                            )} />
                            {!isSidebarCollapsed && <span className="truncate">{item.name}</span>}
                            {pathname.startsWith(item.href) && !isSidebarCollapsed && (
                                <div className="ml-auto w-1.5 h-1.5 bg-blue-400 rounded-full shrink-0" />
                            )}
                        </Link>
                    ))}
                </nav>

                <div className="p-4 border-t border-white/10 flex flex-col gap-2">
                    {!isSidebarCollapsed && session?.user && (
                        <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 mb-1">
                            <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center overflow-hidden border border-white/10 shrink-0">
                                <UserIcon className="w-5 h-5 text-slate-300" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-white truncate">{session.user.name}</p>
                                <p className="text-xs text-slate-400 truncate">{(session.user as any).role}</p>
                            </div>
                        </div>
                    )}
                    <button
                        onClick={() => signOut({ callbackUrl: "/login" })}
                        className={cn(
                            "flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition-all duration-200",
                            isSidebarCollapsed && "justify-center"
                        )}
                    >
                        <LogOut className="w-5 h-5 shrink-0" />
                        {!isSidebarCollapsed && <span className="font-medium">Logout</span>}
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <div className="flex-1 flex flex-col min-w-0 min-h-screen sm:h-screen overflow-hidden bg-dashboard-pattern">
                {/* Top Header - touch-friendly on mobile */}
                <header className="bg-white/80 backdrop-blur-md border-b border-slate-200/80 min-h-14 sm:h-16 flex items-center justify-between px-3 sm:px-4 lg:px-8 flex-shrink-0 shadow-sm safe-top">
                    <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
                        <button
                            type="button"
                            aria-label="Open menu"
                            className="lg:hidden p-3 -ml-1 rounded-xl text-slate-600 hover:bg-slate-100 active:bg-slate-200 transition-colors touch-manipulation"
                            onClick={() => setIsMobileMenuOpen(true)}
                        >
                            <Menu className="w-6 h-6" />
                        </button>
                        {pathname !== "/ro/new" && (
                            <div className="relative hidden md:block w-64 lg:w-96 flex-shrink-0">
                                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                                <input
                                    placeholder="Search RO, Reg No, Customer..."
                                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50/80 border border-slate-200/80 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-400/50 focus:bg-white transition-all shadow-sm"
                                />
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-2 lg:gap-4 flex-shrink-0">
                        {/* Header actions */}
                    </div>
                </header>

                {/* Page Content - comfortable padding on mobile */}
                <main className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-4 lg:p-8 pb-[env(safe-area-inset-bottom)]">
                    {children}
                </main>
            </div>
        </div>
    );
}
