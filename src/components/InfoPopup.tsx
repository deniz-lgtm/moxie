"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";

export type InfoRow =
  | { label: string; value: React.ReactNode }
  | { label: string; status: string }
  | { label: string; skip: true };

type Props = {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  rows: InfoRow[];
  action?: { label: string; href?: string; onClick?: () => void };
  onClose: () => void;
};

export default function InfoPopup({ title, subtitle, icon, rows, action, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-card rounded-xl border border-border w-full max-w-md overflow-hidden shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-border flex items-start gap-3">
          {icon && <div className="shrink-0 mt-0.5">{icon}</div>}
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold truncate">{title}</h3>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate">{subtitle}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="shrink-0 p-1 text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-2">
          {rows.map((row, i) => {
            if ("skip" in row) return null;
            return (
              <div key={i} className="flex items-start gap-3 text-sm">
                <span className="text-xs text-muted-foreground w-28 shrink-0 pt-0.5">
                  {row.label}
                </span>
                <div className="flex-1 min-w-0">
                  {"status" in row ? <StatusBadge value={row.status} /> : row.value}
                </div>
              </div>
            );
          })}
        </div>

        {action && (
          <div className="p-4 border-t border-border flex justify-end">
            {action.href ? (
              <a
                href={action.href}
                className="text-sm font-medium text-accent hover:underline"
              >
                {action.label}
              </a>
            ) : (
              <button
                onClick={action.onClick}
                className="text-sm font-medium text-accent hover:underline"
              >
                {action.label}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
