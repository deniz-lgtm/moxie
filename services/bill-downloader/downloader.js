// ============================================
// Moxie Bill Downloader — Computer Use Driver
// ============================================
// Uses Anthropic Computer Use API to drive Chrome through LADWP and SoCal Gas
// login + bill download flows. Runs the agentic loop, executing tool calls
// (screenshots, clicks, typing) on the host Windows machine.
//
// The tool executor uses PowerShell one-liners for screenshots and the
// .NET Forms SendKeys/SendInput APIs for clicks and typing. This avoids
// requiring a native npm package like robotjs which is painful to install.

import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATUS_FILE = path.join(__dirname, "status.json");
const LOG_FILE = path.join(__dirname, "downloader.log");

const DISPLAY_WIDTH = parseInt(process.env.DISPLAY_WIDTH || "1920");
const DISPLAY_HEIGHT = parseInt(process.env.DISPLAY_HEIGHT || "1080");
const BILLS_FOLDER = process.env.BILLS_FOLDER || "";

let currentJob = null; // in-memory state (also persisted to STATUS_FILE)

// ─── Status management ────────────────────────────────────────

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

// ─── Prompt builder ────────────────────────────────────────────

function buildDownloadPrompt(provider) {
  const accounts = [];

  if (provider === "all" || provider === "ladwp") {
    if (process.env.LADWP_USER_1 && process.env.LADWP_PASSWORD_1) {
      accounts.push({
        provider: "LADWP",
        accountLabel: "LADWP Account 1",
        url: "https://myaccount.ladwp.com/",
        user: process.env.LADWP_USER_1,
        password: process.env.LADWP_PASSWORD_1,
      });
    }
    if (process.env.LADWP_USER_2 && process.env.LADWP_PASSWORD_2) {
      accounts.push({
        provider: "LADWP",
        accountLabel: "LADWP Account 2 (Barrett)",
        url: "https://myaccount.ladwp.com/",
        user: process.env.LADWP_USER_2,
        password: process.env.LADWP_PASSWORD_2,
      });
    }
  }

  if (provider === "all" || provider === "socalgas") {
    if (process.env.SOCALGAS_USER_1 && process.env.SOCALGAS_PASSWORD_1) {
      accounts.push({
        provider: "SoCal Gas",
        accountLabel: "SoCal Gas Account 1",
        url: "https://myaccount.socalgas.com/",
        user: process.env.SOCALGAS_USER_1,
        password: process.env.SOCALGAS_PASSWORD_1,
      });
    }
    if (process.env.SOCALGAS_USER_2 && process.env.SOCALGAS_PASSWORD_2) {
      accounts.push({
        provider: "SoCal Gas",
        accountLabel: "SoCal Gas Account 2 (Dorr Holdings)",
        url: "https://myaccount.socalgas.com/",
        user: process.env.SOCALGAS_USER_2,
        password: process.env.SOCALGAS_PASSWORD_2,
      });
    }
  }

  const accountList = accounts
    .map((a, i) => `${i + 1}. ${a.accountLabel}
   URL: ${a.url}
   Username: ${a.user}
   Password: ${a.password}`)
    .join("\n\n");

  return `You are downloading utility bills for a Los Angeles property management company. You must download the most recent bill PDF for each of the following utility accounts and save them to this folder on the Windows machine:

${BILLS_FOLDER}

ACCOUNTS TO PROCESS:

${accountList}

INSTRUCTIONS:
1. Open Chrome (or bring an existing Chrome window to the front)
2. For each account in the list:
   a. Open a new tab and navigate to the login URL
   b. Log in using the provided username and password
   c. If there is a 2FA or verification prompt, pause and report that the user needs to intervene
   d. Navigate to the billing/statements/history page
   e. Find the most recent bill (current month or previous month if current is not yet available)
   f. Click to download the PDF
   g. When the save dialog appears, save it to the bills folder with a descriptive name like "ladwp-acct1-2026-04.pdf" or "socalgas-dorrholdings-2026-04.pdf"
   h. Log out or move to the next account
3. When ALL accounts are done, respond with a summary of what was downloaded.

IMPORTANT:
- Each utility portal looks different. Adapt to what you see on screen.
- If a page is loading, wait a few seconds and take another screenshot before proceeding.
- If you encounter a CAPTCHA, report it and stop for that account.
- Save all PDFs to the exact path: ${BILLS_FOLDER}
- When you finish, explicitly say "DOWNLOAD COMPLETE" in your response.

Start by taking a screenshot to see the current state of the screen.`;
}

