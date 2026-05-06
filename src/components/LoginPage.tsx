"use client";

import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";

export function LoginPage() {
  const { signInWithMicrosoft, authError } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSignIn() {
    setError(null);
    setLoading(true);
    const { error: err } = await signInWithMicrosoft();
    if (err) {
      setError(err);
      setLoading(false);
    }
    // On success the browser is redirected to Microsoft; no need to clear loading.
  }

  const message = error || authError;

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#fafafa] px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <div className="w-14 h-14 hero-gradient rounded-2xl flex items-center justify-center mx-auto shadow-lg">
            <span className="text-white font-bold text-2xl">M</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight mt-4">Moxie Management</h1>
          <p className="text-sm text-muted-foreground mt-1">Sign in with your work account</p>
        </div>

        <div className="bg-card rounded-2xl border border-border p-6 space-y-4 shadow-sm">
          {message && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <p className="text-sm text-red-700">{message}</p>
            </div>
          )}

          <button
            type="button"
            onClick={handleSignIn}
            disabled={loading}
            className="w-full py-2.5 bg-[#2f2f2f] text-white text-sm font-medium rounded-xl hover:bg-black transition-colors shadow-sm disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <MicrosoftLogo />
            {loading ? "Redirecting…" : "Sign in with Microsoft"}
          </button>

          <p className="text-xs text-muted-foreground text-center">
            Only @bradmanagement.com and @moxieusc.com accounts can sign in.
          </p>
        </div>

        <p className="text-xs text-muted-foreground text-center">
          Contact your admin if you need access.
        </p>
      </div>
    </div>
  );
}

function MicrosoftLogo() {
  return (
    <svg width="16" height="16" viewBox="0 0 21 21" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}
