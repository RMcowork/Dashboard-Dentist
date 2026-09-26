// Where the dashboard gets its data.
//   • server mode  — `npm start`: GET api/data (the token stays on the server).
//   • browser mode — static hosting such as GitHub Pages, where there is no API:
//       demo data generated in the browser, or Airtable read directly from the browser
//       with a read-only token the viewer pastes in (kept only in this browser's localStorage).
// Both return { source, airtableConfigured, sync, data, mode }.

import { createAirtableSync } from './airtable-sync.js';
import { getDemoData } from './demo-source.js';
import { MARKET_BASE_ID } from './market-config.js';
import { getDemoMarket } from './market-demo.js';
import { createMarketReader } from './market-source.js';

const STORE_KEY = 'dental-dash.airtable';
export const DEFAULT_BASE_ID = 'appTRu3aSv38OmmGV';

// 'server' | 'browser'. Known static hosts skip the API probe; elsewhere the first request decides.
let mode = typeof location !== 'undefined' && location.hostname.endsWith('.github.io') ? 'browser' : null;

export function getMode() {
  return mode;
}

export function loadAirtableConfig() {
  try {
    const cfg = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    return cfg?.baseId && cfg?.token ? cfg : null;
  } catch {
    return null;
  }
}

export function saveAirtableConfig(cfg) {
  try {
    if (cfg) localStorage.setItem(STORE_KEY, JSON.stringify({ baseId: cfg.baseId, marketBaseId: cfg.marketBaseId, token: cfg.token }));
    else localStorage.removeItem(STORE_KEY);
  } catch { /* storage unavailable: the connection lasts for this page load only */ }
  memoryConfig = cfg;
  airtable.reset();
  market.reset();
}

let memoryConfig = loadAirtableConfig();
const airtable = createAirtableSync(() => ({ ...memoryConfig, minIntervalMs: 15_000, fullSyncMs: 30 * 60_000 }));
const market = createMarketReader(() => ({ baseId: memoryConfig?.marketBaseId, token: memoryConfig?.token }));
export const DEFAULT_MARKET_BASE_ID = MARKET_BASE_ID;

// Throws on bad token/base, so the connect dialog can report it before saving.
export async function testAirtable(cfg) {
  const probe = createAirtableSync(() => ({ ...cfg, minIntervalMs: 0 }));
  await probe.getData();
  if (cfg.marketBaseId) {
    const marketProbe = createMarketReader(() => ({ baseId: cfg.marketBaseId, token: cfg.token }));
    await marketProbe.getMarket().catch((err) => { throw new Error(`Market base: ${err.message}`); });
  }
}

async function fromServer(force) {
  const res = await fetch(`api/data${force ? '?force=1' : ''}`, { cache: 'no-store' });
  const isJson = (res.headers.get('content-type') || '').includes('application/json');
  if (!isJson) return null; // static host: no API here
  const body = await res.json();
  if (!res.ok) throw Object.assign(new Error(body.error || res.statusText), { fromServer: true });
  return { ...body, mode: 'server' };
}

async function fromBrowser(force) {
  if (memoryConfig) {
    const { data, sync } = await airtable.getData({ force });
    return { source: 'airtable', airtableConfigured: true, sync, data, mode: 'browser' };
  }
  const { data, sync } = getDemoData();
  return { source: 'demo', airtableConfigured: false, sync, data, mode: 'browser' };
}

export async function loadData({ force = false } = {}) {
  if (mode !== 'browser') {
    let body = null;
    try {
      body = await fromServer(force);
    } catch (err) {
      // A real server error (or a lost connection to a known server), not a missing API.
      if (mode === 'server' || err.fromServer) throw err;
    }
    if (body) {
      mode = 'server';
      return body;
    }
    mode = 'browser';
  }
  return fromBrowser(force);
}

// Market tab data: { source: 'airtable' | 'demo', data: { searchTrends, competitors }, error? }.
// Call after loadData() so the mode is known. A failure never breaks the main dashboard:
// it falls back to demo market data and reports the error.
export async function loadMarket({ force = false } = {}) {
  try {
    if (mode === 'server') {
      const res = await fetch(`api/market${force ? '?force=1' : ''}`, { cache: 'no-store' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || res.statusText);
      return body;
    }
    if (memoryConfig?.marketBaseId) return { source: 'airtable', data: await market.getMarket({ force }) };
    return { source: 'demo', data: getDemoMarket() };
  } catch (err) {
    return { source: 'demo', data: getDemoMarket(), error: err.message };
  }
}
