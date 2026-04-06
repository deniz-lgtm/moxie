// ============================================
// SoCal Gas Bill Download Flow
// ============================================
// Starter template. Run `npm run record-socalgas` to generate a recorded
// version, then copy the relevant click/fill steps from the recorded
// file into the downloadBill() function below.

/**
 * Download the most recent SoCal Gas bill for a single account.
 *
 * @param {import('playwright').Page} page
 * @param {object} options
 * @param {string} options.user
 * @param {string} options.password
 * @param {string} options.downloadDir
 * @param {string} options.accountLabel
 * @param {(msg: string) => void} options.onProgress
 * @returns {Promise<{ success: boolean, savedTo?: string, error?: string }>}
 */
export async function downloadBill(page, options) {
  const { user, password, downloadDir, accountLabel, onProgress } = options;

  try {
    onProgress(`[${accountLabel}] Navigating to SoCal Gas login...`);
    await page.goto("https://myaccount.socalgas.com/", { waitUntil: "domcontentloaded" });

    // ─── LOGIN ─────────────────────────────────────────────────
    // TODO: Replace with selectors from `npm run record-socalgas`
    onProgress(`[${accountLabel}] Logging in as ${user}...`);
    await page.getByLabel(/username|email/i).fill(user);
    await page.getByLabel(/password/i).fill(password);
    await page.getByRole("button", { name: /sign in|log in/i }).click();

    await page.waitForLoadState("networkidle", { timeout: 30000 });

    // ─── NAVIGATE TO BILL HISTORY ──────────────────────────────
    onProgress(`[${accountLabel}] Navigating to bill history...`);
    // TODO: Replace with actual selector
    await page.getByRole("link", { name: /bill.*history|view bill|billing/i }).first().click();
    await page.waitForLoadState("networkidle", { timeout: 30000 });

    // ─── DOWNLOAD PDF ──────────────────────────────────────────
    onProgress(`[${accountLabel}] Downloading current bill PDF...`);
    const downloadPromise = page.waitForEvent("download", { timeout: 60000 });
    // TODO: Replace with actual download trigger
    await page.getByRole("link", { name: /download.*pdf|view pdf|bill pdf/i }).first().click();
    const download = await downloadPromise;

    const filename = `socalgas-${accountLabel}-${monthStamp()}.pdf`;
    const savedTo = `${downloadDir}/${filename}`;
    await download.saveAs(savedTo);
    onProgress(`[${accountLabel}] Saved: ${filename}`);

    return { success: true, savedTo };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function monthStamp() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
