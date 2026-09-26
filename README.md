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
The *Dental Clinic Demo* base already exists. To fill it and read from it:

1. Create an Airtable personal access token with the scopes listed in [docs/AIRTABLE.md](docs/AIRTABLE.md), and put it in `.env` as `AIRTABLE_TOKEN`.
2. Generate the data and upload it:
   ```bash
   npm run generate
   npm run seed
   ```
3. Set `DATA_SOURCE=airtable` in `.env` and run `npm start` again.

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
