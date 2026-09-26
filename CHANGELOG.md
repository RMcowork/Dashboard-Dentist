# Changelog

## 2026-09-27

### Market collector
- Fix: the Trends actor accepts `timeRange: ''` for the past 12 months, not `today 12-m` (`actorTimeRange` in market-config.js).
- Google Trends now uses the actor's documented `searchTerms` + `isMultiple` input: one comparison run per region (1 page each) instead of 12 URLs in one run, which Google mostly blocked. Rising searches come from separate, optional per-term runs.
- First real collection: 20 nearby clinics saved; Trends saved 1 of 10 series before this change.
- Each Apify run now has a hard time limit enforced by Apify (Trends 20 min, Maps 10 min); an overrunning run is aborted and its partial results are used.
- Google Maps runs first; Google Trends requests the comparison pages first and uses gentler settings (fewer retries, 4 pages at a time).
- A clear hint when the Airtable token lacks access to the market base (403).

### Process
- Docs (`CLAUDE.md`, `docs/PRACTICE.md`, `docs/SPEC.md`, `CHANGELOG.md`) are now updated with every change, as a rule in `CLAUDE.md` and `docs/PRACTICE.md`.

## 2026-09-26

### Market tab (Apify + Airtable)
- New **Market** tab: Google Trends search interest (Israel / worldwide) for five treatments, rising searches, and nearby clinics' ratings and review momentum from Google Maps.
- Daily collector `scripts/collect-trends.js` (GitHub Actions, 07:00 Israel) runs the Apify actors and upserts into the new Airtable base *Dental Market Trends*.
- `GET /api/market` for server mode; browser mode reads the market base with the same connected token. Demo market data until the collector has run.
- Docs: `docs/MARKET.md`.

### Docs
- Added `docs/BENEFITS.md`: what the dashboard does for the owner and the front desk.

### Phone layout
- Compact two-row header and a bottom tab bar on screens up to 600 px.
- Front desk on phones: swipeable day counters and a time-ordered agenda with a *Now* divider, instead of the sideways-scrolling chair grid.

### GitHub Pages (browser mode)
- Published at <https://rmcowork.github.io/Dashboard-Dentist/> by `.github/workflows/pages.yml` (tests, then deploy of `public/`).
- Without a server, the page generates demo data itself, or reads Airtable directly after **Connect Airtable** with the viewer's own read-only token (kept only in that browser).
- Airtable sync, schema and demo generator moved to `public/js/data/` and are shared by the server and the browser.
- `node server/serve.js --static` runs browser mode locally.

### Live refresh and redesign
- Refresh interval selectable (Off, 15 s, 30 s, 1 min default, 2, 5, 15 min), with a loading animation on every refresh, count-up numbers, highlights of changed cards and appointments, a toast, and a countdown ring.
- Airtable adapter: delta sync of changed records, full reload every 30 min, request coalescing and a minimum interval, stale fallback. `DATA_SOURCE=auto` picks Airtable when a token is set.
- New look: Inter / Plus Jakarta Sans (Rubik, IBM Plex Sans Arabic for Hebrew/Arabic), KPI cards with icons and sparklines, gradient charts, dentist avatars, light/dark toggle.
- Demo data (874 records) loaded into the Airtable base *Dental Clinic Demo*.

### First version
- Overview (8 KPIs vs previous period, trends, treatment mix, dentist performance) and Front desk (schedule by chair, counters, unpaid balances, recalls, next-day confirmations).
- English, Hebrew and Arabic with RTL; ₪ formatting; demo data generator; Airtable adapter and seed script.
