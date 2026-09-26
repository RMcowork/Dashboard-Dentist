// Demo adapter: generates data in memory, anchored to the current day, so the
// Front desk tab always has a live-looking schedule. No network, no token.

import { generate } from '../demo/generate.js';
import { todayStr } from '../../public/js/dates.js';

export const name = 'demo';

let cache = null;

export async function getData() {
  const now = new Date();
  const today = todayStr();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  // Statuses of today's appointments follow the clock, so regenerate when the minute changes.
  const mode = cache && cache.today === today && cache.nowMin === nowMin ? 'cached' : 'full';
  if (mode === 'full') cache = { today, nowMin, data: generate({ today, nowMin }), at: now.toISOString() };
  return { data: cache.data, sync: { at: cache.at, mode, changed: null, calls: 0 } };
}
