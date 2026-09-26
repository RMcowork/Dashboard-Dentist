// Market data for GET /api/market: the "Dental Market Trends" base when a token and
// AIRTABLE_MARKET_BASE_ID are set (the same read-only token, with access to that base too),
// otherwise demo market data. An empty base (collector not run yet) is reported as such.

import { createMarketReader } from '../../public/js/data/market-source.js';
import { getDemoMarket } from '../../public/js/data/market-demo.js';

const reader = createMarketReader(() => ({
  baseId: process.env.AIRTABLE_MARKET_BASE_ID,
  token: process.env.AIRTABLE_TOKEN,
}));

export function marketConfigured() {
  return Boolean(process.env.AIRTABLE_TOKEN && process.env.AIRTABLE_MARKET_BASE_ID);
}

export async function getMarket({ force = false } = {}) {
  if (!marketConfigured()) return { source: 'demo', data: getDemoMarket() };
  const data = await reader.getMarket({ force });
  return { source: 'airtable', data };
}
