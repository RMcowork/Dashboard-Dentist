// Reads the "Dental Market Trends" base (filled daily by the Apify collector).
// The data changes once a day, so reads are cached for `minIntervalMs` (default 10 min):
// 2 API calls per read, whatever the dashboard's refresh interval.

import { listAll } from './airtable-sync.js';
import { MARKET_TABLES, competitorFromRecord, trendFromRecord } from './market-schema.js';

export function createMarketReader(config) {
  const state = { data: null, at: 0, inflight: null };

  async function read() {
    const { baseId, token } = config();
    const [trendRows, placeRows] = await Promise.all([
      listAll(baseId, token, MARKET_TABLES.searchTrends),
      listAll(baseId, token, MARKET_TABLES.competitors),
    ]);
    state.data = { searchTrends: trendRows.map(trendFromRecord), competitors: placeRows.map(competitorFromRecord) };
    state.at = Date.now();
  }

  async function getMarket({ force = false } = {}) {
    const minInterval = config().minIntervalMs ?? 600_000;
    if (state.data && Date.now() - state.at < (force ? 60_000 : minInterval)) return state.data;
    if (!state.inflight) state.inflight = read().finally(() => { state.inflight = null; });
    try {
      await state.inflight;
    } catch (err) {
      if (!state.data) throw err;
    }
    return state.data;
  }

  return { getMarket, reset: () => Object.assign(state, { data: null, at: 0, inflight: null }) };
}
