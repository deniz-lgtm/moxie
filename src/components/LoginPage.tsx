"use client";

import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";

type Stage =
  | { kind: "credentials" }
  | {
      kind: "verify";
      challengeId: string;
      enroll: { secret: string; otpauthUrl: string; qrDataUrl: string } | null;
    };

export function LoginPage() {
  const { beginSignIn, completeSignIn } = useAuth();
  const [stage, setStage] = useState<Stage>({ kind: "credentials" });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleCredentials(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const result = await beginSignIn(email, password);
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setCode("");
    setStage({ kind: "verify", challengeId: result.challengeId, enroll: result.enroll });
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (stage.kind !== "verify") return;
    setError(null);
    setLoading(true);
    const result = await completeSignIn(stage.challengeId, code);
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
    }
  }

  function backToCredentials() {
    setStage({ kind: "credentials" });
    setError(null);
    setCode("");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#fafafa] px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <div className="w-14 h-14 hero-gradient rounded-2xl flex items-center justify-center mx-auto shadow-lg">
            <span className="text-white font-bold text-2xl">M</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight mt-4">Moxie Management</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {stage.kind === "credentials"
              ? "Sign in to your account"
              : stage.enroll
                ? "Set up two-factor authentication"
                : "Enter your verification code"}
          </p>
        </div>

        {stage.kind === "credentials" ? (
          <form onSubmit={handleCredentials} className="bg-card rounded-2xl border border-border p-6 space-y-4 shadow-sm">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider block mb-1.5">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                autoFocus
                placeholder="you@moxiemanagement.com"
                className="w-full text-sm border border-border rounded-xl px-3.5 py-2.5 bg-card focus:border-accent focus:ring-1 focus:ring-accent/20 transition-colors"
              />
            </div>

            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider block mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="Enter your password"
                className="w-full text-sm border border-border rounded-xl px-3.5 py-2.5 bg-card focus:border-accent focus:ring-1 focus:ring-accent/20 transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-accent text-white text-sm font-medium rounded-xl hover:bg-accent-hover transition-colors shadow-sm disabled:opacity-50"
            >
              {loading ? "Signing in..." : "Continue"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerify} className="bg-card rounded-2xl border border-border p-6 space-y-4 shadow-sm">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {stage.enroll && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Scan this QR code with an authenticator app (Google Authenticator, Authy, 1Password, etc.),
                  then enter the 6-digit code below to finish setup.
                </p>
                <div className="flex justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={stage.enroll.qrDataUrl} alt="TOTP QR code" className="w-44 h-44 rounded-xl border border-border" />
                </div>
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer">Can&apos;t scan? Show secret</summary>
                  <code className="block mt-2 break-all bg-muted/40 rounded-lg px-2 py-1.5 font-mono text-[11px]">
                    {stage.enroll.secret}
                  </code>
                </details>
              </div>
            )}

            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider block mb-1.5">
                6-digit code
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                required
                autoFocus
                placeholder="123456"
                className="w-full text-center text-lg tracking-[0.4em] font-mono border border-border rounded-xl px-3.5 py-2.5 bg-card focus:border-accent focus:ring-1 focus:ring-accent/20 transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={loading || code.length !== 6}
              className="w-full py-2.5 bg-accent text-white text-sm font-medium rounded-xl hover:bg-accent-hover transition-colors shadow-sm disabled:opacity-50"
            >
              {loading ? "Verifying..." : "Verify & sign in"}
            </button>

            <button
              type="button"
              onClick={backToCredentials}
              className="w-full text-xs text-muted-foreground hover:text-foreground"
            >
              Back to sign in
            </button>
          </form>
        )}

        <p className="text-xs text-muted-foreground text-center">
          Contact your admin if you need an account or lost access to your authenticator.
        </p>
      </div>
    </div>
  );
}
