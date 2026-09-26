// Daily market collection: Apify → "Dental Market Trends" Airtable base.
//   • apify/google-trends-scraper   → Search Trends (one record per topic+region)
//   • compass/crawler-google-places → Competitors (one record per clinic, daily history)
// Runs from .github/workflows/collect-trends.yml (daily) or by hand:
//   npm run collect                   # both
//   npm run collect -- --only=trends  # or --only=places
//   npm run collect -- --dry-run      # run Apify, print what would be written, write nothing
// Needs APIFY_TOKEN and AIRTABLE_MARKET_TOKEN (write access to the market base only). See docs/MARKET.md.

import { loadEnv, requireEnv } from '../server/env.js';
import { listAll } from '../public/js/data/airtable-sync.js';
import { MARKET, MARKET_BASE_ID, trendsUrl } from '../public/js/data/market-config.js';
import {
  MARKET_TABLES, competitorFromRecord, competitorToFields, normalizePlaces, normalizeTrends, trendToFields,
} from '../public/js/data/market-schema.js';

loadEnv();

const APIFY = 'https://api.apify.com/v2';
const AIRTABLE = 'https://api.airtable.com/v0';
const RUN_TIMEOUT_MS = 20 * 60_000;
const args = process.argv.slice(2);
const only = args.find((a) => a.startsWith('--only='))?.slice(7);
const dryRun = args.includes('--dry-run');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const todayIL = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());

async function apify(path, init = {}) {
  const res = await fetch(`${APIFY}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${requireEnv('APIFY_TOKEN')}`, 'Content-Type': 'application/json', ...init.headers },
  });
  if (!res.ok) throw new Error(`Apify ${path.split('?')[0]}: ${res.status} ${await res.text()}`);
  return res.json();
}

// Start an actor run, wait for it, return its dataset items.
async function runActor(actorId, input) {
  const { data: run } = await apify(`/acts/${actorId.replace('/', '~')}/runs`, { method: 'POST', body: JSON.stringify(input) });
  console.log(`  ${actorId}: run ${run.id} started`);
  const started = Date.now();
  let status = run.status;
  let datasetId = run.defaultDatasetId;
  while (!['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT'].includes(status)) {
    if (Date.now() - started > RUN_TIMEOUT_MS) throw new Error(`${actorId}: run ${run.id} still ${status} after 20 min`);
    await sleep(10_000);
    const { data } = await apify(`/actor-runs/${run.id}`);
    ({ status } = data);
    datasetId = data.defaultDatasetId;
  }
  if (status !== 'SUCCEEDED') throw new Error(`${actorId}: run ${run.id} ended ${status}`);
  const items = await apify(`/datasets/${datasetId}/items?clean=true&format=json`);
  console.log(`  ${actorId}: ${items.length} items in ${Math.round((Date.now() - started) / 1000)} s`);
  return items;
}

// Upsert in batches of 10 (Airtable's limit), sequentially (5 requests/second per base).
async function upsert(table, mergeOn, fieldsList) {
  const baseId = process.env.AIRTABLE_MARKET_BASE_ID || MARKET_BASE_ID;
  const token = requireEnv('AIRTABLE_MARKET_TOKEN');
  for (let i = 0; i < fieldsList.length; i += 10) {
    const res = await fetch(`${AIRTABLE}/${baseId}/${encodeURIComponent(table)}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        performUpsert: { fieldsToMergeOn: [mergeOn] },
        records: fieldsList.slice(i, i + 10).map((fields) => ({ fields })),
        typecast: true,
      }),
    });
    if (!res.ok) throw new Error(`Airtable ${table}: ${res.status} ${await res.text()}`);
    await sleep(250);
  }
}

async function collectTrends() {
  console.log('Search trends (Google Trends)');
  // Per region: one comparison URL (shared scale) + one URL per term (its rising queries).
  const startUrls = MARKET.regions.flatMap((region) => {
    const terms = MARKET.topics.map((tp) => tp.terms[region.key]);
    return [trendsUrl(region.geo, terms), ...terms.map((term) => trendsUrl(region.geo, [term]))];
  }).map((url) => ({ url }));
  const items = await runActor('apify/google-trends-scraper', { startUrls, maxItems: 0, skipDebugScreen: true });
  const trends = normalizeTrends(items);
  if (!trends.length) throw new Error('Google Trends returned no usable series; nothing written');
  for (const tr of trends) console.log(`  ${tr.key.padEnd(20)} latest ${tr.latest ?? '—'}  3m ${tr.change3m == null ? '—' : `${Math.round(tr.change3m * 100)}%`}  rising ${tr.rising.length}`);
  if (!dryRun) await upsert(MARKET_TABLES.searchTrends, 'Key', trends.map(trendToFields));
  return trends.length;
}

async function collectPlaces() {
  console.log('Nearby clinics (Google Maps)');
  const { searches, location, maxPlaces, language } = MARKET.competitors;
  const items = await runActor('compass/crawler-google-places', {
    searchStringsArray: searches,
    locationQuery: location,
    maxCrawledPlacesPerSearch: maxPlaces,
    language,
    maxReviews: 0,
    maxImages: 0,
    scrapePlaceDetailPage: false,
    skipClosedPlaces: true,
  });
  const baseId = process.env.AIRTABLE_MARKET_BASE_ID || MARKET_BASE_ID;
  const existing = (await listAll(baseId, requireEnv('AIRTABLE_MARKET_TOKEN'), MARKET_TABLES.competitors)).map(competitorFromRecord);
  const clinics = normalizePlaces(items, existing, todayIL());
  if (!clinics.length) throw new Error('Google Maps returned no places; nothing written');
  for (const c of clinics) console.log(`  ${c.name.slice(0, 40).padEnd(40)} ★${c.rating ?? '—'}  ${c.reviews ?? '—'} reviews  (${c.history.length} days)`);
  if (!dryRun) await upsert(MARKET_TABLES.competitors, 'Place ID', clinics.map(competitorToFields));
  return clinics.length;
}

const jobs = { trends: collectTrends, places: collectPlaces };
let failed = false;
for (const [name, job] of Object.entries(jobs)) {
  if (only && only !== name) continue;
  try {
    const n = await job();
    console.log(`✓ ${name}: ${n} records ${dryRun ? '(dry run, not written)' : 'upserted'}\n`);
  } catch (err) {
    failed = true;
    console.error(`✗ ${name}: ${err.message}\n`);
  }
}
process.exit(failed ? 1 : 0);
