/**
 * PDF Generator — Move-Out Security Deposit Documents
 *
 * Generates two CA Civil Code 1950.5 compliant documents:
 * 1. Disposition Letter — formal cover letter with forensic assessment methodology
 * 2. Itemized Deduction Statement — quantified damage findings using Golden Formula
 *
 * All damage descriptions use hyper-objective, strictly quantified, legally
 * anchored language designed to withstand AI-assisted tenant disputes.
 */

import { jsPDF } from "jspdf";
import type { DbRoom } from "./supabase";

// ── Brand colors ────────────────────────────────────
const BRAND = {
  maroon: [157, 21, 53] as [number, number, number], // #9d1535 — matches in-app accent
  black: [25, 25, 25] as [number, number, number],
  darkGray: [60, 60, 60] as [number, number, number],
  medGray: [130, 130, 130] as [number, number, number],
  lightGray: [220, 220, 220] as [number, number, number],
  bgGray: [248, 248, 248] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
};

export type InvoiceData = {
  inspection: {
    unit_name: string;
    property_name: string;
    rooms: DbRoom[];
    tenant_name?: string | null;
    tenant_email?: string | null;
    deposit_amount?: number | null;
    scheduled_date?: string | null;
    completed_date?: string | null;
    inspector?: string | null;
    [key: string]: unknown;
  };
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  tenants?: { name: string; email: string }[];
  logoBase64?: string | null;
};

// ── Shared helpers ──────────────────────────────────

function addBrandedHeader(
  doc: jsPDF,
  data: InvoiceData,
  startY: number
): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  let y = startY;

  // Logo (if available) — rendered larger for a more intentional, branded feel.
  if (data.logoBase64) {
    try {
      const logoW = 55;
      const logoH = 22;
      doc.addImage(data.logoBase64, "PNG", margin, y - 5, logoW, logoH);

      // Contact block right-aligned to the logo baseline.
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...BRAND.darkGray);
      doc.text(data.companyAddress, pageWidth - margin, y, { align: "right" });
      const contactLine = [data.companyPhone, data.companyEmail].filter(Boolean).join("  |  ");
      if (contactLine) {
        doc.text(contactLine, pageWidth - margin, y + 4, { align: "right" });
      }

      // Small wordmark beneath the logo as a fallback signal if the PNG ever
      // renders empty — keeps brand identity visible either way.
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...BRAND.medGray);
      doc.text(data.companyName.toUpperCase(), margin, y + logoH + 1);

      y += logoH + 4;
    } catch {
      // Fall back to text header if image fails
      y = addTextHeader(doc, data, y);
    }
  } else {
    y = addTextHeader(doc, data, y);
  }

  // Accent line below header
  doc.setDrawColor(...BRAND.maroon);
  doc.setLineWidth(0.8);
  doc.line(margin, y, pageWidth - margin, y);
  doc.setLineWidth(0.2);
  y += 6;

  doc.setTextColor(...BRAND.black);
  return y;
}

function addTextHeader(doc: jsPDF, data: InvoiceData, startY: number): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  let y = startY;

  // Company name — larger and paired with a short maroon underline bar so the
  // logo-less rendering still feels deliberate.
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...BRAND.black);
  doc.text(data.companyName.toUpperCase(), margin, y + 4);

  // Right-aligned contact info on the same visual row.
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...BRAND.darkGray);
  doc.text(data.companyAddress, pageWidth - margin, y, { align: "right" });
  const contactLine = [data.companyPhone, data.companyEmail].filter(Boolean).join("  |  ");
  if (contactLine) {
    doc.text(contactLine, pageWidth - margin, y + 4, { align: "right" });
  }

  y += 7;

  // Maroon underline bar under the wordmark.
  doc.setDrawColor(...BRAND.maroon);
  doc.setLineWidth(1.2);
  doc.line(margin, y, margin + 40, y);
  doc.setLineWidth(0.2);
  y += 5;

  return y;
}

function addPageFooters(doc: jsPDF, data: InvoiceData, docType: string) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const totalPages = doc.getNumberOfPages();

  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);

    // Maroon footer line
    doc.setDrawColor(...BRAND.maroon);
    doc.setLineWidth(0.4);
    doc.line(margin, pageHeight - 16, pageWidth - margin, pageHeight - 16);
    doc.setLineWidth(0.2);

    // Footer text
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...BRAND.medGray);
    doc.text(
      `${data.companyName}  |  ${docType}  |  CA Civil Code §1950.5`,
      margin,
      pageHeight - 11
    );
    doc.text(
      `Page ${i} of ${totalPages}`,
      pageWidth - margin,
      pageHeight - 11,
      { align: "right" }
    );
    doc.setTextColor(...BRAND.black);
  }
}

// ── Deposit Deduction Statement ─────────────────────

/**
 * Generate a CA Civil Code 1950.5 compliant deposit deduction PDF.
 * Uses forensic assessment language and the Golden Formula for damage descriptions.
 */
