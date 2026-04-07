# Moxie Bill File-Server

A tiny Express service that runs on an always-on Windows computer and exposes the local Dropbox utility-bills folder to the Moxie webapp (hosted on Railway) via a public tunnel.

## What this does (and doesn't do)

**Does:**
- Lists PDF files in your Dropbox bills folder (`GET /files`)
- Streams a specific PDF back to the webapp (`GET /files/:name`)
- Authenticates requests with a shared bearer token

**Does NOT:**
- Download bills from LADWP / SoCal Gas. That's handled by **Cowork** (Claude desktop app with Computer Use). See [`COWORK_INSTRUCTIONS.md`](./COWORK_INSTRUCTIONS.md) for the cowork setup.

## Architecture

```
[ Cowork on Windows ]                [ Moxie webapp on Railway ]
      ↓                                          ↓
[ LADWP/SoCal Gas portals ]              [ /api/rubs/import ]
      ↓                                          ↓
[ Dropbox folder ]  ← ← ← ← ← ← ← ← ← ←  [ ngrok tunnel ]
      ↑                                          ↑
[ bill-fileserver on Windows :4401 ] ─────────────┘
```

The user's monthly workflow:
1. Open Moxie webapp → /rubs → "Import Bills" → "Need to download new bills?"
2. Open Cowork on Windows, mount the bills folder, ask it to download this month's bills
3. Bills land in Dropbox folder
4. Click "I've Downloaded the Bills — Scan Now" in the webapp
5. Webapp lists the PDFs (via this fileserver), AI parses them, user confirms import

## Setup (Windows)

### 1. Install Node.js
Install Node.js 20+ from https://nodejs.org/

### 2. Clone the repo
```powershell
cd C:\Users\deniz
git clone <moxie-repo-url> moxie
cd moxie\services\bill-downloader
```

### 3. Install dependencies
```powershell
npm install
```

### 4. Create your `.env`
```powershell
copy .env.example .env
notepad .env
```
Fill in:
- `RUBS_DOWNLOADER_TOKEN` — generate with:
  ```powershell
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- `BILLS_FOLDER` — `C:\Users\deniz\Simpatico Systems Dropbox\Brad Management\MOXIE MANAGEMENT\AI\RUBs\Utility Bills`

### 5. Start ngrok in one PowerShell window
```powershell
ngrok http 4401
```
Copy the `https://...ngrok-free.dev` URL.

### 6. Start the file-server in another PowerShell window
```powershell
cd C:\Users\deniz\moxie\services\bill-downloader
npm start
```

You should see:
```
[bill-fileserver] Listening on http://localhost:4401
[bill-fileserver] Bills folder: C:\Users\...\Utility Bills
```

### 7. Configure Railway
In your Railway project → Variables:
- `RUBS_DOWNLOADER_URL` = the ngrok URL from step 5
- `RUBS_DOWNLOADER_TOKEN` = the same value from your `.env`

### 8. Test
Open the ngrok URL in a browser → you should see service info JSON. Then in the Moxie webapp, go to `/rubs` → Import Bills → "Scan Folder for New Bills". It should list any PDFs in the Dropbox folder (or just be empty if nothing's there yet).

## Auto-start on boot

For "always-on" operation, add Task Scheduler entries that start ngrok and `npm start` when you log in:

1. Open Task Scheduler
2. Create Basic Task → Trigger: "When I log on"
3. Action: Start a program → `C:\Program Files\nodejs\node.exe`
4. Arguments: `C:\Users\deniz\moxie\services\bill-downloader\server.js`
5. Start in: `C:\Users\deniz\moxie\services\bill-downloader`

Repeat for ngrok with Arguments: `http 4401`.

## ngrok URLs change on restart

Free ngrok generates a new URL every time `ngrok http 4401` is restarted. After any reboot or ngrok restart, you'll need to update `RUBS_DOWNLOADER_URL` in Railway with the new URL.

To get a permanent URL, use **Cloudflare Tunnel** (free) or ngrok paid plan.

## Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/` | none | Service info |
| GET | `/health` | none | Health check |
| GET | `/files` | bearer | List PDFs in BILLS_FOLDER |
| GET | `/files/:name` | bearer | Stream a specific PDF |

## Troubleshooting

**Webapp says "Could not reach downloader service"**
- Check that `npm start` is running on Windows
- Check that `ngrok http 4401` is running
- Verify `RUBS_DOWNLOADER_URL` in Railway matches the current ngrok URL

**Webapp says "Downloader service returned 401"**
- The token in Railway doesn't match the one in your local `.env`. Make sure `RUBS_DOWNLOADER_TOKEN` is identical in both places.

**Webapp says "Bills folder not found"**
- Make sure Dropbox is fully synced
- Verify the path in `BILLS_FOLDER` matches exactly (no typos in the long path)
