"use client";

const colorMap: Record<string, string> = {
  // Inspection statuses
  scheduled: "bg-blue-100 text-blue-800",
  in_progress: "bg-yellow-100 text-yellow-800",
  completed: "bg-green-100 text-green-800",
  needs_review: "bg-orange-100 text-orange-800",
  // Turn statuses
  pending: "bg-slate-100 text-slate-700",
  // Maintenance statuses
  submitted: "bg-blue-100 text-blue-800",
  assigned: "bg-purple-100 text-purple-800",
  awaiting_parts: "bg-orange-100 text-orange-800",
  closed: "bg-slate-100 text-slate-600",
  // Priority
  emergency: "bg-red-100 text-red-800",
  high: "bg-orange-100 text-orange-800",
  medium: "bg-yellow-100 text-yellow-800",
  low: "bg-slate-100 text-slate-600",
  // Condition
  excellent: "bg-green-100 text-green-800",
  good: "bg-emerald-100 text-emerald-700",
  fair: "bg-yellow-100 text-yellow-800",
  poor: "bg-orange-100 text-orange-800",
  damaged: "bg-red-100 text-red-800",
  // Task statuses
  not_started: "bg-slate-100 text-slate-600",
  blocked: "bg-red-100 text-red-800",
  // Unit statuses
  occupied: "bg-green-100 text-green-800",
  vacant: "bg-blue-100 text-blue-800",
  turning: "bg-yellow-100 text-yellow-800",
  ready: "bg-emerald-100 text-emerald-800",
};

function formatLabel(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function StatusBadge({ value }: { value: string }) {
  const colors = colorMap[value] || "bg-slate-100 text-slate-700";
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colors}`}
    >
      {formatLabel(value)}
    </span>
  );
}
