"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: string | null;
  totpEnrolled: boolean;
};

export type LoginStep1Result =
  | { ok: true; challengeId: string; enroll: { secret: string; otpauthUrl: string; qrDataUrl: string } | null }
  | { ok: false; error: string };

export type LoginStep2Result = { ok: true } | { ok: false; error: string };

interface AuthContextType {
  user: SessionUser | null;
  loading: boolean;
  /** Step 1: verify password, returns a challenge for the 2FA code. */
  beginSignIn: (email: string, password: string) => Promise<LoginStep1Result>;
  /** Step 2: verify TOTP code, sets the session. */
  completeSignIn: (challengeId: string, code: string) => Promise<LoginStep2Result>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  beginSignIn: async () => ({ ok: false, error: "Not initialized" }),
  completeSignIn: async () => ({ ok: false, error: "Not initialized" }),
  signOut: async () => {},
  refresh: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      const json = await res.json();
      setUser(json.user ?? null);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const beginSignIn = useCallback<AuthContextType["beginSignIn"]>(async (email, password) => {
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();
      if (!res.ok) return { ok: false, error: json.error || "Login failed" };
      return { ok: true, challengeId: json.challengeId, enroll: json.enroll ?? null };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Network error" };
    }
  }, []);

  const completeSignIn = useCallback<AuthContextType["completeSignIn"]>(async (challengeId, code) => {
    try {
      const res = await fetch("/api/auth/verify-2fa", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ challengeId, code }),
      });
      const json = await res.json();
      if (!res.ok) return { ok: false, error: json.error || "Verification failed" };
      setUser(json.user ?? null);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Network error" };
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, beginSignIn, completeSignIn, signOut, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}
