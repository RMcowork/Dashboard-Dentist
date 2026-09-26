# CLAUDE.md

Guide for Claude (and humans) working in this repo. Read this first, then `docs/SPEC.md` for *what* the product does and `docs/PRACTICE.md` for *how* we write code here.

## What this is
A dashboard for a dental clinic with three tabs:
- **Overview**: owner/manager KPIs, trends, dentist performance.
- **Front desk**: a day's schedule by chair, plus call lists (unpaid balances, recalls due, next-day confirmations).
- **Market**: dental search trends (Google Trends) and nearby clinics (Google Maps), collected daily by Apify into a separate Airtable base. See `docs/MARKET.md`.

The UI is English by default, with Hebrew and Arabic (RTL) selectable. Money is shown in ₪ (ILS).

## Stack
- Vanilla JS (ES modules) and CSS, with no build step and **no npm dependencies**. Chart.js 4 loads from jsDelivr.
- Node ≥ 20 (`node:test`, global `fetch`). `server/serve.js` serves `public/` and a JSON API.
- Data comes through an **adapter** chosen by `DATA_SOURCE`: `auto` (default: Airtable when `AIRTABLE_TOKEN` and `AIRTABLE_BASE_ID` are set, else demo), `demo` or `airtable`.
- Fonts (Google Fonts): Inter (UI), Plus Jakarta Sans (display), Rubik (Hebrew), IBM Plex Sans Arabic (Arabic). They are set via `--font-ui` and `--font-display` in `public/style.css`.

## Commands
```bash
npm start            # http://localhost:8940  (DATA_SOURCE from .env, default auto)
node server/serve.js --static --port=8941   # no API: browser mode, like GitHub Pages
npm test             # node --test: KPI formulas, generator, Airtable mapping
npm run generate     # write data/demo.json (snapshot to seed Airtable with)
npm run collect      # Apify → market base (needs APIFY_TOKEN + AIRTABLE_MARKET_TOKEN; add -- --dry-run)
npm run seed         # upload data/demo.json to AIRTABLE_BASE_ID (add --reset to replace; the demo base is already seeded)
```
Preview configs live in `.claude/launch.json`: `dental-dashboard` (server mode, port 8940) and `dental-static` (browser mode, port 8941).

The live site is <https://rmcowork.github.io/Dashboard-Dentist/> (repo `RMcowork/Dashboard-Dentist`); every push to `main` redeploys it.

## Layout
```
server/serve.js            static files + GET /api/data + GET /api/market
server/env.js              .env loader (no deps)
server/adapters/*.js       demo | airtable | market; thin Node wrappers over public/js/data/*
public/js/data/schema.js   data model ↔ Airtable table/field/label mapping (single source of truth)
public/js/data/generate.js deterministic demo generator (seeded RNG, anchored to "today")
public/js/data/airtable-sync.js  Airtable reader: full/delta sync, coalescing, stale (Node + browser)
public/js/data/demo-source.js    demo data cached per minute (Node + browser)
public/js/data/source.js   browser data layer: server mode (api/data, api/market) or browser mode (static hosting)
public/js/data/market-*.js Market tab: config (topics, location, base id), schema + Apify normalizers, reader, demo
public/index.html          markup; strings carry data-i18n keys; Connect Airtable dialog
public/js/app.js           state, refresh cycle, connect dialog, wiring
public/js/metrics.js       PURE KPI functions (shared with Node tests)
public/js/dates.js         date helpers + clinic opening hours (shared with Node)
public/js/overview.js      Overview tab
public/js/today.js         Front-desk tab
public/js/market.js        Market tab
public/js/charts.js        Chart.js wrapper (tokens from CSS, RTL axes)
public/js/i18n.js          t(), setLang(), Intl formatters
public/js/icons.js         inline SVG icons
public/js/dom.js           esc(), tableHtml(), initials()
public/style.css           tokens (light/dark, palette, fonts), components, phone layout (≤ 600 px)
public/i18n/{en,he,ar}.json
scripts/                   generate-demo.js, seed-airtable.js, collect-trends.js (daily Apify collector)
test/                      metrics, schema round-trip, Airtable sync (mocked fetch), market normalizers
.github/workflows/pages.yml  test + publish public/ to GitHub Pages
.github/workflows/collect-trends.yml  daily Apify collection (secrets APIFY_TOKEN, AIRTABLE_MARKET_TOKEN)
docs/                      SPEC.md, PRACTICE.md, AIRTABLE.md, MARKET.md, BENEFITS.md; CHANGELOG.md at the root
```

