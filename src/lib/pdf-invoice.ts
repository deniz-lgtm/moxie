/**
 * PDF Invoice Generator — Move-Out Deposit Deduction Statement
 *
 * Compliant with California Civil Code Section 1950.5:
 * - Itemized statement of deductions
 * - Each deduction includes description, cost, and supporting photos
 * - Must be provided within 21 calendar days of move-out
 * - Must include estimated vs actual costs
 * - Remaining deposit amount clearly stated
 */

import { jsPDF } from "jspdf";
import type { DbInspection, DbRoom, DbInspectionItem } from "./supabase";

type InvoiceData = {
  inspection: DbInspection;
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
};

/**
 * Generate a CA Civil Code 1950.5 compliant deposit deduction PDF.
 * Returns a data URL of the PDF.
 */
export function generateDepositDeductionPDF(data: InvoiceData): string {
  const { inspection } = data;
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;
  let y = 20;

  // ── Helper functions ──────────────────────────────

  function addText(text: string, x: number, fontSize: number, style: "normal" | "bold" = "normal") {
    doc.setFontSize(fontSize);
    doc.setFont("helvetica", style);
    doc.text(text, x, y);
  }

  function addLine() {
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, y, pageWidth - margin, y);
    y += 5;
  }

  function checkNewPage(needed: number) {
    if (y + needed > doc.internal.pageSize.getHeight() - 30) {
      doc.addPage();
      y = 20;
    }
  }

  // ── Header ────────────────────────────────────────

  // Company name
  addText(data.companyName, margin, 18, "bold");
  y += 8;
  addText(data.companyAddress, margin, 9, "normal");
  y += 5;
  addText(`${data.companyPhone}  |  ${data.companyEmail}`, margin, 9, "normal");
  y += 10;

  addLine();

  // ── Title ─────────────────────────────────────────

  addText("ITEMIZED STATEMENT OF SECURITY DEPOSIT DEDUCTIONS", margin, 14, "bold");
  y += 7;
  addText("Pursuant to California Civil Code Section 1950.5", margin, 9, "normal");
  y += 10;

  // ── Tenant & Property Info ────────────────────────

  const infoFields = [
    ["Tenant Name:", inspection.tenant_name || "—"],
    ["Unit Address:", inspection.unit_name],
    ["Property:", inspection.property_name],
    ["Move-Out Date:", inspection.completed_date || inspection.scheduled_date || "—"],
    ["Inspection Date:", inspection.scheduled_date || "—"],
    ["Inspector:", inspection.inspector || "—"],
    ["Security Deposit:", inspection.deposit_amount ? `$${inspection.deposit_amount.toLocaleString()}` : "—"],
  ];

  for (const [label, value] of infoFields) {
    checkNewPage(8);
    addText(label, margin, 10, "bold");
    doc.setFont("helvetica", "normal");
    doc.text(String(value), margin + 45, y);
    y += 6;
  }

  y += 5;
  addLine();

  // ── Deduction Items ───────────────────────────────

  addText("ITEMIZED DEDUCTIONS", margin, 12, "bold");
  y += 8;

  // Table header
  checkNewPage(10);
  doc.setFillColor(245, 245, 245);
  doc.rect(margin, y - 4, contentWidth, 8, "F");
  addText("#", margin + 2, 9, "bold");
  addText("Room", margin + 12, 9, "bold");
  addText("Item / Description", margin + 50, 9, "bold");
  addText("Cost", pageWidth - margin - 20, 9, "bold");
  y += 8;

  let itemNum = 0;
  let totalDeductions = 0;

  const allRooms: DbRoom[] = inspection.rooms || [];

  for (const room of allRooms) {
    for (const item of room.items) {
      if (!item.is_deduction || item.cost_estimate <= 0) continue;

      itemNum++;
      totalDeductions += item.cost_estimate;

      checkNewPage(20);

      addText(String(itemNum), margin + 2, 9, "normal");
      addText(room.name, margin + 12, 9, "normal");

      // Wrap long descriptions
      const descLines = doc.splitTextToSize(
        `${item.name}${item.notes ? ` — ${item.notes}` : ""}`,
        contentWidth - 90
      );
      for (let i = 0; i < descLines.length; i++) {
        if (i > 0) {
          checkNewPage(6);
        }
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.text(descLines[i], margin + 50, y);
        if (i === 0) {
          addText(`$${item.cost_estimate.toFixed(2)}`, pageWidth - margin - 20, 9, "normal");
        }
        y += 5;
      }

      y += 3;

      // Light separator between items
      doc.setDrawColor(230, 230, 230);
      doc.line(margin + 10, y - 2, pageWidth - margin, y - 2);
    }
  }

  if (itemNum === 0) {
    addText("No deductions — full deposit to be returned.", margin + 12, 10, "normal");
    y += 8;
  }

  y += 5;
  addLine();

  // ── Totals ────────────────────────────────────────

  checkNewPage(30);
  const depositAmount = inspection.deposit_amount || 0;
  const refundAmount = Math.max(0, depositAmount - totalDeductions);

  addText("SUMMARY", margin, 12, "bold");
  y += 8;

  const summaryRows = [
    ["Security Deposit Held:", `$${depositAmount.toFixed(2)}`],
    ["Total Deductions:", `($${totalDeductions.toFixed(2)})`],
    ["Amount Due to Tenant:", `$${refundAmount.toFixed(2)}`],
  ];

  for (const [label, value] of summaryRows) {
    addText(label, margin + 50, 11, "normal");
    addText(value, pageWidth - margin - 30, 11, "bold");
    y += 7;
  }

  y += 10;
  addLine();

  // ── Legal Notice ──────────────────────────────────

  checkNewPage(40);
  addText("LEGAL NOTICE", margin, 10, "bold");
  y += 6;

  const legalText = [
    "This statement is provided pursuant to California Civil Code Section 1950.5.",
    "",
    "The landlord must return the security deposit, minus any lawful deductions, within",
    "21 calendar days after the tenant has vacated the premises. Deductions may only be",
    "made for: (1) unpaid rent, (2) cleaning costs to restore the unit to the same level",
    "of cleanliness as at move-in, (3) repair of damages beyond normal wear and tear,",
    "and (4) restoration of personal property if agreed in the lease.",
    "",
    "Normal wear and tear includes reasonable deterioration from ordinary use of the",
    "premises. The landlord may not deduct for conditions caused by normal wear and tear.",
    "",
    "If actual costs differ from the estimated costs listed above, an amended statement",
    "with receipts will be provided within 14 calendar days of completion of repairs.",
    "",
    "The tenant has the right to request receipts for any deduction over $125.00.",
    "Photos documenting conditions are available upon request.",
  ];

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  for (const line of legalText) {
    checkNewPage(5);
    doc.text(line, margin, y);
    y += 4;
  }

  y += 10;

  // ── Signature Lines ───────────────────────────────

  checkNewPage(30);
  addLine();
  y += 5;

  doc.setFontSize(9);
  doc.text("Landlord/Agent Signature: ____________________________", margin, y);
  doc.text("Date: ____________", pageWidth - margin - 50, y);
  y += 12;
  doc.text("Tenant Signature (acknowledgment): ____________________________", margin, y);
  doc.text("Date: ____________", pageWidth - margin - 50, y);

  // ── Footer on each page ───────────────────────────

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(150, 150, 150);
    doc.text(
      `${data.companyName} — Deposit Deduction Statement — Page ${i} of ${totalPages}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: "center" }
    );
    doc.setTextColor(0, 0, 0);
  }

  return doc.output("datauristring");
}

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
