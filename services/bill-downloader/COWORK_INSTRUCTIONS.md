# Cowork Setup for Moxie Bill Downloads

This document is for handing back to **Cowork** (Claude desktop app with Computer Use). It explains how Cowork should be configured to download utility bills for the Moxie RUBS system.

## Background

Moxie Management uses a webapp (`moxie` on Railway) to track utility bills for ratio utility billing. The webapp imports bills via AI parsing of PDF files, but those PDFs need to be downloaded from the LADWP and SoCal Gas web portals first. **Cowork is responsible for the download step.**

## Setup (one-time)

### 1. Mount the bills folder
When starting any Cowork session for bill downloads, mount this folder so Cowork can save files into it:

```
C:\Users\deniz\Simpatico Systems Dropbox\Brad Management\MOXIE MANAGEMENT\AI\RUBs\Utility Bills
```

This is a Dropbox-synced folder, so anything Cowork saves here automatically becomes available to the Moxie webapp via the always-on Windows file-server.

### 2. Browser setup
Make sure Chrome on the Windows machine has the user already logged into both portals (Cowork can use the Claude in Chrome extension):
- LADWP: https://myaccount.ladwp.com/ (2 accounts: primary + Barrett)
- SoCal Gas: https://myaccount.socalgas.com/ (2 accounts: primary + Dorr Holdings)

If "Remember this device" is available on either portal, enable it. This avoids 2FA prompts during automated runs.

## The download workflow

When the user asks Cowork to download bills, Cowork should:

1. **For each LADWP account (2 total):**
   - Open a Chrome tab → navigate to https://myaccount.ladwp.com/
   - Log in (use the Claude in Chrome extension's autofill if credentials are saved, or prompt the user)
   - Navigate to Billing → Bill History (or similar)
   - Find the most recent bill
   - Click "Download PDF" (or equivalent)
   - **Save the file to** `C:\Users\deniz\Simpatico Systems Dropbox\Brad Management\MOXIE MANAGEMENT\AI\RUBs\Utility Bills` with a descriptive filename like `ladwp-acct1-2026-04.pdf` or `ladwp-barrett-2026-04.pdf`
   - Log out
   - Repeat for the second LADWP account

2. **For each SoCal Gas account (2 total):**
   - Same process at https://myaccount.socalgas.com/
   - Save as `socalgas-acct1-2026-04.pdf` or `socalgas-dorrholdings-2026-04.pdf`

3. **When all 4 bills are downloaded**, tell the user: "All bills downloaded. You can now go back to the Moxie webapp and click 'I've Downloaded the Bills — Scan Now' to import them."

## Filename conventions

Use this format so the AI parser can match bills to properties even if a filename gets mixed up:
- `<provider>-<account-label>-<YYYY-MM>.pdf`

Examples:
- `ladwp-acct1-2026-04.pdf`
- `ladwp-barrett-2026-04.pdf`
- `socalgas-acct1-2026-04.pdf`
- `socalgas-dorrholdings-2026-04.pdf`

The AI parser doesn't actually rely on the filename — it reads the PDF content to extract the service address, amount, and billing period — so even random filenames like `bill_12345.pdf` will work. The naming convention is just for human organization.

## CAPTCHA / 2FA handling

If a portal throws a CAPTCHA or 2FA challenge:
- **CAPTCHA**: Solve it manually if Cowork can. If it's a "press and hold" type challenge, prompt the user to solve it on the desktop while Cowork waits.
- **2FA**: Pause, ask the user for the code, then continue.

Either way, after the first manual login on a given Chrome profile, future runs should be smoother because the portal remembers the device.

## Multiple accounts

There are 4 separate logins total:
- **LADWP account 1** (primary)
- **LADWP account 2** (Barrett login)
- **SoCal Gas account 1** (primary)
- **SoCal Gas account 2** (Dorr Holdings login)

Credentials should be stored in the user's password manager. Cowork can ask the user for them or use saved Chrome autofill.

## Sample prompt the user will give Cowork

> "Download this month's utility bills. Two LADWP accounts and two SoCal Gas accounts. Save them to the Dropbox folder I mounted. Use filenames like `ladwp-acct1-2026-04.pdf`. Let me know when all 4 are done."

## What happens after Cowork finishes

The user goes back to the Moxie webapp at `/rubs` → Import Bills → clicks **"I've Downloaded the Bills — Scan Now"**. The webapp:

1. Scans the Dropbox folder via the file-server tunnel
2. Lists all PDFs found
3. User selects which to import
4. AI parses each PDF (extracts property address, amount, billing period, utility type)
5. Shows a preview table where user can verify/edit
6. User confirms → bills are saved to the RUBS database

Cowork's job is complete once all 4 PDFs are in the Dropbox folder.

## Troubleshooting

**"I downloaded the bills but the webapp doesn't see them"**
- Verify the files are in the EXACT path: `C:\Users\deniz\Simpatico Systems Dropbox\Brad Management\MOXIE MANAGEMENT\AI\RUBs\Utility Bills`
- Verify the files have a `.pdf` extension (not `.PDF` or anything else — though the file-server treats both the same)
- Verify Dropbox has fully synced (the tray icon should not show "syncing")
- Check that the bill-fileserver service and ngrok are running on the always-on Windows computer

**"LADWP wants me to do a CAPTCHA every time"**
- This is normal for automated tools. Solve it manually each run.
- Long-term fix: enable "Remember this device" on the LADWP account if available, or use a dedicated Chrome profile that builds up trust over time.
