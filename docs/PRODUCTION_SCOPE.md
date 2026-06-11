# Moxie — Engineering Handoff & Production Readiness Scope

**Audience:** the engineer taking over this codebase. This document covers
(1) what the system is and how it's wired, (2) a module-by-module scope of
what's real vs. prototype, (3) a register of audited defects — those already
fixed on this branch and those still open — and (4) a recommended plan to
production with rough effort. Effort ranges are order-of-magnitude planning
inputs, not a quote.

> One-paragraph status: Moxie is a working internal tool / advanced prototype.
> The core workflows (move-out inspections, RUBS billing, work-order ops,
> showings) function end-to-end and are used day-to-day, but the platform has
> **no server-side authentication, no tests, no CI, no observability**, and a
> few features still persist only to browser localStorage. A field-reliability
> audit (June 2026) fixed the worst cellular/network bugs (§4), but the
> platform gaps in §2 dominate the work remaining.

---

## 0. Business context (read this first)

**Moxie Management is the premier off-campus student-housing property manager at
USC.** That single fact drives almost every design decision in this app:

- **Lean team, ~1,000+ units.** A small staff manages a very large portfolio,
  so the product's core job is to let one person do what would normally take
  several — heavy automation and AI assistance are not nice-to-haves, they're
  the point.
- **The entire portfolio turns over at once.** Students move out **July 31** and
  the next cohort moves in **August 15**. Everything — move-out inspections,
  deposit accounting, repairs/cleaning/turns, new leases — is compressed into a
  ~2-week window across the whole portfolio, every year. Tools that are merely
  "fine" at normal cadence fall over under this synchronized peak; throughput
  and reliability during the turn are the real acceptance criteria.
- **Legally regulated, adversarial counterparty.** Security-deposit handling is
  governed by California law (Civil Code §1950.5: itemized deductions,
  documentation, strict return deadlines). The tenants are tech-savvy students
  who increasingly **use AI to dispute deductions** and to challenge late
  returns. So outputs must be fast, consistent, well-documented, and
  defensible — sloppy or late paperwork is a direct financial and legal risk.

Keep this in mind reading the module scopes: features exist to collapse
multi-person manual workflows into one-person, phone-first, AI-assisted ones,
and to survive a once-a-year throughput spike under legal deadlines.

---

## 1. System map

**Stack:** Next.js 16 (App Router) + React 19 + TypeScript (strict) + Tailwind 4.
Deployed on Vercel (no `vercel.json`; defaults). ~35–40k LOC. Zero test files.

**Persistence:** Supabase (Postgres + Storage + Auth), single project
`muqogvuahmuaayrjhxft`, shared by dev and prod. ~40 SQL migrations in
`supabase/migrations/` — the repo is the source of truth, but they are applied
**manually** (see `CLAUDE.md`); there is no migration CI.
⚠️ **There is no checked-in migration for the `inspections` table** — the
deployed schema predates the convention. Reverse-engineer it into a migration
before standing up any second environment.

**External integrations:**

| Service | Use | Auth | Notes |
|---|---|---|---|
| AppFolio v2 Reports API | Properties, units, tenants, work orders, applications, showings | HTTP Basic (`APPFOLIO_CLIENT_ID/SECRET`) | Read-mostly; writes = guest-card creation. Hardcoded `portfolio_id = 24` in `src/lib/data.ts`. Rate limit 7 req/15s with backoff in `src/lib/appfolio.ts`. |
| Anthropic Claude (Haiku 4.5) | Inspection photo analysis, floor-plan room detection, utility-bill parsing, work-order classify/summarize/translate, meeting action extraction | `ANTHROPIC_API_KEY` (server-side only) | No rate limiting, quotas, or spend tracking. |
| Dropbox Sign | E-signature (1 template: deposit-refund) | `HELLOSIGN_API_KEY`; HMAC-verified webhook | `HELLOSIGN_TEST_MODE=1` default — must be unset in prod. |
| Notion | Vendor directory two-way sync, roadmap | `NOTION_API_KEY` | Last-write-wins by timestamp. |
| Bill-downloader (`services/bill-downloader/`) | Legacy RUBS PDF source | Shared bearer token | Node service on an always-on **Windows desktop behind an ngrok tunnel**. Newer flow uses Supabase Storage upload instead — finish that migration and retire this. |

**Client/server split that matters:** the login (`AuthGate`/`AuthProvider`) is a
client-side UI gate over Supabase Auth. **No API route verifies a session.**
Supabase RLS is enabled but every policy is `using (true)` for `anon` +
`authenticated`. Treat every endpoint and table as publicly writable today.

