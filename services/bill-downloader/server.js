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
    // Recursively walk the folder to include PDFs in any subfolder
    const files = [];
    walkPdfs(BILLS_FOLDER, BILLS_FOLDER, files);
    files.sort((a, b) => b.modified.localeCompare(a.modified));
    res.json({ folder: BILLS_FOLDER, files });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Recursively walk a directory, adding all PDFs to the output array.
// Each entry has a "name" that's the path relative to the base folder
// (with forward slashes) so it can be safely URL-encoded.
function walkPdfs(baseFolder, dir, out, depth = 0) {
  // Guard against absurd nesting (infinite symlinks etc.)
  if (depth > 6) return;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkPdfs(baseFolder, fullPath, out, depth + 1);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".pdf")) {
      try {
        const stat = fs.statSync(fullPath);
        const rel = path.relative(baseFolder, fullPath).split(path.sep).join("/");
        out.push({
          name: rel,
          size: stat.size,
          modified: stat.mtime.toISOString(),
        });
      } catch {
        // skip files we can't stat
      }
    }
  }
}

app.get("/files/*", requireAuth, (req, res) => {
  try {
    // Express wildcard captures the full path including subfolders
    const rawName = req.params[0] || "";
    // Normalize to system separator, reject any traversal attempts
    const normalized = rawName.split("/").map((s) => path.basename(s)).join(path.sep);
    const filePath = path.join(BILLS_FOLDER, normalized);
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

    const safeName = path.basename(resolved);
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
