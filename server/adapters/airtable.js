// Airtable adapter: the token stays on the server; the browser only ever sees /api/data.
// The sync logic (full/delta/coalescing/stale) lives in public/js/data/airtable-sync.js,
// shared with the static GitHub Pages build.

import { requireEnv } from '../env.js';
import { createAirtableSync, listAll } from '../../public/js/data/airtable-sync.js';

export const name = 'airtable';
export { listAll };

// For a real clinic base whose tables/columns are named differently, override names here, e.g.
// TABLE_NAMES.patients = 'Clients';  FIELD_NAMES.patients = { phone: 'Mobile', firstVisit: 'Registered' };
export const TABLE_NAMES = {};
export const FIELD_NAMES = {};

const envNumber = (key, fallback) => {
  const v = process.env[key];
  return v === undefined || v === '' || Number.isNaN(Number(v)) ? fallback : Number(v);
};

const airtable = createAirtableSync(() => ({
  baseId: requireEnv('AIRTABLE_BASE_ID'),
  token: requireEnv('AIRTABLE_TOKEN'),
  minIntervalMs: envNumber('AIRTABLE_MIN_INTERVAL_SECONDS', 15) * 1000,
  fullSyncMs: envNumber('AIRTABLE_FULL_SYNC_MINUTES', 30) * 60_000,
  tableNames: TABLE_NAMES,
  fieldNames: FIELD_NAMES,
}));

export const getData = airtable.getData;
// Exposed for tests.
export const _reset = airtable.reset;
