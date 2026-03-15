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
    ChevronLeft,
    ChevronRight,
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
    { name: "Import Center", href: "/import", icon: Upload, permission: "import.manage" },
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

    const userPermissions = (session?.user as any)?.permissions || [];
    const filteredSidebarItems = sidebarItems.filter(item =>
        !item.permission || userPermissions.includes(item.permission)
    );

    return (
        <div className="min-h-screen bg-[#f8fafc] flex">
            {/* Mobile Menu Overlay */}
            {isMobileMenuOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-sm"
                    onClick={() => setIsMobileMenuOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside
                className={cn(
                    "bg-white border-r border-slate-200 z-50 transition-all duration-300 flex flex-col fixed lg:static inset-y-0 left-0",
                    isSidebarCollapsed ? "w-20" : "w-64",
                    isMobileMenuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
                )}
            >
                <div className="p-4 flex items-center justify-between border-b border-slate-100 h-16">
                    <div className={cn("flex items-center gap-3 overflow-hidden", isSidebarCollapsed && "lg:justify-center w-full")}>
                        <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center shrink-0 shadow-lg shadow-blue-600/20">
                            <Car className="text-white w-6 h-6" />
                        </div>
                        {!isSidebarCollapsed && (
                            <span className="font-bold text-slate-900 truncate">Arvind Hyundai</span>
                        )}
                    </div>
                    <button
                        className="lg:hidden"
                        onClick={() => setIsMobileMenuOpen(false)}
                    >
                        <X className="w-6 h-6 text-slate-500" />
                    </button>
                </div>

                <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
                    {filteredSidebarItems.map((item) => (
                        <Link
                            key={item.name}
                            href={item.href}
                            className={cn(
                                "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all group",
                                pathname.startsWith(item.href)
                                    ? "bg-blue-50 text-blue-600 font-semibold"
                                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                            )}
                        >
                            <item.icon className={cn(
                                "w-5 h-5",
                                pathname.startsWith(item.href) ? "text-blue-600" : "text-slate-400 group-hover:text-slate-600"
                            )} />
                            {!isSidebarCollapsed && <span className="truncate">{item.name}</span>}
                            {pathname.startsWith(item.href) && !isSidebarCollapsed && (
                                <div className="ml-auto w-1.5 h-1.5 bg-blue-600 rounded-full" />
                            )}
                        </Link>
                    ))}
                </nav>

                <div className="p-4 border-t border-slate-100 flex flex-col gap-2">
                    {!isSidebarCollapsed && session?.user && (
                        <div className="flex items-center gap-3 px-2 py-2 mb-2">
                            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center overflow-hidden border border-slate-200">
                                <UserIcon className="w-5 h-5 text-slate-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-slate-900 truncate">{session.user.name}</p>
                                <p className="text-xs text-slate-500 truncate">{(session.user as any).role}</p>
                            </div>
                        </div>
                    )}
                    <button
                        onClick={() => signOut({ callbackUrl: "/login" })}
                        className={cn(
                            "flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-500 hover:bg-red-50 hover:text-red-600 transition-all",
                            isSidebarCollapsed && "justify-center"
                        )}
                    >
                        <LogOut className="w-5 h-5" />
                        {!isSidebarCollapsed && <span className="font-medium">Logout</span>}
                    </button>
                    <button
                        onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                        className="hidden lg:flex items-center justify-center p-2 rounded-lg hover:bg-slate-100 text-slate-400 absolute -right-4 top-20 bg-white border border-slate-200 shadow-sm z-50"
                    >
                        {isSidebarCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
                {/* Top Header */}
                <header className="bg-white border-b border-slate-200 h-16 flex items-center justify-between px-4 lg:px-8 flex-shrink-0">
                    <div className="flex items-center gap-4">
                        <button
                            className="lg:hidden p-2 text-slate-500"
                            onClick={() => setIsMobileMenuOpen(true)}
                        >
                            <Menu className="w-6 h-6" />
                        </button>
                        <div className="relative hidden md:block w-64 lg:w-96">
                            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                            <input
                                placeholder="Search RO, Reg No, Customer..."
                                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white transition-all"
                            />
                        </div>
                    </div>

                    <div className="flex items-center gap-2 lg:gap-4">
                        {/* Header actions (Notifications/Profile) removed as per user request */}
                    </div>
                </header>

                {/* Page Content */}
                <main className="flex-1 overflow-y-auto p-4 lg:p-8">
                    {children}
                </main>
            </div>
        </div>
    );
}
