// Demo adapter: generates data in memory, anchored to the current day, so the
// Today tab always has a live-looking schedule. No network, no token.

import { generate } from '../demo/generate.js';
import { todayStr } from '../../public/js/dates.js';

export const name = 'demo';

let cache = null;

export async function getData() {
  const now = new Date();
  const today = todayStr();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  // Regenerate at most once a minute (statuses of today's appointments follow the clock)
  if (!cache || cache.today !== today || cache.nowMin !== nowMin) {
    cache = { today, nowMin, data: generate({ today, nowMin }) };
  }
  return cache.data;
}