---

## 2. Platform gaps (the bulk of the work)

1. **Server-side authN/authZ** — verify the Supabase JWT in every `/api/**`
   route (clients must start sending the access token), add roles, rewrite RLS
   for real isolation, signed URLs for the public `inspection-files` bucket.
   *~2–3 wks.*
2. **Data consolidation** — comp-watch, vendors detail, reports, notices,
   unit-turns, capital projects and some tour data still localStorage-first;
   migrate to Supabase (several `*-db.ts` libs + migrations already exist as
   the pattern). *~2–3 wks.*
3. **CI/CD + tests** — GitHub Actions (lint/typecheck/build), unit tests for
   the money paths first (RUBS allocation, deduction math), migration CI.
   *~2–3 wks.*
4. **Observability** — Sentry (or similar), structured logs, error boundaries
   beyond the single `InspectionErrorBoundary`, AppFolio outage fallback/cache.
   *~1–2 wks.*
5. **AI/infra cost controls** — rate limits + dedup on Claude endpoints; spend
   alerts. *~1 wk.*
6. **Environments** — a staging Supabase project + AppFolio sandbox story;
   today schema changes hit live data. *~0.5–1 wk.*

**Platform subtotal ≈ 8–12 weeks.**

---

## 3. Module scopes

### 3.1 Move-out inspections — flagship, ~85% complete (~7,300 LOC)

**Purpose & goal.** This is the highest-stakes workflow in the business because
of the synchronized July 31 move-out (§0). **The old process:** two property
managers walk every unit together — one shooting photos, the other recording
voice notes on what to clean/repair/deduct — across 1,000+ units in days. Then
an admin replays the voice notes to guess deductions and amounts, schedules
contractors/maintenance/cleaners per unit, and hand-prepares each tenant's legal
deposit-return paperwork. Tenants then dispute the deductions (often with AI) and
challenge any late deposit return. It's slow, two-person, error-prone, and
legally exposed at the worst possible time of year.

**What we're building:** collapse that into a **one-person, phone-only** flow.
AppFolio pre-populates the units with a move-out; floor plans (pre-loaded before
the turn, with AI naming the rooms — Bedroom 1, Bedroom 2, …) give the PM a
ready room-by-room checklist. The PM walks each unit on their own phone,
photographing only the items to repair or deduct, saves, and moves to the next
unit. **Then, from a computer,** an admin reviews each inspection: AI proposes a
deduction (description + amount) per photo, the admin accepts or edits it, and on
finalize the system auto-generates the legally-compliant PDFs — disposition
letter, itemized deposit return with explanations, and a **matching contractor
invoice that ties to the deductions** — for the admin to send. The outcome we
want: faster turns, consistent and defensible §1950.5 documentation, deposits
returned on time, and far fewer successful disputes — all achievable by a lean
team during the two-week crunch.

Wizard: unit select (auto-populated from AppFolio deposits) → floor-plan upload
+ AI room detection → guided camera walk (`InspectionCamera.tsx`, photos
compressed to 1920px and timestamp-stamped) → per-photo Claude Vision damage
analysis with LA-market cost estimates → human deduction review with edit
history → four CA §1950.5 PDFs via jsPDF (`src/lib/pdf-invoice.ts`, includes
contractor invoice using vendor labor rates). Offline-first: debounced save
queue (`useSaveQueue`) + localStorage offline queue with replay.

Still missing: tenant email dispatch (UI exists, no send), signature-panel
wiring, panorama capture UI, the `inspections` table migration (above), photo
pre-fetch for PDFs is memory-heavy at scale, AI analysis is serial (n photos =
n × ~10–30s). Move-in is a lighter working page; quarterly/punch-list/
onboarding are thin.

### 3.2 RUBS — works end-to-end; money path (~6,300 LOC)

**Purpose & goal.** Run by the **admin**. Moxie recovers utility costs from
students, but the **scattered-site portfolio makes the metering genuinely
messy**: on one property a single water meter may cover *all* units while
electric meters each cover only *some* units. That irregularity is exactly why
off-the-shelf RUBS products have failed here in the past. **Today** the admin
keeps an elementary spreadsheet encoding the mapping and splits (e.g. 3 units ×
5 tenants = 15 tenants on this water meter), and every billing cycle (~monthly
or every two months) she reads each bill off the utility websites, types the
figures into her spreadsheet, downloads AppFolio's **blank charge template**
(pre-filled with the right properties), fills it in by hand, and uploads it back
to AppFolio — which is what actually charges the students. **This takes a couple
of days each cycle and a lot of utilities get missed** (i.e. lost revenue) in
the manual shuffle.

