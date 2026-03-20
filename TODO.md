# Moxie Dashboard — Remaining Work

## Bug Fixes (Completed)
- [x] Unit selectors show tenant names instead of Unit Street Address 1 — fixed in maintenance, notices, inspections, unit-turns

## Incomplete Pages

### Reports (5% complete)
- [ ] Implement actual P&L report generation using AppFolio financial data
- [ ] Implement occupancy report with historical trends
- [ ] Implement maintenance cost report with vendor breakdowns
- [ ] Implement rent roll report pulling live AppFolio data
- [ ] Add CSV/PDF export capability
- [ ] "Generate Report" currently creates empty objects — wire up real calculations

### Vendors (15% complete)
- [ ] Connect vendor directory to AppFolio vendor data
- [ ] Link vendors to completed work orders for job history
- [ ] Auto-calculate response time and performance metrics from work order data
- [ ] Track insurance expiration dates with alerts
- [ ] Auto-update ratings and jobs completed from maintenance history

### Comp Watch (20% complete)
- [ ] Add market data integration (manual CSV import at minimum)
- [ ] Auto-pull competitor rent data if available from a data source
- [ ] Trend calculation should be based on historical entries, not hardcoded "stable"
- [ ] Add rent comparison charts (own properties vs competitors)

### Resident Pulse (40% complete)
- [ ] Currently just groups maintenance tickets by category — not true resident feedback
- [ ] Add resident survey/feedback collection mechanism
- [ ] Implement actual sentiment analysis or pattern recognition
- [ ] "Trend" field is hardcoded to "stable" — calculate from historical data
- [ ] Consider renaming to "Maintenance Analytics" if no feedback source is planned

### Leasing Parent Page (70% complete)
- [ ] Tours section is hardcoded empty: `const upcomingTours: any[] = []`
- [ ] Connect tour data from the tours sub-page to the parent leasing overview
- [ ] Remove "Tours not yet connected to AppFolio" comment and wire up

## Infrastructure / Cross-Cutting

### Data Persistence
- [ ] Most client-side pages (inspections, unit turns, notices, capital projects, tours, comp watch, vendors) lose all data on page refresh
- [ ] Consider adding a database backend (Supabase, PlanetScale, etc.) for persistent storage
- [ ] Or at minimum, localStorage persistence for draft data

### Unit Data Verification
- [ ] Verify that AppFolio `UnitStreetAddress1` field is always populated and matches the expected addresses from the Unit Directory report
- [ ] If field is sometimes missing, add better fallback logic in `src/lib/data.ts` line 132

### General Polish
- [ ] Ensure all pages handle loading states gracefully
- [ ] Add error boundaries for API failures
- [ ] Mobile responsiveness audit across all pages