// ─── Tool Executor (Windows PowerShell-based) ─────────────────

function runPowerShell(script) {
  const result = spawnSync("powershell.exe", ["-NoProfile", "-Command", script], {
    encoding: "buffer",
    timeout: 30000,
  });
  if (result.status !== 0) {
    const stderr = result.stderr ? result.stderr.toString("utf-8") : "";
    const stdout = result.stdout ? result.stdout.toString("utf-8") : "";
    log(`PowerShell exit ${result.status}: stderr=${stderr.slice(0, 500)} stdout=${stdout.slice(0, 200)}`);
  }
  if (result.error) {
    log(`PowerShell spawn error: ${result.error.message}`);
  }
  return result;
}

function takeScreenshot() {
  const tmpFile = path.join(__dirname, `screenshot-${Date.now()}.png`);
  // PowerShell single-quoted strings are literal — backslashes don't need escaping.
  // BUT single quotes inside the path need to be doubled. Use forward slashes
  // which .NET also accepts on Windows to be extra safe.
  const psPath = tmpFile.replace(/\\/g, "/");
  const ps = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bmp = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
$bmp.Save('${psPath}', [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$bmp.Dispose()
Write-Output "screenshot saved: ${psPath}"
`;
  const result = runPowerShell(ps);
  if (!fs.existsSync(tmpFile)) {
    const stderr = result.stderr ? result.stderr.toString("utf-8") : "";
    const stdout = result.stdout ? result.stdout.toString("utf-8") : "";
    throw new Error(`Screenshot failed (exit=${result.status}). stderr=${stderr.slice(0, 300)} stdout=${stdout.slice(0, 200)}`);
  }
  const buf = fs.readFileSync(tmpFile);
  try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
  return buf.toString("base64");
}

function moveMouse(x, y) {
  const ps = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${x}, ${y})`;
  runPowerShell(ps);
}

function clickMouse(button = "left") {
  const btn = button === "right" ? "0x0008, 0x0010" : "0x0002, 0x0004"; // down, up
  const ps = `
Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, uint dwExtraInfo);' -Name U32 -Namespace W
[W.U32]::mouse_event(${btn.split(",")[0]}, 0, 0, 0, 0)
Start-Sleep -Milliseconds 50
[W.U32]::mouse_event(${btn.split(",")[1]}, 0, 0, 0, 0)
`;
  runPowerShell(ps);
}

function typeText(text) {
  // Escape for PowerShell SendKeys
  const escaped = text
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "''")
    .replace(/[+^%~(){}]/g, (m) => `{${m}}`);
  const ps = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${escaped}')`;
  runPowerShell(ps);
}

function pressKey(key) {
  // Map Anthropic key names to SendKeys syntax
  const keyMap = {
    Return: "{ENTER}",
    Enter: "{ENTER}",
    Tab: "{TAB}",
    Escape: "{ESC}",
    BackSpace: "{BACKSPACE}",
    Delete: "{DELETE}",
    Home: "{HOME}",
    End: "{END}",
    Page_Up: "{PGUP}",
    Page_Down: "{PGDN}",
    Up: "{UP}",
    Down: "{DOWN}",
    Left: "{LEFT}",
    Right: "{RIGHT}",
    space: " ",
  };
  const sendKey = keyMap[key] || key;
  const ps = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${sendKey.replace(/'/g, "''")}')`;
  runPowerShell(ps);
}

async function executeTool(toolName, input) {
  if (toolName !== "computer") {
    return { type: "tool_result", content: `Unknown tool: ${toolName}`, is_error: true };
  }

  const action = input.action;
  log(`Executing: ${action} ${JSON.stringify(input).slice(0, 200)}`);

  try {
    switch (action) {
      case "screenshot": {
        const b64 = takeScreenshot();
        return {
          type: "image",
          source: { type: "base64", media_type: "image/png", data: b64 },
        };
      }
      case "mouse_move": {
        const [x, y] = input.coordinate || [0, 0];
        moveMouse(x, y);
        return { type: "text", text: `Mouse moved to (${x}, ${y})` };
      }
      case "left_click": {
        if (input.coordinate) {
          const [x, y] = input.coordinate;
          moveMouse(x, y);
          await sleep(100);
        }
        clickMouse("left");
        return { type: "text", text: "Left clicked" };
      }
      case "right_click": {
        if (input.coordinate) {
          const [x, y] = input.coordinate;
          moveMouse(x, y);
          await sleep(100);
        }
        clickMouse("right");
        return { type: "text", text: "Right clicked" };
      }
      case "double_click": {
        if (input.coordinate) {
          const [x, y] = input.coordinate;
          moveMouse(x, y);
          await sleep(100);
        }
        clickMouse("left");
        await sleep(50);
        clickMouse("left");
        return { type: "text", text: "Double clicked" };
      }
      case "type": {
        typeText(input.text || "");
        return { type: "text", text: `Typed: ${input.text?.slice(0, 50)}...` };
      }
      case "key": {
        pressKey(input.text || "");
        return { type: "text", text: `Pressed: ${input.text}` };
      }
      case "wait": {
        await sleep((input.duration || 1) * 1000);
        return { type: "text", text: `Waited ${input.duration}s` };
      }
      case "cursor_position": {
        return { type: "text", text: "Cursor position tracking not implemented" };
      }
      default:
        return { type: "text", text: `Unsupported action: ${action}`, is_error: true };
    }
  } catch (err) {
    log(`Tool execution error: ${err.message}`);
    return { type: "text", text: `Error: ${err.message}`, is_error: true };
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Main Agentic Loop ─────────────────────────────────────────

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
  });

  // Run in background
  runAgentLoop(provider, jobId)
    .then(() => {
      writeStatus({
        running: false,
        progress: "Download complete",
        finishedAt: new Date().toISOString(),
      });
      log(`Job ${jobId} completed`);
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

async function runAgentLoop(provider, jobId) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const prompt = buildDownloadPrompt(provider);

  writeStatus({ progress: "Sending initial prompt to Claude..." });

  const messages = [{ role: "user", content: prompt }];

  const tools = [
    {
      type: "computer_20250124",
      name: "computer",
      display_width_px: DISPLAY_WIDTH,
      display_height_px: DISPLAY_HEIGHT,
      display_number: 1,
    },
  ];

  let iterations = 0;
  const maxIterations = parseInt(process.env.MAX_ITERATIONS || "300");

  while (iterations < maxIterations) {
    iterations++;
    writeStatus({ progress: `Agent iteration ${iterations}/${maxIterations}` });

    const response = await client.beta.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 4096,
      tools,
      messages,
      betas: ["computer-use-2025-01-24"],
    });

    log(`Iteration ${iterations}: stop_reason=${response.stop_reason}`);

    // Add assistant message to history
    messages.push({ role: "assistant", content: response.content });

    // Check for text output (progress, completion, etc.)
    const textBlocks = response.content.filter((b) => b.type === "text");
    for (const block of textBlocks) {
      const text = block.text || "";
      if (text.length > 0) {
        log(`Claude: ${text.slice(0, 500)}`);
        // Extract first sentence as progress
        const firstLine = text.split("\n")[0].slice(0, 120);
        writeStatus({ progress: firstLine });

        if (text.includes("DOWNLOAD COMPLETE")) {
          log("Agent reported DOWNLOAD COMPLETE");
          return;
        }
      }
    }

    // End if Claude has nothing more to do
    if (response.stop_reason === "end_turn") {
      log("Agent stopped (end_turn)");
      return;
    }

    // Execute tool calls
    const toolUseBlocks = response.content.filter((b) => b.type === "tool_use");
    if (toolUseBlocks.length === 0) {
      log("No tool calls and no end_turn, stopping");
      return;
    }

    const toolResults = [];
    for (const toolUse of toolUseBlocks) {
      const result = await executeTool(toolUse.name, toolUse.input);
      toolResults.push({
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: result.type === "image" ? [result] : [{ type: "text", text: result.text || "" }],
        is_error: result.is_error || false,
      });
    }

    messages.push({ role: "user", content: toolResults });
  }

  throw new Error(`Agent exceeded max iterations (${maxIterations})`);
}
