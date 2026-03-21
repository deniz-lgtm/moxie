"use client";

import type { AcademicYear } from "@/lib/types";

const YEARS: { value: AcademicYear; label: string }[] = [
  { value: "2025-2026", label: "2025-2026" },
  { value: "2026-2027", label: "2026-2027" },
  { value: "2027-2028", label: "2027-2028" },
];

export function AcademicYearSelector({
  value,
  onChange,
}: {
  value: AcademicYear;
  onChange: (year: AcademicYear) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as AcademicYear)}
      className="text-sm border border-border rounded-lg px-3 py-2 bg-card"
    >
      {YEARS.map((y) => (
        <option key={y.value} value={y.value}>
          {y.label} Academic Year
        </option>
      ))}
    </select>
  );
}
