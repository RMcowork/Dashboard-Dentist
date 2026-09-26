// Airtable reader shared by the Node server (server/adapters/airtable.js) and the
// static GitHub Pages build (public/js/data/source.js). No Node or DOM APIs.
//
// Sync strategy (keeps a 60-second refresh inside Airtable's API quota):
//   • full load  — every table, every page. On start and every `fullSyncMs`
//                  (catches deletions and reference-table edits).
//   • delta load — only patients + appointments created/modified since the last sync
//                  (usually 2 API calls returning 0 rows).
//   • coalescing — concurrent requests share one in-flight sync, and syncs closer together
//                  than `minIntervalMs` return the cached result.
//   • stale      — if Airtable fails after a good sync, the last data is served.

import { TABLES, TABLE_ORDER, fromAirtableRecord } from './schema.js';

const API = 'https://api.airtable.com/v0';
const DELTA_TABLES = ['patients', 'appointments'];
const CLOCK_SKEW_MS = 5000;

// One page-through of a table. `onCall` counts API requests.
export async function listAll(baseId, token, table, { fields, formula, onCall } = {}) {
  const records = [];
  let offset;
  do {
    const url = new URL(`${API}/${baseId}/${encodeURIComponent(table)}`);
    url.searchParams.set('pageSize', '100');
    for (const f of fields ?? []) url.searchParams.append('fields[]', f);
    if (formula) url.searchParams.set('filterByFormula', formula);
    if (offset) url.searchParams.set('offset', offset);
    onCall?.();
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Airtable ${table}: ${res.status} ${await res.text()}`);
    const body = await res.json();
    records.push(...body.records);
    offset = body.offset;
  } while (offset);
  return records;
}

/**
 * config() is read on every sync so settings can change at runtime (and in tests):
 *   { baseId, token, minIntervalMs = 15000, fullSyncMs = 1800000, tableNames = {}, fieldNames = {} }
 * For a real clinic base whose tables/columns are named differently, pass e.g.
 *   tableNames: { patients: 'Clients' }, fieldNames: { patients: { phone: 'Mobile' } }
 */
export function createAirtableSync(config) {
  const state = { data: null, syncedAt: 0, fullAt: 0, inflight: null, apiCalls: 0, lastSync: null };
  const onCall = () => { state.apiCalls += 1; };

  async function readTable(key, opts) {
    const { baseId, token, tableNames = {}, fieldNames = {} } = config();
    const fields = TABLES[key].fields.filter((f) => f.key !== 'label').map((f) => fieldNames[key]?.[f.key] ?? f.name);
    const rows = await listAll(baseId, token, tableNames[key] ?? TABLES[key].name, { fields, onCall, ...opts });
    return rows.map((r) => fromAirtableRecord(key, r, fieldNames[key]));
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
    const needFull = !state.data || now - state.fullAt > (config().fullSyncMs ?? 1_800_000);
    const callsBefore = state.apiCalls;
    const { data, changed } = needFull ? await fullLoad() : await deltaLoad(state.syncedAt);
    state.data = data;
    state.syncedAt = now;
    if (needFull) state.fullAt = now;
    state.lastSync = { mode: needFull ? 'full' : 'delta', changed, calls: state.apiCalls - callsBefore };
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

  async function getData({ force = false } = {}) {
    const minInterval = config().minIntervalMs ?? 15_000;
    const floor = force ? Math.min(3000, minInterval) : minInterval;
    if (state.data && Date.now() - state.syncedAt < floor) return result('cached');
    if (!state.inflight) state.inflight = sync().finally(() => { state.inflight = null; });
    try {
      await state.inflight;
      return result(state.lastSync.mode);
    } catch (err) {
      if (!state.data) throw err;
      // Keep serving the last good data (e.g. quota exceeded / network blip).
      return result('stale', err.message);
    }
  }

  function reset() {
    Object.assign(state, { data: null, syncedAt: 0, fullAt: 0, inflight: null, apiCalls: 0, lastSync: null });
  }

  return { getData, reset };
}
