# Moxie — Production Readiness Scope

**Purpose:** A handoff document for an engineer evaluating what it takes to bring
the Moxie property-management app to production. It describes each major module
(what it does, what is real vs. prototype, the gaps that block production) plus
the platform-wide issues that cut across everything. Rough effort ranges are
given to support a proposal/estimate — they are order-of-magnitude, not a quote.

> Status snapshot: this is a working internal tool / advanced prototype. The core
> workflows demo well and several are genuinely useful day-to-day, but there is
> **no server-side authentication, no test suite, no CI, and several features run
> on browser localStorage only.** The foundational platform work below will likely
> dominate the budget more than any single feature.

---

## 1. System overview

- **Stack:** Next.js 16 (App Router) + React 19, TypeScript (strict), Tailwind v4.
- **Backend:** Supabase (Postgres + Storage + Auth) — single project, ref
  `muqogvuahmuaayrjhxft`. ~40 SQL migrations, applied **by hand** via the Supabase
  MCP tool (no migration CI; see `CLAUDE.md`).
- **External integrations:**
  - **AppFolio** (property-management system) — read-only reports API, single
    hardcoded portfolio (`portfolio_id = 24`), HTTP Basic auth. One write path
    exists: creating guest cards from showing registrations.
  - **Anthropic Claude** (Haiku 4.5) — photo damage analysis, utility-bill
    parsing, work-order classification/summarization/translation, meeting action
    extraction, task next-step suggestions.
  - **Dropbox Sign / HelloSign** — e-signature (one template wired today).
  - **Notion** — vendor directory sync, roadmap.
  - **Bill-downloader** — a Node/Express service that runs on an **always-on
    Windows desktop** and is exposed to the app via an **ngrok tunnel** (see
    `services/bill-downloader/`).
- **Deployment:** Vercel (assumed; no `vercel.json`, empty `next.config.ts`).
- **Code size:** ~35–40k LOC of app/lib code. No tests.

### Top platform-blocking risks (read this first)

| # | Risk | Why it blocks production |
|---|------|--------------------------|
| 1 | **No server-side auth on API routes.** The `AuthGate` is a client-side UI gate only; every `/api/**` route runs with no session/user check. | Anyone who can reach the URLs can read or modify *all* company data — inspections, RUBS billing, work orders, vendors, signing requests. |
| 2 | **RLS is effectively off.** Tables enable RLS but with permissive `using (true)` policies for `anon` + `authenticated`. | Supabase enforces no row-level isolation; the only thing standing between a caller and the data is app code that doesn't check identity. |
| 3 | **localStorage is the system of record for ~10 features** (tours, comp-watch, vendors detail, reports, notices, unit-turns, capital projects, etc.). | No multi-user / multi-device sync; data lives in one browser and is lost when it's cleared. Breaks team collaboration. |
| 4 | **RUBS bill ingestion depends on a Windows desktop + ngrok tunnel.** | A consumer machine and a free tunnel are a single point of failure for a money-touching workflow. |
| 5 | **No tests, no CI, no monitoring/observability.** | Can't refactor or deploy safely; production failures are silent. |
| 6 | **Uncontrolled Claude/AppFolio spend & failure modes.** No rate limits, quotas, caching guarantees, or graceful fallback when AppFolio is down. | Cost spikes; pages hard-fail on upstream outage. |

---

## 2. Platform / cross-cutting work (do this before or alongside feature hardening)

These items are not owned by any one module; they affect all of them and are the
backbone of the estimate.

1. **AuthN/AuthZ + RBAC.** Verify the Supabase session server-side on every API
   route; introduce roles (admin / PM / read-only) and property-level scoping;
   rewrite RLS policies to actually isolate rows. *~2–3 weeks.*
2. **Data consolidation.** Migrate localStorage-only features into Supabase; add a
   real sync/offline strategy (an `offline-queue.ts` exists but is only used by
   inspections). *~2–3 weeks.*
