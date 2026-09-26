// Airtable adapter: reads the four tables via the REST API and normalizes them.
// The token stays on the server; the browser only ever sees /api/data.
//
// Sync strategy (keeps a 60-second refresh inside Airtable's API quota):
//   • full load  — every table, every page. On start and every AIRTABLE_FULL_SYNC_MINUTES
//                  (catches deletions and reference-table edits).
//   • delta load — only patients + appointments created/modified since the last sync
//                  (usually 2 API calls returning 0 rows).
//   • coalescing — concurrent requests share one in-flight sync, and syncs closer together
//                  than AIRTABLE_MIN_INTERVAL_SECONDS return the cached result.

import { requireEnv } from '../env.js';
import { TABLES, TABLE_ORDER, fromAirtableRecord } from '../schema.js';

export const name = 'airtable';

const API = 'https://api.airtable.com/v0';
const DELTA_TABLES = ['patients', 'appointments'];
const CLOCK_SKEW_MS = 5000;

const envNumber = (name, fallback) => {
  const v = process.env[name];
  return v === undefined || v === '' || Number.isNaN(Number(v)) ? fallback : Number(v);
};
const minIntervalMs = () => envNumber('AIRTABLE_MIN_INTERVAL_SECONDS', 15) * 1000;
const fullSyncMs = () => envNumber('AIRTABLE_FULL_SYNC_MINUTES', 30) * 60_000;

// For a real clinic base whose tables/columns are named differently, override names here, e.g.
// TABLE_NAMES.patients = 'Clients';  FIELD_NAMES.patients = { phone: 'Mobile', firstVisit: 'Registered' };
export const TABLE_NAMES = {};
export const FIELD_NAMES = {};

const state = { data: null, syncedAt: 0, fullAt: 0, inflight: null, apiCalls: 0, lastSync: null };

// Exposed for tests.
export function _reset() {
  Object.assign(state, { data: null, syncedAt: 0, fullAt: 0, inflight: null, apiCalls: 0, lastSync: null });
}

function fieldNamesFor(key) {
  return TABLES[key].fields.filter((f) => f.key !== 'label').map((f) => FIELD_NAMES[key]?.[f.key] ?? f.name);
}

export async function listAll(baseId, token, table, { fields, formula } = {}) {
  const records = [];
  let offset;
  do {
    const url = new URL(`${API}/${baseId}/${encodeURIComponent(table)}`);
    url.searchParams.set('pageSize', '100');
    for (const f of fields ?? []) url.searchParams.append('fields[]', f);
    if (formula) url.searchParams.set('filterByFormula', formula);
    if (offset) url.searchParams.set('offset', offset);
    state.apiCalls += 1;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Airtable ${table}: ${res.status} ${await res.text()}`);
    const body = await res.json();
    records.push(...body.records);
    offset = body.offset;
  } while (offset);
  return records;
}

async function readTable(key, opts) {
  const baseId = requireEnv('AIRTABLE_BASE_ID');
  const token = requireEnv('AIRTABLE_TOKEN');
  const rows = await listAll(baseId, token, TABLE_NAMES[key] ?? TABLES[key].name, { fields: fieldNamesFor(key), ...opts });
  return rows.map((r) => fromAirtableRecord(key, r, FIELD_NAMES[key]));
}

async function fullLoad() {
  const data = {};
  // Sequential on purpose: Airtable allows 5 requests/second per base.
  for (const key of TABLE_ORDER) data[key] = await readTable(key);
  return { data, changed: null };
}

async function deltaLoad(since) {
  const iso = new Date(since - CLOCK_SKEW_MS).toISOString();
  const formula = `OR(IS_AFTER(LAST_MODIFIED_TIME(), DATETIME_PARSE('${iso}')), IS_AFTER(CREATED_TIME(), DATETIME_PARSE('${iso}')))`;
  const data = { ...state.data };
  let changed = 0;
  for (const key of DELTA_TABLES) {
    const rows = await readTable(key, { formula });
    if (!rows.length) continue;
    const byId = new Map(data[key].map((r) => [r.id, r]));
    for (const r of rows) byId.set(r.id, r);
    data[key] = [...byId.values()];
    changed += rows.length;
  }
  return { data, changed };
}

async function sync() {
  const now = Date.now();
  const needFull = !state.data || now - state.fullAt > fullSyncMs();
  const callsBefore = state.apiCalls;
  const { data, changed } = needFull ? await fullLoad() : await deltaLoad(state.syncedAt);
  state.data = data;
  state.syncedAt = now;
  if (needFull) state.fullAt = now;
  state.lastSync = { mode: needFull ? 'full' : 'delta', changed, calls: state.apiCalls - callsBefore };
}

export async function getData({ force = false } = {}) {
  const age = Date.now() - state.syncedAt;
  const floor = force ? Math.min(3000, minIntervalMs()) : minIntervalMs();
  if (state.data && age < floor) return result('cached');
  if (!state.inflight) {
    state.inflight = sync().finally(() => { state.inflight = null; });
  }
  try {
    await state.inflight;
    return result(state.lastSync.mode);
  } catch (err) {
    if (!state.data) throw err;
    // Keep serving the last good data (e.g. quota exceeded / network blip).
    return result('stale', err.message);
  }
}

function result(mode, error) {
  return {
    data: state.data,
    sync: {
      at: new Date(state.syncedAt).toISOString(),
      mode,
      changed: mode === 'delta' ? state.lastSync?.changed ?? 0 : null,
      calls: mode === 'cached' ? 0 : state.lastSync?.calls ?? 0,
      apiCallsTotal: state.apiCalls,
      ...(error ? { error } : {}),
    },
  };
}
