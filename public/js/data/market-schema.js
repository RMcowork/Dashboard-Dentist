// Market data: normalized shape, Airtable mapping, and Apify output normalizers.
// Pure functions (no Node/DOM), shared by the collector, the server and the browser.
//
// Normalized shape:
// { searchTrends: [{ key, topic, region, term, latest, average, change3m, series: [[date, value]], rising: [{ query, value, label }], updated }],
//   competitors:  [{ placeId, name, city, address, category, rating, reviews, url, website, history: [{ d, r, n }], updated }] }

import { MARKET } from './market-config.js';

export const MARKET_TABLES = { searchTrends: 'Search Trends', competitors: 'Competitors' };
export const HISTORY_DAYS = 180;
const RISING_LIMIT = 6;

const json = (text, fallback) => {
  try { return text ? JSON.parse(text) : fallback; } catch { return fallback; }
};
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// ---------- Airtable <-> normalized ----------

export function trendToFields(tr) {
  return {
    Key: tr.key,
    Topic: tr.topic,
    Region: tr.region,
    Term: tr.term,
    Latest: tr.latest,
    Average: tr.average,
    'Change 3m': tr.change3m,
    Series: JSON.stringify(tr.series),
    'Rising queries': JSON.stringify(tr.rising),
    Updated: tr.updated,
  };
}

export function trendFromRecord(rec) {
  const f = rec.fields;
  return {
    key: f.Key ?? `${f.Topic}|${f.Region}`,
    topic: f.Topic ?? null,
    region: f.Region ?? null,
    term: f.Term ?? null,
    latest: num(f.Latest),
    average: num(f.Average),
    change3m: num(f['Change 3m']),
    series: json(f.Series, []),
    rising: json(f['Rising queries'], []),
    updated: f.Updated ?? null,
  };
}

export function competitorToFields(c) {
  return {
    'Place ID': c.placeId,
    Name: c.name,
    City: c.city,
    Address: c.address,
    Category: c.category,
    Rating: c.rating,
    Reviews: c.reviews,
    'Maps URL': c.url,
    Website: c.website,
    History: JSON.stringify(c.history),
    Updated: c.updated,
  };
}

export function competitorFromRecord(rec) {
  const f = rec.fields;
  return {
    placeId: f['Place ID'] ?? rec.id,
    name: f.Name ?? '',
    city: f.City ?? null,
    address: f.Address ?? null,
    category: f.Category ?? null,
    rating: num(f.Rating),
    reviews: num(f.Reviews),
    url: f['Maps URL'] ?? null,
    website: f.Website ?? null,
    history: json(f.History, []),
    updated: f.Updated ?? null,
  };
}

// ---------- derived numbers ----------

const avg = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

// Last 4 weeks vs the 4 weeks that ended 13 weeks earlier (about three months).
export function change3m(values) {
  if (values.length < 17) return null;
  const now = avg(values.slice(-4));
  const then = avg(values.slice(-17, -13));
  return then ? (now - then) / then : null;
}

