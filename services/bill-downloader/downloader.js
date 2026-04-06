// ============================================
// Moxie Bill Downloader — Playwright Orchestrator
// ============================================
// Replaces the previous Computer Use approach with Playwright browser
// automation. Each utility provider has a flow file in flows/ that
// exports a downloadBill() function. The orchestrator loops over the
// configured accounts, runs each flow with a fresh page, and saves
// PDFs to BILLS_FOLDER.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { chromium } from "playwright";
import { downloadBill as ladwpDownload } from "./flows/ladwp.js";
import { downloadBill as socalgasDownload } from "./flows/socalgas.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATUS_FILE = path.join(__dirname, "status.json");
const LOG_FILE = path.join(__dirname, "downloader.log");
const PROFILE_DIR = path.join(__dirname, "browser-profile");

const BILLS_FOLDER = process.env.BILLS_FOLDER || "";
const HEADLESS = process.env.HEADLESS !== "false"; // default true; set HEADLESS=false to watch it run

let currentJob = null;

// ─── Status Management ────────────────────────────────────────

function writeStatus(patch) {
  currentJob = { ...(currentJob || {}), ...patch };
  try {
    fs.writeFileSync(STATUS_FILE, JSON.stringify(currentJob, null, 2));
  } catch (err) {
    log(`Failed to write status: ${err.message}`);
  }
}

export function getStatus() {
  if (currentJob) return currentJob;
  try {
    if (fs.existsSync(STATUS_FILE)) {
      return JSON.parse(fs.readFileSync(STATUS_FILE, "utf-8"));
    }
  } catch { /* ignore */ }
  return { running: false, jobId: null, progress: "", startedAt: null, finishedAt: null };
}

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  process.stdout.write(line);
  try { fs.appendFileSync(LOG_FILE, line); } catch { /* ignore */ }
}

// ─── Account Resolution ────────────────────────────────────────

function getAccounts(provider) {
  const accounts = [];

  if (provider === "all" || provider === "ladwp") {
    if (process.env.LADWP_USER_1 && process.env.LADWP_PASSWORD_1) {
      accounts.push({
        provider: "ladwp",
        accountLabel: "acct1",
        user: process.env.LADWP_USER_1,
        password: process.env.LADWP_PASSWORD_1,
        flow: ladwpDownload,
      });
    }
    if (process.env.LADWP_USER_2 && process.env.LADWP_PASSWORD_2) {
      accounts.push({
        provider: "ladwp",
        accountLabel: "barrett",
        user: process.env.LADWP_USER_2,
        password: process.env.LADWP_PASSWORD_2,
        flow: ladwpDownload,
      });
    }
  }

  if (provider === "all" || provider === "socalgas") {
    if (process.env.SOCALGAS_USER_1 && process.env.SOCALGAS_PASSWORD_1) {
      accounts.push({
        provider: "socalgas",
        accountLabel: "acct1",
        user: process.env.SOCALGAS_USER_1,
        password: process.env.SOCALGAS_PASSWORD_1,
        flow: socalgasDownload,
      });
    }
    if (process.env.SOCALGAS_USER_2 && process.env.SOCALGAS_PASSWORD_2) {
      accounts.push({
        provider: "socalgas",
        accountLabel: "dorrholdings",
        user: process.env.SOCALGAS_USER_2,
        password: process.env.SOCALGAS_PASSWORD_2,
        flow: socalgasDownload,
      });
    }
  }

  return accounts;
}

// ─── Main Job Runner ───────────────────────────────────────────

export function startDownloadJob(provider) {
  const jobId = `job-${Date.now()}`;
  writeStatus({
    running: true,
    jobId,
    provider,
    progress: "Starting download job...",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    lastError: null,
    results: [],
  });

  // Run in background — don't await
  runJob(provider, jobId)
    .then((results) => {
      const successCount = results.filter((r) => r.success).length;
      writeStatus({
        running: false,
        progress: `Downloaded ${successCount}/${results.length} bills`,
        finishedAt: new Date().toISOString(),
        results,
      });
      log(`Job ${jobId} completed: ${successCount}/${results.length} successful`);
    })
    .catch((err) => {
      writeStatus({
        running: false,
        progress: `Failed: ${err.message}`,
        lastError: err.message,
        finishedAt: new Date().toISOString(),
      });
      log(`Job ${jobId} failed: ${err.message}`);
    });

  return jobId;
}

async function runJob(provider, jobId) {
  if (!BILLS_FOLDER) throw new Error("BILLS_FOLDER not configured");
  if (!fs.existsSync(BILLS_FOLDER)) {
    throw new Error(`BILLS_FOLDER does not exist: ${BILLS_FOLDER}`);
  }

  const accounts = getAccounts(provider);
  if (accounts.length === 0) {
    throw new Error(`No accounts configured for provider: ${provider}`);
  }

  log(`Job ${jobId}: Processing ${accounts.length} account(s)`);
  writeStatus({ progress: `Launching browser...` });

  // Use a persistent context so cookies/localStorage survive between runs.
  // This means after the first successful login, future runs may not need
  // to re-enter credentials (depending on the portal's session length).
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: HEADLESS,
    acceptDownloads: true,
    viewport: { width: 1280, height: 800 },
  });

  const results = [];

  try {
    for (let i = 0; i < accounts.length; i++) {
      const acct = accounts[i];
      const fullLabel = `${acct.provider}-${acct.accountLabel}`;
      writeStatus({
        progress: `Account ${i + 1}/${accounts.length}: ${fullLabel}`,
      });
      log(`[${fullLabel}] Starting download flow`);

      const page = await context.newPage();
      try {
        const result = await acct.flow(page, {
          user: acct.user,
          password: acct.password,
          downloadDir: BILLS_FOLDER,
          accountLabel: acct.accountLabel,
          onProgress: (msg) => {
            log(msg);
            writeStatus({ progress: msg });
          },
        });
        results.push({ ...result, account: fullLabel });
        if (result.success) {
          log(`[${fullLabel}] ✓ Saved to ${result.savedTo}`);
        } else {
          log(`[${fullLabel}] ✗ Failed: ${result.error}`);
        }
      } catch (err) {
        log(`[${fullLabel}] ✗ Exception: ${err.message}`);
        results.push({ success: false, error: err.message, account: fullLabel });
      } finally {
        await page.close().catch(() => { /* ignore */ });
      }
    }
  } finally {
    await context.close().catch(() => { /* ignore */ });
  }

  return results;
}
