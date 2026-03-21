# Moxie Dashboard — Remaining Work

## Completed

### Bug Fixes
- [x] Unit selectors show tenant names instead of Unit Street Address 1 — fixed in maintenance, notices, inspections, unit-turns

### Leasing Parent Page (was 70% → now 95%)
- [x] Tours section wired up — reads from localStorage via TourStats client component
- [x] Tour counts and registration counts shown dynamically on parent page
- [ ] Connect tour data to AppFolio if/when API supports it

### Maintenance Analytics (was "Resident Pulse", 40% → now 80%)
- [x] Renamed from "Resident Pulse" to "Maintenance Analytics"
- [x] Added time-range filter (30d, 90d, 6m, all time)
- [x] Added property filter
- [x] Trend calculation compares current vs previous period (no longer hardcoded "stable")
- [x] Shows avg resolution time per category
- [x] Period-over-period comparison in summary cards
- [ ] Consider adding cost breakdown by category

### Comp Watch (was 20% → now 75%)
- [x] localStorage persistence — data survives page refresh
- [x] Rent history tracking — snapshots rent values when updated
- [x] Auto-calculated trend based on rent history (up/down/stable)
- [x] Expandable rows with occupancy, notes, and rent history timeline
- [x] Delete competitor functionality
- [ ] CSV import for bulk competitor data
- [ ] Side-by-side comparison chart with own properties

### Vendors (was 15% → now 70%)
- [x] localStorage persistence for vendor directory
- [x] Connected to AppFolio work orders — auto-calculates jobs completed and avg resolution time
- [x] Vendor detail view shows actual work order history from AppFolio
- [x] Search filter for finding vendors by name
- [x] Insurance expiry date tracking with alerts (30-day warning)
- [x] Delete vendor and edit status from detail view
- [ ] Rating system (star-based or scoring)
- [ ] Bulk import vendors

### Reports (was 5% → now 70%)
- [x] localStorage persistence for generated reports
- [x] Occupancy reports pull live unit data from AppFolio
- [x] Rent roll reports show all units with tenant, rent, status, lease end
- [x] Maintenance cost reports with category breakdown and cost bars
- [x] P&L summary (estimated from rent income vs maintenance costs)
- [x] Report detail view with full data display
- [x] CSV export for all report types
- [x] Delete reports
- [x] Default month uses current month (no longer hardcoded)
- [ ] Full P&L requires AppFolio General Ledger API connection
- [ ] PDF export
- [ ] Email/send to owner functionality

### Data Persistence (was 0% → now 90%)
- [x] Created shared localStorage utility (`src/lib/storage.ts`)
- [x] Tours — persisted to localStorage
- [x] Comp Watch — persisted to localStorage
- [x] Vendors — persisted to localStorage
- [x] Reports — persisted to localStorage
- [x] Inspections — persisted to localStorage
- [x] Unit Turns — persisted to localStorage
- [x] Notices — persisted to localStorage
- [x] Capital Projects — persisted to localStorage
- [ ] Consider database backend (Supabase, etc.) for multi-device sync

## Still Remaining

### Unit Data Verification
- [ ] Verify that AppFolio `UnitStreetAddress1` field is always populated
- [ ] If field is sometimes missing, add better fallback logic in `src/lib/data.ts`

### General Polish
- [ ] Mobile responsiveness audit across all pages
- [ ] Loading skeleton states for pages that fetch data
- [ ] Error boundaries for API failures
