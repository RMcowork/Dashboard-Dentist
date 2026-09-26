# Engineering Practice

How we build and change this project. The short version is in `CLAUDE.md`.

## Principles
1. **No build, no dependencies.** Plain ES modules in the browser, and Node built-ins on the server. Adding a dependency needs a reason in the PR description.
2. **One source of truth per concern.**

   | Concern | Lives in |
   |---|---|
   | Data model and Airtable mapping | `server/schema.js` |
   | KPI maths | `public/js/metrics.js` |
   | Dates and opening hours | `public/js/dates.js` |
   | Strings | `public/i18n/*.json` |
   | Colours | CSS tokens in `public/style.css` |

3. **Pure core, thin shell.** `metrics.js` and `dates.js` take plain data and return plain data. They don't touch the DOM or do I/O, so the same code runs in the browser and in `node --test`.
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
- Cache inside the adapter, and respect the source's rate and quota limits:
  - Airtable: 5 requests/second per base
  - Free plan: about 1,000 API calls/month
- To add a source:
  1. Create `server/adapters/<name>.js`.
  2. Register it in `ADAPTERS` in `serve.js`.
  3. Document it in SPEC §6.
  4. Add a round-trip or fixture test.

## Secrets & configuration
- Configuration lives only in environment variables or `.env` (git-ignored). `.env.example` lists every variable and must be kept current.
- Airtable tokens: use the **least scope** needed and restrict them to the one base.
  - The dashboard needs only `data.records:read`.
  - Seeding needs write and schema scopes. Consider a separate token that you delete afterwards.
- Never print a token, and never put one in a URL, a client bundle or a test fixture.

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
- External scripts come only from pinned CDN versions (Chart.js `4.4.4` on jsDelivr).

## Testing
- `npm test` runs `node --test` over `test/*.test.js`.
- Required whenever you change the matching code:
  - A KPI formula → a fixture-based assertion, with the numbers worked out by hand in a comment
  - The generator → the determinism and record-budget test stays green
  - The schema → the round-trip test (normalized → Airtable → normalized) stays green
- UI changes are verified in the preview (`.claude/launch.json` → `dental-dashboard`):
  - Both tabs
  - en, he and ar
  - 375 px width
  - Dark mode
  - A clean console

## Git
- Branch from `main`; keep changes small and focused.
- Commit messages are imperative ("Add recall list to front desk"), with a body explaining *why* when it isn't obvious.
- Never commit `.env`, `data/demo.json` or real data.
