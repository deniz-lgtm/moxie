"use client";

const colorMap: Record<string, string> = {
  // Inspection statuses
  scheduled: "bg-blue-50 text-blue-700 ring-blue-600/10",
  in_progress: "bg-yellow-50 text-yellow-700 ring-yellow-600/10",
  completed: "bg-green-50 text-green-700 ring-green-600/10",
  needs_review: "bg-orange-50 text-orange-700 ring-orange-600/10",
  // Turn statuses
  pending: "bg-slate-50 text-slate-600 ring-slate-500/10",
  // Maintenance statuses
  submitted: "bg-blue-50 text-blue-700 ring-blue-600/10",
  assigned: "bg-purple-50 text-purple-700 ring-purple-600/10",
  awaiting_parts: "bg-orange-50 text-orange-700 ring-orange-600/10",
  closed: "bg-slate-50 text-slate-500 ring-slate-500/10",
  // Priority
  emergency: "bg-red-50 text-red-700 ring-red-600/10",
  high: "bg-orange-50 text-orange-700 ring-orange-600/10",
  medium: "bg-yellow-50 text-yellow-700 ring-yellow-600/10",
  low: "bg-slate-50 text-slate-500 ring-slate-500/10",
  // Condition
  excellent: "bg-green-50 text-green-700 ring-green-600/10",
  good: "bg-emerald-50 text-emerald-700 ring-emerald-600/10",
  fair: "bg-yellow-50 text-yellow-700 ring-yellow-600/10",
  poor: "bg-orange-50 text-orange-700 ring-orange-600/10",
  damaged: "bg-red-50 text-red-700 ring-red-600/10",
  // Task statuses
  not_started: "bg-slate-50 text-slate-500 ring-slate-500/10",
  blocked: "bg-red-50 text-red-700 ring-red-600/10",
  // Unit statuses
  occupied: "bg-green-50 text-green-700 ring-green-600/10",
  vacant: "bg-blue-50 text-blue-700 ring-blue-600/10",
  turning: "bg-yellow-50 text-yellow-700 ring-yellow-600/10",
  ready: "bg-emerald-50 text-emerald-700 ring-emerald-600/10",
  // Application statuses
  incomplete: "bg-yellow-50 text-yellow-700 ring-yellow-600/10",
  under_review: "bg-purple-50 text-purple-700 ring-purple-600/10",
  approved: "bg-green-50 text-green-700 ring-green-600/10",
  denied: "bg-red-50 text-red-700 ring-red-600/10",
  // Applicant statuses
  complete: "bg-green-50 text-green-700 ring-green-600/10",
  in_review: "bg-purple-50 text-purple-700 ring-purple-600/10",
  rejected: "bg-red-50 text-red-700 ring-red-600/10",
  // Document statuses
  missing: "bg-red-50 text-red-600 ring-red-600/10",
  uploaded: "bg-blue-50 text-blue-700 ring-blue-600/10",
  verified: "bg-green-50 text-green-700 ring-green-600/10",
  // Nudge statuses
  sent: "bg-blue-50 text-blue-700 ring-blue-600/10",
  delivered: "bg-emerald-50 text-emerald-700 ring-emerald-600/10",
  opened: "bg-green-50 text-green-700 ring-green-600/10",
  failed: "bg-red-50 text-red-700 ring-red-600/10",
  // Tour registration
  confirmed: "bg-green-50 text-green-700 ring-green-600/10",
  attended: "bg-emerald-50 text-emerald-700 ring-emerald-600/10",
  no_show: "bg-red-50 text-red-700 ring-red-600/10",
  rescheduled: "bg-orange-50 text-orange-700 ring-orange-600/10",
  cancelled: "bg-slate-50 text-slate-500 ring-slate-500/10",
  // Roles
  primary: "bg-indigo-50 text-indigo-700 ring-indigo-600/10",
  co_applicant: "bg-blue-50 text-blue-700 ring-blue-600/10",
  guarantor: "bg-amber-50 text-amber-700 ring-amber-600/10",
  // Move in/out
  move_in: "bg-green-50 text-green-700 ring-green-600/10",
  move_out: "bg-orange-50 text-orange-700 ring-orange-600/10",
  upcoming: "bg-blue-50 text-blue-700 ring-blue-600/10",
  // Vendors
  active: "bg-green-50 text-green-700 ring-green-600/10",
  inactive: "bg-slate-50 text-slate-500 ring-slate-500/10",
  // Severity
  critical: "bg-red-50 text-red-700 ring-red-600/10",
  // Projects
  planning: "bg-blue-50 text-blue-700 ring-blue-600/10",
  on_hold: "bg-orange-50 text-orange-700 ring-orange-600/10",
  // Notices
  draft: "bg-slate-50 text-slate-500 ring-slate-500/10",
  acknowledged: "bg-green-50 text-green-700 ring-green-600/10",
  // Inspection statuses
  walking: "bg-blue-50 text-blue-700 ring-blue-600/10",
  ai_review: "bg-purple-50 text-purple-700 ring-purple-600/10",
  team_review: "bg-amber-50 text-amber-700 ring-amber-600/10",
};

function formatLabel(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function StatusBadge({ value, options, onChange }: {
  value: string;
  options?: string[];
  onChange?: (newValue: string) => void;
}) {
  const colors = colorMap[value] || "bg-slate-50 text-slate-600 ring-slate-500/10";

  if (options && onChange) {
    return (
      <select
        value={value}
        onChange={(e) => { e.stopPropagation(); onChange(e.target.value); }}
        onClick={(e) => e.stopPropagation()}
        className={`appearance-none cursor-pointer px-2.5 py-1.5 min-h-[36px] sm:min-h-0 rounded-lg text-xs font-semibold ring-1 ring-inset pr-6 ${colors}`}
        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='3'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 6px center" }}
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>{formatLabel(opt)}</option>
        ))}
      </select>
    );
  }

  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold ring-1 ring-inset ${colors}`}
    >
      {formatLabel(value)}
    </span>
  );
}
