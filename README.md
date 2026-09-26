# Dental Clinic Dashboard

A dashboard for a small dental clinic, in English, עברית and العربية, with amounts in ₪.

- **Overview** (owner/manager):
  - Revenue, collections, visits, new patients, no-show rate, chair utilization, average revenue per visit and outstanding balance, each compared with the previous period
  - Trends, treatment mix and dentist performance
- **Front desk**:
  - The day's schedule by chair (a time-ordered agenda on phones), with live statuses
  - Unpaid balances, recalls due and next-day confirmations
- **Live refresh**: every 1 minute by default (Off, 15 s … 15 min selectable), with a visible loading/refresh animation and highlights of what changed
- **Works on phones**: compact header, bottom tab bar, swipeable counters, agenda view
- Light and dark themes; right-to-left layout for Hebrew and Arabic

**Why a clinic would use it:** the owner gets a clear picture of the business, and the reception gets a practical to-do list for the day (confirmations, balances to collect, recalls), both from the same up-to-date data. See [docs/BENEFITS.md](docs/BENEFITS.md).

It runs on generated **demo data** out of the box, and reads from **Airtable** when configured.

**Live demo:** <https://rmcowork.github.io/Dashboard-Dentist/>. It runs entirely in your browser; click **Connect Airtable** to read a base with your own read-only token.

## Two ways to run it
| | Server mode (`npm start`) | Browser mode (GitHub Pages / any static host) |
|---|---|---|
| Data | Node reads Airtable (or demo) and serves `/api/data` | The page generates demo data, or reads Airtable directly |
| Airtable token | In `.env` on the server; never reaches the browser | Pasted by each viewer into **Connect Airtable**; saved only in that browser's localStorage and sent only to `api.airtable.com` |
| Best for | A clinic screen / the clinic's real data | Demos, trying the dashboard, personal use |

The page picks the mode by itself: if `api/data` exists it uses the server, otherwise browser mode. The Airtable sync code (`public/js/data/airtable-sync.js`) is the same in both.

## Quick start
Requires Node ≥ 20. There's nothing to install.

```bash
cp .env.example .env
npm start
```
Then open <http://localhost:8940>.

The demo's "today" follows your clock. The clinic is closed on Saturdays, so use the day picker to view a weekday.

## Using Airtable
The *Dental Clinic Demo* base (`appTRu3aSv38OmmGV`) already exists and holds the demo data. To read from it:

1. Create a **read-only** personal access token at <https://airtable.com/create/tokens>: scope `data.records:read`, access limited to *Dental Clinic Demo*.
2. Paste it into `.env` as `AIRTABLE_TOKEN=`, then restart `npm start`.

With `DATA_SOURCE=auto` (the default), the server switches to Airtable by itself and the badge reads **Airtable · live**. Without a token it serves demo data and shows a banner.

The dashboard auto-refreshes every minute by default. Use the selector in the top bar to choose Off, 15 s, 30 s, 1, 2, 5 or 15 min. The ↻ button refreshes now.

To use a real clinic's data, see "Connecting a real clinic base" in [docs/AIRTABLE.md](docs/AIRTABLE.md).

## GitHub Pages
`.github/workflows/pages.yml` runs the tests and publishes `public/` on every push to `main`. No secret is built into the site. To run browser mode locally, use `node server/serve.js --static --port=8941`.

## Tests
```bash
npm test
```

## Docs
| File | What's in it |
|---|---|
| [CLAUDE.md](CLAUDE.md) | Orientation for contributors and Claude: layout, data contract, rules |
| [docs/BENEFITS.md](docs/BENEFITS.md) | What the dashboard does for the owner and the front desk |
| [docs/SPEC.md](docs/SPEC.md) | Product spec: users, screens, exact KPI formulas, roadmap |
| [docs/PRACTICE.md](docs/PRACTICE.md) | Engineering practice: style, adapters, secrets, privacy, i18n/RTL, charts, testing |
| [docs/AIRTABLE.md](docs/AIRTABLE.md) | Base schema, tokens, sync & free-plan limits, GitHub Pages connection, real data |
| [CHANGELOG.md](CHANGELOG.md) | What changed in each version |

All names and phone numbers in the demo data are fictional.
