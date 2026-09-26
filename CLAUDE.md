# CLAUDE.md

Guide for Claude (and humans) working in this repo. Read this first, then `docs/SPEC.md` for *what* the product does and `docs/PRACTICE.md` for *how* we write code here.

## What this is
A dashboard for a dental clinic with two tabs:
- **Overview**: owner/manager KPIs, trends, dentist performance.
- **Front desk**: a day's schedule by chair, plus call lists (unpaid balances, recalls due, next-day confirmations).

The UI is English by default, with Hebrew and Arabic (RTL) selectable. Money is shown in ₪ (ILS).

## Stack
- Vanilla JS (ES modules) and CSS, with no build step and **no npm dependencies**. Chart.js 4 loads from jsDelivr.
- Node ≥ 20 (`node:test`, global `fetch`). `server/serve.js` serves `public/` and a JSON API.
- Data comes through an **adapter** chosen by `DATA_SOURCE`: `demo` (generated in memory) or `airtable`.

## Commands
```bash
npm start            # http://localhost:8940  (DATA_SOURCE from .env, default demo)
npm test             # node --test: KPI formulas, generator, Airtable mapping
npm run generate     # write data/demo.json (snapshot to seed Airtable with)
npm run seed         # upload data/demo.json to AIRTABLE_BASE_ID (add --reset to replace)
```
The preview config lives in `.claude/launch.json` (name `dental-dashboard`, port 8940).

## Layout
```
server/serve.js            static files + GET /api/data
server/env.js              .env loader (no deps)
server/schema.js           data model ↔ Airtable table/field/label mapping (single source of truth)
server/adapters/*.js       demo | airtable; each exports name + getData() → normalized data
server/demo/generate.js    deterministic demo generator (seeded RNG, anchored to "today")
public/index.html          markup; strings carry data-i18n keys
public/js/app.js           state, wiring, fetch
public/js/metrics.js       PURE KPI functions (shared with Node tests)
public/js/dates.js         date helpers + clinic opening hours (shared with Node)
public/js/overview.js      Overview tab
public/js/today.js         Front-desk tab
public/js/charts.js        Chart.js wrapper (tokens from CSS, RTL axes)
public/js/i18n.js          t(), setLang(), Intl formatters
public/i18n/{en,he,ar}.json
scripts/                   generate-demo.js, seed-airtable.js
docs/                      SPEC.md, PRACTICE.md, AIRTABLE.md
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

The keys and labels are defined in `server/schema.js`.

## Rules that matter
- **Secrets stay server-side.** Never send `AIRTABLE_TOKEN` to the browser, log it, or commit `.env`.
- **KPI formulas live only in `metrics.js`** and are documented in `docs/SPEC.md`. If you change one, change both and update `test/metrics.test.js`.
- **Every user-visible string goes through `t()`**, with the key added to all three JSON files. Use CSS logical properties (`margin-inline-start`, not `margin-left`) so RTL works.
- **Escape data before `innerHTML`**: use `esc()` from `public/js/dom.js`.
- **Dentist colour = categorical slot by chair order** (`--series-N`). Don't cycle or invent colours. See PRACTICE → Charts.
- Demo data must stay **under 1,000 records**, the Airtable free-plan base limit. A test enforces this.
- The Airtable free plan also has only ~1,000 API calls/month, so don't lower `AIRTABLE_CACHE_MINUTES` casually.
- Patient data is sensitive (see PRACTICE → Privacy). The demo uses fictional names and `05x-555-xxxx` numbers.

## Verifying a UI change
Start the `dental-dashboard` preview and check both tabs in **en, he and ar**, at mobile width and in dark mode. The console should be clean. The demo "today" follows the real clock, and the clinic is closed on Saturday. Use the day picker to view a weekday.
