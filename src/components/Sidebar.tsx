"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ClipboardCheck,
  Wrench,
  Users,
  FileText,
  Zap,
  Building2,
  Bell,
  Megaphone,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Calendar,
  MessageSquare,
  HardHat,
  BarChart3,
  LogOut,
  X,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { usePortfolio, PORTFOLIO_LABELS, type PortfolioId } from "@/contexts/PortfolioContext";
import { appCategories, apps } from "@/lib/mock-data";
import type { AppCategory } from "@/lib/types";

// Map Lucide icon name (string in AppConfig.icon) to the actual component
const iconByName: Record<string, LucideIcon> = {
  ClipboardCheck, Wrench, Users, FileText, Zap, Building2, Bell,
  Megaphone, TrendingUp, Calendar, MessageSquare, HardHat, BarChart3,
  Truck: ClipboardCheck,
};

type Child = { label: string; href: string };

// Nested children expose sub-pages for apps whose single tool card actually
// spans multiple routes (Marketing, RUBs, Inspections).
const childrenByAppId: Record<string, Child[]> = {
  "marketing-dashboard": [
    { label: "Dashboard", href: "/marketing" },
    { label: "Create Content", href: "/marketing/create" },
    { label: "Monthly Report", href: "/marketing/report" },
  ],
  "rubs": [
    { label: "Bills", href: "/rubs" },
    { label: "Settings", href: "/rubs/settings" },
  ],
};

// Extra nav items that aren't backed by an entry in the apps array
// (dashboard, floor plans rollup under inspections, unit turns).
type ExtraItem = {
  id: string;
  label: string;
  href: string;
  iconName: string;
  category: AppCategory | "primary";
  children?: Child[];
};

const extraItems: ExtraItem[] = [
  // Inspections roll-up with children — replaces the 5 individual tool cards
  // in the sidebar so the nav stays tight. The individual cards still exist
  // in the apps array and appear on the Inspections category page.
  {
    id: "inspections-hub",
    label: "Inspections",
    href: "/inspections",
    iconName: "ClipboardCheck",
    category: "inspections",
    children: [
      { label: "Move-Out", href: "/inspections/move-out" },
      { label: "Move-In", href: "/inspections/move-in" },
      { label: "Onboarding", href: "/inspections/onboarding" },
      { label: "Quarterly", href: "/inspections/quarterly" },
      { label: "Punch List", href: "/inspections/punch-list" },
      { label: "Floor Plans", href: "/floor-plans" },
    ],
  },
  // Unit Turns lives under operations but isn't in the apps array
  {
    id: "unit-turns",
    label: "Unit Turns",
    href: "/unit-turns",
    iconName: "HardHat",
    category: "operations",
  },
];

// Inspections: suppress the individual inspection apps since the roll-up
// covers them via children.
const APP_IDS_HIDDEN_IN_SIDEBAR = new Set<string>([
  "move-out-inspection",
  "move-in-inspection",
  "onboarding-inspection",
  "quarterly-inspection",
  "punch-list",
]);

type SidebarItem = {
  id: string;
  label: string;
  href: string;
  Icon: LucideIcon;
  category: AppCategory | "primary";
  children?: Child[];
};

function buildSidebarItems(): SidebarItem[] {
  const items: SidebarItem[] = [
    {
      id: "dashboard",
      label: "Dashboard",
      href: "/",
      Icon: LayoutDashboard,
      category: "primary",
    },
  ];

  for (const app of apps) {
    if (APP_IDS_HIDDEN_IN_SIDEBAR.has(app.id)) continue;
    items.push({
      id: app.id,
      label: app.name,
      href: app.href,
      Icon: iconByName[app.icon] ?? FileText,
      category: app.category,
      children: childrenByAppId[app.id],
    });
  }

  for (const extra of extraItems) {
    items.push({
      id: extra.id,
      label: extra.label,
      href: extra.href,
      Icon: iconByName[extra.iconName] ?? FileText,
      category: extra.category,
      children: extra.children,
    });
  }

  return items;
}

// Sidebar items that only apply to the USC student housing portfolio.
const USC_ONLY_APP_IDS = new Set(["applications", "showings", "comp-watch"]);

// Category header labels: "primary" has no header, others come from appCategories
const categoryHeaders: Record<string, string> = Object.fromEntries(
  appCategories.map((c) => [c.id, c.label])
);

const categoryOrder: (AppCategory | "primary")[] = [
  "primary",
  ...appCategories.sort((a, b) => a.order - b.order).map((c) => c.id),
];

