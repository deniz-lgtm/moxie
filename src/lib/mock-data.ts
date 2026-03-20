import {
  DashboardStats,
  UserRole,
  AppConfig,
  AppCategoryConfig,
} from "./types";

// --- App Launcher Configuration ---
// This file only contains app launcher config and dashboard stat labels.
// All property, unit, tenant, and application data comes from AppFolio.

// Dashboard stat labels used in app cards (overridden by real data on the dashboard page)
const defaultStats: DashboardStats = {
  totalUnits: 0,
  occupiedUnits: 0,
  vacantUnits: 0,
  turningUnits: 0,
  preLeasedUnits: 0,
  activeInspections: 0,
  openMaintenanceRequests: 0,
  upcomingTurns: 0,
  activeApplications: 0,
  upcomingTours: 0,
  upcomingMoveOuts: 0,
  vendorCount: 0,
  pendingRubs: "—",
  reportsDue: 0,
  activeCapitalProjects: 0,
  pendingNotices: 0,
  trackedComps: 0,
  recurringIssues: 0,
};

export const appCategories: AppCategoryConfig[] = [
  { id: "operations", label: "Operations", color: "blue", order: 1 },
  { id: "leasing", label: "Leasing", color: "purple", order: 2 },
  { id: "finance", label: "Finance", color: "emerald", order: 3 },
  { id: "asset_management", label: "Asset Management", color: "amber", order: 4 },
  { id: "communications", label: "Communications", color: "rose", order: 5 },
];

export const apps: AppConfig[] = [
  // --- Operations ---
  {
    id: "inspections",
    name: "Inspections",
    description: "Move-in, move-out, and quarterly inspections with condition tracking and photos",
    href: "/inspections",
    icon: "ClipboardCheck",
    category: "operations",
    categoryLabel: "Operations",
    categoryColor: "blue",
    roles: ["property_manager", "maintenance_tech"],
    isBuilt: true,
  },
  {
    id: "unit-turns",
    name: "Unit Turns",
    description: "Manage the full move-out to move-in workflow — cleaning, paint, repairs, walkthroughs",
    href: "/unit-turns",
    icon: "RefreshCw",
    category: "operations",
    categoryLabel: "Operations",
    categoryColor: "blue",
    roles: ["property_manager", "maintenance_tech"],
    isBuilt: true,
  },
  {
    id: "maintenance",
    name: "Maintenance",
    description: "Track work orders from submission through completion. Assign vendors and monitor costs",
    href: "/maintenance",
    icon: "Wrench",
    category: "operations",
    categoryLabel: "Operations",
    categoryColor: "blue",
    roles: ["property_manager", "maintenance_tech"],
    isBuilt: true,
  },
  {
    id: "move-in-out",
    name: "Move In / Move Out",
    description: "Tenant-facing checklist for move day: key handoff, utility setup, welcome packet, condition photos",
    href: "/move-in-out",
    icon: "Truck",
    category: "operations",
    categoryLabel: "Operations",
    categoryColor: "blue",
    roles: ["property_manager", "maintenance_tech", "leasing_agent"],
    isBuilt: true,
  },
  {
    id: "vendors",
    name: "Vendor Directory",
    description: "Preferred vendors, performance tracking, insurance status, and contact info. Synced with Notion",
    href: "/vendors",
    icon: "Users",
    category: "operations",
    categoryLabel: "Operations",
    categoryColor: "blue",
    roles: ["property_manager", "maintenance_tech"],
    isBuilt: true,
  },
  // --- Leasing ---
  {
    id: "applications",
    name: "Applications",
    description: "Track lease applications, co-applicant progress, document uploads, guarantor status",
    href: "/leasing/applications",
    icon: "FileText",
    category: "leasing",
    categoryLabel: "Leasing",
    categoryColor: "purple",
    roles: ["property_manager", "leasing_agent"],
    isBuilt: true,
  },
  {
    id: "tours",
    name: "Tour Scheduling",
    description: "Manage open house tours with automated reminders and post-tour follow-ups",
    href: "/leasing/tours",
    icon: "Calendar",
    category: "leasing",
    categoryLabel: "Leasing",
    categoryColor: "purple",
    roles: ["property_manager", "leasing_agent"],
    isBuilt: true,
  },
  {
    id: "comp-watch",
    name: "Comp Watch",
    description: "Track competitor rents near USC — price drops, concessions, and demand signals during leasing season",
    href: "/comp-watch",
    icon: "TrendingUp",
    category: "leasing",
    categoryLabel: "Leasing",
    categoryColor: "purple",
    roles: ["property_manager", "leasing_agent", "asset_manager", "owner"],
    isBuilt: true,
  },
  // --- Finance ---
  {
    id: "rubs",
    name: "RUBs",
    description: "Ratio Utility Billing — split water, gas, electric, and trash costs across tenants by sqft or occupancy",
    href: "/rubs",
    icon: "Zap",
    category: "finance",
    categoryLabel: "Finance",
    categoryColor: "emerald",
    roles: ["property_manager", "asset_manager", "owner"],
    isBuilt: true,
  },
  {
    id: "reports",
    name: "Monthly Reports",
    description: "Generate and review monthly P&L, occupancy, and maintenance cost reports per property",
    href: "/reports",
    icon: "BarChart3",
    category: "finance",
    categoryLabel: "Finance",
    categoryColor: "emerald",
    roles: ["property_manager", "asset_manager", "owner"],
    isBuilt: true,
  },
  // --- Asset Management ---
  {
    id: "portfolio",
    name: "Portfolio Overview",
    description: "Property-level performance dashboard: occupancy, revenue, expense ratios, and NOI per property",
    href: "/portfolio",
    icon: "Building2",
    category: "asset_management",
    categoryLabel: "Asset Management",
    categoryColor: "amber",
    roles: ["property_manager", "asset_manager", "owner"],
    isBuilt: true,
  },
  {
    id: "capital-projects",
    name: "Capital Projects",
    description: "Track large improvements: roof replacements, HVAC upgrades, renovations with budget vs actual",
    href: "/capital-projects",
    icon: "HardHat",
    category: "asset_management",
    categoryLabel: "Asset Management",
    categoryColor: "amber",
    roles: ["property_manager", "asset_manager"],
    isBuilt: true,
  },
  // --- Communications ---
  {
    id: "notices",
    name: "Tenant Notices",
    description: "Draft and send lease violation notices, rent reminders, and building-wide announcements",
    href: "/notices",
    icon: "Bell",
    category: "communications",
    categoryLabel: "Communications",
    categoryColor: "rose",
    roles: ["property_manager", "leasing_agent"],
    isBuilt: true,
  },
  {
    id: "resident-pulse",
    name: "Resident Pulse",
    description: "Spot recurring issues from maintenance tickets, inspections, and reviews — surfaces the top problems each month",
    href: "/resident-pulse",
    icon: "MessageSquare",
    category: "communications",
    categoryLabel: "Communications",
    categoryColor: "rose",
    roles: ["property_manager", "leasing_agent", "asset_manager"],
    isBuilt: true,
  },
];

export const currentUserRole: UserRole = "property_manager";

export function getAppsForRole(role: UserRole): AppConfig[] {
  return apps.filter((app) => app.roles.includes(role));
}

export function getAppsByCategory(appList: AppConfig[]): Record<string, AppConfig[]> {
  const grouped: Record<string, AppConfig[]> = {};
  for (const app of appList) {
    if (!grouped[app.category]) grouped[app.category] = [];
    grouped[app.category].push(app);
  }
  return grouped;
}
