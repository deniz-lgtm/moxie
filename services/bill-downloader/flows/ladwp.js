// ============================================
// LADWP Bill Download Flow
// ============================================
// This is a starter template. Run `npm run record-ladwp` to generate
// a recorded version (flows/ladwp.recorded.js), then copy the relevant
// click/fill steps from the recorded file into the downloadBill()
// function below.
//
// The orchestrator (downloader.js) calls downloadBill(page, options)
// for each LADWP account. The page is a fresh Playwright Page object
// already attached to a persistent browser context (so cookies and
// cached state survive between runs).

/**
 * Download the most recent LADWP bill for a single account.
 *
 * @param {import('playwright').Page} page - A fresh Playwright page
 * @param {object} options
 * @param {string} options.user - Username/email for this LADWP account
 * @param {string} options.password - Password for this account
 * @param {string} options.downloadDir - Absolute path where the PDF should be saved
 * @param {string} options.accountLabel - Human-readable label like "ladwp-acct1"
 * @param {(msg: string) => void} options.onProgress - Progress callback
 * @returns {Promise<{ success: boolean, savedTo?: string, error?: string }>}
 */
export async function downloadBill(page, options) {
  const { user, password, downloadDir, accountLabel, onProgress } = options;

  try {
    onProgress(`[${accountLabel}] Navigating to LADWP login...`);
    await page.goto("https://myaccount.ladwp.com/", { waitUntil: "domcontentloaded" });

    // ─── LOGIN ─────────────────────────────────────────────────
    // TODO: Replace these selectors with the ones from your recorded flow.
    // Run `npm run record-ladwp` and watch what Playwright Codegen generates.
    onProgress(`[${accountLabel}] Logging in as ${user}...`);
    await page.getByLabel(/username|email/i).fill(user);
    await page.getByLabel(/password/i).fill(password);
    await page.getByRole("button", { name: /sign in|log in/i }).click();

    // Wait for dashboard to load (adjust selector based on what you see post-login)
    await page.waitForLoadState("networkidle", { timeout: 30000 });

    // ─── NAVIGATE TO BILLING ───────────────────────────────────
    onProgress(`[${accountLabel}] Navigating to billing history...`);
    // TODO: Replace with actual selector from recording
    await page.getByRole("link", { name: /billing|bill history|view bill/i }).first().click();
    await page.waitForLoadState("networkidle", { timeout: 30000 });

    // ─── DOWNLOAD PDF ──────────────────────────────────────────
    onProgress(`[${accountLabel}] Downloading current bill PDF...`);
    const downloadPromise = page.waitForEvent("download", { timeout: 60000 });
    // TODO: Replace with actual download trigger from recording
    await page.getByRole("link", { name: /download.*pdf|view pdf|bill pdf/i }).first().click();
    const download = await downloadPromise;

    const filename = `ladwp-${accountLabel}-${monthStamp()}.pdf`;
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
