"use client";

import type { SaveStatus } from "@/hooks/useSaveQueue";

interface SaveIndicatorProps {
  status: SaveStatus;
  onRetry?: () => void;
}

export function SaveIndicator({ status, onRetry }: SaveIndicatorProps) {
  if (status === "idle") return null;

  return (
    <div className="flex items-center gap-1.5 text-xs">
      {status === "saving" && (
        <>
          <div className="w-3 h-3 border-[1.5px] border-accent/30 border-t-accent rounded-full animate-spin" />
          <span className="text-muted-foreground">Saving...</span>
        </>
      )}
      {status === "saved" && (
        <>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-green-600">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span className="text-green-600 font-medium">Saved</span>
        </>
      )}
      {status === "error" && (
        <>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-red-500">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
          <span className="text-red-500 font-medium">Save failed</span>
          {onRetry && (
            <button onClick={onRetry} className="text-accent hover:underline ml-1 font-medium">
              Retry
            </button>
          )}
        </>
      )}
    </div>
  );
}
