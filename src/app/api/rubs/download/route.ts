import { NextResponse } from "next/server";
import { exec } from "child_process";
import fs from "fs";

const DOWNLOAD_SCRIPT = process.env.RUBS_DOWNLOAD_SCRIPT || "";
const PID_FILE = "/tmp/rubs-download.pid";

export const dynamic = "force-dynamic";

// GET — Check download status
export async function GET() {
  const running = isRunning();
  const lastRun = getLastRun();
  return NextResponse.json({
    configured: Boolean(DOWNLOAD_SCRIPT),
    running,
    lastRun,
  });
}

// POST — Trigger bill download
export async function POST(request: Request) {
  if (!DOWNLOAD_SCRIPT) {
    return NextResponse.json(
      { error: "RUBS_DOWNLOAD_SCRIPT environment variable not configured. Set it to the path of your bill download script." },
      { status: 500 }
    );
  }

  if (!fs.existsSync(DOWNLOAD_SCRIPT)) {
    return NextResponse.json(
      { error: `Download script not found: ${DOWNLOAD_SCRIPT}` },
      { status: 404 }
    );
  }

  if (isRunning()) {
    return NextResponse.json(
      { error: "Download is already running" },
      { status: 409 }
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const provider = (body as any).provider || "all";

    // Run script in background, write PID
    const child = exec(
      `bash "${DOWNLOAD_SCRIPT}" "${provider}"`,
      { timeout: 300000 }, // 5 min max
      (error) => {
        // Cleanup PID file when done
        try { fs.unlinkSync(PID_FILE); } catch { /* ignore */ }
        if (error) {
          console.error("[RUBS Download] Script error:", error.message);
        }
      }
    );

    if (child.pid) {
      fs.writeFileSync(PID_FILE, String(child.pid));
    }

    return NextResponse.json({
      ok: true,
      message: `Download started for provider: ${provider}`,
      pid: child.pid,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to start download" },
      { status: 500 }
    );
  }
}

function isRunning(): boolean {
  if (!fs.existsSync(PID_FILE)) return false;
  try {
    const pid = parseInt(fs.readFileSync(PID_FILE, "utf-8").trim());
    // Check if process exists (signal 0 = test only)
    process.kill(pid, 0);
    return true;
  } catch {
    // Process not running, clean up stale PID file
    try { fs.unlinkSync(PID_FILE); } catch { /* ignore */ }
    return false;
  }
}

function getLastRun(): string | null {
  try {
    const logFile = "/tmp/rubs-download.log";
    if (fs.existsSync(logFile)) {
      const stat = fs.statSync(logFile);
      return stat.mtime.toISOString();
    }
  } catch { /* ignore */ }
  return null;
}
