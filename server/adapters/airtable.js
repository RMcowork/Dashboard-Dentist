// Airtable adapter: reads the four tables via the REST API and normalizes them.
// The token stays on the server; the browser only ever sees /api/data.

import { requireEnv } from '../env.js';
import { TABLES, TABLE_ORDER, fromAirtableRecord } from '../schema.js';

export const name = 'airtable';

const API = 'https://api.airtable.com/v0';
// Airtable's free plan allows ~1,000 API calls/month; each refresh costs one call per 100 records.
const cacheMs = () => (Number(process.env.AIRTABLE_CACHE_MINUTES) || 15) * 60_000;

// For a real clinic base whose tables/columns are named differently, override names here, e.g.
// TABLE_NAMES.patients = 'Clients';  FIELD_NAMES.patients = { phone: 'Mobile', firstVisit: 'Registered' };
export const TABLE_NAMES = {};
export const FIELD_NAMES = {};

let cache = null;

export async function listAll(baseId, token, table) {
  const records = [];
  let offset;
  do {
    const url = new URL(`${API}/${baseId}/${encodeURIComponent(table)}`);
    url.searchParams.set('pageSize', '100');
    if (offset) url.searchParams.set('offset', offset);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Airtable ${table}: ${res.status} ${await res.text()}`);
    const body = await res.json();
    records.push(...body.records);
    offset = body.offset;
  } while (offset);
  return records;
}

export async function getData() {
  if (cache && Date.now() - cache.at < cacheMs()) return cache.data;
  const baseId = requireEnv('AIRTABLE_BASE_ID');
  const token = requireEnv('AIRTABLE_TOKEN');

  const data = {};
  // Sequential on purpose: Airtable allows 5 requests/second per base.
  for (const key of TABLE_ORDER) {
    const rows = await listAll(baseId, token, TABLE_NAMES[key] ?? TABLES[key].name);
    data[key] = rows.map((r) => fromAirtableRecord(key, r, FIELD_NAMES[key]));
  }
  cache = { at: Date.now(), data };
  return data;
}
