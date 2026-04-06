# Moxie Bill Downloader

A local Node.js service that runs on an always-on Windows computer. It uses **Playwright** (browser automation) to log into LADWP and SoCal Gas web portals, download the most recent utility bills, and save them to a Dropbox folder. The Moxie webapp (hosted on Railway) triggers this service via a public tunnel.

> **Why Playwright instead of Claude Computer Use?** Reliable, fast (~2 min for all 4 accounts vs 20+ min), free (no API costs), works headless (no visible desktop required), and doesn't take over your screen while running.

## Architecture

```
[Moxie webapp on Railway]
         ↓ HTTPS + bearer token
[ngrok/Cloudflare tunnel]
         ↓
[bill-downloader Express server on Windows :4401]
         ↓
[Playwright orchestrator]
         ↓
[Headless Chromium] → [LADWP / SoCal Gas portals]
         ↓
[PDFs saved to Dropbox folder]
```

## One-time Setup (Windows)

### 1. Install Node.js
Install Node.js 20+ from https://nodejs.org/

### 2. Clone the repo
```powershell
cd C:\Users\deniz
git clone <moxie-repo-url> moxie
cd moxie\services\bill-downloader
```

### 3. Install dependencies + Playwright browser
```powershell
npm install
npm run install-browsers
```
The second command downloads Chromium (~150MB) which Playwright uses.

