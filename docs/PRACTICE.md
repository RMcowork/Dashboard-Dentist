# Engineering Practice

How we build and change this project. The short version is in `CLAUDE.md`.

## Principles
1. **No build, no dependencies.** Plain ES modules in the browser, and Node built-ins on the server. Adding a dependency needs a reason in the PR description.
2. **One source of truth per concern.**

   | Concern | Lives in |
   |---|---|
   | Data model and Airtable mapping | `public/js/data/schema.js` |
   | Airtable sync (server and browser) | `public/js/data/airtable-sync.js` |
   | KPI maths | `public/js/metrics.js` |
   | Dates and opening hours | `public/js/dates.js` |
   | Strings | `public/i18n/*.json` |
   | Colours | CSS tokens in `public/style.css` |

3. **Pure core, thin shell.** `metrics.js`, `dates.js` and `public/js/data/*` (except `source.js`) take plain data and return plain data. They don't touch the DOM or do I/O, so the same code runs in the browser and in `node --test`.
4. **Read-only UI.** The dashboard never writes to a data source. Seeding is a separate, explicit script.

## Code style
- ES2022+, 2-space indent, single quotes, semicolons, trailing commas in multi-line literals.
- Name things in the domain's language: `appointments`, `noShowRate`, `chair`. Avoid `items` or `val`.
- Comments explain *why*, or give a rule the code can't show (for example, the rate limits). No change logs in comments.
- Keep functions small. Render functions take `(root, data, …)` and own only their section of the DOM.

## Adapters (data sources)
- An adapter is a module exporting `name` and `async getData()`, returning the normalized shape documented in `CLAUDE.md`.
- Normalize at the edge. Adapters convert labels to keys (`'No-show'` → `no_show`), dates to `YYYY-MM-DD` and times to `HH:MM`. The UI never sees source-specific formats.
- Missing values become `null`, not `undefined` or `''`. Metrics treat `null` safely.
- Cache inside the adapter (the Airtable adapter delta-syncs and coalesces, see docs/AIRTABLE.md), and respect the source's rate and quota limits:
  - Airtable: 5 requests/second per base
  - Free plan: about 1,000 API calls/month
- To add a source:
  1. Put the reading/normalizing logic in `public/js/data/<name>.js` (no Node or DOM APIs) so both modes can use it.
  2. Wrap it in `server/adapters/<name>.js` and register it in `ADAPTERS` in `serve.js`.
  3. If it should work on GitHub Pages too, add it to `public/js/data/source.js` (browser mode).
  4. Document it in SPEC §6 and add a round-trip or fixture test.

