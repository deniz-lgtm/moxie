"use client";

import { useRef, useState, useCallback, useEffect } from "react";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

interface UseSaveQueueOptions<T> {
  /** Function that performs the actual save. Should throw on failure. */
  saveFn: (data: T) => Promise<void>;
  /** Debounce delay in ms before triggering a save (default 500ms) */
  debounceMs?: number;
  /** Max retries on failure (default 3) */
  maxRetries?: number;
}

interface UseSaveQueueReturn<T> {
  /** Queue a save. Debounces and coalesces rapid calls. */
  queueSave: (data: T) => void;
  /** Current save status */
  saveStatus: SaveStatus;
  /** Whether there are unsaved changes */
  isDirty: boolean;
  /** Force an immediate save of the last queued data */
  flushSave: () => void;
  /** Last error message if status is "error" */
  lastError: string | null;
  /** Retry the last failed save */
  retrySave: () => void;
}

export function useSaveQueue<T>({
  saveFn,
  debounceMs = 500,
  maxRetries = 3,
}: UseSaveQueueOptions<T>): UseSaveQueueReturn<T> {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [isDirty, setIsDirty] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const pendingDataRef = useRef<T | null>(null);
  const isSavingRef = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveFnRef = useRef(saveFn);
  saveFnRef.current = saveFn;

  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const executeSave = useCallback(async () => {
    if (isSavingRef.current || pendingDataRef.current === null) return;

    const data = pendingDataRef.current;
    pendingDataRef.current = null;
    isSavingRef.current = true;
    setSaveStatus("saving");
    setLastError(null);

    let attempt = 0;
    let success = false;

    while (attempt < maxRetries && !success) {
      try {
        await saveFnRef.current(data);
        success = true;
      } catch (err) {
        attempt++;
        if (attempt < maxRetries) {
          // Exponential backoff: 1s, 2s, 4s
          await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
        } else {
          const msg = err instanceof Error ? err.message : "Save failed";
          console.error("[SaveQueue] Save failed after retries:", msg);
          setLastError(msg);
          setSaveStatus("error");
          isSavingRef.current = false;
          // Keep data as pending so retry can pick it up
          pendingDataRef.current = data;
          return;
        }
      }
    }

    isSavingRef.current = false;
    setIsDirty(false);
    setSaveStatus("saved");

    // Show "saved" briefly then go back to idle
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => setSaveStatus("idle"), 2000);

    // If more data was queued while saving, save it now
    if (pendingDataRef.current !== null) {
      executeSave();
    }
  }, [maxRetries]);

  const queueSave = useCallback(
    (data: T) => {
      pendingDataRef.current = data;
      setIsDirty(true);

      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        executeSave();
      }, debounceMs);
    },
    [debounceMs, executeSave],
  );

  const flushSave = useCallback(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    executeSave();
  }, [executeSave]);

  const retrySave = useCallback(() => {
    if (pendingDataRef.current !== null) {
      setSaveStatus("idle");
      setLastError(null);
      executeSave();
    }
  }, [executeSave]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  return { queueSave, saveStatus, isDirty, flushSave, lastError, retrySave };
}
