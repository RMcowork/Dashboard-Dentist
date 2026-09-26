import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MARKET, trendsUrl } from '../public/js/data/market-config.js';
import {
  change3m, competitorFromRecord, competitorToFields, normalizePlaces, normalizeTrends, reviewsGained,
  trendFromRecord, trendToFields,
} from '../public/js/data/market-schema.js';
import { getDemoMarket } from '../public/js/data/market-demo.js';

const WEEK = 7 * 86400;
const T0 = Date.UTC(2025, 8, 28) / 1000; // Sun 2025-09-28
const timeline = (n, valueAt) => Array.from({ length: n }, (_, i) => ({ time: String(T0 + i * WEEK), value: valueAt(i), hasData: [true] }));

test('trendsUrl keeps literal commas and omits geo for worldwide', () => {
  const url = trendsUrl('', ['a b', 'c']);
  assert.match(url, /q=a%20b,c$/);
  assert.doesNotMatch(url, /geo=/);
  assert.match(trendsUrl('IL', ['x']), /&geo=IL&/);
});

test('change3m compares the last 4 weeks with 4 weeks ending 13 weeks earlier', () => {
  const values = Array.from({ length: 20 }, (_, i) => (i >= 16 ? 60 : i >= 3 && i < 7 ? 40 : 50));
  // last 4 = 60; weeks [-17, -13) = indices 3..6 = 40 → +50%
  assert.equal(change3m(values), 0.5);
  assert.equal(change3m([1, 2, 3]), null);
});

test('normalizeTrends: comparison item gives shared-scale series, single items give rising queries', () => {
  const topics = MARKET.topics;
  const items = [];
  for (const region of MARKET.regions) {
    const terms = topics.map((tp) => tp.terms[region.key]);
    items.push({ inputUrlOrTerm: trendsUrl(region.geo, terms), interestOverTime_timelineData: timeline(20, (i) => terms.map((_, k) => 10 * (k + 1) + i)) });
    for (const term of terms) {
      items.push({
        inputUrlOrTerm: trendsUrl(region.geo, [term]),
        interestOverTime_timelineData: timeline(20, () => [99]),
        relatedQueries_rising: [{ query: `${term} price`, value: [250], formattedValue: ['+250%'] }, { query: `${term} near me`, value: [5000], formattedValue: ['Breakout'] }],
      });
    }
  }
  const out = normalizeTrends(items, '2026-09-26T06:00:00.000Z');
  assert.equal(out.length, MARKET.regions.length * topics.length);
  const second = out.find((tr) => tr.key === `${topics[1].key}|IL`);
  assert.equal(second.series.length, 20);
  assert.deepEqual(second.series[0], ['2025-09-28', 20]); // comparison value for term #2, not the single item's 99
  assert.equal(second.latest, 39);
  assert.equal(second.rising.length, 2);
  assert.deepEqual(second.rising[1], { query: `${topics[1].terms.IL} near me`, value: 5000, label: 'Breakout' });
});

test('normalizeTrends falls back to single-term series when the comparison lacks per-term values', () => {
  const region = MARKET.regions[0];
  const term = MARKET.topics[0].terms[region.key];
  const items = [
    { inputUrlOrTerm: trendsUrl(region.geo, MARKET.topics.map((tp) => tp.terms[region.key])), interestOverTime_timelineData: timeline(5, () => [7]) },
    { inputUrlOrTerm: trendsUrl(region.geo, [term]), interestOverTime_timelineData: timeline(5, (i) => [i + 1]) },
  ];
  const [first] = normalizeTrends(items);
  assert.equal(first.key, `${MARKET.topics[0].key}|${region.key}`);
  assert.deepEqual(first.series.map(([, v]) => v), [1, 2, 3, 4, 5]);
});

