/**
 * Offline Queue — Local-first persistence for inspection data
 *
 * When network is unavailable, queues saves to localStorage.
 * When connectivity returns, replays the queue in order.
 */

const QUEUE_KEY = "moxie_offline_queue";

export interface QueuedSave {
  id: string;
  endpoint: string;
  method: string;
  body: string;
  timestamp: string;
  /**
   * Optional logical key (e.g. "inspection:<id>"). Enqueueing with an existing
   * key replaces the older entry so the queue only ever holds the latest
   * snapshot per record — replaying a stale snapshot after a newer live save
   * would silently roll back the user's work.
   */
  dedupeKey?: string;
}

/** Get all queued saves */
export function getOfflineQueue(): QueuedSave[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** Add a save to the offline queue. Replaces any entry with the same dedupeKey. */
export function enqueueOfflineSave(save: Omit<QueuedSave, "id" | "timestamp">): void {
  let queue = getOfflineQueue();
  if (save.dedupeKey) {
    queue = queue.filter((q) => q.dedupeKey !== save.dedupeKey);
  }
  queue.push({
    ...save,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
  });
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch (err) {
    console.error("[OfflineQueue] Failed to persist queue:", err);
  }
}

/** Drop queued entries for a key after a newer live save succeeded. */
export function removeQueuedByKey(dedupeKey: string): void {
  const queue = getOfflineQueue();
  const filtered = queue.filter((q) => q.dedupeKey !== dedupeKey);
  if (filtered.length !== queue.length) {
    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(filtered));
    } catch (err) {
      console.error("[OfflineQueue] Failed to persist queue:", err);
    }
  }
}

/** Remove a specific item from the queue */
function removeFromQueue(id: string): void {
  const queue = getOfflineQueue().filter((q) => q.id !== id);
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

/** Clear the entire queue */
export function clearOfflineQueue(): void {
  localStorage.removeItem(QUEUE_KEY);
}

/**
 * Replay all queued saves. Returns the number of successful replays.
 * Failed items remain in the queue for next attempt.
 */
export async function replayOfflineQueue(): Promise<{ succeeded: number; failed: number }> {
  const queue = getOfflineQueue();
  if (queue.length === 0) return { succeeded: 0, failed: 0 };

  let succeeded = 0;
  let failed = 0;

  for (const item of queue) {
    try {
      const res = await fetch(item.endpoint, {
        method: item.method,
        headers: { "Content-Type": "application/json" },
        body: item.body,
        // Bound each replay so one stalled request (common on weak cellular,
        // where the browser still reports "online") doesn't hang the loop.
        signal: AbortSignal.timeout(30_000),
      });
      if (res.ok) {
        removeFromQueue(item.id);
        succeeded++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }

  return { succeeded, failed };
}
