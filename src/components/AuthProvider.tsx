"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { User, Session } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase";

const ALLOWED_EMAIL_DOMAINS = ["bramanagement.com", "moxieusc.com"];

function isAllowedEmail(email: string | undefined | null): boolean {
  if (!email) return false;
  const domain = email.split("@")[1]?.toLowerCase();
  return !!domain && ALLOWED_EMAIL_DOMAINS.includes(domain);
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  authError: string | null;
  signInWithMicrosoft: () => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  authError: null,
  signInWithMicrosoft: async () => ({ error: "Not initialized" }),
  signOut: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) {
      setLoading(false);
      return;
    }

    async function applySession(s: Session | null) {
      if (s?.user && !isAllowedEmail(s.user.email)) {
        await sb!.auth.signOut();
        setSession(null);
        setUser(null);
        setAuthError(
          "Your account isn't authorized for Moxie. Sign in with a @bramanagement.com or @moxieusc.com address."
        );
        return;
      }
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) setAuthError(null);
    }

    sb.auth.getSession().then(({ data: { session: s } }) => {
      applySession(s).finally(() => setLoading(false));
    });

    const { data: { subscription } } = sb.auth.onAuthStateChange((_event, s) => {
      applySession(s);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signInWithMicrosoft = useCallback(async () => {
    const sb = getSupabase();
    if (!sb) return { error: "Supabase not configured" };
    setAuthError(null);
    const { error } = await sb.auth.signInWithOAuth({
      provider: "azure",
      options: {
        scopes: "email openid profile",
        redirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
      },
    });
    if (error) return { error: error.message };
    return { error: null };
  }, []);

  const signOut = useCallback(async () => {
    const sb = getSupabase();
    if (!sb) return;
    await sb.auth.signOut();
    setAuthError(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, session, loading, authError, signInWithMicrosoft, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}
