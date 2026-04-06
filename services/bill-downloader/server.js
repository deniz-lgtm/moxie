// ============================================
// Moxie Bill Downloader — HTTP Server
// ============================================
// Express server exposing endpoints for the Moxie webapp (hosted on Railway)
// to trigger bill downloads, check status, and fetch PDF files.
//
// This service runs on an always-on Windows computer that has Chrome logged
// into LADWP and SoCal Gas. It uses Claude Computer Use to drive Chrome.

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { startDownloadJob, getStatus } from "./downloader.js";

dotenv.config();

const PORT = parseInt(process.env.PORT || "4401");
const TOKEN = process.env.RUBS_DOWNLOADER_TOKEN || "";
const BILLS_FOLDER = process.env.BILLS_FOLDER || "";

if (!TOKEN) {
  console.error("[bill-downloader] FATAL: RUBS_DOWNLOADER_TOKEN not set in .env");
  process.exit(1);
}
if (!BILLS_FOLDER) {
  console.error("[bill-downloader] FATAL: BILLS_FOLDER not set in .env");
  process.exit(1);
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error("[bill-downloader] FATAL: ANTHROPIC_API_KEY not set in .env");
  process.exit(1);
}

// Ensure the bills folder exists
if (!fs.existsSync(BILLS_FOLDER)) {
  console.warn(`[bill-downloader] Bills folder does not exist, creating: ${BILLS_FOLDER}`);
  try {
    fs.mkdirSync(BILLS_FOLDER, { recursive: true });
  } catch (err) {
    console.error(`[bill-downloader] Could not create bills folder: ${err.message}`);
  }
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// ─── Auth middleware ───────────────────────────────────────────

function requireAuth(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token || token !== TOKEN) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

// ─── Routes ────────────────────────────────────────────────────

// Root — friendly landing page
app.get("/", (_req, res) => {
  res.json({
    service: "moxie-bill-downloader",
    status: "running",
    endpoints: [
      "GET /health (no auth)",
      "GET /status (auth required)",
      "POST /download-bills (auth required)",
      "GET /files (auth required)",
      "GET /files/:name (auth required)",
    ],
  });
});

// Health check (no auth)
app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "moxie-bill-downloader",
    billsFolder: BILLS_FOLDER,
    folderExists: fs.existsSync(BILLS_FOLDER),
  });
});

// Get download status
app.get("/status", requireAuth, (_req, res) => {
  res.json(getStatus());
});

// Trigger bill download
app.post("/download-bills", requireAuth, async (req, res) => {
  const { provider = "all" } = req.body || {};
  const status = getStatus();
  if (status.running) {
    return res.status(409).json({ error: "A download job is already running", status });
  }
  if (!["all", "ladwp", "socalgas"].includes(provider)) {
    return res.status(400).json({ error: "Invalid provider. Must be 'all', 'ladwp', or 'socalgas'" });
  }
  try {
    const jobId = startDownloadJob(provider);
    res.json({ ok: true, jobId, message: `Download started for provider: ${provider}` });
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to start download" });
  }
});

// List PDFs in the bills folder
app.get("/files", requireAuth, (_req, res) => {
  try {
    if (!fs.existsSync(BILLS_FOLDER)) {
      return res.status(404).json({ error: `Bills folder not found: ${BILLS_FOLDER}` });
    }
    const entries = fs.readdirSync(BILLS_FOLDER);
    const files = entries
      .filter((f) => f.toLowerCase().endsWith(".pdf"))
      .map((name) => {
        const stat = fs.statSync(path.join(BILLS_FOLDER, name));
        return {
          name,
          size: stat.size,
          modified: stat.mtime.toISOString(),
        };
      })
      .sort((a, b) => b.modified.localeCompare(a.modified));
    res.json({ folder: BILLS_FOLDER, files });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Stream a specific PDF back
app.get("/files/:name", requireAuth, (req, res) => {
  try {
    const safeName = path.basename(req.params.name);
    const filePath = path.join(BILLS_FOLDER, safeName);
    const resolved = path.resolve(filePath);
    const folderResolved = path.resolve(BILLS_FOLDER);

    // Path traversal protection
    if (!resolved.startsWith(folderResolved)) {
      return res.status(400).json({ error: "Invalid filename" });
    }
    if (!fs.existsSync(resolved)) {
      return res.status(404).json({ error: "File not found" });
    }
    if (!resolved.toLowerCase().endsWith(".pdf")) {
      return res.status(400).json({ error: "Only PDF files are allowed" });
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${safeName}"`);
    fs.createReadStream(resolved).pipe(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Start ─────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`[bill-downloader] Listening on http://localhost:${PORT}`);
  console.log(`[bill-downloader] Bills folder: ${BILLS_FOLDER}`);
  console.log(`[bill-downloader] Expose via tunnel (e.g. 'ngrok http ${PORT}') and set that URL in Railway as RUBS_DOWNLOADER_URL`);
});