type SidebarProps = {
  /** Desktop-only: render the icons-only collapsed rail. */
  collapsed: boolean;
  onToggleCollapse: () => void;
  /** Mobile: drawer is open and sliding in over content. */
  mobileOpen: boolean;
  onCloseMobile: () => void;
};

export function Sidebar({
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const { portfolioId, setPortfolioId } = usePortfolio();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    "inspections-hub": pathname.startsWith("/inspections") || pathname.startsWith("/floor-plans"),
    "marketing-dashboard": pathname.startsWith("/marketing"),
    "rubs": pathname.startsWith("/rubs"),
  });

  const allSidebarItems = buildSidebarItems();
  const sidebarItems = portfolioId === "25"
    ? allSidebarItems.filter((i) => !USC_ONLY_APP_IDS.has(i.id))
    : allSidebarItems;

  function toggleExpand(id: string) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  const allHrefs = sidebarItems.flatMap((item) =>
    item.children ? [item.href, ...item.children.map((c) => c.href)] : [item.href]
  );

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    if (pathname === href) return true;
    if (!pathname.startsWith(href + "/")) return false;
    const hasMoreSpecific = allHrefs.some(
      (other) => other !== href && other.length > href.length && (pathname === other || pathname.startsWith(other + "/"))
    );
    return !hasMoreSpecific;
  }

  // On the collapsed rail, child trees and category headers are hidden
  // because there's no room for labels. Clicking the parent still
  // navigates to its top-level href.
  const showLabels = !collapsed;

  return (
    <>
      {/* Mobile backdrop. Tapping it closes the drawer. */}
      <div
        className={`fixed inset-0 z-40 bg-black/50 lg:hidden transition-opacity ${
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onCloseMobile}
        aria-hidden="true"
      />

      <aside
        className={`
          fixed inset-y-0 left-0 z-50 flex flex-col border-r border-white/5
          transition-[transform,width] duration-200 ease-out
          ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
          lg:translate-x-0
          ${collapsed ? "lg:w-16" : "lg:w-64"}
          w-64
        `}
        style={{ backgroundColor: "#111827" }}
        aria-label="Primary navigation"
      >
        {/* Header: logo + collapse/close controls. The desktop chevron
            toggles the icon-only rail; the mobile X closes the drawer. */}
        <div
          className={`h-24 flex items-center border-b border-white/10 ${
            collapsed ? "lg:px-2 lg:justify-center px-4 justify-between" : "px-4 justify-between"
          }`}
        >
          <Link
            href="/"
            onClick={onCloseMobile}
            className="group hover:opacity-85 transition-opacity flex items-center justify-center"
          >
            {collapsed ? (
              <div className="hidden lg:flex w-10 h-10 hero-gradient rounded-lg items-center justify-center shadow-md">
                <span className="text-white font-bold text-lg">M</span>
              </div>
            ) : null}
            <Image
              src="/moxie-logo.png"
              alt="Moxie Management"
              width={160}
              height={80}
              className={`w-40 h-auto object-contain ${collapsed ? "lg:hidden" : ""}`}
            />
          </Link>

          {/* Desktop collapse toggle */}
          <button
            onClick={onToggleCollapse}
            className={`hidden lg:inline-flex p-1.5 rounded-md text-sidebar-text hover:text-sidebar-text-active hover:bg-sidebar-hover transition-colors ${
              collapsed ? "lg:hidden" : ""
            }`}
            title="Collapse sidebar"
            aria-label="Collapse sidebar"
          >
            <ChevronLeft size={16} />
          </button>

          {/* Mobile close */}
          <button
            onClick={onCloseMobile}
            className="lg:hidden p-1.5 rounded-md text-sidebar-text hover:text-sidebar-text-active hover:bg-sidebar-hover transition-colors"
            aria-label="Close sidebar"
          >
            <X size={18} />
          </button>
        </div>

        {/* Floating expand button — only visible when collapsed on desktop.
            Sits over the right edge of the rail so it stays reachable. */}
        {collapsed && (
          <button
            onClick={onToggleCollapse}
            className="hidden lg:flex absolute -right-3 top-28 w-6 h-6 rounded-full bg-sidebar-hover border border-white/10 text-sidebar-text-active items-center justify-center hover:bg-sidebar-active transition-colors shadow-md"
            title="Expand sidebar"
            aria-label="Expand sidebar"
          >
            <ChevronRight size={14} />
          </button>
        )}

        {/* Portfolio selector — hidden on the collapsed rail because the
            two labels won't fit. Use the expanded view to switch portfolios. */}
        {showLabels && (
          <div className="border-b border-white/5 px-3 py-3">
            <p className="text-[10px] font-semibold text-sidebar-text uppercase tracking-wider mb-2 px-1">
              Portfolio
            </p>
            <div className="inline-flex w-full rounded-lg border border-white/10 bg-white/5 p-0.5">
              {(["24", "25"] as PortfolioId[]).map((id) => (
                <button
                  key={id}
                  onClick={() => setPortfolioId(id)}
                  className={`flex-1 px-2 py-1.5 rounded-md text-xs font-semibold transition-all ${
                    portfolioId === id
                      ? "bg-sidebar-active text-sidebar-text-active shadow-sm"
                      : "text-sidebar-text hover:text-sidebar-text-active"
                  }`}
                >
                  {PORTFOLIO_LABELS[id]}
                </button>
              ))}
            </div>
          </div>
        )}

        <nav className={`flex-1 overflow-y-auto py-4 ${collapsed ? "lg:px-2 px-3" : "px-3"}`}>
          {categoryOrder.map((cat) => {
            const items = sidebarItems.filter((i) => i.category === cat);
            if (items.length === 0) return null;
            const header = cat === "primary" ? null : categoryHeaders[cat];

            return (
              <div key={cat} className="mb-4">
                {header && showLabels && (
                  <div className="px-3 mb-2">
                    <h3 className="text-xs font-semibold text-sidebar-text uppercase tracking-wider">
                      {header}
                    </h3>
                  </div>
                )}
                <div className="space-y-0.5">
                  {items.map((item) => {
                    const active = isActive(item.href);
                    const isExpanded = !!expanded[item.id];
                    const hasChildren = item.children && item.children.length > 0;

                    return (
                      <div key={item.id}>
                        <div className="flex items-center">
                          <Link
                            href={item.href}
                            onClick={onCloseMobile}
                            title={collapsed ? item.label : undefined}
                            className={`flex-1 flex items-center gap-3 ${
                              collapsed ? "lg:justify-center lg:px-0" : ""
                            } px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                              active
                                ? "bg-sidebar-active text-sidebar-text-active shadow-sm shadow-accent/20"
                                : "text-sidebar-text hover:text-sidebar-text-active hover:bg-sidebar-hover"
                            }`}
                          >
                            <item.Icon
                              size={18}
                              className={`transition-colors duration-200 ${active ? "text-red-400" : "text-sidebar-text"}`}
                            />
                            {showLabels && (
                              <>
                                <span className="flex-1">{item.label}</span>
                                {active && <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />}
                              </>
                            )}
                          </Link>
                          {hasChildren && showLabels && (
                            <button
                              onClick={() => toggleExpand(item.id)}
                              className="p-1.5 rounded-md text-sidebar-text hover:text-sidebar-text-active hover:bg-sidebar-hover transition-colors"
                              aria-label={`Toggle ${item.label} sub-pages`}
                            >
                              <ChevronDown
                                size={14}
                                className={`transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                              />
                            </button>
                          )}
                        </div>

                        {hasChildren && isExpanded && showLabels && (
                          <div className="ml-5 pl-4 border-l border-white/5 mt-1 mb-1 space-y-0.5">
                            {item.children!.map((child) => {
                              const childActive = pathname === child.href;
                              return (
                                <Link
                                  key={child.href}
                                  href={child.href}
                                  onClick={onCloseMobile}
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
                </div>
              </div>
            );
          })}
        </nav>

        <div className={`border-t border-white/5 ${collapsed ? "lg:p-2 p-4" : "p-4"}`}>
          <div className={`flex items-center ${collapsed ? "lg:justify-center gap-3" : "gap-3"}`}>
            <div
              className="w-8 h-8 rounded-full bg-sidebar-hover flex items-center justify-center shrink-0"
              title={collapsed ? user?.email ?? undefined : undefined}
            >
              <span className="text-xs font-medium text-sidebar-text-active">
                {user?.email ? user.email.substring(0, 2).toUpperCase() : "PM"}
              </span>
            </div>
            {showLabels && (
              <>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-sidebar-text-active truncate">
                    {user?.email || "Property Manager"}
                  </p>
                  <p className="text-[10px] text-sidebar-text truncate">Moxie Management</p>
                </div>
                {user && (
                  <button
                    onClick={signOut}
                    className="p-1.5 rounded-lg text-sidebar-text hover:text-red-400 hover:bg-sidebar-hover transition-colors"
                    title="Sign out"
                  >
                    <LogOut size={14} />
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
