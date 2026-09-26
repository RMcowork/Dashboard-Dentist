// Demo market data: plausible Google Trends curves and fictional nearby clinics,
// anchored to today and deterministic per day. Shown until the Apify collector has filled
// the "Dental Market Trends" base (or when Airtable isn't connected).

import { addDays, todayStr, weekStart } from '../dates.js';
import { MARKET } from './market-config.js';
import { change3m } from './market-schema.js';

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Shape per topic: base level, yearly growth, seasonal peak month (0-11) and strength.
const SHAPES = {
  implants: { IL: [62, 0.10, 2, 0.08], Worldwide: [70, 0.06, 0, 0.05] },
  whitening: { IL: [48, 0.04, 5, 0.30], Worldwide: [55, 0.02, 5, 0.22] },
  aligners: { IL: [30, 0.35, 8, 0.12], Worldwide: [42, 0.18, 8, 0.10] },
  veneers: { IL: [22, 0.45, 6, 0.15], Worldwide: [38, 0.30, 6, 0.12] },
  braces: { IL: [40, -0.05, 7, 0.28], Worldwide: [60, -0.02, 7, 0.25] },
};

const RISING = {
  IL: {
    implants: [['שתלים דנטליים מחיר', 'Breakout'], ['שתלים בטורקיה', '+350%'], ['שתלים ביום אחד', '+180%']],
    whitening: [['הלבנת שיניים ביתית', '+250%'], ['ערכת הלבנה', '+120%']],
    aligners: [['invisalign מחיר', '+300%'], ['יישור שקוף למבוגרים', '+160%']],
    veneers: [['ציפויי קומפוזיט', 'Breakout'], ['ציפוי שיניים לפני ואחרי', '+220%']],
    braces: [['גשר שקוף', '+140%'], ['אורתודנט לילדים', '+90%']],
  },
  Worldwide: {
    implants: [['all on 4 cost', '+190%'], ['dental implants turkey', '+150%']],
    whitening: [['teeth whitening strips', '+130%'], ['led teeth whitening', '+110%']],
    aligners: [['invisalign vs braces', '+170%'], ['clear aligners cost', '+140%']],
    veneers: [['composite veneers', 'Breakout'], ['veneers before and after', '+260%']],
    braces: [['ceramic braces', '+80%'], ['braces colors', '+60%']],
  },
};

const CLINICS = [
  ['Demo Smile Studio', 4.9, 412, 0.9], ['Demo Rothschild Dental', 4.8, 655, 1.4], ['Demo Dizengoff Dental Care', 4.7, 318, 0.7],
  ['Demo Florentin Dental', 4.6, 205, 0.5], ['Demo Sarona Orthodontics', 4.9, 188, 0.8], ['Demo Jaffa Family Dentistry', 4.5, 540, 0.6],
  ['Demo Neve Tzedek Aesthetics', 4.8, 97, 1.1], ['Demo Ramat Aviv Dental', 4.4, 730, 0.4], ['Demo Bauhaus Implant Center', 4.7, 263, 1.0],
  ['Demo Yarkon Kids Dental', 4.9, 151, 0.6], ['Demo Allenby Dental Clinic', 4.2, 389, 0.3], ['Demo Ibn Gabirol Smiles', 4.6, 122, 0.5],
];

let cache = null;

export function getDemoMarket() {
  const today = todayStr();
  if (cache?.today === today) return cache.data;
  const rand = rng(Number(today.replaceAll('-', '')) % 100000);
  const lastWeek = addDays(weekStart(today), -7);
  const weeks = Array.from({ length: 52 }, (_, i) => addDays(lastWeek, (i - 51) * 7));
  const updated = `${today}T06:00:00.000Z`;

  const searchTrends = [];
  for (const region of MARKET.regions) {
    for (const tp of MARKET.topics) {
      const [base, growth, peak, season] = SHAPES[tp.key][region.key];
      const series = weeks.map((d, i) => {
        const month = Number(d.slice(5, 7)) - 1;
        const seasonal = 1 + season * Math.cos(((month - peak) / 12) * 2 * Math.PI);
        const trendF = 1 + growth * (i / 51 - 0.5);
        return [d, Math.max(1, Math.min(100, Math.round(base * seasonal * trendF * (0.9 + rand() * 0.2))))];
      });
      const values = series.map(([, v]) => v);
      searchTrends.push({
        key: `${tp.key}|${region.key}`,
        topic: tp.key,
        region: region.key,
        term: tp.terms[region.key],
        latest: values.at(-1),
        average: Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10) / 10,
        change3m: change3m(values),
        series,
        rising: RISING[region.key][tp.key].map(([query, label]) => ({ query, value: parseInt(label.replace(/\D/g, ''), 10) || null, label })),
        updated,
      });
    }
  }

  const days = Array.from({ length: 90 }, (_, i) => addDays(today, i - 89));
  const competitors = CLINICS.map(([name, rating, reviews, perWeek], i) => {
    // Walk back from today's count so the history ends exactly at `reviews`.
    let n = reviews;
    const history = [...days].reverse().map((d) => {
      const entry = { d, r: rating, n };
      if (rand() < perWeek / 7) n -= 1;
      return entry;
    }).reverse();
    return {
      placeId: `demo-${i + 1}`,
      name,
      city: 'Tel Aviv-Yafo',
      address: null,
      category: i === 4 ? 'Orthodontist' : 'Dental clinic',
      rating,
      reviews,
      url: null,
      website: null,
      history,
      updated,
    };
  });

  cache = { today, data: { searchTrends, competitors } };
  return cache.data;
}