3. **Observability & resilience.** Error tracking (e.g. Sentry), structured logging,
   error boundaries on all pages (only inspections has one today), and a cache/
   fallback for AppFolio outages. *~1–2 weeks.*
4. **CI/CD + testing.** GitHub Actions (lint, typecheck, test gates), a test suite
   (currently zero), and **migration CI** so schema changes stop being applied by
   hand. *~2–3 weeks.*
5. **Cost & rate controls.** Rate limiting + de-duplication + spend tracking on
   Claude and AppFolio calls; input size validation before sending images to AI.
   *~1 week.*
6. **Secrets & environments.** Establish staging vs. prod (today there is one
   Supabase project and one AppFolio portfolio — schema changes hit live data
   immediately); document Vercel env management. *~0.5–1 week.*

**Foundational subtotal: ~8–12 weeks** before/around feature-level hardening.

---

## 3. Module scopes

### 3.1 Move-out inspections (primary)

**What it does.** A guided move-out workflow: pick a unit (auto-populated from
AppFolio deposits) → upload a floor plan (PDF/image) → AI auto-detects rooms →
room-by-room camera walk → **per-photo Claude Vision damage analysis** (forensic
description + tenant-facing review + LA-market repair-cost estimate) → manual
deduction review with edit history → generate CA Civil Code §1950.5-compliant
PDFs (deposit deduction statement, disposition letter, contractor report,
contractor invoice with vendor labor rate). Offline-capture with replay to
Supabase. Four lighter inspection types also exist (move-in, quarterly, punch
list, onboarding) — move-in is partial; the others are stubs.

**Real vs. prototype.** Core move-out flow is ~85% functional end-to-end and is
the most sophisticated part of the app (AI quality is high, offline-first is
robust). **Stubbed/missing:** tenant email send (UI selects tenants but never
dispatches), send-for-signature wiring, panorama capture.

**Production gaps.**
- **No inspections table migration exists in the repo** — schema is assumed to
  already live in the deployed DB. A new environment would fail. *(Confirm/author this migration.)*
- No auth/validation on `/api/inspections/*` (CRUD accepts arbitrary JSON; upload
  endpoint has no MIME/type check; storage URLs are public/guessable).
- Serial AI calls (100 photos ≈ 50+ min, 100 billable calls, no rate limit).
- PDF generation pre-loads all photos as base64 → browser OOM risk at scale.
- AppFolio units fetch isn't paginated; AI failure silently returns "fair/no damage."

**Size / effort.** ~7,300 LOC (move-out page alone is ~2,750; `pdf-invoice.ts`
~1,683). Rough hardening: **~25–40 engineer-days** (auth, validation, migration,
error handling, signature/email, perf, tests).

---

### 3.2 RUBS — utility bill allocation (money-touching)

**What it does.** Ingests utility bills (LADWP, SoCal Gas), parses them with Claude
Vision (provider, address, amount, period, meter), fuzzy-matches to properties,
maps meters → units, then **allocates each bill across tenants** (by sqft /
occupancy / equal / custom) with penny-accurate rounding and an
"owner-absorbs-vacancy" option. De-dupes by file hash + service period. Exports
AppFolio "Bulk Charges" CSV after reconciling against occupancy. Bills arrive
either via Supabase Storage upload (newer) or the Windows bill-downloader (legacy).

**Real vs. prototype.** Core workflow works end-to-end and has been used on real
bills. Calculation, dedup, property resolver, CSV import, and AppFolio export are
all functional.

**Production gaps.**
- **Bill-downloader on a Windows desktop behind ngrok** is the headline risk —
  fragile, manual (tunnel URL changes on restart), unmonitored. **Recommend
  retiring it entirely in favor of Supabase Storage upload.**
- Permissive RLS + shared bearer token; no per-user isolation or audit trail of
  who changed a bill (this is financial data → it needs an audit log).
- No validation at save (negative totals, split method vs. meter type), no unit
  tests on allocation math, occupancy sync from AppFolio is manual/one-way.

