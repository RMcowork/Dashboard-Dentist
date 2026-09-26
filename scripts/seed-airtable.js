// Uploads data/demo.json into the Airtable base in AIRTABLE_BASE_ID.
// Creates any missing tables/fields first (needs schema.bases:write), then inserts records in
// dependency order, translating local ids (pat001…) into Airtable record ids for link fields.
//
// Usage:
//   node scripts/seed-airtable.js           # create schema if needed, then insert records
//   node scripts/seed-airtable.js --reset   # first delete ALL records in the four tables
//
// Token scopes: data.records:read, data.records:write, schema.bases:read, schema.bases:write

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, loadEnv, requireEnv } from '../server/env.js';
import { TABLES, TABLE_ORDER, toAirtableFields } from '../public/js/data/schema.js';
import { listAll } from '../server/adapters/airtable.js';

loadEnv();
const BASE = requireEnv('AIRTABLE_BASE_ID');
const TOKEN = requireEnv('AIRTABLE_TOKEN');
const API = 'https://api.airtable.com/v0';
const BATCH = 10; // Airtable max records per write request
const PAUSE_MS = 250; // stay under 5 requests/second

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(method, path, body) {
  await sleep(PAUSE_MS);
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${JSON.stringify(json)}`);
  return json;
}

function fieldSpec(f, tableIds) {
  const spec = { name: f.name, type: f.type };
  if (f.link) spec.options = { linkedTableId: tableIds[f.link] };
  else if (f.options) spec.options = f.options;
  return spec;
}

async function ensureSchema() {
  const { tables } = await api('GET', `/meta/bases/${BASE}/tables`);
  const byName = new Map(tables.map((t) => [t.name, t]));
  const tableIds = {};
  for (const key of TABLE_ORDER) {
    const def = TABLES[key];
    const existing = byName.get(def.name);
    if (!existing) {
      console.log(`Creating table ${def.name}`);
      const created = await api('POST', `/meta/bases/${BASE}/tables`, {
        name: def.name,
        fields: def.fields.map((f) => fieldSpec(f, tableIds)),
      });
      tableIds[key] = created.id;
      continue;
    }
    tableIds[key] = existing.id;
    const have = new Set(existing.fields.map((f) => f.name));
    for (const f of def.fields.filter((x) => !have.has(x.name))) {
      console.log(`Adding field ${def.name}.${f.name}`);
      await api('POST', `/meta/bases/${BASE}/tables/${existing.id}/fields`, fieldSpec(f, tableIds));
    }
  }
  return tableIds;
}

async function reset(tableIds) {
  for (const key of [...TABLE_ORDER].reverse()) {
    const records = await listAll(BASE, TOKEN, tableIds[key]);
    for (let i = 0; i < records.length; i += BATCH) {
      const qs = records.slice(i, i + BATCH).map((r) => `records[]=${r.id}`).join('&');
      await api('DELETE', `/${BASE}/${tableIds[key]}?${qs}`);
    }
    console.log(`Deleted ${records.length} ${TABLES[key].name}`);
  }
}

async function insert(tableIds, data) {
  const idMap = {};
  for (const key of TABLE_ORDER) {
    const rows = data[key];
    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH);
      const { records } = await api('POST', `/${BASE}/${tableIds[key]}`, {
        records: chunk.map((r) => ({ fields: toAirtableFields(key, r, idMap) })),
        typecast: true,
      });
      records.forEach((rec, j) => { idMap[chunk[j].id] = rec.id; });
      process.stdout.write(`\r${TABLES[key].name}: ${Math.min(i + BATCH, rows.length)}/${rows.length}`);
    }
    process.stdout.write('\n');
  }
}

const file = join(ROOT, 'data', 'demo.json');
if (!existsSync(file)) {
  console.error('data/demo.json not found. Run `npm run generate` first.');
  process.exit(1);
}
const data = JSON.parse(readFileSync(file, 'utf8'));

const tableIds = await ensureSchema();
if (process.argv.includes('--reset')) await reset(tableIds);
else {
  const existing = await listAll(BASE, TOKEN, tableIds.appointments);
  if (existing.length) {
    console.error(`Appointments already has ${existing.length} records. Re-run with --reset to replace them.`);
    process.exit(1);
  }
}
await insert(tableIds, data);
console.log(`Done. Seeded data generated for ${data.generatedFor}.`);
