"use client";

import { useCallback, useEffect, useState } from "react";
import { FileSignature } from "lucide-react";
import type { Inspection, SigningRequest, SigningRequestStatus } from "@/lib/types";
import { buildDepositRefundPrefillFromInspection } from "@/lib/signing-prefill";

interface Props {
  inspection: Inspection;
  tenants: { name: string; email: string }[];
}

const STATUS_LABEL: Record<SigningRequestStatus, string> = {
  queued: "Queued",
  sent: "Sent",
  viewed: "Viewed",
  signed: "Signed",
  declined: "Declined",
  expired: "Expired",
  cancelled: "Cancelled",
  error: "Error",
};

const STATUS_BG: Record<SigningRequestStatus, string> = {
  queued: "bg-slate-100 text-slate-700",
  sent: "bg-blue-100 text-blue-800",
  viewed: "bg-amber-100 text-amber-800",
  signed: "bg-emerald-100 text-emerald-800",
  declined: "bg-red-100 text-red-800",
  expired: "bg-gray-100 text-gray-600",
  cancelled: "bg-gray-100 text-gray-600",
  error: "bg-red-100 text-red-900",
};

export function SendForSignaturePanel({ inspection, tenants }: Props) {
  const [requests, setRequests] = useState<SigningRequest[]>([]);
  const [busyEmail, setBusyEmail] = useState<string | null>(null);
  const [error, setError] = useState<string>("");

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/signing/requests?source_type=move_out_inspection&source_id=${encodeURIComponent(inspection.id)}`
      );
      const j = await res.json();
      if (Array.isArray(j.requests)) setRequests(j.requests);
    } catch {
      // best-effort poll — leave existing list in place
    }
  }, [inspection.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const latestForTenant = (email: string): SigningRequest | undefined =>
    requests.find((r) => r.recipientEmail.toLowerCase() === email.toLowerCase());

  const send = async (tenant: { name: string; email: string }) => {
    setBusyEmail(tenant.email);
    setError("");
    try {
      const prefill = buildDepositRefundPrefillFromInspection({
        ...inspection,
        // The form is addressed per-tenant — override the inspection's
        // tenantName so each signer's prefill names themselves, not the
        // unit's primary tenant.
        tenantName: tenant.name,
      });
      const res = await fetch("/api/signing/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateKey: "deposit_refund_instruction",
          recipientName: tenant.name,
          recipientEmail: tenant.email,
          prefill,
          sourceType: "move_out_inspection",
          sourceId: inspection.id,
          propertyId: inspection.propertyId,
          unitId: inspection.unitId,
          subject: `Security Deposit Refund Instruction — ${inspection.propertyName} ${inspection.unitNumber}`.trim(),
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        setError(j.error || "Send failed");
      }
      await refresh();
    } catch (err: any) {
      setError(err?.message || "Send failed");
    } finally {
      setBusyEmail(null);
    }
  };

  if (tenants.length === 0) return null;

  return (
    <div className="mt-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <FileSignature className="w-4 h-4 text-accent" />
        <h3 className="text-sm font-semibold">Send Security Deposit Refund Form</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Sends a Dropbox Sign request, pre-filled with the tenant&apos;s name, property address, and deposit amount. Each tenant gets their own copy to sign.
      </p>
      <div className="space-y-2">
        {tenants.map((t) => {
          const req = latestForTenant(t.email);
          const isBusy = busyEmail === t.email;
          const buttonDisabled = isBusy || (req && req.status !== "error" && req.status !== "declined" && req.status !== "expired" && req.status !== "cancelled");
          const buttonLabel = isBusy
            ? "Sending…"
            : req
              ? "Resend"
              : "Send";
          return (
            <div key={t.email} className="flex items-center gap-3 p-2 rounded-lg border border-border bg-background">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{t.name}</p>
                <p className="text-xs text-muted-foreground truncate">{t.email}</p>
              </div>
              {req && (
                <span className={`text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded ${STATUS_BG[req.status]}`}>
                  {STATUS_LABEL[req.status]}
                </span>
              )}
              {req?.signedPdfUrl && (
                <a
                  href={req.signedPdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-accent hover:underline"
                >
                  PDF
                </a>
              )}
              <button
                onClick={() => send(t)}
                disabled={buttonDisabled || !t.email}
                className="text-xs px-3 py-1.5 rounded bg-accent text-accent-foreground hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed font-medium whitespace-nowrap"
                title={!t.email ? "Tenant has no email on file" : undefined}
              >
                {buttonLabel}
              </button>
            </div>
          );
        })}
      </div>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}
