"use client";

import { Suspense, useState, useEffect, ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
    Users,
    LogOut,
    User as UserIcon,
    Menu,
    X,
    Car,
    Database,
    KanbanSquare,
    PackageCheck,
    PanelLeftClose,
    PanelLeftOpen,
    BarChart3,
    KeyRound,
    Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { isOwnerUser } from "@/lib/owner-access";
import { SidebarStages } from "@/components/bodyshop/sidebar-stages";
import { ServiceSidebarStages } from "@/components/service/sidebar-stages";

type SidebarItem = {
    name: string;
    href: string;
    icon: typeof KanbanSquare;
    permission?: string;
    ownerOnly?: boolean;
};

const sidebarItems: SidebarItem[] = [
    { name: "Bodyshop Board", href: "/bodyshop", icon: KanbanSquare, permission: "ro.view" },
    { name: "Bodyshop Delivered", href: "/bodyshop/delivered", icon: PackageCheck, permission: "users.manage" },
    { name: "Service Board", href: "/service", icon: Wrench, permission: "ro.view" },
    { name: "Service Delivered", href: "/service/delivered", icon: PackageCheck, permission: "users.manage" },
    { name: "Analytics", href: "/analytics", icon: BarChart3, ownerOnly: true },
    { name: "User Management", href: "/admin/users", icon: Users, permission: "users.manage" },
    { name: "GDMS Credentials", href: "/gdms-credentials", icon: KeyRound, permission: "gdms.fetch" },
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

    const isOwner = isOwnerUser(session?.user);

    const filteredSidebarItems = sidebarItems.filter((item) => {
        if (item.ownerOnly && !isOwner) {
            return false;
        }
        if (item.permission && !userPermissions.includes(item.permission)) {
            return false;
        }
        return true;
    });

    // Render Bodyshop/Service "board" link(s) above their stages, but keep "Delivered" below stages.
    const deliveredItem = filteredSidebarItems.find((i) => i.href === "/bodyshop/delivered");
    const bodyshopItem = filteredSidebarItems.filter(
        (i) => i.href.startsWith("/bodyshop") && i.href !== "/bodyshop/delivered"
    );
    const serviceDeliveredItem = filteredSidebarItems.find((i) => i.href === "/service/delivered");
    const serviceItem = filteredSidebarItems.filter(
        (i) => i.href.startsWith("/service") && i.href !== "/service/delivered"
    );
    const nonBodyshopItems = filteredSidebarItems.filter(
        (i) => !i.href.startsWith("/bodyshop") && !i.href.startsWith("/service")
    );
    const showBodyshopStages =
        pathname.startsWith("/bodyshop") &&
        !pathname.startsWith("/bodyshop/delivered") &&
        !isSidebarCollapsed;
    const showServiceStages =
        pathname.startsWith("/service") &&
        !pathname.startsWith("/service/delivered") &&
        !isSidebarCollapsed;
    const pageTitle =
        pathname.startsWith("/bodyshop/delivered")
            ? "Delivered Vehicles"
            : pathname.startsWith("/bodyshop")
                ? "Bodyshop Operations"
                : pathname.startsWith("/service/delivered")
                    ? "Service Delivered Vehicles"
                    : pathname.startsWith("/service")
                        ? "Service Operations"
                        : pathname.startsWith("/admin/users")
                            ? "User Management"
                            : pathname.startsWith("/gdms-credentials")
                                ? "GDMS Credentials"
                            : pathname.startsWith("/data")
                                ? "Data Library"
                                : pathname.startsWith("/analytics")
                                    ? "Analytics"
                                    : "Service Operations";
    const isSidebarItemActive = (href: string) => {
        if (href === "/bodyshop") {
            // `/bodyshop/delivered` should not mark "Bodyshop Board" as active.
            return pathname === "/bodyshop" || (pathname.startsWith("/bodyshop") && !pathname.startsWith("/bodyshop/delivered"));
        }
        if (href === "/service") {
            // `/service/delivered` should not mark "Service Board" as active.
            return pathname === "/service" || (pathname.startsWith("/service") && !pathname.startsWith("/service/delivered"));
        }
        return pathname.startsWith(href);
    };

    return (
        <div className="min-h-screen bg-[var(--background)] flex text-slate-950">
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
                    "bg-[var(--sidebar-bg)] z-50 transition-all duration-300 flex flex-col fixed lg:static inset-y-0 left-0 shadow-2xl lg:shadow-none pt-[env(safe-area-inset-top)] overflow-hidden",
                    {
                        "w-[min(20rem,85vw)] lg:w-20": isSidebarCollapsed,
                        "w-[min(20rem,85vw)] lg:w-64": !isSidebarCollapsed,
                    },
                    isMobileMenuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
                )}
            >
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(14,165,233,0.28),transparent_17rem),linear-gradient(180deg,rgba(255,255,255,0.07),transparent_18rem)]" />
                <div className="relative px-3 py-2 flex items-center justify-between min-h-14 border-b border-white/10">
                    <div className={cn("flex items-center gap-3 overflow-hidden", isSidebarCollapsed && "lg:justify-center w-full")}>
                        <div className="w-9 h-9 bg-sky-500 rounded-xl flex items-center justify-center shrink-0 shadow-lg shadow-sky-500/30 ring-1 ring-white/20">
                            <Car className="text-white w-5 h-5" />
                        </div>
                        {!isSidebarCollapsed && (
                            <div className="min-w-0">
                                <span className="block font-bold text-white truncate text-base tracking-tight">Arvind Hyundai</span>
                                <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-200/70">Service Desk</span>
                            </div>
                        )}
                    </div>
                    <button
                        className="lg:hidden p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                        onClick={() => setIsMobileMenuOpen(false)}
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <nav className="relative flex-1 min-h-0 overflow-hidden py-2 px-3 space-y-1">
                    {bodyshopItem.map((item) => (
                        <Link
                            key={item.name}
                            href={item.href}
                            onClick={() => setIsMobileMenuOpen(false)}
                            className={cn(
                                "flex items-center gap-3 px-3 py-2 min-h-10 rounded-xl transition-all duration-200 group touch-manipulation",
                                isSidebarItemActive(item.href)
                                    ? "bg-white/[0.12] text-white font-medium shadow-inner ring-1 ring-white/10"
                                    : "text-slate-400 hover:bg-white/[0.07] hover:text-slate-100"
                            )}
                        >
                            <item.icon className={cn(
                                "w-5 h-5 shrink-0",
                                isSidebarItemActive(item.href) ? "text-sky-300" : "text-slate-500 group-hover:text-slate-300"
                            )} />
                            {!isSidebarCollapsed && <span className="truncate">{item.name}</span>}
                            {isSidebarItemActive(item.href) && !isSidebarCollapsed && (
                                <div className="ml-auto w-1.5 h-1.5 bg-sky-300 rounded-full shrink-0" />
                            )}
                        </Link>
                    ))}
                    {showBodyshopStages && (
                        <div className="mt-2 h-[calc(100vh-26rem)] min-h-32 overflow-hidden">
                            <Suspense fallback={<div className="bg-white/10 rounded-xl h-32 animate-pulse" />}>
                                <SidebarStages />
                            </Suspense>
                        </div>
                    )}
                    {deliveredItem && (
                        <Link
                            key={deliveredItem.name}
                            href={deliveredItem.href}
                            onClick={() => setIsMobileMenuOpen(false)}
                            className={cn(
                                "flex items-center gap-3 px-3 py-2 min-h-10 rounded-xl transition-all duration-200 group touch-manipulation text-sm",
                                showBodyshopStages && "mt-1",
                                pathname.startsWith(deliveredItem.href)
                                    ? "bg-white/[0.12] text-white font-medium shadow-inner ring-1 ring-white/10"
                                    : "text-slate-400 hover:bg-white/[0.07] hover:text-slate-100"
                            )}
                        >
                            <deliveredItem.icon
                                className={cn(
                                    "w-5 h-5 shrink-0",
                                    pathname.startsWith(deliveredItem.href)
                                        ? "text-sky-300"
                                        : "text-slate-500 group-hover:text-slate-300"
                                )}
                            />
                            {!isSidebarCollapsed && (
                                <span className="truncate">{deliveredItem.name}</span>
                            )}
                            {pathname.startsWith(deliveredItem.href) && !isSidebarCollapsed && (
                                <div className="ml-auto w-1.5 h-1.5 bg-sky-300 rounded-full shrink-0" />
                            )}
                        </Link>
                    )}
                    {serviceItem.map((item) => (
                        <Link
                            key={item.name}
                            href={item.href}
                            onClick={() => setIsMobileMenuOpen(false)}
                            className={cn(
                                "flex items-center gap-3 px-3 py-2 min-h-10 rounded-xl transition-all duration-200 group touch-manipulation",
                                isSidebarItemActive(item.href)
                                    ? "bg-white/[0.12] text-white font-medium shadow-inner ring-1 ring-white/10"
                                    : "text-slate-400 hover:bg-white/[0.07] hover:text-slate-100"
                            )}
                        >
                            <item.icon className={cn(
                                "w-5 h-5 shrink-0",
                                isSidebarItemActive(item.href) ? "text-sky-300" : "text-slate-500 group-hover:text-slate-300"
                            )} />
                            {!isSidebarCollapsed && <span className="truncate">{item.name}</span>}
                            {isSidebarItemActive(item.href) && !isSidebarCollapsed && (
                                <div className="ml-auto w-1.5 h-1.5 bg-sky-300 rounded-full shrink-0" />
                            )}
                        </Link>
                    ))}
                    {showServiceStages && (
                        <div className="mt-2 h-[calc(100vh-26rem)] min-h-32 overflow-hidden">
                            <Suspense fallback={<div className="bg-white/10 rounded-xl h-32 animate-pulse" />}>
                                <ServiceSidebarStages />
                            </Suspense>
                        </div>
                    )}
                    {serviceDeliveredItem && (
                        <Link
                            key={serviceDeliveredItem.name}
                            href={serviceDeliveredItem.href}
                            onClick={() => setIsMobileMenuOpen(false)}
                            className={cn(
                                "flex items-center gap-3 px-3 py-2 min-h-10 rounded-xl transition-all duration-200 group touch-manipulation text-sm",
                                showServiceStages && "mt-1",
                                pathname.startsWith(serviceDeliveredItem.href)
                                    ? "bg-white/[0.12] text-white font-medium shadow-inner ring-1 ring-white/10"
                                    : "text-slate-400 hover:bg-white/[0.07] hover:text-slate-100"
                            )}
                        >
                            <serviceDeliveredItem.icon
                                className={cn(
                                    "w-5 h-5 shrink-0",
                                    pathname.startsWith(serviceDeliveredItem.href)
                                        ? "text-sky-300"
                                        : "text-slate-500 group-hover:text-slate-300"
                                )}
                            />
                            {!isSidebarCollapsed && (
                                <span className="truncate">{serviceDeliveredItem.name}</span>
                            )}
                            {pathname.startsWith(serviceDeliveredItem.href) && !isSidebarCollapsed && (
                                <div className="ml-auto w-1.5 h-1.5 bg-sky-300 rounded-full shrink-0" />
                            )}
                        </Link>
                    )}
                    {nonBodyshopItems.map((item) => (
                        <Link
                            key={item.name}
                            href={item.href}
                            onClick={() => setIsMobileMenuOpen(false)}
                            className={cn(
                                "flex items-center gap-3 px-3 py-2 min-h-10 rounded-xl transition-all duration-200 group touch-manipulation text-sm",
                                isSidebarItemActive(item.href)
                                    ? "bg-white/[0.12] text-white font-medium shadow-inner ring-1 ring-white/10"
                                    : "text-slate-400 hover:bg-white/[0.07] hover:text-slate-100"
                            )}
                        >
                            <item.icon className={cn(
                                "w-5 h-5 shrink-0",
                                isSidebarItemActive(item.href) ? "text-sky-300" : "text-slate-500 group-hover:text-slate-300"
                            )} />
                            {!isSidebarCollapsed && <span className="truncate">{item.name}</span>}
                            {isSidebarItemActive(item.href) && !isSidebarCollapsed && (
                                <div className="ml-auto w-1.5 h-1.5 bg-sky-300 rounded-full shrink-0" />
                            )}
                        </Link>
                    ))}
                </nav>

                <div className="relative p-3 border-t border-white/10 flex flex-col gap-1.5">
                    {!isSidebarCollapsed && session?.user && (
                        <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-white/[0.07] ring-1 ring-white/10">
                            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center overflow-hidden border border-white/10 shrink-0">
                                <UserIcon className="w-4 h-4 text-slate-300" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-white truncate">{session.user.name}</p>
                                <p className="text-xs text-slate-400 truncate">{(session.user as any).role}</p>
                            </div>
                        </div>
                    )}
                    <button
                        type="button"
                        onClick={() => setIsSidebarCollapsed((value) => !value)}
                        className={cn(
                            "hidden lg:flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-slate-400 hover:bg-white/[0.07] hover:text-white transition-all duration-200",
                            isSidebarCollapsed && "justify-center"
                        )}
                        aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                    >
                        {isSidebarCollapsed ? (
                            <PanelLeftOpen className="w-5 h-5 shrink-0" />
                        ) : (
                            <PanelLeftClose className="w-5 h-5 shrink-0" />
                        )}
                        {!isSidebarCollapsed && <span className="font-medium">Collapse</span>}
                    </button>
                    <button
                        onClick={() => signOut({ callbackUrl: "/login" })}
                        className={cn(
                            "flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-slate-400 hover:bg-red-500/10 hover:text-red-300 transition-all duration-200",
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
                <header className="bg-white/[0.78] backdrop-blur-xl border-b border-white/80 min-h-14 sm:h-16 flex items-center justify-between px-3 sm:px-4 lg:px-8 flex-shrink-0 shadow-[0_1px_0_rgba(15,23,42,0.04)] safe-top">
                    <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
                        <button
                            type="button"
                            aria-label="Open menu"
                            className="lg:hidden p-3 -ml-1 rounded-xl text-slate-600 hover:bg-slate-100 active:bg-slate-200 transition-colors touch-manipulation"
                            onClick={() => setIsMobileMenuOpen(true)}
                        >
                            <Menu className="w-6 h-6" />
                        </button>
                        <div className="hidden sm:block min-w-0">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Workspace</div>
                            <div className="text-sm font-bold text-slate-900 truncate">{pageTitle}</div>
                        </div>
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