### 4. Create your `.env`
```powershell
copy .env.example .env
notepad .env
```
Fill in:
- `RUBS_DOWNLOADER_TOKEN` — generate a long random string:
  ```powershell
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- `BILLS_FOLDER` — full path to your Dropbox bills folder
- All 4 utility credentials (LADWP_USER_1/2 + LADWP_PASSWORD_1/2, SOCALGAS_USER_1/2 + SOCALGAS_PASSWORD_1/2)
- `HEADLESS=true` (or `false` if you want to watch the browser run during testing)

### 5. Record the LADWP flow (one-time, ~5 min)

This is the key step that replaces hand-written automation. Playwright Codegen will open a real browser and watch you click — every click and field fill becomes code.

```powershell
npm run record-ladwp
```

A browser opens to `https://myaccount.ladwp.com/`. **Click through the entire flow ONE time:**
1. Click the "Log In" button
2. Type your username and password
3. Click "Sign In"
4. Navigate to the bill/billing history page
5. Click "Download PDF" (or whatever the link is) on the most recent bill
6. When the PDF download dialog appears, save it (anywhere — we'll change this in code)

When you're done, **close the browser**. Playwright Codegen will save the recorded clicks to `flows/ladwp.recorded.js`.

Then **copy the relevant lines from `flows/ladwp.recorded.js` into the `downloadBill()` function in `flows/ladwp.js`**, replacing the `// TODO` placeholders. The structure to follow:
- Login section: copy the `await page.fill(...)` and `await page.click(...)` lines for entering credentials
- Navigation section: copy the clicks that go from the dashboard to the bill history page
- Download section: copy the click that triggers the PDF download

The download saving is already handled by the orchestrator — your recorded `download.saveAs(...)` line should be removed and replaced with the existing pattern in `flows/ladwp.js`.

### 6. Record the SoCal Gas flow (same process)

```powershell
npm run record-socalgas
```

Same routine: click through the login → bill download flow once, then copy the steps into `flows/socalgas.js`.

### 7. Test the flows manually

Set `HEADLESS=false` in `.env` so you can watch the browser, then:

```powershell
npm start
```

In another terminal, trigger a download for a single provider to verify:
```powershell
curl -X POST -H "Authorization: Bearer YOUR_TOKEN" -H "Content-Type: application/json" -d "{\"provider\":\"ladwp\"}" http://localhost:4401/download-bills
```

Watch the browser do its thing. Check `downloader.log` and `status.json` for progress.

Once both flows work reliably, set `HEADLESS=true` in `.env` and restart `npm start`.

### 8. Start ngrok and configure Railway

```powershell
ngrok http 4401
```

Copy the `https://...ngrok-free.dev` URL. In your Railway project → Variables, set:
- `RUBS_DOWNLOADER_URL` = the ngrok URL
- `RUBS_DOWNLOADER_TOKEN` = the same token from your local `.env`

### 9. Use it from the Moxie webapp

Open the Moxie webapp → `/rubs` → **Import Bills → Download New Bills**. Watch progress in the UI. When the job completes, click **Scan Folder** → select PDFs → **Parse with AI** → confirm import.

## How the recorded flows work

After recording, your `flows/ladwp.js` should look something like this (the exact selectors depend on what LADWP shows you):

```js
export async function downloadBill(page, options) {
  const { user, password, downloadDir, accountLabel, onProgress } = options;
  try {
    onProgress(`[${accountLabel}] Navigating to LADWP...`);
    await page.goto("https://myaccount.ladwp.com/");

    // ── Login (from your recording) ──
    await page.getByRole('textbox', { name: 'Username' }).fill(user);
    await page.getByRole('textbox', { name: 'Password' }).fill(password);
    await page.getByRole('button', { name: 'Log In' }).click();

    // ── Navigate to bills (from your recording) ──
    await page.getByRole('link', { name: 'Billing & Payment' }).click();
    await page.getByRole('link', { name: 'Bill History' }).click();

    // ── Trigger PDF download ──
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('link', { name: 'Download PDF' }).first().click();
    const download = await downloadPromise;

    const filename = `ladwp-${accountLabel}-${monthStamp()}.pdf`;
    await download.saveAs(`${downloadDir}/${filename}`);
    return { success: true, savedTo: `${downloadDir}/${filename}` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
```

The key insight: **the orchestrator handles credentials, browser launching, and saving PDFs**. Your flow just needs to drive the page from login to "click download."

## Re-recording when portals change

LADWP and SoCal Gas update their websites occasionally. When a flow stops working:
1. Run `npm run record-ladwp` (or socalgas) again
2. Copy the new selectors into the corresponding `flows/*.js`
3. Restart the service

Total time per portal: ~5 minutes.

## Persistent browser profile

The orchestrator uses `browser-profile/` as a persistent Chromium profile directory. This means cookies, saved logins, and "remember this device" tokens survive between runs. After the first successful login, future runs may skip the login step entirely (depending on the portal's session length).

If a flow gets stuck due to a stale cookie, just delete `browser-profile/` and the next run will start fresh.

## Endpoints (unchanged from v1)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | none | Health check |
| GET | `/` | none | Service info |
| GET | `/status` | bearer | Current job status |
| POST | `/download-bills` | bearer | Trigger download (body: `{ provider: "all"|"ladwp"|"socalgas" }`) |
| GET | `/files` | bearer | List PDFs in BILLS_FOLDER |
| GET | `/files/:name` | bearer | Stream a specific PDF |

## Logs

- `downloader.log` — every action and progress message
- `status.json` — current job state (read by `/status`)

## Troubleshooting

**"Account 1/4: ladwp-acct1" then immediate failure**
The recorded selectors don't match what LADWP is showing. Re-record with `npm run record-ladwp` and update `flows/ladwp.js`.

**Login works but bill download fails**
The portal probably changed the bill download link. Re-record just the bill download step and update the relevant section in your flow file.

**Browser keeps asking for 2FA code**
The persistent profile should remember "trusted device" tokens. If 2FA is mandatory every session, you'll need to handle the SMS/email code interactively — Playwright can't read your phone. Options:
- Disable 2FA on the utility account if possible
- Use a TOTP authenticator app and have the flow read codes from a shared file/env var

**"BILLS_FOLDER does not exist"**
Make sure Dropbox is fully synced and the path in `.env` matches exactly (Windows backslashes are fine).

**`npm start` works but Railway can't reach it**
ngrok URL changed. Update `RUBS_DOWNLOADER_URL` in Railway with the current ngrok URL. Consider Cloudflare Tunnel for a permanent URL.
