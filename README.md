# Dental Clinic Dashboard

A dashboard for a small dental clinic, in English, עברית and العربية, with amounts in ₪.

- **Overview** (owner/manager):
  - Revenue, collections, visits, new patients, no-show rate, chair utilization, average revenue per visit and outstanding balance, each compared with the previous period
  - Trends, treatment mix and dentist performance
- **Front desk**:
  - The day's schedule by chair, with live statuses
  - Unpaid balances, recalls due and next-day confirmations

It runs on generated **demo data** out of the box, and reads from **Airtable** when configured.

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

## Tests
```bash
npm test
```

## Docs
| File | What's in it |
|---|---|
| [CLAUDE.md](CLAUDE.md) | Orientation for contributors and Claude: layout, data contract, rules |
| [docs/SPEC.md](docs/SPEC.md) | Product spec: users, screens, exact KPI formulas, roadmap |
| [docs/PRACTICE.md](docs/PRACTICE.md) | Engineering practice: style, adapters, secrets, privacy, i18n/RTL, charts, testing |
| [docs/AIRTABLE.md](docs/AIRTABLE.md) | Base schema, seeding, free-plan limits, connecting real data |

All names and phone numbers in the demo data are fictional.
