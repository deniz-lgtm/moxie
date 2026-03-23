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
  DollarSign,
  Settings,
  Link as LinkIcon,
} from "lucide-react";
import { useState } from "react";

type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  children?: { label: string; href: string }[];
  category?: string;
  disabled?: boolean;
};

const navItems: NavItem[] = [
  // Primary
  { label: "Dashboard", href: "/", icon: LayoutDashboard, category: "Primary" },
  
  // Leasing & Operations
  { label: "Applications", href: "/leasing/applications", icon: FileText, category: "Leasing & Operations" },
  { label: "Leasing", href: "/leasing", icon: FileText, category: "Leasing & Operations" },
  { label: "Tenants", href: "/tenants", icon: Users, category: "Leasing & Operations", disabled: true },
  
  // Property Management
  { label: "Maintenance", href: "/maintenance", icon: Wrench, category: "Property Management" },
  { label: "Buildings", href: "/portfolio", icon: Building2, category: "Property Management" },
  { label: "Units/Spaces", href: "/units", icon: Building2, category: "Property Management", disabled: true },
  {
    label: "Inspections",
    href: "/inspections",
    icon: ClipboardCheck,
    category: "Property Management",
    children: [
      { label: "Move-Out", href: "/inspections/move-out" },
      { label: "Move-In", href: "/inspections/move-in" },
      { label: "Onboarding", href: "/inspections/onboarding" },
      { label: "Quarterly", href: "/inspections/quarterly" },
      { label: "Punch List", href: "/inspections/punch-list" },
    ],
  },
  
  // Revenue & Finance
  { label: "Revenue", href: "/revenue", icon: DollarSign, category: "Revenue & Finance", disabled: true },
  { label: "Financials", href: "/financials", icon: BarChart3, category: "Revenue & Finance", disabled: true },
  { label: "Analytics", href: "/resident-pulse", icon: MessageSquare, category: "Revenue & Finance" },
  
  // Asset Management
  { label: "Assets", href: "/assets", icon: HardHat, category: "Asset Management", disabled: true },
  { label: "Depreciation", href: "/depreciation", icon: TrendingUp, category: "Asset Management", disabled: true },
  { label: "Maintenance Log", href: "/maintenance-log", icon: Wrench, category: "Asset Management", disabled: true },
  { label: "Compliance", href: "/compliance", icon: ClipboardCheck, category: "Asset Management", disabled: true },
  
  // Admin
  { label: "Team", href: "/team", icon: Users, category: "Admin", disabled: true },
  { label: "Settings", href: "/settings", icon: Settings, category: "Admin", disabled: true },
  { label: "Integrations", href: "/integrations", icon: LinkIcon, category: "Admin", disabled: true },
  
  // Legacy items (to be reviewed)
  { label: "Unit Turns", href: "/unit-turns", icon: RefreshCw, category: "Property Management" },
  { label: "Vendors", href: "/vendors", icon: Users, category: "Property Management" },
  { label: "RUBs", href: "/rubs", icon: Zap, category: "Revenue & Finance" },
  { label: "Capital Projects", href: "/capital-projects", icon: HardHat, category: "Asset Management" },
  { label: "Notices", href: "/notices", icon: Bell, category: "Leasing & Operations" },
  {
    label: "Marketing",
    href: "/marketing",
    icon: Megaphone,
    category: "Leasing & Operations",
    children: [
      { label: "Dashboard", href: "/marketing" },
      { label: "Create Content", href: "/marketing/create" },
      { label: "Monthly Report", href: "/marketing/report" },
    ],
  },
];

// Group items by category
const categoryOrder = [
  "Primary",
  "Leasing & Operations",
  "Property Management", 
  "Revenue & Finance",
  "Asset Management",
  "Admin"
];

const groupedItems = navItems.reduce((acc, item) => {
  const category = item.category || "Other";
  if (!acc[category]) {
    acc[category] = [];
  }
  acc[category].push(item);
  return acc;
}, {} as Record<string, NavItem[]>);

export function Sidebar() {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    Inspections: pathname.startsWith("/inspections"),
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
    <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 z-50 border-r border-white/5" style={{ backgroundColor: '#111827' }}>
      {/* Brand */}
      <div className="h-16 flex items-center px-5 border-b border-white/10">
        <Link href="/" className="flex items-center gap-3 group hover:opacity-80 transition-opacity">
          <div className="w-9 h-9 bg-gradient-to-br from-red-500 to-red-600 rounded-xl flex items-center justify-center shadow-lg shadow-red-500/20 group-hover:shadow-red-500/40 transition-shadow">
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
      <nav className="flex-1 overflow-y-auto py-4 px-3">
        {categoryOrder.map((category) => {
          const items = groupedItems[category];
          if (!items || items.length === 0) return null;
          
          return (
            <div key={category} className={`mb-4 ${category === "Primary" ? "" : ""}`}>
              {/* Category header (hidden for Primary) */}
              {category !== "Primary" && (
                <div className="px-3 mb-2">
                  <h3 className="text-xs font-semibold text-sidebar-text uppercase tracking-wider">
                    {category}
                  </h3>
                </div>
              )}
              
              {/* Category items */}
              <div className="space-y-0.5">
                {items.filter(item => !item.disabled).map((item) => {
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
                          className={`flex-1 flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                            active
                              ? "bg-sidebar-active text-sidebar-text-active shadow-sm shadow-accent/20"
                              : "text-sidebar-text hover:text-sidebar-text-active hover:bg-sidebar-hover"
                          }`}
                        >
                          <Icon
                            size={18}
                            className={`transition-colors duration-200 ${active ? "text-red-400" : "text-sidebar-text group-hover:text-sidebar-text-active"}`}
                          />
                          <span className="flex-1">{item.label}</span>
                          {active && (
                            <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
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
              </div>
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