**Size / effort.** ~6,300 LOC (UI ~3,300; lib ~2,200; routes ~500; service ~160).
Rough hardening: **~44–72 hours (≈1.5–2 weeks)** — retire downloader (~1–2d),
RLS/audit (~2–3d), allocation tests + monitoring (~2–3d), validation/docs.

---

### 3.3 Applications / leasing & signing

**What it does.** A prospect-to-tenant pipeline in three layers: (1) **tours/
showings** — schedule open-house slots, public signup at `/s/[token]`, dual-source
with AppFolio 1-on-1 showings, and push registrations to AppFolio as guest cards
(a real write path); (2) **applications** — a team view that *reads* the AppFolio
application pipeline; (3) a **public applicant portal** at `/apply/[id]`. Plus
**document signing** via Dropbox Sign (send + HMAC-verified webhook + signed-PDF
storage).

**Real vs. prototype.** Showings/tours and the AppFolio guest-card push are
working. Signing send + webhook are built and HMAC verification is correct.
**Prototype:** the applications view is read-only (no real intake/workflow); the
public apply portal is **mock data only** (a code comment notes it should be a
token-protected public route in prod); only one signing template exists and the
public `/s/[token]/signing` UI is **not implemented**.

**Production gaps.**
- Public routes rely on token secrecy (no auth); validate token entropy and add
  rate-limiting/brute-force protection.
- `HELLOSIGN_TEST_MODE=1` by default — needs an explicit prod guard or signatures
  won't be billable/legal.
- PII (applicant/prospect data, signed PDFs) stored with no retention/encryption
  policy. No auth on the signing/showings API routes.

**Size / effort.** ~3,600 LOC. Rough hardening to finish intake + signing portal +
secure public routes: **~3–5 weeks** (most of it is the missing applicant intake
and the public signing UI, not the existing showings code).

---

### 3.4 Maintenance & vendors

**What it does.** Syncs AppFolio work orders into Supabase (manual trigger),
overlays Moxie annotations (status/assignment/vendor/follow-up/notes that survive
re-sync), and adds AI: Claude **classification** (category/priority/title, with a
keyword fallback), **summarization** (cached), and **Spanish translation** for
tech dispatch. Includes a maintenance-analytics dashboard ("Resident Pulse") and a
**vendor directory with bidirectional Notion sync** (last-write-wins) and labor
rates feeding the inspection invoices.

**Real vs. prototype.** Largely feature-complete for internal use and well
architected (clean Supabase schema, JSONB `raw` for extensibility, AI fallbacks).

**Production gaps.**
- **Sync is manual only — no scheduler.** Needs Vercel Cron (or similar) for
  periodic sync; reconciliation that flips rows to "closed" stores no reason
  (hard to debug false positives).
- No auth on `/api/maintenance/*` and `/api/vendors/*`; permissive RLS.
- AI endpoints aren't rate-limited; Notion last-write-wins can silently overwrite
  on clock skew and has no soft-delete/tombstone.
- Portfolio `24` hardcoded (a same-named portfolio `10`/`25` is unsupported).

**Size / effort.** ~8,500 LOC across UI/lib/routes (UI dominates; `data.ts` and
`appfolio.ts` are shared infra). Rough hardening: **~2–3 weeks** (auth, cron sync,
logging, tests, Notion edge cases).

---

### 3.5 Marketing / "SEO"

**What it does (and doesn't).** Despite the name, this is **not a real SEO
implementation** — there is no metadata/sitemap/robots/schema.org work at the app
level. It's a polished dashboard with: a mock SEO metrics panel (organic sessions,
rankings — all hardcoded), a content library/calendar (mock), an "AI content
generator" that is a **2-second fake delay returning canned copy (no Claude
wired)**, AI suggestions (mock, "Powered by Claude" badge is misleading), and a
mock monthly marketing report. **The only real feature is prospect/lead-source
tracking**, which pulls live AppFolio applications + Supabase showings.

