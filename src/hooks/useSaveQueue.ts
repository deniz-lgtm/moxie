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
  /**
   * Force an immediate save and await the result. Resolves once the data is
   * persisted, rejects if the save fails after all retries. Use this when the
   * UI must not advance until the write is confirmed (e.g. marking complete).
   */
  flushSaveAsync: () => Promise<void>;
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

  // Resolves with whether the save ultimately succeeded.
  const executeSave = useCallback(async (): Promise<boolean> => {
    if (isSavingRef.current || pendingDataRef.current === null) return true;

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
          return false;
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
      return executeSave();
    }
    return true;
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

  const flushSaveAsync = useCallback(async () => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    // If a save is already in flight, wait for it to settle before flushing
    // the latest pending data so we don't early-return on a stale write.
    while (isSavingRef.current) {
      await new Promise((r) => setTimeout(r, 50));
    }
    const ok = await executeSave();
    if (!ok) throw new Error(lastError || "Save failed");
  }, [executeSave, lastError]);

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
      // Flush any pending save synchronously on unmount. Fire-and-forget —
      // the Promise continues in the background even after the component
      // is gone. Without this, navigating away within the debounce window
      // silently drops the last change.
      if (pendingDataRef.current !== null && !isSavingRef.current) {
        const data = pendingDataRef.current;
        pendingDataRef.current = null;
        saveFnRef.current(data).catch((err) => {
          console.error("[SaveQueue] Flush on unmount failed:", err);
        });
      }
    };
  }, []);

  return { queueSave, saveStatus, isDirty, flushSave, flushSaveAsync, lastError, retrySave };
}