test('normalizePlaces merges daily history, dedupes and skips closed places', () => {
  const existing = [{ placeId: 'p1', history: [{ d: '2026-09-24', r: 4.5, n: 100 }, { d: '2026-09-25', r: 4.5, n: 102 }] }];
  const items = [
    { placeId: 'p1', title: 'Clinic One', totalScore: 4.6, reviewsCount: 105, city: 'Tel Aviv', url: 'https://maps.google.com/?cid=1' },
    { placeId: 'p1', title: 'Clinic One (dup)', totalScore: 1, reviewsCount: 1 },
    { placeId: 'p2', title: 'Closed', permanentlyClosed: true },
    { placeId: 'p3', title: 'New Clinic', totalScore: 4.9, reviewsCount: 12 },
  ];
  const out = normalizePlaces(items, existing, '2026-09-26');
  assert.deepEqual(out.map((c) => c.placeId), ['p1', 'p3']);
  assert.deepEqual(out[0].history.at(-1), { d: '2026-09-26', r: 4.6, n: 105 });
  assert.equal(out[0].history.length, 3);
  // Running twice on the same day replaces today's entry instead of adding one
  const again = normalizePlaces(items, out, '2026-09-26');
  assert.equal(again[0].history.length, 3);
});

test('reviewsGained counts reviews over the window', () => {
  const history = [{ d: '2026-08-01', n: 90 }, { d: '2026-08-28', n: 95 }, { d: '2026-09-26', n: 104 }];
  assert.equal(reviewsGained(history, 30), 9); // base = first entry on/after 2026-08-27
  assert.equal(reviewsGained([{ d: '2026-09-26', n: 5 }]), 0);
  assert.equal(reviewsGained([]), null);
});

test('market records round-trip through Airtable fields', () => {
  const { searchTrends, competitors } = getDemoMarket();
  const tr = searchTrends[0];
  assert.deepEqual(trendFromRecord({ id: 'rec1', fields: trendToFields(tr) }), tr);
  const c = competitors[0];
  assert.deepEqual(competitorFromRecord({ id: 'rec2', fields: competitorToFields(c) }), c);
});

test('demo market data covers every topic and region and stays small', () => {
  const { searchTrends, competitors } = getDemoMarket();
  assert.equal(searchTrends.length, MARKET.topics.length * MARKET.regions.length);
  assert.ok(searchTrends.every((tr) => tr.series.length === 52 && tr.series.every(([, v]) => v >= 1 && v <= 100)));
  assert.ok(competitors.length <= MARKET.competitors.maxPlaces);
  assert.ok(competitors.every((c) => c.history.at(-1).n === c.reviews));
});

test('normalizeTrends accepts searchTerms-run items tagged with their region', () => {
  const [il, world] = MARKET.regions;
  const ilTerms = MARKET.topics.map((tp) => tp.terms[il.key]);
  const items = [
    // comparison run: one item, the joined term string, one value per term
    { __geo: il.geo, inputUrlOrTerm: ilTerms.join(','), interestOverTime_timelineData: timeline(20, (i) => ilTerms.map((_, k) => k + i)) },
    // per-term run: rising searches only matter here
    { __geo: il.geo, inputUrlOrTerm: ilTerms[2], interestOverTime_timelineData: timeline(20, () => [80]), relatedQueries_rising: [{ query: 'x', value: [120], formattedValue: ['+120%'] }] },
    // worldwide single term without a comparison → its own series
    { __geo: world.geo, searchTerm: MARKET.topics[0].terms[world.key], interestOverTime_timelineData: timeline(20, () => [42]) },
  ];
  const out = normalizeTrends(items);
  const third = out.find((tr) => tr.key === `${MARKET.topics[2].key}|${il.key}`);
  assert.equal(third.latest, 2 + 19); // comparison value, not the single run's 80
  assert.equal(third.rising[0].label, '+120%');
  assert.equal(out.filter((tr) => tr.region === il.key).length, MARKET.topics.length);
  const worldFirst = out.find((tr) => tr.key === `${MARKET.topics[0].key}|${world.key}`);
  assert.equal(worldFirst.latest, 42);
  assert.equal(out.filter((tr) => tr.region === world.key).length, 1);
});