## Scrapers (Apify)
- Scraping runs only in `scripts/collect-trends.js` (GitHub Actions), never in the dashboard or on page load.
- Normalize Apify output in `public/js/data/market-schema.js` and cover it with fixture tests; treat every field as optional.
- Refuse to write when a run returns nothing usable, and never delete records: a failed day keeps yesterday's data.
- Keep runs cheap: no reviews or images from Google Maps, a fixed `maxPlaces`, one comparison per region for Google Trends.
- Use an actor's documented input (e.g. `searchTerms` + `isMultiple`) rather than start URLs, and keep each run to as few pages as possible: Google blocks bursts of Trends pages. Required data (series) and nice-to-have data (rising searches) go in separate runs so one can fail without the other; switch off a nice-to-have run that keeps failing rather than paying for it daily.
- Every Apify run gets a `timeout` passed to Apify (so a stuck run is stopped on Apify's side), and the collector aborts it if it overruns. Partial results are used rather than thrown away; order inputs so the most important pages come first.

## Secrets & configuration
- Configuration lives only in environment variables or `.env` (git-ignored). `.env.example` lists every variable and must be kept current.
- Airtable tokens: use the **least scope** needed and restrict them to the one base.
  - The dashboard needs only `data.records:read`.
  - Seeding needs write and schema scopes. Consider a separate token that you delete afterwards.
- Never print a token, and never put one in a URL, a client bundle or a test fixture.
- The collector's tokens (`APIFY_TOKEN`, `AIRTABLE_MARKET_TOKEN`, write access to the market base only) live in GitHub Actions secrets, or in `.env` for a manual run.
- **Browser mode (GitHub Pages).** A static site cannot keep a secret, so nothing secret is built into it. Each viewer pastes their own token into *Connect Airtable*:
  - It must be read-only (`data.records:read`) and scoped to one base.
  - It is stored only in that browser's localStorage and sent only to `api.airtable.com`. Everything on the same origin (`<user>.github.io`, including other Pages sites of that account) can read localStorage, so never use a write-scoped token there, and disconnect on shared computers.
  - Anyone with the token can read the whole base. For real patient data use server mode behind authentication instead.

## Privacy (patient data)
Real clinic data is health data, which is sensitive under Israel's Privacy Protection Law and its data-security regulations.
- **Demo data only in the repo.** Never commit real patient names, phones or exports. `data/demo.json` is git-ignored and fictional (`05x-555-xxxx`).
- Show the minimum: name and phone for call lists, and no ID numbers, addresses or clinical notes.
- Before real data is used beyond a single trusted machine, add authentication in front of the server (SPEC §9, v0.3), and serve it over HTTPS.
- Screenshots for PRs and docs must use demo data.

## i18n & RTL
- Every visible string is a key in **all three** files `en.json`, `he.json` and `ar.json`. Missing keys fall back to English, but treat that as a bug.
- Use `{placeholder}` interpolation. Never build sentences by concatenation, because word order differs between languages.
- Format through `fmtMoney` / `fmtNum` / `fmtPct` / `fmtDate` in `i18n.js`. Never hand-format numbers or add "₪" yourself.
- Layout uses **logical CSS properties**: `margin-inline-start`, `border-inline-start`, `inset-inline-*`, `text-align: start/end`. Directional icons get the `.flip` class.
- Phone numbers and other LTR tokens inside RTL text get `dir="ltr"`.
- Test every UI change in en + one RTL language.

## Charts
We follow the dataviz method: form first, colour last. The rules:
- **One value axis per chart**, never dual-axis. Use two charts or a table instead.
- **Colour follows the entity.** Dentist *i*, ordered by chair, uses `--series-(i+1)` everywhere: bars, schedule edges and table swatches.
- Single-series charts use one hue (`--series-1`), not a rainbow.
- The categorical palette in `style.css` is the validated default. Light and dark steps are defined separately, and slots 1–3 pass colour-vision-deficiency checks in every pairing. If you have more than 3 dentists, validate the palette again before shipping.
- Status colours are reserved for state (done, no-show). They always come with an icon and a label.
- Every chart has a table twin (the *Table* toggle). Tooltips are on, marks are thin (2px lines, rounded bar ends), and the grid is recessive.
- Charts read colours from CSS tokens at render time and re-render when the colour scheme changes.

## Security in the browser
- Escape everything that comes from data with `esc()` before it goes into `innerHTML`. Prefer `textContent` for single values.
- The static server rejects path traversal. Keep `PUBLIC + sep` checks if you touch it.
- The only third-party endpoint the browser calls is `api.airtable.com` (browser mode), plus the pinned CDN and Google Fonts.
- External scripts come only from pinned CDN versions (Chart.js `4.4.4` on jsDelivr).

## Testing
- `npm test` runs `node --test` over `test/*.test.js`.
- Required whenever you change the matching code:
  - A KPI formula → a fixture-based assertion, with the numbers worked out by hand in a comment
  - The generator → the determinism and record-budget test stays green
  - The schema → the round-trip test (normalized → Airtable → normalized) stays green
- UI changes are verified in the preview (`.claude/launch.json` → `dental-dashboard`, and `dental-static` for browser mode):
  - Both tabs
  - en, he and ar
  - 375 px width (bottom tab bar, agenda) and 768 px (chair grid)
  - Dark mode
  - A clean console

## Git
- Branch from `main`; keep changes small and focused.
- Commit messages are imperative ("Add recall list to front desk"), with a body explaining *why* when it isn't obvious.
- Never commit `.env`, `data/demo.json` or real data.
- Pushing to `main` deploys GitHub Pages (tests must pass first).
- Every change updates the docs in the same commit: `CLAUDE.md` (layout, rules), `docs/SPEC.md` (behaviour), `docs/PRACTICE.md` (how we build it) and `CHANGELOG.md` (what changed).
