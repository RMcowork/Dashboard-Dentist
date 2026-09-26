// Market tab: dental search trends (Google Trends) and nearby clinics (Google Maps),
// collected daily by Apify into the "Dental Market Trends" Airtable base.

import { MARKET } from './data/market-config.js';
import { reviewsGained } from './data/market-schema.js';
import { chartCard, seriesColor } from './charts.js';
import { esc, sparkline } from './dom.js';
import { fmtAgo, fmtDate, fmtNum, fmtPct, t } from './i18n.js';
import { icon } from './icons.js';

const TOPIC_ORDER = MARKET.topics.map((tp) => tp.key);
const topicColor = (key) => seriesColor(TOPIC_ORDER.indexOf(key)); // fixed slot per topic
const RISING_SHOWN = 8;
const COMPETITORS_CHARTED = 10;

function changeHtml(change) {
  if (change == null) return `<span class="delta neutral">${esc(t('delta.none'))}</span>`;
  if (Math.abs(change) < 0.005) return '<span class="delta neutral">±0</span>';
  const up = change > 0;
  return `<span class="delta ${up ? 'good' : 'bad'}"><span aria-hidden="true">${up ? '▲' : '▼'}</span> ${esc(fmtPct(Math.abs(change)))}</span>`;
}

// market: { source, data: { searchTrends, competitors }, error? }; view: { region }
export function renderMarket(root, market, { region }, mode = 'static') {
  const animate = mode !== 'static';
  const { searchTrends = [], competitors = [] } = market.data ?? {};
  const trends = searchTrends.filter((tr) => tr.region === region)
    .sort((a, b) => TOPIC_ORDER.indexOf(a.topic) - TOPIC_ORDER.indexOf(b.topic));

  for (const btn of root.querySelectorAll('[data-region]')) btn.setAttribute('aria-pressed', String(btn.dataset.region === region));

  // Source line + notices (empty base / read error)
  const updated = [...searchTrends, ...competitors].map((x) => x.updated).filter(Boolean).sort().at(-1);
  root.querySelector('#market-source').textContent = [
    t(market.source === 'airtable' ? 'market.sourceLive' : 'market.sourceDemo'),
    updated && market.source === 'airtable' ? t('market.updated', { ago: fmtAgo((Date.now() - Date.parse(updated)) / 1000) }) : '',
  ].filter(Boolean).join(' · ');
  const note = root.querySelector('#market-note');
  const empty = market.source === 'airtable' && !searchTrends.length && !competitors.length;
  note.hidden = !market.error && !empty;
  note.querySelector('span:last-child').textContent = market.error ? t('market.error', { message: market.error }) : t('market.empty');

  // Topic cards
  root.querySelector('#topic-grid').innerHTML = trends.length ? trends.map((tr, i) => `
    <article class="kpi topic-card" style="--i:${i}; --topic:${topicColor(tr.topic)}">
      <header class="kpi-head">
        <span class="kpi-icon topic-icon">${icon('search')}</span>
        <h3>${esc(t(`topic.${tr.topic}`))}</h3>
      </header>
      <div class="kpi-value"><bdi dir="ltr">${esc(fmtNum(tr.latest))}<span class="kpi-unit">/100</span></bdi></div>
      <div class="kpi-foot">${changeHtml(tr.change3m)}<span class="kpi-note">${esc(t('market.vs3m'))}</span></div>
      <p class="topic-term" title="${esc(t('market.term'))}">${icon('search', { size: 11 })}<bdi>${esc(tr.term)}</bdi></p>
      ${sparkline(tr.series.map(([, v]) => v), `t-${tr.topic}`)}
    </article>`).join('') : `<p class="empty">${esc(t('empty'))}</p>`;

  // Interest over time: one line per topic, colour fixed per topic
  const dates = [...new Set(trends.flatMap((tr) => tr.series.map(([d]) => d)))].sort();
  const labels = dates.map((d) => fmtDate(d));
  const valueAt = (tr) => { const m = new Map(tr.series); return dates.map((d) => m.get(d) ?? null); };
  chartCard(root, 'interest', {
    type: 'line', labels, legend: true, animate,
    datasets: trends.map((tr) => ({ label: t(`topic.${tr.topic}`), data: valueAt(tr), borderColor: topicColor(tr.topic) })),
    tooltipLabel: (c) => ` ${c.dataset.label}: ${fmtNum(c.parsed.y)}`,
  }, [t('table.period'), ...trends.map((tr) => t(`topic.${tr.topic}`))],
  dates.map((d, i) => [labels[i], ...trends.map((tr) => fmtNum(new Map(tr.series).get(d)))]));

  // Rising searches across topics
  const rising = trends.flatMap((tr) => tr.rising.map((q) => ({ ...q, topic: tr.topic })))
    .sort((a, b) => (b.label === 'Breakout') - (a.label === 'Breakout') || (b.value ?? 0) - (a.value ?? 0))
    .slice(0, RISING_SHOWN);
  root.querySelector('#rising-list').innerHTML = rising.length ? `<ul class="list rising">${rising.map((q) => `
    <li><span class="li-main"><span class="rising-q" dir="auto">${esc(q.query)}</span>
      <span class="topic-chip" style="--topic:${topicColor(q.topic)}">${esc(t(`topic.${q.topic}`))}</span></span>
      <span class="li-value rising-v">${icon('rising', { size: 14 })}${q.label === 'Breakout' ? esc(t('market.breakout')) : `<bdi dir="ltr">${esc(q.label)}</bdi>`}</span></li>`).join('')}</ul>`
    : `<p class="empty">${esc(t('market.noRising'))}</p>`;

  // Competitors: momentum (reviews gained in 30 days) + table
  const clinics = competitors.map((c) => ({ ...c, gained: reviewsGained(c.history, 30) }))
    .sort((a, b) => (b.gained ?? -1) - (a.gained ?? -1) || (b.reviews ?? 0) - (a.reviews ?? 0));
  const charted = clinics.slice(0, COMPETITORS_CHARTED);
  chartCard(root, 'momentum', {
    type: 'bar', horizontal: true, animate,
    labels: charted.map((c) => c.name),
    datasets: [{ label: t('market.gained30'), data: charted.map((c) => c.gained ?? 0), backgroundColor: seriesColor(0) }],
    tooltipLabel: (c) => ` ${t('market.gained30')}: ${fmtNum(c.parsed.x)}`,
  }, [t('market.clinic'), t('market.gained30')], charted.map((c) => [c.name, fmtNum(c.gained)]));

  const byReviews = [...clinics].sort((a, b) => (b.reviews ?? 0) - (a.reviews ?? 0));
  root.querySelector('#competitor-table').innerHTML = byReviews.length ? `
    <thead><tr>
      <th scope="col">${esc(t('market.clinic'))}</th>
      <th scope="col" class="num">${esc(t('market.rating'))}</th>
      <th scope="col" class="num">${esc(t('market.reviews'))}</th>
      <th scope="col" class="num">${esc(t('market.gained30'))}</th>
    </tr></thead>
    <tbody>${byReviews.map((c) => `<tr>
      <th scope="row"><span class="who-name" dir="auto">${c.url ? `<a href="${esc(c.url)}" target="_blank" rel="noopener noreferrer">${esc(c.name)}</a>` : esc(c.name)}</span>
        <span class="muted small block">${esc([c.category, c.city].filter(Boolean).join(' · '))}</span></th>
      <td class="num"><span class="stars">${icon('star', { size: 13 })}${esc(fmtNum(c.rating, 1))}</span></td>
      <td class="num">${esc(fmtNum(c.reviews))}</td>
      <td class="num">${c.gained ? `<span class="delta good"><bdi dir="ltr">+${esc(fmtNum(c.gained))}</bdi></span>` : esc(fmtNum(c.gained))}</td>
    </tr>`).join('')}</tbody>` : `<caption>${esc(t('empty'))}</caption>`;
  root.querySelector('#competitor-note').textContent = t('market.competitorsNote', { location: MARKET.competitors.location });
}
