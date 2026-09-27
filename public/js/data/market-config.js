// What the Market tab tracks. Used by the daily collector (scripts/collect-trends.js),
// the demo generator and the UI. Edit terms/location here; topic keys are i18n keys (topic.<key>).

export const MARKET_BASE_ID = 'app4RLlYNfgYxgs7f'; // Airtable base "Dental Market Trends"

export const MARKET = {
  // Google Trends: all topics of a region are compared in ONE request, so their values
  // share a scale (100 = the busiest week of the busiest topic in that region). Max 5 topics.
  timeRange: 'today 12-m', // Trends URL form
  actorTimeRange: '', // apify/google-trends-scraper form: '' = past 12 months (its allowed values differ from the URL's)
  // Per-term runs for "rising searches". Off by default: Google blocks them most days, and a
  // blocked run still uses Apify compute until its time limit. Turn on to try again.
  risingSearches: false,
  regions: [
    { key: 'IL', geo: 'IL' },
    { key: 'Worldwide', geo: '' },
  ],
  topics: [
    { key: 'implants', terms: { IL: 'שתלים דנטליים', Worldwide: 'dental implants' } },
    { key: 'whitening', terms: { IL: 'הלבנת שיניים', Worldwide: 'teeth whitening' } },
    { key: 'aligners', terms: { IL: 'invisalign', Worldwide: 'invisalign' } },
    { key: 'veneers', terms: { IL: 'ציפוי שיניים', Worldwide: 'veneers' } },
    { key: 'braces', terms: { IL: 'יישור שיניים', Worldwide: 'braces' } },
  ],
  // Google Maps: dental clinics near the clinic. Each place is one paid Apify result.
  competitors: {
    searches: ['dentist'],
    location: 'Tel Aviv, Israel',
    maxPlaces: 20,
    language: 'en',
  },
};

// Commas between terms stay literal: that is how Google Trends marks a comparison.
export function trendsUrl(geo, terms) {
  const q = terms.map(encodeURIComponent).join(',');
  return `https://trends.google.com/trends/explore?date=${encodeURIComponent(MARKET.timeRange)}${geo ? `&geo=${geo}` : ''}&q=${q}`;
}
