# Moxie Bill Downloader

A local Node.js service that runs on an always-on Windows computer. It uses the Anthropic Claude Computer Use API to log into LADWP and SoCal Gas web portals in Chrome, download the most recent utility bills, and save them to a Dropbox folder. The Moxie webapp (hosted on Railway) triggers this service via a public tunnel.

## What This Does

1. Listens for HTTP requests from the Moxie webapp
2. When triggered, spawns a background job that calls Claude (via the Anthropic Messages API with the `computer-use-2025-01-24` beta) and tells it to download bills for all configured accounts
3. Claude drives Chrome on the local machine: takes screenshots, moves the mouse, types passwords, clicks download buttons
4. PDFs land in the configured bills folder (typically a Dropbox-synced folder)
5. The Moxie webapp then fetches those PDFs through the same tunnel and runs AI extraction on them

## Architecture

```
[Moxie webapp on Railway] 
         ↓ HTTPS + bearer token
[ngrok/Cloudflare tunnel]
         ↓
[bill-downloader Express server on Windows box :4401]
         ↓
[Anthropic Messages API — Claude Sonnet 4.5 with Computer Use]
         ↓
[Windows PowerShell tool executor — screenshot / click / type]
         ↓
[Chrome on local desktop]
         ↓
[PDFs saved to Dropbox folder]
```

## One-time Setup (Windows)

### 1. Install Node.js
Download and install Node.js 20 or later from https://nodejs.org/

### 2. Clone the Moxie repo
```powershell
cd C:\Users\deniz
git clone <moxie-repo-url> moxie
cd moxie\services\bill-downloader
```

### 3. Install dependencies
```powershell
npm install
```

### 4. Create your `.env` file
Copy `.env.example` to `.env` and fill in all the values:

```powershell
copy .env.example .env
notepad .env
```

**Required fields:**
- `RUBS_DOWNLOADER_TOKEN` — a long random string. Generate one with:
  ```powershell
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- `ANTHROPIC_API_KEY` — from https://console.anthropic.com/ (must have Computer Use beta access)
- `BILLS_FOLDER` — the Dropbox path where bills should be saved, e.g.
  `C:\Users\deniz\Simpatico Systems Dropbox\Brad Management\MOXIE MANAGEMENT\AI\RUBs\Utility Bills`
- `LADWP_USER_1` / `LADWP_PASSWORD_1` — your primary LADWP login
- `LADWP_USER_2` / `LADWP_PASSWORD_2` — your Barrett LADWP login
- `SOCALGAS_USER_1` / `SOCALGAS_PASSWORD_1` — your primary SoCal Gas login
- `SOCALGAS_USER_2` / `SOCALGAS_PASSWORD_2` — your Dorr Holdings SoCal Gas login

### 5. Install and start ngrok (or another tunnel)
Download ngrok from https://ngrok.com/ and sign up for a free account. Install it and run:

```powershell
ngrok http 4401
```

You'll see output like:
```
Forwarding  https://abc123-def456.ngrok-free.app -> http://localhost:4401
```

Copy that `https://...ngrok-free.app` URL — you'll use it in Railway.

**Tip:** For a stable URL that doesn't change on restart, use ngrok paid plan, Cloudflare Tunnel, or Tailscale Funnel.

### 6. Start the bill downloader service
In a new PowerShell window:
```powershell
cd C:\Users\deniz\moxie\services\bill-downloader
npm start
```

You should see:
```
[bill-downloader] Listening on http://localhost:4401
[bill-downloader] Bills folder: C:\...\Utility Bills
```

### 7. Configure Railway
Go to your Railway project → Variables and add:
- `RUBS_DOWNLOADER_URL` = the ngrok URL from step 5 (e.g. `https://abc123.ngrok-free.app`)
- `RUBS_DOWNLOADER_TOKEN` = the same random string from step 4

Railway will auto-redeploy.

### 8. Test the connection
Open your Moxie webapp in a browser, go to `/rubs`, click "Import Bills". You should see:
- "Scan Folder" shows any PDFs already in the Dropbox folder
- "Download New Bills" triggers Claude to start the download flow

## Prep Chrome before running

Before clicking "Download New Bills" for the first time, open Chrome on the Windows machine and make sure:
- Chrome is already running and visible on screen
- You're NOT logged into any utility portal (Claude will log in fresh)
- No other windows are blocking Chrome

Claude will take screenshots of your primary monitor and click on it, so keep the Chrome window maximized and don't move your mouse during a download job.

## Running as a Windows Service (auto-start on boot)

For true "always-on" operation, install as a Windows service so it starts automatically and runs in the background:

```powershell
npm run install-windows-service
```

This uses the `node-windows` package. After installation, the service appears in `services.msc` and will restart on reboot.

To uninstall:
```powershell
npm run uninstall-windows-service
```

**Note:** Running as a service means there's no visible desktop session for Computer Use to interact with. You'll need to either:
- Keep the user logged in and use a regular process via Task Scheduler instead, OR
- Use a separate tool like NSSM to run `npm start` as a service in the user's session

For most users, the simplest approach is to add a Task Scheduler entry that runs `npm start` on login:
1. Open Task Scheduler
2. Create Basic Task → Trigger: "When I log on"
3. Action: Start a program → `C:\Program Files\nodejs\node.exe`
4. Arguments: `C:\Users\deniz\moxie\services\bill-downloader\server.js`
5. Start in: `C:\Users\deniz\moxie\services\bill-downloader`

And do the same for ngrok (or use `ngrok service install`).

## Testing endpoints manually

```powershell
# Health check (no auth)
curl http://localhost:4401/health

# List files (requires token)
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:4401/files

# Check status
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:4401/status

# Trigger download
curl -X POST -H "Authorization: Bearer YOUR_TOKEN" -H "Content-Type: application/json" -d "{\"provider\":\"all\"}" http://localhost:4401/download-bills
```

## Logs

- `downloader.log` in this folder — all agent actions and Claude's responses
- `status.json` in this folder — current job status (read by the `/status` endpoint)

## Troubleshooting

**"Screenshot failed"** — PowerShell permissions issue. Make sure Node is not being blocked by antivirus or Windows Defender from invoking PowerShell.

**Claude clicks the wrong spot** — The display dimensions in `.env` (`DISPLAY_WIDTH`, `DISPLAY_HEIGHT`) must match your actual primary monitor resolution. Check Windows Display Settings.

**2FA / CAPTCHA blocks the flow** — Claude will pause and report this. You'll need to disable 2FA on the utility account or pre-authorize the browser session.

**Railway returns "downloader not reachable"** — ngrok tunnel probably died. Restart ngrok and update `RUBS_DOWNLOADER_URL` in Railway.

**Service runs but Claude does nothing** — Make sure `ANTHROPIC_API_KEY` has computer use beta access. Check `downloader.log` for API errors.
