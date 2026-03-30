"use client";

import { useState, useEffect, useCallback } from "react";

/**
 * Track online/offline status with automatic detection.
 * Returns { isOnline, wasOffline } — wasOffline is true if the user
 * went offline and came back (useful for triggering sync).
 */
export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(true);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    // Set initial state
    setIsOnline(navigator.onLine);

    function handleOnline() {
      setIsOnline(true);
      setWasOffline(true);
    }

    function handleOffline() {
      setIsOnline(false);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const clearWasOffline = useCallback(() => setWasOffline(false), []);

  return { isOnline, wasOffline, clearWasOffline };
}