// Reviews gained over the last `days` days, from a daily history.
export function reviewsGained(history, days = 30) {
  if (!history?.length) return null;
  const last = history.at(-1);
  const cutoff = new Date(`${last.d}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - days);
  const iso = cutoff.toISOString().slice(0, 10);
  const base = history.find((h) => h.d >= iso) ?? history[0];
  return base === last && history.length > 1 ? 0 : last.n - base.n;
}

function trendRecord(topicKey, regionKey, term, series, rising, updated) {
  const values = series.map(([, v]) => v);
  return {
    key: `${topicKey}|${regionKey}`,
    topic: topicKey,
    region: regionKey,
    term,
    latest: values.length ? values.at(-1) : null,
    average: values.length ? Math.round(avg(values) * 10) / 10 : null,
    change3m: change3m(values),
    series,
    rising,
    updated,
  };
}

// ---------- Apify → normalized ----------

const unixToDate = (t) => new Date(Number(t) * 1000).toISOString().slice(0, 10);

const splitTerms = (text) => (text ?? '').split(',').map((s) => s.trim()).filter(Boolean);

// Which region and terms an item belongs to. Items from searchTerms runs carry the region
// the collector tagged them with (`__geo`); items from Trends URLs carry it in the URL.
function parseTrendsInput(item) {
  const raw = item.inputUrlOrTerm ?? item.searchTerm ?? item.url ?? '';
  try {
    const url = new URL(raw);
    return { geo: item.__geo ?? url.searchParams.get('geo') ?? '', terms: splitTerms(url.searchParams.get('q')) };
  } catch {
    return { geo: item.__geo ?? null, terms: splitTerms(raw) };
  }
}

function risingFrom(item) {
  return (item.relatedQueries_rising ?? []).slice(0, RISING_LIMIT).map((q) => ({
    query: q.query ?? q.topic?.title ?? '',
    value: num(q.value?.[0] ?? q.value),
    label: q.formattedValue?.[0] ?? q.formattedValue ?? (q.value != null ? `+${q.value}%` : ''),
  })).filter((q) => q.query);
}

/**
 * Items from apify/google-trends-scraper run on trendsUrl() start URLs: per region one
 * comparison URL (all terms) plus one URL per term (for its rising queries).
 * Series come from the comparison item (shared scale); a single-term item is used as a
 * fallback if the comparison didn't return per-term values.
 */
export function normalizeTrends(items, updated = new Date().toISOString(), config = MARKET) {
  const out = [];
  for (const region of config.regions) {
    const regionItems = items.filter((it) => (parseTrendsInput(it).geo ?? '') === region.geo);
    const terms = config.topics.map((tp) => tp.terms[region.key]);
    const comparison = regionItems.find((it) => parseTrendsInput(it).terms.length > 1);
    const timeline = comparison?.interestOverTime_timelineData ?? [];
    const comparable = timeline.length && timeline.every((p) => Array.isArray(p.value) && p.value.length === terms.length);

    config.topics.forEach((tp, i) => {
      const term = tp.terms[region.key];
      const single = regionItems.find((it) => {
        const parsed = parseTrendsInput(it);
        return parsed.terms.length === 1 && parsed.terms[0].toLowerCase() === term.toLowerCase();
      });
      const source = comparable ? timeline.map((p) => [p.time, p.value[i]]) : (single?.interestOverTime_timelineData ?? []).map((p) => [p.time, p.value?.[0] ?? p.value]);
      const series = source.filter(([t, v]) => t != null && typeof v === 'number').map(([t, v]) => [unixToDate(t), v]);
      if (!series.length && !single) return;
      out.push(trendRecord(tp.key, region.key, term, series, single ? risingFrom(single) : [], updated));
    });
  }
  return out;
}

/** Items from compass/crawler-google-places, merged into existing competitors' daily history. */
export function normalizePlaces(items, existing = [], today = new Date().toISOString().slice(0, 10), updated = new Date().toISOString()) {
  const prev = new Map(existing.map((c) => [c.placeId, c]));
  const seen = new Map();
  for (const p of items) {
    const placeId = p.placeId ?? p.url;
    if (!placeId || seen.has(placeId) || p.permanentlyClosed) continue;
    const rating = num(p.totalScore);
    const reviews = num(p.reviewsCount);
    const history = [...(prev.get(placeId)?.history ?? [])].filter((h) => h.d !== today);
    if (rating != null || reviews != null) history.push({ d: today, r: rating, n: reviews });
    seen.set(placeId, {
      placeId,
      name: p.title ?? '',
      city: p.city ?? null,
      address: p.address ?? null,
      category: p.categoryName ?? null,
      rating,
      reviews,
      url: p.url ?? null,
      website: p.website ?? null,
      history: history.slice(-HISTORY_DAYS),
      updated,
    });
  }
  return [...seen.values()];
}