**What we're building (and are close to):** a Cowork agent that already holds
the utility logins downloads every bill automatically; the system imports the
meter→unit mapping and the blank AppFolio template; the admin uploads the bills,
and because everything is already mapped, metered, and templated, **a few clicks
allocates every bill and writes the result straight back into the AppFolio
spreadsheet, ready to upload as-is** — with a review step in between. The goal is
to turn a ~2-day, error-prone monthly chore into a few minutes of clicking,
while capturing utilities that previously slipped through. Because this posts
real charges to students, **accuracy and an audit trail matter more than
anywhere else in the app.**

Bills (LADWP/SoCal Gas PDFs) → Claude extraction (`rubs-bill-parser.ts`) →
fuzzy property matching with aliases (`rubs-property-resolver.ts`) → meter→unit
mappings (CSV import) → allocation (`rubs-calc.ts`: sqft/occupancy/equal/custom,
integer-cent rounding, owner-absorbs-vacancy) → AppFolio Bulk-Charges CSV
export with occupancy reconciliation. Dedup by SHA-256 + service period.
**The allocation math was independently audited and is correct** (integer
cents, remainder to largest fractional shares, sums exact).

Priorities: retire the Windows/ngrok downloader (Supabase Storage path already
exists); add an audit log (who changed which bill); unit-test the calc; tighten
the fuzzy matcher (see register #O4); periodic occupancy sync from AppFolio.

### 3.3 Leasing / applications / signing (~3,600 LOC)

**Purpose & goal.** *(Lower priority than inspections/RUBS.)* Moxie continues to
run leasing **on AppFolio** — this module is not trying to replace it. The
specific pain it targets is the **document-collection gap in the application
process**. An application can have **multiple tenants tied to it** (groups of
students sharing a unit), and partway through, the process **falls out of
AppFolio**: applicants and their **parents/guarantors email documents to the
admin**, where they pile up in a mailbox. Leasing staff then spend their time
**chasing people** to submit the missing pieces so the application can be
completed and the unit locked down — a real bottleneck when the whole portfolio
is leasing toward the same Aug 15 move-in.

**What we're building:** essentially a **leasing-application tracker** (similar
in spirit to EliseAI's) that sits alongside AppFolio and (a) **auto-nudges**
applicants/guarantors for outstanding items, and (b) gives students **one place
to upload the required documents**, which then get **attached to the right
application automatically** — getting docs out of the admin's inbox and shrinking
the time-to-complete-and-sign. The outcome: fewer stalled applications, less
manual chasing, faster lockdown of units.

Working: open-house slots with public signup (`/s/[token]`), capacity logic,
AppFolio 1-on-1 showing shadows + promotion, push-to-AppFolio guest cards,
Dropbox Sign send + HMAC-verified webhook + signed-PDF storage.
Prototype: `/leasing/applications` is a read-only AppFolio view; `/apply/[id]`
is mock data (intended to become a token-authed public portal); the public
signing page `/s/[token]/signing` is not built; only one signing template.
Public-route hardening needed: token entropy/rate limiting, registration
validation, a registration capacity transaction (register #O2).

### 3.4 Maintenance & vendors (~8,500 LOC incl. shared data layer)

**Purpose & goal.** Today this module is about **getting proactive with
maintenance** — it is intentionally not trying to replace AppFolio, which all
work orders still flow through. **Step one (now):** let AI **learn and
categorize** the maintenance issues coming in so the team can **see trends**
(what's breaking, where, how often) and make decisions from that data — and
surface **problem tenants** (repeat/abusive requesters). **Step two (next):**
connect **WhatsApp** so the team can dispatch a maintenance tech a unit and the
list of items to fix, **auto-translated into Spanish** so the tech understands
it. The outcome: shift from reactive ticket-handling to data-driven, proactive
maintenance, with faster and clearer dispatch to Spanish-speaking techs — all
while AppFolio stays the system of record.

Working: manual AppFolio work-order sync into `work_orders` +
`work_order_annotations` overlay (Moxie edits survive re-sync), Claude
classify/summarize/translate with keyword fallbacks and server-side caching,
analytics dashboard, vendor directory with two-way Notion sync and labor rates.
Needed: a cron schedule for sync (Vercel Cron), reconciliation audit trail,
length-validation on AI batch responses (register #O5), Notion soft-deletes.

### 3.5 Marketing / "SEO" (~1,500 LOC) — prototype

Polished UI, but: SEO metrics, keywords, content library/calendar, monthly
report are all hardcoded mock data; the "AI generator" is a 2-second fake
delay with canned copy (no Claude call); nothing persists (no tables, no write
routes). The only real feature is prospect/lead-source tracking
(`/api/appfolio/prospect-sources`). There is also no actual SEO machinery
(no `generateMetadata`, sitemap, robots, structured data) anywhere in the app.
**Decision needed: build it for real (~3–4 wks) or descope.**

### 3.6 Secondary modules

Meetings (Supabase, recorder + AI action items), Tasks (Supabase + AI next
step), Floor-plan library (Supabase, feeds inspections), Portfolio dashboard
(AppFolio read-only, biggest page), Capital projects / notices / unit-turns /
comp-watch / reports / tours (functional UIs, several localStorage-only —
roll into platform item 2), Users (Supabase service-role admin API), Team
calendar, Notion roadmap.

---

## 4. June 2026 audit — defect register

A code audit (all main modules + shared infra) was run on 2026-06-11,
triggered in part by a field report: **“works on WiFi but not on cellular.”**

### 4.1 Cellular root cause (diagnosed, fixed)

The inspection flow is the cellular-heavy path (photos captured in the field).
Four compounding defects explain WiFi-works/cellular-fails:

1. **Failed photo uploads silently embedded multi-MB base64 into the
   inspection record.** `uploadPhoto()` in `src/lib/inspections-db.ts`
   returned the base64 data URL as the "uploaded URL" whenever Supabase
   Storage errored — and the server upload route happily returned it with
   HTTP 200. From then on, *every* autosave carried megabytes of inline
   images. WiFi absorbed it; cellular requests stalled or failed.
2. **The autosave used `keepalive: true` unconditionally.** Browsers reject
   keepalive bodies over ~64KB with an immediate "Failed to fetch", so once an
   inspection grew past that (AI text + edit history — even without bug #1),
   saves failed deterministically.
3. **No fetch had a timeout.** On weak cellular, `navigator.onLine` stays
   `true` while sockets stall for minutes; the save queue sat in "saving"
   forever and the offline queue never engaged (it only armed on the browser's
   `offline` event, which cellular rarely fires).
4. **Failures were reported as success.** `saveInspectionToDb()` logged
   Supabase errors and returned normally, so the API returned `{ok:true}` and
   the UI showed "saved" for writes that never happened. Similarly, AI
   analysis timeouts/truncations were recorded as a fabricated
   `condition: "fair", damage_items: []` — i.e. slow networks could silently
   erase damage findings from legal deduction documents.

### 4.2 Fixed on this branch (commit-by-commit in PR #131)

| # | Fix | Files |
|---|-----|-------|
| F1 | Storage/DB failures now **throw** instead of returning fake success or base64 fallbacks (uploads, save, delete, bulk-create) | `src/lib/inspections-db.ts` |
| F2 | Autosave: `keepalive` only for <60KB bodies; 30s `AbortSignal.timeout`; network-level failures persist the snapshot to the offline queue and surface the error | `src/app/inspections/move-out/page.tsx` |
| F3 | Offline queue: per-inspection `dedupeKey` (latest snapshot only — a stale replay can no longer roll back newer data); queued entries cleared on successful live save; 30s timeout per replay; **replay now runs on mount + every 60s**, not only on the `online` event | `src/lib/offline-queue.ts`, move-out page |
| F4 | Photo upload + AI analyze fetches bounded with 60s timeouts (camera component and both analyze loops) so one stalled request can't hang a batch | move-out page, `src/components/InspectionCamera.tsx` |
| F5 | AI analysis **throws** on timeout / API error / truncated JSON instead of fabricating "fair, no damage" — failed photos land in the existing failed-list with per-item retry UI | `src/lib/ai-analysis.ts` |
| F6 | AppFolio pagination failure now throws instead of silently returning a **partial** dataset (previously: missing units/tenants/work orders with no signal) | `src/lib/appfolio.ts` |
| F7 | Work-order sync skips "mark missing as closed" reconciliation when AppFolio returns zero rows (an outage would have closed every work order) | `src/app/api/maintenance/sync/route.ts` |
| F8 | Dropbox Sign webhook ACKs (200) on HMAC failure without processing — non-2xx responses cause Dropbox to disable the callback permanently | `src/app/api/webhooks/dropbox-sign/route.ts` |
| F9 | RUBS calculate: rejects missing/empty `units` (400), refuses to mark a bill "calculated" with zero allocations (422), refuses to recalculate a **posted** bill (409) | `src/app/api/rubs/calculate/route.ts` |
| F10 | Fire-and-forget saves on move-in/quarterly/punch-list/onboarding pages now catch and alert on failure | 4 inspection pages |

`npx tsc --noEmit` and `next build` pass after these changes.

### 4.3 Outstanding (audited, not yet fixed) — prioritized

| # | Issue | Where | Why it matters / suggested fix |
|---|-------|-------|--------------------------------|
| O1 | **No server-side auth anywhere** | all `/api/**`, RLS | §2 item 1. The defining production blocker. |
| O2 | Showing registration capacity check is read-then-write — concurrent signups can overbook | `api/showings/registrations/route.ts:74-84` | Enforce in Postgres (constraint/trigger or `select … for update` RPC). Needs a migration. |
| O3 | RUBS Supabase failures fall back to localStorage and report success | `src/lib/rubs-db.ts` (multiple) | Same class as F1; surface sync failures to the caller. |
| O4 | Property fuzzy-matcher allows substring cross-matches ("Main St" ↔ "Main St Plaza") | `rubs-property-resolver.ts:216` | Human-confirmed in the import preview today, but tighten before automating; add tests with the real portfolio names. |
| O5 | AI batch endpoints don't validate response length/shape — short responses silently fall back per item | `api/maintenance/classify/route.ts:136-154`, `summarize` | Validate `parsed.length === valid.length`; flag fallback results. |
| O6 | Bill parser uses Claude JSON with minimal validation (only `totalAmount > 0`) | `rubs-bill-parser.ts:118` | Schema-validate required fields before save. |
| O7 | CSV import: short rows silently become empty cells; account-number strip unvalidated | `rubs-csv-import.ts:148, 238` | Add row-length + `^\d+$` validation with warnings. |
| O8 | Export total summed in floats; amounts round-trip through strings | `rubs-appfolio-export.ts:294, 322` | Sum in integer cents. |
| O9 | Signed-PDF upload failure leaves `status='signed'` with no PDF and no retry path | `signing-db.ts:168-185`, webhook | Return structured result; add retry. |
| O10 | Notion vendor sync: clock-skew can silently overwrite local edits; no tombstones | `api/vendors/sync/route.ts:139` | Tie-breaker + soft deletes. |
| O11 | Page-level fetch hygiene: most pages use `Promise.all` + `.catch(() => ({}))` with no timeouts; dashboard hides timeout behind a blank screen | `portfolio/page.tsx:415`, `leasing/units:177`, `maintenance:334`, `page.tsx:138` | Introduce one `fetchJSON(url, {timeoutMs})` helper; `allSettled` + per-section skeletons. Biggest *remaining* cellular UX item. |
| O12 | localStorage quota failures silent (portfolio choice, queue writes) | `PortfolioContext.tsx:35` | Surface a warning; relevant on photo-heavy devices. |
| O13 | No `inspections` table migration in repo | `supabase/migrations/` | Blocks any new environment. |
| O14 | Upload endpoint: no MIME whitelist; public bucket URLs guessable | `api/inspections/upload`, Storage | Whitelist + signed URLs (with §2 item 1). |
| O15 | Duplicate-send risk on signing (no idempotency key) | `api/signing/send` | Accept idempotency key. |

Verified-correct in the audit (don't re-litigate): RUBS penny-rounding math,
Dropbox HMAC crypto (timing-safe), Notion pagination, AppFolio rate-limit
backoff.

---

## 5. Suggested plan

1. **Phase 0 — platform (8–12 wks):** §2 items; fold in O1, O13, O14, O3, O11.
2. **Phase 1 — money/legal hardening (~3–4 wks):** RUBS O4–O8 + audit log +
   calc tests + retire ngrok downloader; inspections tenant-email/signature
   completion + parallel AI analysis + PDF memory fix.
3. **Phase 2 — ops (~2–3 wks):** maintenance cron sync + O5; leasing O2, O9,
   O15 + public signing portal + applicant intake (or explicit descope).
4. **Phase 3 — marketing decision (0 or ~3–4 wks):** build real or descope.

## 6. Open questions for the team

- Single-org forever, or multi-tenant? (Drives the entire auth/RLS design.)
- AppFolio write scope beyond guest cards?
- Marketing/SEO: real build or descope?
- Confirm RUBS bills can move 100% to in-app upload (retire Windows box).
- Compliance posture: PII retention/encryption; legal review of generated
  §1950.5 documents and e-sign flow.
- Anthropic + AppFolio budget ceilings (to size rate limits sensibly).