**Real vs. prototype.** ~90% prototype/mockup. Nothing persists (no DB tables, no
`/api/marketing/*` write routes); users will quickly find "nothing sticks."

**Production gaps.** Build the backend from scratch: Supabase tables for content/
calendar/suggestions, CRUD routes, real Claude integration, real metric sources
(GA4 / Search Console / SE Ranking), and — if "SEO" is actually wanted —
app-level `generateMetadata`/OpenGraph/sitemap. Plus auth and tests.

**Size / effort.** ~1,500 LOC (mostly UI shell). Rough effort to make it real:
**~3–4 weeks**, and this is the module where scope should be confirmed with the
team — much of it may be cheaper to rebuild than to retrofit.

---

## 4. Secondary modules (for completeness / pricing)

These weren't the headline asks but exist in the app and the engineer should price
them. Most are functional UIs; several are localStorage-only (the recurring theme).

| Module | State | Notes |
|--------|-------|-------|
| **Meetings** (`/meetings`) | Working, Supabase-backed | Recorder hook, AI action-item extraction, attachments. ~530 LOC + lib. |
| **Tasks** (`/tasks`) | Working, Supabase-backed | Standalone tasks, AI next-step suggestion. |
| **Floor plans** (`/floor-plans`) | Working, Supabase-backed | AI room detection; feeds inspections. ~1,050 LOC. |
| **Portfolio** (`/portfolio`) | Working, AppFolio-backed | Largest dashboard (~1,800 LOC); read-only. |
| **Showings** (`/showings`) | Working | Covered under leasing; ~1,300 LOC. |
| **Capital projects / Notices / Unit-turns / Comp-watch / Reports / Tours** | Mixed; **localStorage-only** | Per `TODO.md`. Functional UIs but no multi-device sync — fold into the data-consolidation workstream. |
| **Contacts / Users** | Partial | `users` uses the Supabase service-role admin API; `contacts` table exists but is largely unused. |
| **Calendar / Notion roadmap** | Working integrations | Team calendar, Notion roadmap embed. |

---

## 5. Suggested phasing for the proposal

1. **Phase 0 — Platform foundation (≈8–12 wks):** server-side auth + RBAC, real
   RLS, data consolidation off localStorage, CI/CD + first tests, observability,
   cost controls, staging environment, migration CI. *Prerequisite for everything.*
2. **Phase 1 — Money & legal paths first:** RUBS (retire the Windows downloader,
   add audit log + allocation tests) and Move-out inspections (auth/validation,
   inspections-table migration, signature/email, perf). These touch dollars and
   legal documents, so they carry the most risk.
3. **Phase 2 — Operations:** Maintenance (scheduled sync, auth, tests) and Leasing
   (finish applicant intake + public signing portal, secure public routes).
4. **Phase 3 — Growth/marketing:** decide build-vs-rebuild on Marketing/SEO; wire
   real data sources and persistence, or descope.

**Very rough total:** foundational ~8–12 weeks + module hardening ~9–14 weeks of
focused work, overlapping in places. A single experienced full-stack engineer
should treat this as a multi-month engagement; the platform gaps (auth, data,
testing) are the dominant cost, not the feature code.

---

## 6. Open questions for the incoming engineer / team

- **Multi-tenant or single-org?** Everything is hardcoded to one AppFolio
  portfolio and one Supabase project. The auth/RLS design depends on this answer.
- **AppFolio write scope** — is two-way sync (beyond guest cards) in scope, or
  stays read-mostly?
- **Marketing/SEO** — is the intent real content tooling + real SEO, or can it be
  descoped? Biggest scope uncertainty.
- **RUBS bill sourcing** — confirm full migration to in-app upload so the Windows
  desktop + ngrok dependency can be retired.
- **Is there an existing `inspections` table** in the deployed DB that needs to be
  reverse-engineered into a checked-in migration?
- **Compliance** — tenant PII retention/encryption and the legal standing of
  generated §1950.5 deduction documents and e-signatures.
</content>
</invoke>
