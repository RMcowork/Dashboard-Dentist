# Market tab: dental trends via Apify and Airtable

The **Market** tab shows what is happening in the dental world around the clinic:

- **Search interest** (Google Trends) in Israel and worldwide for five treatments: dental implants, teeth whitening, clear aligners, veneers and braces. Each has a card with the latest weekly score (0–100), the change against three months ago and a trend line, plus one chart comparing all five over 12 months.
- **Rising searches**: related searches that grew fastest in the last 12 months (for example "composite veneers" → *Breakout*).
- **Nearby clinics** (Google Maps): dental clinics around the clinic's area with rating, number of reviews and **review momentum** (new reviews in the last 30 days).

Until the collector has run, the tab shows clearly labelled demo data.

## How it works
```
GitHub Actions (daily 07:00 Israel)
  └─ scripts/collect-trends.js
       ├─ Apify: apify/google-trends-scraper     ─┐
       ├─ Apify: compass/crawler-google-places   ─┤ normalize (public/js/data/market-schema.js)
       └─ upsert → Airtable "Dental Market Trends" ◄┘
                              │  (read, cached 10 min)
Dashboard Market tab ◄────────┘  server: GET /api/market · GitHub Pages: read directly
```

- **Separate base.** Market data lives in its own base, *Dental Market Trends* (`app4RLlYNfgYxgs7f`), so it never eats into the clinic base's 1,000-record free-plan limit. It stays small: 10 trend records (5 topics × 2 regions) plus one record per clinic (about 20).
- **Search Trends** table: one record per topic+region (`Key` = `implants|IL`). `Series` holds the weekly values as JSON, and `Rising queries` the top related searches.
- **Competitors** table: one record per Google Maps place (`Place ID`). Each run adds today's rating and review count to `History` (JSON, last 180 days); review momentum is computed from it.
- **Comparable values.** All five topics of a region are requested together in one Google Trends comparison (the actor's `searchTerms` + `isMultiple` input, one run per region), so their numbers share a scale (100 = the busiest week of the most-searched topic in that region).
- **Rising searches** come from optional per-term runs, **off by default** (`risingSearches: false` in `market-config.js`): in testing Google blocked them every time, and a blocked run still uses Apify compute until its 8-minute limit. Set it to `true` to try again; if it fails, the series are still written.
- An empty comparison is retried once, since Google blocks Trends pages at random.
- **Reads are cheap.** The dashboard reads the 2 tables (2 API calls) at most once every 10 minutes, whatever its refresh interval.

## What to track
Edit `public/js/data/market-config.js`:
- `topics`: up to 5 topics, each with a search term per region. The Hebrew terms are a starting point; check them in [Google Trends](https://trends.google.com/trends/explore?geo=IL) and change them if a different wording is more common. A new topic key also needs a `topic.<key>` string in the three `public/i18n/*.json` files.
- `competitors.location`: set this to the clinic's city or neighbourhood (default *Tel Aviv, Israel*). `searches` and `maxPlaces` control what Google Maps returns.

## Setup (once)
You need three things. I never handle tokens; you paste them into GitHub or `.env` yourself.

1. **Apify token.** In Apify: *Settings → API & Integrations → Personal API token*.
2. **Airtable write token for the market base.** At <https://airtable.com/create/tokens> create a token with scopes `data.records:read` and `data.records:write`, and access to **Dental Market Trends only**. It can't touch the clinic data.
3. **GitHub secrets.** In the repo: *Settings → Secrets and variables → Actions → New repository secret*:
   - `APIFY_TOKEN`
   - `AIRTABLE_MARKET_TOKEN`

   Or from a terminal (it prompts for the value, so it isn't saved in your shell history):
   ```bash
   gh secret set APIFY_TOKEN
   ```
   ```bash
   gh secret set AIRTABLE_MARKET_TOKEN
   ```
4. **First run.** *Actions → Collect market trends → Run workflow*. It takes a few minutes; the log lists every topic and clinic it wrote. After that it runs every day at 07:00 Israel time (04:00 UTC).

### Let the dashboard read the market base
- **GitHub Pages:** in *Connect Airtable*, the *Market trends base ID* is prefilled. Your read-only token needs access to **both** bases: edit the token at <https://airtable.com/create/tokens> and add *Dental Market Trends*.
- **Local server:** add `AIRTABLE_MARKET_BASE_ID=app4RLlYNfgYxgs7f` to `.env` and give `AIRTABLE_TOKEN` access to the market base too. Without the ID the server serves demo market data.

If the token can't read the market base, the tab shows demo data with a note saying why; the rest of the dashboard is unaffected.

### Running the collector by hand
Put `APIFY_TOKEN` and `AIRTABLE_MARKET_TOKEN` in `.env`, then:
```bash
npm run collect -- --dry-run
```
`--dry-run` runs Apify and prints what it would write without touching Airtable. Use `--only=trends` or `--only=places` to run one part.

## Cost
- **Apify.** The free plan includes about $5 of usage a month. The Google Maps scraper is billed per place found (about 20 per day with the default settings); the Google Trends scraper uses a little compute per page (12 pages a day). Check *Billing → Usage* in Apify after the first week. If it's too much, lower `maxPlaces` or change the schedule in `.github/workflows/collect-trends.yml` (for example run clinics weekly with `--only=places` on a separate cron).
- **Airtable.** A collection costs about 5 API calls; dashboard reads 2 calls per 10 minutes per open dashboard. Both are small next to the ~1,000 calls/month free-plan limit, but they share it with the clinic data.
- **GitHub Actions.** A few minutes a day, within the free allowance.

## Troubleshooting
- **`Airtable Competitors: 403 … INVALID_PERMISSIONS_OR_MODEL_NOT_FOUND`**: `AIRTABLE_MARKET_TOKEN` can't see the market base. Edit the token at <https://airtable.com/create/tokens>: scopes `data.records:read` and `data.records:write`, and under **Access** add *Dental Market Trends*. Nothing needs to change in GitHub if you edit the same token.
- **Google Trends run is slow or times out.** Google rate-limits Trends scrapers; the first version (12 Trends URLs in one run) got only 1 page through in 19 minutes. The collector now makes one comparison run per region (1 page each) and then optional per-term runs for rising searches, each with a hard 8-minute limit that Apify enforces (Maps: 10 min). A stuck run stops on its own and doesn't keep spending credits; partial results are kept. It runs again the next morning.
- **A run failed in Actions.** Open *Actions → Collect market trends → the run → Collect* for the log; every part prints ✓ or ✗ with the reason. The other part still runs, and existing records are never deleted.

- **`Input is not valid: Field input.timeRange …`**: the actor's time ranges differ from Google Trends URLs. `actorTimeRange` in `market-config.js` must be one of the values the error lists (`''` = past 12 months).

## Caveats
- Google Trends numbers are relative, not search volumes: they show direction and seasonality, not how many people searched.
- Hebrew search terms have low volume for some treatments; a term with too little data returns zeros. Pick wordings people actually use.
- Scrapers depend on Google's pages. If a run fails, the workflow is marked failed in *Actions* and the base keeps the previous data; nothing is deleted.
- The actors' output format is handled defensively (see `normalizeTrends` in `market-schema.js` and its tests), but if Apify changes it, the collector stops with "no usable series" rather than writing bad data.
