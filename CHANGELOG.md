# Changelog

## 2026-09-26

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
