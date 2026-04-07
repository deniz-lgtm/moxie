// ============================================
// Moxie Bill File-Server
// ============================================
// Lightweight Express server that exposes the local Dropbox utility bills
// folder to the Moxie webapp (hosted on Railway) via a public tunnel.
//
// The actual bill DOWNLOAD from LADWP/SoCal Gas is handled separately by
// Cowork (Claude Computer Use desktop app). Cowork saves PDFs into the
// Dropbox folder. This service just lets the webapp read those files.

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

const PORT = parseInt(process.env.PORT || "4401");
const TOKEN = process.env.RUBS_DOWNLOADER_TOKEN || "";
const BILLS_FOLDER = process.env.BILLS_FOLDER || "";

if (!TOKEN) {
  console.error("[bill-fileserver] FATAL: RUBS_DOWNLOADER_TOKEN not set in .env");
  process.exit(1);
}
if (!BILLS_FOLDER) {
  console.error("[bill-fileserver] FATAL: BILLS_FOLDER not set in .env");
  process.exit(1);
}

if (!fs.existsSync(BILLS_FOLDER)) {
  console.warn(`[bill-fileserver] Bills folder does not exist, creating: ${BILLS_FOLDER}`);
  try {
    fs.mkdirSync(BILLS_FOLDER, { recursive: true });
  } catch (err) {
    console.error(`[bill-fileserver] Could not create bills folder: ${err.message}`);
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

app.get("/", (_req, res) => {
  res.json({
    service: "moxie-bill-fileserver",
    status: "running",
    purpose: "Exposes the local Dropbox utility bills folder over an authenticated tunnel for the Moxie webapp",
    endpoints: [
      "GET /health (no auth)",
      "GET /files (auth required)",
      "GET /files/:name (auth required)",
    ],
  });
});

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "moxie-bill-fileserver",
    billsFolder: BILLS_FOLDER,
    folderExists: fs.existsSync(BILLS_FOLDER),
  });
});

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

app.get("/files/:name", requireAuth, (req, res) => {
  try {
    const safeName = path.basename(req.params.name);
    const filePath = path.join(BILLS_FOLDER, safeName);
    const resolved = path.resolve(filePath);
    const folderResolved = path.resolve(BILLS_FOLDER);

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
  console.log(`[bill-fileserver] Listening on http://localhost:${PORT}`);
  console.log(`[bill-fileserver] Bills folder: ${BILLS_FOLDER}`);
  console.log(`[bill-fileserver] Expose via tunnel (e.g. 'ngrok http ${PORT}') and set that URL in Railway as RUBS_DOWNLOADER_URL`);
});