## The normalized data shape (the adapter contract)
```js
{
  dentists:     [{ id, name, specialty, chair, active }],
  treatments:   [{ id, name: { en, he, ar }, category, price, duration }],
  patients:     [{ id, name, phone, birthDate, gender, city, language, firstVisit, lastVisit }],
  appointments: [{ id, date: 'YYYY-MM-DD', start: 'HH:MM', duration, patientId, dentistId, treatmentId,
                   chair, status, fee, paid, paymentMethod, source }],
}
```
- `status` ∈ `scheduled | checked_in | in_chair | completed | no_show | cancelled`
- `category` ∈ `preventive | restorative | endo | ortho | cosmetic | surgery`

The keys and labels are defined in `public/js/data/schema.js`.

## Rules that matter
- **Docs are part of every change.** In the same commit, update `CLAUDE.md`, `docs/PRACTICE.md`, `docs/SPEC.md` and `CHANGELOG.md` (and README / `docs/MARKET.md` / `docs/AIRTABLE.md` / `docs/BENEFITS.md` when affected). Don't wait to be asked.
- **Secrets stay out of the repo and the build.** In server mode `AIRTABLE_TOKEN` stays on the server; never send it to the browser, log it, or commit `.env`. In browser mode (GitHub Pages) the viewer's own read-only token lives only in their localStorage (`dental-dash.airtable`) and goes only to `api.airtable.com`. Never add a token to `public/`, the workflow, or a Pages build.
- **Code in `public/js/data/` runs in Node and the browser**: no Node APIs, no DOM (except `source.js`).
- **KPI formulas live only in `metrics.js`** and are documented in `docs/SPEC.md`. If you change one, change both and update `test/metrics.test.js`.
- **Every user-visible string goes through `t()`**, with the key added to all three JSON files. Use CSS logical properties (`margin-inline-start`, not `margin-left`) so RTL works.
- **Escape data before `innerHTML`**: use `esc()` from `public/js/dom.js`.
- **Dentist colour = categorical slot by chair order** (`--series-N`). Don't cycle or invent colours. See PRACTICE → Charts.
- Demo data must stay **under 1,000 records**, the Airtable free-plan base limit. A test enforces this.
- The Airtable free plan also has only ~1,000 API calls/month. The adapter delta-syncs (only changed records between full loads), coalesces concurrent requests and enforces `AIRTABLE_MIN_INTERVAL_SECONDS`. Keep those protections when you touch `public/js/data/airtable-sync.js`.
- **Refresh cycle** (`public/js/app.js`): the user picks the interval (Off, 15 s … 15 min, default 1 min, stored in localStorage). Every refresh shows the loading state for at least 900 ms, then re-renders with count-up, changed-card glow and a toast. Refreshing pauses while the browser tab is hidden.
- **Phone layout** (≤ 600 px) is CSS-only except the agenda list, which `today.js` renders next to the chair grid; CSS shows one or the other. Don't put `backdrop-filter`/`transform` on ancestors of the fixed bottom tab bar.
- **Market data is separate**: its own base (`app4RLlYNfgYxgs7f`), its own write token used only by the collector, and a failure there must never break the other tabs (`loadMarket()` falls back to demo). Keep the base small: one record per topic+region and per clinic, history as JSON.
- Patient data is sensitive (see PRACTICE → Privacy). The demo uses fictional names and `05x-555-xxxx` numbers.

## Verifying a UI change
Start the `dental-dashboard` preview and check both tabs in **en, he and ar**, at mobile width (375 px: bottom tab bar, agenda instead of the chair grid) and in dark mode. The console should be clean. The demo "today" follows the real clock, and the clinic is closed on Saturday. Use the day picker to view a weekday.