export function generateDepositDeductionPDF(data: InvoiceData): string {
  const { inspection } = data;
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;

  function checkNewPage(needed: number) {
    if (y + needed > doc.internal.pageSize.getHeight() - 25) {
      doc.addPage();
      y = 20;
    }
  }

  // ── Header ──
  let y = addBrandedHeader(doc, data, 18);

  // Title
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...BRAND.black);
  doc.text("ITEMIZED STATEMENT OF SECURITY DEPOSIT DEDUCTIONS", margin, y);
  y += 5;
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...BRAND.darkGray);
  doc.text("Pursuant to California Civil Code Section 1950.5", margin, y);
  y += 8;

  // ── Property & Tenant Info ──
  doc.setFillColor(...BRAND.bgGray);
  doc.setDrawColor(...BRAND.lightGray);
  const infoBoxHeight = 48;
  doc.rect(margin, y - 2, contentWidth, infoBoxHeight, "FD");

  const col1x = margin + 4;
  const col2x = margin + contentWidth / 2 + 4;
  const labelWidth = 38;
  let iy = y + 4;

  function infoRow(label: string, value: string, x: number) {
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...BRAND.darkGray);
    doc.text(label, x, iy);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...BRAND.black);
    doc.text(String(value || "—"), x + labelWidth, iy);
  }

  const tenantDisplay = data.tenants?.length
    ? data.tenants.map((t) => t.name).join(", ")
    : inspection.tenant_name || "—";

  infoRow("Tenant(s):", tenantDisplay, col1x);
  infoRow("Inspector:", inspection.inspector || "—", col2x);
  iy += 6;
  infoRow("Unit Address:", inspection.unit_name, col1x);
  infoRow("Inspection Date:", inspection.scheduled_date || "—", col2x);
  iy += 6;
  infoRow("Property:", inspection.property_name, col1x);
  infoRow("Move-Out Date:", inspection.completed_date || inspection.scheduled_date || "—", col2x);
  iy += 6;
  infoRow("Security Deposit:", inspection.deposit_amount ? `$${Number(inspection.deposit_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : "—", col1x);
  infoRow("Assessment Method:", "Forensic Visual Inspection", col2x);

  y += infoBoxHeight + 6;

  // ── Methodology notice ──
  doc.setFontSize(7);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(...BRAND.darkGray);
  const methodText = doc.splitTextToSize(
    "All findings documented below were obtained through a standardized forensic visual inspection conducted at the time of unit turnover. " +
    "Each assessment is strictly quantified and classified per the Standardized Glossary of Assessment Terms. " +
    "Deductions represent conditions inconsistent with normal wear and tear as defined by California Civil Code Section 1950.5. " +
    "Photographic documentation accompanies each assessed condition below; full-resolution files are maintained and available upon written request.",
    contentWidth
  );
  for (const line of methodText) {
    doc.text(line, margin, y);
    y += 3.5;
  }
  doc.setFont("helvetica", "normal");
  y += 4;

  // ── Deduction Items ──
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...BRAND.black);
  doc.text("ITEMIZED DEDUCTIONS", margin, y);
  y += 7;

  // Table header
  checkNewPage(10);
  doc.setFillColor(...BRAND.maroon);
  doc.rect(margin, y - 4, contentWidth, 8, "F");
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...BRAND.white);
  doc.text("#", margin + 3, y);
  doc.text("Location", margin + 12, y);
  doc.text("Finding / Assessment", margin + 48, y);
  doc.text("Cost", pageWidth - margin - 4, y, { align: "right" });
  y += 7;
  doc.setTextColor(...BRAND.black);

  let itemNum = 0;
  let totalDeductions = 0;

  const allRooms: DbRoom[] = inspection.rooms || [];

  // Helper to render a single deduction line. When `photoDataUrl` is provided
  // the photo is embedded beneath the description as visual evidence.
  function renderDeductionLine(
    roomName: string,
    description: string,
    cost: number,
    photoDataUrl?: string,
  ) {
    itemNum++;
    totalDeductions += cost;

    // Reserve enough room for header line + optional photo (~42mm) + trailing padding.
    const photoBlockH = photoDataUrl ? 46 : 0;
    checkNewPage(22 + photoBlockH);

    if (itemNum % 2 === 0) {
      doc.setFillColor(250, 250, 250);
      doc.rect(margin, y - 4, contentWidth, 5, "F");
    }

    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...BRAND.darkGray);
    doc.text(String(itemNum), margin + 3, y);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(...BRAND.black);
    doc.text(roomName, margin + 12, y);

    const descLines = doc.splitTextToSize(description, contentWidth - 78);
    for (let i = 0; i < descLines.length; i++) {
      if (i > 0) checkNewPage(5);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text(descLines[i], margin + 48, y);
      if (i === 0) {
        doc.setFont("helvetica", "bold");
        doc.text(`$${cost.toFixed(2)}`, pageWidth - margin - 4, y, { align: "right" });
      }
      y += 4.5;
    }

    // Wear-and-tear exclusion rationale — explicitly anchors every deduction
    // to the CA Civil Code §1950.5 standard so the statement is AI-dispute-resistant.
    checkNewPage(5);
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(...BRAND.medGray);
    doc.text(
      "W&T exclusion: condition determined inconsistent with gradual deterioration from ordinary daily use per CA Civ. Code §1950.5",
      margin + 48, y
    );
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...BRAND.black);
    y += 4;

    // Embedded photo thumbnail — only drawn for photo-level deductions that
    // have been pre-fetched into a base64 data URL by buildPdfData.
    if (photoDataUrl) {
      checkNewPage(46);
      try {
        const imgW = 60;
        const imgH = 42;
        doc.addImage(photoDataUrl, "JPEG", margin + 48, y, imgW, imgH);
        // Subtle border for legibility against white pages.
        doc.setDrawColor(...BRAND.lightGray);
        doc.rect(margin + 48, y, imgW, imgH);
        y += imgH + 3;
      } catch {
        // Bad/unsupported data URL — skip silently, document stays valid.
      }
    }

    y += 2;
    doc.setDrawColor(...BRAND.lightGray);
    doc.line(margin + 10, y - 1, pageWidth - margin, y - 1);
  }

  for (const room of allRooms) {
    for (const item of room.items) {
      // Check for per-photo deductions first
      const photoDeductions = (item.photos || []).filter(
        (p) => p.is_deduction && (p.cost_estimate || 0) > 0
      );

      if (photoDeductions.length > 0) {
        // Render each deductible photo as its own line. Description uses only
        // the inspector-written notes — AI analysis text is never included in
        // tenant-facing documents.
        for (const photo of photoDeductions) {
          const desc = `${item.name}${photo.notes ? ` — ${photo.notes}` : ""}`;
          renderDeductionLine(
            room.name,
            desc,
            photo.cost_estimate || 0,
            photo.data_url,
          );
        }
      } else if (item.is_deduction && item.cost_estimate > 0) {
        // Item-level deduction (no per-photo deductions)
        const desc = `${item.name}${item.notes ? ` — ${item.notes}` : ""}`;
        renderDeductionLine(room.name, desc, item.cost_estimate);
      }
    }
  }

  if (itemNum === 0) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text("No deductions assessed. Full deposit to be returned.", margin + 12, y);
    y += 8;
  }

  y += 6;

  // ── Summary ──
  checkNewPage(40);
  doc.setDrawColor(...BRAND.maroon);
  doc.setLineWidth(0.6);
  doc.line(margin, y, pageWidth - margin, y);
  doc.setLineWidth(0.2);
  y += 8;

  const depositAmount = inspection.deposit_amount || 0;
  const refundAmount = Math.max(0, depositAmount - totalDeductions);
  const amountOwed = Math.max(0, totalDeductions - depositAmount);

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("FINANCIAL SUMMARY", margin, y);
  y += 8;

  function summaryRow(label: string, value: string, bold: boolean = false) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...BRAND.darkGray);
    doc.text(label, margin + 5, y);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setTextColor(...BRAND.black);
    doc.text(value, pageWidth - margin - 5, y, { align: "right" });
    y += 7;
  }

  summaryRow("Security Deposit Held:", `$${depositAmount.toFixed(2)}`);
  summaryRow("Total Itemized Deductions:", `($${totalDeductions.toFixed(2)})`);

  // Divider before final amount
  doc.setDrawColor(...BRAND.darkGray);
  doc.line(margin + 80, y - 3, pageWidth - margin - 5, y - 3);

  if (refundAmount > 0) {
    summaryRow("REFUND DUE TO TENANT:", `$${refundAmount.toFixed(2)}`, true);
  } else if (amountOwed > 0) {
    summaryRow("BALANCE DUE FROM TENANT:", `$${amountOwed.toFixed(2)}`, true);
  } else {
    summaryRow("DEPOSIT FULLY APPLIED:", "$0.00", true);
  }

  y += 6;

  // ── Legal Notice ──
  checkNewPage(50);
  doc.setDrawColor(...BRAND.lightGray);
  doc.line(margin, y, pageWidth - margin, y);
  y += 6;

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...BRAND.black);
  doc.text("LEGAL NOTICE", margin, y);
  y += 5;

  const legalParagraphs = [
    "This statement is provided pursuant to California Civil Code Section 1950.5. All deductions represent conditions that exceed the threshold of normal wear and tear, as determined through standardized forensic visual inspection methodology.",
    "Deductions are permitted solely for: (1) unpaid rent; (2) cleaning costs to restore the unit to documented move-in baseline condition; (3) repair of damages beyond normal wear and tear; and (4) restoration of personal property if agreed in the lease.",
    "\"Normal wear and tear\" as defined under California law means gradual deterioration occurring through expected, intended, and reasonable daily use, absent negligence, carelessness, accident, or abuse. Each deduction listed above has been assessed against this standard with measurable, documented evidence.",
    "If actual repair costs differ from estimates listed above, an amended statement with supporting receipts will be provided within 14 calendar days of completion of repairs, per Section 1950.5(g)(4).",
    "Tenants retain the right to request copies of invoices or receipts for any deduction exceeding $125.00. Photographic documentation of all assessed conditions is maintained and available upon written request.",
  ];

  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...BRAND.darkGray);
  for (const para of legalParagraphs) {
    checkNewPage(12);
    const lines = doc.splitTextToSize(para, contentWidth);
    for (const line of lines) {
      doc.text(line, margin, y);
      y += 3.5;
    }
    y += 2;
  }

  y += 6;

  // ── Signature Lines ──
  checkNewPage(35);
  doc.setDrawColor(...BRAND.lightGray);
  doc.line(margin, y, pageWidth - margin, y);
  y += 10;

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...BRAND.black);
  doc.text("Landlord/Agent Signature: ____________________________", margin, y);
  doc.text("Date: ________________", pageWidth - margin - 50, y);
  y += 14;
  doc.text("Tenant Acknowledgment: ____________________________", margin, y);
  doc.text("Date: ________________", pageWidth - margin - 50, y);

  // Footers
  addPageFooters(doc, data, "Itemized Statement of Security Deposit Deductions");

  return doc.output("datauristring");
}

// ── Disposition Letter ──────────────────────────────

/**
 * Generate a California Security Deposit Disposition Letter.
 * Formal cover letter with forensic assessment methodology reference,
 * designed to withstand AI-assisted tenant dispute responses.
 */
export function generateDispositionLetterPDF(data: InvoiceData): string {
  const { inspection } = data;
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;

  function checkNewPage(needed: number) {
    if (y + needed > doc.internal.pageSize.getHeight() - 25) {
      doc.addPage();
      y = 20;
    }
  }

  function addWrapped(
    text: string,
    x: number,
    fontSize: number,
    maxWidth: number,
    style: "normal" | "bold" | "italic" = "normal",
  ) {
    doc.setFontSize(fontSize);
    doc.setFont("helvetica", style);
    // Slightly tighter single-spacing — 0.5 felt airy for 10pt body copy.
    const lineHeight = fontSize * 0.45;
    const lines = doc.splitTextToSize(text, maxWidth);
    for (const line of lines) {
      checkNewPage(fontSize * 0.55);
      doc.text(line, x, y);
      y += lineHeight;
    }
  }

  // ── Header ──
  let y = addBrandedHeader(doc, data, 18);

  // Date
  const today = new Date();
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...BRAND.black);
  doc.text(today.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }), margin, y);
  y += 10;

  // ── Recipient ──
  const tenantList = data.tenants?.length
    ? data.tenants
    : inspection.tenant_name
      ? [{ name: inspection.tenant_name, email: inspection.tenant_email || "" }]
      : [{ name: "Tenant", email: "" }];

  const tenantNames = tenantList.map((t) => t.name);
  const tenantEmails = tenantList.map((t) => t.email).filter(Boolean);

  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...BRAND.maroon);
  doc.text("SENT VIA FIRST-CLASS MAIL AND EMAIL", margin, y);
  y += 7;

  doc.setTextColor(...BRAND.black);
  for (const t of tenantList) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(t.name, margin, y);
    y += 5;
    if (t.email) {
      doc.setFontSize(8);
      doc.text(t.email, margin, y);
      y += 4;
    }
  }
  doc.setFontSize(9);
  doc.text(inspection.unit_name, margin, y);
  y += 4;
  doc.text(inspection.property_name, margin, y);
  y += 10;

  // ── Subject line ──
  const subjectBoxH = 22;
  doc.setFillColor(...BRAND.bgGray);
  doc.setDrawColor(...BRAND.lightGray);
  doc.rect(margin, y - 4, contentWidth, subjectBoxH, "FD");
  // Maroon accent bar on the left edge.
  doc.setFillColor(...BRAND.maroon);
  doc.rect(margin, y - 4, 1.2, subjectBoxH, "F");

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...BRAND.black);
  doc.text("RE: SECURITY DEPOSIT DISPOSITION", margin + 6, y + 2);
  y += 8;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...BRAND.darkGray);
  const moveOutDate = inspection.completed_date || inspection.scheduled_date || "N/A";
  doc.text(`Unit: ${inspection.unit_name}  |  Move-Out Date: ${moveOutDate}`, margin + 6, y + 1);
  doc.setTextColor(...BRAND.black);
  y += 14;

  // ── Salutation ──
  const salutation = tenantNames.length > 2
    ? `${tenantNames.slice(0, -1).join(", ")}, and ${tenantNames[tenantNames.length - 1]}`
    : tenantNames.join(" and ");

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...BRAND.black);
  doc.text(`Dear ${salutation},`, margin, y);
  y += 8;

  // ── Body — AI-proof forensic language ──
  const depositAmount = inspection.deposit_amount || 0;
  const allRooms: DbRoom[] = inspection.rooms || [];
  let totalDeductions = 0;
  for (const room of allRooms) {
    for (const item of room.items) {
      const photoDeductions = (item.photos || [])
        .filter((p) => p.is_deduction && (p.cost_estimate || 0) > 0)
        .reduce((s, p) => s + (p.cost_estimate || 0), 0);
      if (photoDeductions > 0) {
        totalDeductions += photoDeductions;
      } else if (item.is_deduction && item.cost_estimate > 0) {
        totalDeductions += item.cost_estimate;
      }
    }
  }
  const refundAmount = Math.max(0, depositAmount - totalDeductions);
  const amountOwed = Math.max(0, totalDeductions - depositAmount);

  addWrapped(
    `This letter constitutes your formal Security Deposit Disposition Statement issued pursuant to California Civil Code Section 1950.5. ` +
    `This statement is being provided within the statutory 21-calendar-day period following your vacating of the premises located at ${inspection.unit_name}.`,
    margin, 10, contentWidth
  );
  y += 3;

  addWrapped(
    `A comprehensive forensic visual inspection of the above-referenced unit was conducted on ${inspection.scheduled_date || moveOutDate}` +
    `${inspection.inspector ? ` by ${inspection.inspector}` : ""}. ` +
    `All conditions documented in the enclosed itemized statement were assessed using standardized, quantitative measurement protocols. ` +
    `Each finding has been classified under the applicable category from the Standardized Glossary of Assessment Terms and evaluated against the legal standard for normal wear and tear as defined by California Civil Code Section 1950.5.`,
    margin, 10, contentWidth
  );
  y += 3;

  addWrapped(
    `Your security deposit of $${depositAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })} has been applied as follows:`,
    margin, 10, contentWidth
  );
  y += 5;

  // ── Summary box ──
  checkNewPage(40);
  doc.setDrawColor(...BRAND.maroon);
  doc.setLineWidth(0.6);
  doc.setFillColor(...BRAND.bgGray);
  doc.rect(margin, y - 3, contentWidth, 34, "FD");
  doc.setLineWidth(0.2);

  y += 5;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...BRAND.darkGray);
  doc.text("Security Deposit Held:", margin + 6, y);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...BRAND.black);
  doc.text(`$${depositAmount.toFixed(2)}`, pageWidth - margin - 6, y, { align: "right" });
  y += 7;

  doc.setFont("helvetica", "normal");
  doc.setTextColor(...BRAND.darkGray);
  doc.text("Total Itemized Deductions:", margin + 6, y);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...BRAND.black);
  doc.text(`($${totalDeductions.toFixed(2)})`, pageWidth - margin - 6, y, { align: "right" });
  y += 7;

  doc.setDrawColor(...BRAND.darkGray);
  doc.line(margin + 6, y - 3, pageWidth - margin - 6, y - 3);

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  if (refundAmount > 0) {
    doc.text("REFUND DUE TO TENANT:", margin + 6, y);
    doc.text(`$${refundAmount.toFixed(2)}`, pageWidth - margin - 6, y, { align: "right" });
  } else if (amountOwed > 0) {
    doc.setTextColor(...BRAND.maroon);
    doc.text("BALANCE DUE FROM TENANT:", margin + 6, y);
    doc.text(`$${amountOwed.toFixed(2)}`, pageWidth - margin - 6, y, { align: "right" });
  } else {
    doc.text("DEPOSIT FULLY APPLIED:", margin + 6, y);
    doc.text("$0.00", pageWidth - margin - 6, y, { align: "right" });
  }
  doc.setTextColor(...BRAND.black);
  y += 14;

  // ── Post-summary body ──
  if (refundAmount > 0) {
    addWrapped(
      `A refund check in the amount of $${refundAmount.toFixed(2)} is enclosed with this correspondence. Please deposit or negotiate this check within 180 days of the date printed above.`,
      margin, 10, contentWidth
    );
  } else if (amountOwed > 0) {
    addWrapped(
      `The total assessed deductions exceed the security deposit held by $${amountOwed.toFixed(2)}. ` +
      `This balance is due and payable within 30 calendar days of the date of this letter. Failure to remit may result in further collection action as permitted by law.`,
      margin, 10, contentWidth
    );
  }
  y += 3;

  addWrapped(
    `The enclosed Itemized Statement of Security Deposit Deductions provides a full accounting of each assessed condition, including the specific location, measured dimensions, damage classification, and required remediation. ` +
    `All assessments are supported by time-stamped photographic documentation captured during the forensic visual inspection and are available upon written request.`,
    margin, 10, contentWidth
  );
  y += 3;

  addWrapped(
    `Each deduction represents a condition that has been determined to be inconsistent with the expected depreciation over the tenancy duration. ` +
    `Damage isolated to specific, non-traffic areas or exhibiting characteristics of acute incident rather than gradual environmental wear has been classified accordingly. ` +
    `No deductions have been assessed for conditions attributable to normal wear and tear.`,
    margin, 10, contentWidth
  );
  y += 5;

  // ── Tenant rights ──
  checkNewPage(45);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...BRAND.black);
  doc.text("YOUR RIGHTS UNDER CALIFORNIA LAW:", margin, y);
  y += 6;

  const rights = [
    "You have the right to request copies of invoices or receipts for any deduction exceeding $125.00, pursuant to Section 1950.5(g)(2).",
    "If any deductions above are based on good-faith estimates, you will receive an amended statement with actual costs and supporting receipts within 14 calendar days of the completion of repairs, per Section 1950.5(g)(4).",
    "You retain the right to dispute any deduction you believe to be inaccurate or attributable to normal wear and tear. Disputes should be submitted in writing to the address above.",
    "If you believe your security deposit has been wrongfully withheld, you may pursue remedies under California Civil Code Section 1950.5(l), which may include recovery of up to twice the amount of the security deposit in addition to actual damages.",
  ];

  // Bulleted list with proper hanging indent — bullet stays flush while the
  // wrapped text body aligns cleanly under itself.
  const bulletX = margin + 2;
  const textX = margin + 7;
  for (const right of rights) {
    checkNewPage(12);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...BRAND.black);
    doc.text("•", bulletX, y);
    addWrapped(right, textX, 9, contentWidth - 7);
    y += 2;
  }

  y += 4;
  addWrapped(
    `Should you have any questions regarding this disposition or the enclosed itemized statement, please direct correspondence to our office at the address shown above.`,
    margin, 10, contentWidth
  );
  y += 10;

  // ── Signature ──
  checkNewPage(35);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Sincerely,", margin, y);
  y += 16;
  doc.setDrawColor(...BRAND.darkGray);
  doc.line(margin, y, margin + 70, y);
  y += 5;
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(data.companyName, margin, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  if (inspection.inspector) {
    doc.text(`Inspector: ${inspection.inspector}`, margin, y);
    y += 5;
  }
  y += 5;

  // ── Enclosures ──
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...BRAND.darkGray);
  doc.text("Enclosures:", margin, y);
  y += 4;
  doc.setFont("helvetica", "normal");

  // Counter-based numbering so future enclosure types can be added without
  // desyncing the list.
  const enclosures: string[] = [
    "Itemized Statement of Security Deposit Deductions (with photographic evidence)",
  ];
  if (refundAmount > 0) {
    enclosures.push(`Refund check — $${refundAmount.toFixed(2)}`);
  }
  enclosures.push("Full-resolution photographic documentation available upon written request");

  enclosures.forEach((text, idx) => {
    doc.text(`${idx + 1}.  ${text}`, margin + 3, y);
    y += 4;
  });

  if (tenantEmails.length > 0) {
    y += 8;
    doc.setFontSize(7);
    doc.setTextColor(...BRAND.medGray);
    doc.text(`Electronic copy sent to: ${tenantEmails.join(", ")}`, margin, y);
  }

  // Footers
  doc.setTextColor(...BRAND.black);
  addPageFooters(doc, data, "Security Deposit Disposition Letter");

  return doc.output("datauristring");
}

// ── Contractor Work Order Report ────────────────────

/**
 * Generate a contractor repair report from deducted items.
 * No prices — just room locations, item descriptions, and optional floor plan.
 */
export function generateContractorReportPDF(
  data: InvoiceData,
  floorPlanBase64?: string | null,
): string {
  const { inspection } = data;
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;

  function checkNewPage(needed: number) {
    if (y + needed > doc.internal.pageSize.getHeight() - 25) {
      doc.addPage();
      y = 20;
    }
  }

  let y = addBrandedHeader(doc, data, 18);

  // Title
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...BRAND.black);
  doc.text("CONTRACTOR WORK ORDER — UNIT REPAIR CHECKLIST", margin, y);
  y += 5;
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...BRAND.darkGray);
  doc.text("Items requiring remediation following move-out inspection", margin, y);
  y += 8;

  // Property / unit info box
  doc.setFillColor(...BRAND.bgGray);
  doc.setDrawColor(...BRAND.lightGray);
  doc.rect(margin, y - 2, contentWidth, 24, "FD");
  const col1x = margin + 4;
  const col2x = margin + contentWidth / 2 + 4;
  const labelWidth = 32;
  let iy = y + 4;

  function infoRow(label: string, value: string, x: number) {
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...BRAND.darkGray);
    doc.text(label, x, iy);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...BRAND.black);
    doc.text(String(value || "—"), x + labelWidth, iy);
  }

  infoRow("Unit:", inspection.unit_name, col1x);
  infoRow("Inspector:", inspection.inspector || "—", col2x);
  iy += 6;
  infoRow("Property:", inspection.property_name, col1x);
  infoRow("Date:", inspection.scheduled_date || "—", col2x);
  y += 24 + 6;

  // Floor plan (if provided)
  if (floorPlanBase64) {
    checkNewPage(90);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...BRAND.black);
    doc.text("UNIT FLOOR PLAN", margin, y);
    y += 4;
    try {
      const imgW = contentWidth;
      const imgH = 80;
      doc.addImage(floorPlanBase64, "JPEG", margin, y, imgW, imgH);
      doc.setDrawColor(...BRAND.lightGray);
      doc.rect(margin, y, imgW, imgH);
      y += imgH + 6;
    } catch {
      // Skip if floor plan can't be embedded
    }
  }

  // Items header
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...BRAND.black);
  doc.text("REPAIR ITEMS", margin, y);
  y += 7;

  // Table header
  checkNewPage(10);
  doc.setFillColor(...BRAND.maroon);
  doc.rect(margin, y - 4, contentWidth, 8, "F");
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...BRAND.white);
  doc.text("#", margin + 3, y);
  doc.text("Room / Area", margin + 12, y);
  doc.text("Item & Description", margin + 55, y);
  y += 7;
  doc.setTextColor(...BRAND.black);

  const allRooms: DbRoom[] = inspection.rooms || [];
  let itemNum = 0;

  for (const room of allRooms) {
    for (const item of room.items) {
      const photoDeductions = (item.photos || []).filter(
        (p) => p.is_deduction && (p.cost_estimate || 0) > 0,
      );

      const renderItem = (description: string) => {
        itemNum++;
        checkNewPage(14);

        if (itemNum % 2 === 0) {
          doc.setFillColor(250, 250, 250);
          doc.rect(margin, y - 4, contentWidth, 5, "F");
        }

        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...BRAND.darkGray);
        doc.text(String(itemNum), margin + 3, y);

        doc.setFont("helvetica", "normal");
        doc.setTextColor(...BRAND.black);
        doc.text(room.name, margin + 12, y);

        const descLines = doc.splitTextToSize(description, contentWidth - 58);
        for (let i = 0; i < descLines.length; i++) {
          if (i > 0) checkNewPage(5);
          doc.text(descLines[i], margin + 55, y);
          y += 4.5;
        }

        y += 2;
        doc.setDrawColor(...BRAND.lightGray);
        doc.line(margin + 10, y - 1, pageWidth - margin, y - 1);
      };

      if (photoDeductions.length > 0) {
        for (const photo of photoDeductions) {
          renderItem(`${item.name}${photo.notes ? ` — ${photo.notes}` : ""}`);
        }
      } else if (item.is_deduction && item.cost_estimate > 0) {
        renderItem(`${item.name}${item.notes ? ` — ${item.notes}` : ""}`);
      }
    }
  }

  if (itemNum === 0) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text("No repair items identified.", margin + 12, y);
    y += 8;
  }

  y += 6;

  // Signature block
  checkNewPage(30);
  doc.setDrawColor(...BRAND.lightGray);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...BRAND.black);
  doc.text("Contractor Signature: ____________________________", margin, y);
  doc.text("Date: ________________", pageWidth - margin - 50, y);
  y += 10;
  doc.text("Work Completed: ____________________________", margin, y);
  doc.text("Date: ________________", pageWidth - margin - 50, y);

  addPageFooters(doc, data, "Contractor Work Order");
  return doc.output("datauristring");
}

// ── Photo Evidence Package ──────────────────────────

/**
 * Generate a complete photo evidence package for tenant disclosure requests.
 * Every photo from the inspection organized by room, with item label,
 * condition, timestamp, and deduction indicator.
 *
 * Pass `allPhotoDataUrls` — a Map<photoId, base64DataUrl> — pre-fetched by the caller.
 */
export function generatePhotoPackagePDF(
  data: InvoiceData,
  allPhotoDataUrls: Map<string, string>,
): string {
  const { inspection } = data;
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;
  const photoW = (contentWidth - 6) / 2; // two columns with 6mm gap
  const photoH = photoW * 0.72;

  function checkNewPage(needed: number) {
    if (y + needed > doc.internal.pageSize.getHeight() - 25) {
      doc.addPage();
      y = 20;
    }
  }

  let y = addBrandedHeader(doc, data, 18);

  // Title
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...BRAND.black);
  doc.text("PHOTOGRAPHIC EVIDENCE PACKAGE", margin, y);
  y += 5;
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...BRAND.darkGray);
  doc.text("Complete timestamped photo documentation — move-out inspection", margin, y);
  y += 8;

  // Property/unit info box
  doc.setFillColor(...BRAND.bgGray);
  doc.setDrawColor(...BRAND.lightGray);
  doc.rect(margin, y - 2, contentWidth, 22, "FD");
  const col1x = margin + 4;
  const col2x = margin + contentWidth / 2 + 4;
  const labelWidth = 30;
  let iy = y + 4;

  function infoRow(label: string, value: string, x: number) {
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...BRAND.darkGray);
    doc.text(label, x, iy);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...BRAND.black);
    doc.text(String(value || "—"), x + labelWidth, iy);
  }

  infoRow("Unit:", inspection.unit_name, col1x);
  infoRow("Inspector:", inspection.inspector || "—", col2x);
  iy += 6;
  infoRow("Property:", inspection.property_name, col1x);
  infoRow("Inspection Date:", inspection.scheduled_date || "—", col2x);
  y += 22 + 8;

  // Legal note
  doc.setFontSize(7);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(...BRAND.darkGray);
  const noteText = doc.splitTextToSize(
    "All photographs are time-stamped and were captured during the forensic visual inspection. Photos marked \"DEDUCTION\" correspond to line items on the Itemized Statement of Security Deposit Deductions. Full-resolution originals are maintained and available upon written request per CA Civil Code §1950.5(g)(2).",
    contentWidth
  );
  for (const line of noteText) { doc.text(line, margin, y); y += 3.5; }
  doc.setFont("helvetica", "normal");
  y += 4;

  const allRooms: DbRoom[] = inspection.rooms || [];
  let totalPhotos = 0;

  for (const room of allRooms) {
    const roomPhotos: { photo: DbRoom["items"][0]["photos"][0]; itemName: string }[] = [];
    for (const item of room.items) {
      for (const photo of (item.photos || [])) {
        roomPhotos.push({ photo, itemName: item.name });
      }
    }
    if (roomPhotos.length === 0) continue;

    // Room heading
    checkNewPage(14);
    doc.setFillColor(...BRAND.maroon);
    doc.rect(margin, y - 4, contentWidth, 8, "F");
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...BRAND.white);
    doc.text(`${room.name.toUpperCase()}  ·  ${roomPhotos.length} photo${roomPhotos.length !== 1 ? "s" : ""}`, margin + 3, y);
    doc.setTextColor(...BRAND.black);
    y += 8;

    // Photos in 2-column grid
    let col = 0;
    for (const { photo, itemName } of roomPhotos) {
      const x = margin + col * (photoW + 6);
      const captionH = 14;
      checkNewPage(photoH + captionH + 6);

      const dataUrl = allPhotoDataUrls.get(photo.id);
      if (dataUrl) {
        try {
          doc.addImage(dataUrl, "JPEG", x, y, photoW, photoH);
          // Deduction badge
          if (photo.is_deduction) {
            doc.setFillColor(...BRAND.maroon);
            doc.rect(x, y, photoW, 5, "F");
            doc.setFontSize(6);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(...BRAND.white);
            doc.text("DEDUCTION", x + 2, y + 3.5);
            doc.setTextColor(...BRAND.black);
          }
          doc.setDrawColor(...BRAND.lightGray);
          doc.rect(x, y, photoW, photoH);
        } catch {
          // Photo failed to embed — draw placeholder box
          doc.setFillColor(...BRAND.bgGray);
          doc.rect(x, y, photoW, photoH, "F");
          doc.setFontSize(7);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(...BRAND.medGray);
          doc.text("[Photo unavailable]", x + photoW / 2, y + photoH / 2, { align: "center" });
          doc.setTextColor(...BRAND.black);
        }
      } else {
        doc.setFillColor(...BRAND.bgGray);
        doc.rect(x, y, photoW, photoH, "F");
      }

      // Caption
      const capY = y + photoH + 2;
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...BRAND.black);
      doc.text(itemName, x, capY + 4, { maxWidth: photoW });
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...BRAND.darkGray);
      const ts = photo.created_at
        ? new Date(photo.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
        : "";
      if (ts) doc.text(ts, x, capY + 8, { maxWidth: photoW });

      totalPhotos++;
      col++;
      if (col === 2) {
        col = 0;
        y += photoH + captionH + 4;
      }
    }
    // If we ended mid-row, advance
    if (col !== 0) {
      y += photoH + 14 + 4;
      col = 0;
    }
    y += 4;
  }

  // Summary footer on last page
  checkNewPage(16);
  doc.setFontSize(8);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(...BRAND.medGray);
  doc.text(
    `Total photographs: ${totalPhotos}  |  Produced by ${data.companyName}  |  CA Civil Code §1950.5`,
    margin, y
  );

  addPageFooters(doc, data, "Photographic Evidence Package");
  return doc.output("datauristring");
}

// ── PDF Download ────────────────────────────────────

/**
 * Trigger PDF download in the browser.
 */
export function downloadPDF(dataUri: string, filename: string) {
  const link = document.createElement("a");
  link.href = dataUri;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
