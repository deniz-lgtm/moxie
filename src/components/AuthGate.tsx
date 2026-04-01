"use client";

import { useAuth } from "@/components/AuthProvider";
import { LoginPage } from "@/components/LoginPage";

/**
 * Wraps protected content. Shows login if not authenticated.
 * When Supabase is not configured, passes through (dev mode).
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  // Loading — show a minimal spinner
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 hero-gradient rounded-xl flex items-center justify-center mx-auto mb-3 shadow-md">
            <span className="text-white font-bold text-lg">M</span>
          </div>
          <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin mx-auto mt-4" />
        </div>
      </div>
    );
  }

  // Not authenticated — show login
  if (!user) {
    return <LoginPage />;
  }

  // Authenticated — show the app
  return <>{children}</>;
}
