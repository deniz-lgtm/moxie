"use client";

import type { AcademicYear } from "@/lib/types";

const YEARS: { value: AcademicYear; label: string }[] = [
  { value: "2025-2026", label: "2025–26" },
  { value: "2026-2027", label: "2026–27" },
  { value: "2027-2028", label: "2027–28" },
];

export function AcademicYearSelector({
  value,
  onChange,
}: {
  value: AcademicYear;
  onChange: (year: AcademicYear) => void;
}) {
  return (
    <div className="inline-flex items-center rounded-xl border border-border bg-muted/50 p-0.5">
      {YEARS.map((y) => (
        <button
          key={y.value}
          onClick={() => onChange(y.value)}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            value === y.value
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {y.label}
        </button>
      ))}
    </div>
  );
}
