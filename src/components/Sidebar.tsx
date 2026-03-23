"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ClipboardCheck,
  RefreshCw,
  Wrench,
  Users,
  FileText,
  Zap,
  BarChart3,
  Building2,
  HardHat,
  Bell,
  TrendingUp,
  MessageSquare,
  Calendar,
  ChevronDown,
  Megaphone,
} from "lucide-react";
import { useState } from "react";

type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  children?: { label: string; href: string }[];
};

const navItems: NavItem[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  {
    label: "Inspections",
    href: "/inspections",
    icon: ClipboardCheck,
    children: [
      { label: "Move-Out", href: "/inspections/move-out" },
      { label: "Move-In", href: "/inspections/move-in" },
      { label: "Onboarding", href: "/inspections/onboarding" },
      { label: "Quarterly", href: "/inspections/quarterly" },
      { label: "Punch List", href: "/inspections/punch-list" },
    ],
  },
  { label: "Unit Turns", href: "/unit-turns", icon: RefreshCw },
  { label: "Maintenance", href: "/maintenance", icon: Wrench },
  {
    label: "Leasing",
    href: "/leasing",
    icon: FileText,
    children: [
      { label: "Applications", href: "/leasing/applications" },
      { label: "Tours", href: "/leasing/tours" },
      { label: "Comp Watch", href: "/comp-watch" },
    ],
  },
  { label: "Vendors", href: "/vendors", icon: Users },
  { label: "RUBs", href: "/rubs", icon: Zap },
  { label: "Reports", href: "/reports", icon: BarChart3 },
  { label: "Portfolio", href: "/portfolio", icon: Building2 },
  { label: "Capital Projects", href: "/capital-projects", icon: HardHat },
  { label: "Notices", href: "/notices", icon: Bell },
  { label: "Analytics", href: "/resident-pulse", icon: MessageSquare },
  {
    label: "Marketing",
    href: "/marketing",
    icon: Megaphone,
    children: [
      { label: "Dashboard", href: "/marketing" },
      { label: "Create Content", href: "/marketing/create" },
      { label: "Monthly Report", href: "/marketing/report" },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    Inspections: pathname.startsWith("/inspections"),
    Leasing: pathname.startsWith("/leasing") || pathname.startsWith("/comp-watch"),
    Marketing: pathname.startsWith("/marketing"),
  });

  function toggleExpand(label: string) {
    setExpanded((prev) => ({ ...prev, [label]: !prev[label] }));
  }

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  return (
    <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-sidebar z-50">
      {/* Brand */}
      <div className="h-16 flex items-center px-5 border-b border-white/5">
        <Link href="/" className="flex items-center gap-3">
          <div className="w-9 h-9 hero-gradient rounded-xl flex items-center justify-center shadow-lg shadow-accent/20">
            <span className="text-white font-bold text-base">M</span>
          </div>
          <div>
            <span className="text-white font-semibold text-base tracking-tight block leading-tight">
              Moxie
            </span>
            <span className="text-sidebar-text text-[10px] tracking-wide uppercase font-medium">
              Management
            </span>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
        {navItems.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;
          const isExpanded = expanded[item.label];
          const hasChildren = item.children && item.children.length > 0;

          return (
            <div key={item.href}>
              {/* Main nav item */}
              <div className="flex items-center">
                <Link
                  href={item.href}
                  className={`flex-1 flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                    active
                      ? "bg-sidebar-active text-sidebar-text-active"
                      : "text-sidebar-text hover:text-sidebar-text-active hover:bg-sidebar-hover"
                  }`}
                >
                  <Icon
                    size={18}
                    className={active ? "text-accent" : "text-sidebar-text"}
                  />
                  <span className="flex-1">{item.label}</span>
                  {active && (
                    <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse-dot" />
                  )}
                </Link>
                {hasChildren && (
                  <button
                    onClick={() => toggleExpand(item.label)}
                    className="p-1.5 rounded-md text-sidebar-text hover:text-sidebar-text-active hover:bg-sidebar-hover transition-colors"
                  >
                    <ChevronDown
                      size={14}
                      className={`transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                    />
                  </button>
                )}
              </div>

              {/* Sub-navigation */}
              {hasChildren && isExpanded && (
                <div className="ml-5 pl-4 border-l border-white/5 mt-1 mb-1 space-y-0.5">
                  {item.children!.map((child) => {
                    const childActive = pathname === child.href;
                    return (
                      <Link
                        key={child.href}
                        href={child.href}
                        className={`block px-3 py-2 rounded-md text-sm transition-colors ${
                          childActive
                            ? "text-sidebar-text-active font-medium bg-sidebar-hover"
                            : "text-sidebar-text hover:text-sidebar-text-active hover:bg-sidebar-hover"
                        }`}
                      >
                        {child.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Bottom section */}
      <div className="border-t border-white/5 p-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-sidebar-hover flex items-center justify-center">
            <span className="text-xs font-medium text-sidebar-text-active">PM</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-sidebar-text-active truncate">
              Property Manager
            </p>
            <p className="text-[10px] text-sidebar-text truncate">
              Moxie Management
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}
