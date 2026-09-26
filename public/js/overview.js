// Overview tab (owner/manager): KPIs vs previous period, trends, mix, per-dentist performance.

import { addDays, diffDays, monthStart } from './dates.js';
import { byDentist, categoryMix, computeKpis, kpiSeries, previousPeriod, trend } from './metrics.js';
import { fmtDate, fmtMoney, fmtMoneyShort, fmtNum, fmtPct, t } from './i18n.js';
import { renderChart, seriesColor } from './charts.js';
import { esc, initials, tableHtml } from './dom.js';
import { icon } from './icons.js';

export const PRESETS = ['7d', '28d', 'mtd', 'lastMonth', '90d', 'custom'];

export function presetRange(preset, today) {
  switch (preset) {
    case '7d': return { from: addDays(today, -6), to: today };
    case 'mtd': return { from: monthStart(today), to: today };
    case 'lastMonth': {
      const end = addDays(monthStart(today), -1);
      return { from: monthStart(end), to: end };
    }
    case '90d': return { from: addDays(today, -89), to: today };
    default: return { from: addDays(today, -27), to: today };
  }
}

// kind: 'money' | 'count' | 'rate'. lowerIsBetter flips the good/bad reading of a change.
const KPIS = [
  { key: 'revenue', kind: 'money' },
  { key: 'collected', kind: 'money', note: (k) => t('kpi.collectedOf', { rate: fmtPct(k.collectionRate) }) },
  { key: 'completed', kind: 'count' },
  { key: 'newPatients', kind: 'count' },
  { key: 'noShowRate', kind: 'rate', lowerIsBetter: true },
  { key: 'utilization', kind: 'rate' },
  { key: 'avgPerVisit', kind: 'money' },
  { key: 'outstanding', kind: 'money', lowerIsBetter: true, note: () => t('kpi.outstandingNote') },
];

const fmtValue = (kind, v) => (kind === 'money' ? fmtMoney(v == null ? v : Math.round(v)) : kind === 'rate' ? fmtPct(v, 1) : fmtNum(v == null ? v : Math.round(v)));

// Last values shown, so a refresh can count up from them and flag what changed.
const shown = new Map();

// Money/count KPIs change in percent; rate KPIs change in percentage points.
function deltaHtml(kpi, cur, prev) {
  if (cur == null || prev == null || (kpi.kind !== 'rate' && prev === 0)) {
    return `<span class="delta neutral">${esc(t('delta.none'))}</span>`;
  }
  const diff = kpi.kind === 'rate' ? (cur - prev) * 100 : (cur - prev) / prev;
  if (Math.abs(diff) < (kpi.kind === 'rate' ? 0.05 : 0.005)) return '<span class="delta neutral">±0</span>';
  const shownDiff = kpi.kind === 'rate' ? t('delta.pp', { value: fmtNum(Math.abs(diff), 1) }) : fmtPct(Math.abs(diff));
  const up = diff > 0;
  const good = up !== Boolean(kpi.lowerIsBetter);
  return `<span class="delta ${good ? 'good' : 'bad'}"><span aria-hidden="true">${up ? '▲' : '▼'}</span> ${esc(shownDiff)}</span>`;
}

// Tiny trend line for a KPI card. Values are drawn left→right; CSS mirrors it in RTL.
function sparkline(values, id) {
  const pts = values.map((v, i) => [i, v]).filter(([, v]) => v != null);
  if (pts.length < 2) return '';
  const W = 120;
  const H = 36;
  const ys = pts.map(([, v]) => v);
  const min = Math.min(...ys);
  const span = Math.max(...ys) - min || 1;
  const x = (i) => (i / (values.length - 1)) * W;
  const y = (v) => H - 3 - ((v - min) / span) * (H - 6);
  const line = pts.map(([i, v], n) => `${n ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const areaPath = `${line}L${x(pts.at(-1)[0]).toFixed(1)},${H}L${x(pts[0][0]).toFixed(1)},${H}Z`;
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id="sg-${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".22"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs>
    <path d="${areaPath}" fill="url(#sg-${id})"/><path d="${line}" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
  </svg>`;
}

function countUp(el, from, to, format, ms = 900) {
  if (from == null || to == null || from === to || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    el.textContent = format(to);
    return;
  }
  const t0 = performance.now();
  const step = (now) => {
    const p = Math.min(1, (now - t0) / ms);
    const eased = 1 - (1 - p) ** 3;
    el.textContent = format(from + (to - from) * eased);
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// mode: 'refresh' (new data → animate + highlight changes) | 'intro' (first paint → count up from 0) | 'static'
export function renderOverview(root, data, { from, to }, mode = 'static') {
  const prev = previousPeriod(from, to);
  const cur = computeKpis(data, from, to);
  const old = computeKpis(data, prev.from, prev.to);
  const series = kpiSeries(data, from, to);
  const animate = mode !== 'static';

  document.querySelector('#range-compare').textContent = t('range.vsPrev', { days: fmtNum(diffDays(from, to) + 1) });

  const grid = root.querySelector('#kpi-grid');
  grid.innerHTML = KPIS.map((k, i) => `
    <article class="kpi" data-kpi="${k.key}" style="--i:${i}">
      <header class="kpi-head">
        <span class="kpi-icon">${icon(k.key)}</span>
        <h3>${esc(t(`kpi.${k.key}`))}</h3>
      </header>
      <div class="kpi-value" aria-live="polite">${esc(fmtValue(k.kind, cur[k.key]))}</div>
      <div class="kpi-foot">${deltaHtml(k, cur[k.key], old[k.key])}${k.note ? `<span class="kpi-note">${esc(k.note(cur))}</span>` : ''}</div>
      ${sparkline(series.map((s) => s[k.key]), k.key)}
    </article>`).join('');

  for (const k of KPIS) {
    const el = grid.querySelector(`[data-kpi="${k.key}"] .kpi-value`);
    const before = shown.get(k.key);
    const start = mode === 'intro' ? 0 : before;
    if (animate) countUp(el, start ?? cur[k.key], cur[k.key], (v) => fmtValue(k.kind, v));
    if (mode === 'refresh' && before != null && cur[k.key] != null && Math.abs(before - cur[k.key]) > 1e-9) {
      el.closest('.kpi').classList.add('changed');
    }
    shown.set(k.key, cur[k.key]);
  }

  // Revenue trend: billed vs collected
  const tr = trend(data, from, to);
  const labels = tr.buckets.map((b) => fmtDate(b.start));
  const unitNote = t(tr.unit === 'week' ? 'chart.perWeek' : 'chart.perDay');
  root.querySelectorAll('.unit-note').forEach((n) => { n.textContent = unitNote; });

  chartCard(root, 'revenue', {
    type: 'line', labels, legend: true, area: true, animate,
    datasets: [
      { label: t('chart.billed'), data: tr.buckets.map((b) => b.revenue), borderColor: seriesColor(0) },
      { label: t('chart.collected'), data: tr.buckets.map((b) => b.collected), borderColor: seriesColor(1) },
    ],
    valueFormat: fmtMoneyShort,
    tooltipLabel: (c) => ` ${c.dataset.label}: ${fmtMoney(c.parsed.y)}`,
  }, [t('table.period'), t('chart.billed'), t('chart.collected')],
  tr.buckets.map((b, i) => [labels[i], fmtMoney(b.revenue), fmtMoney(b.collected)]));

  // Category mix: sorted horizontal bars, one hue (magnitude, not identity)
  const mix = Object.entries(categoryMix(data, from, to)).sort((a, b) => b[1] - a[1]);
  chartCard(root, 'mix', {
    type: 'bar', horizontal: true, animate,
    labels: mix.map(([c]) => t(`category.${c}`)),
    datasets: [{ label: t('table.revenue'), data: mix.map(([, v]) => v), backgroundColor: seriesColor(0) }],
    valueFormat: fmtMoneyShort,
    tooltipLabel: (c) => ` ${fmtMoney(c.parsed.x)}`,
  }, [t('col.treatment'), t('table.revenue')], mix.map(([c, v]) => [t(`category.${c}`), fmtMoney(v)]));

  // Per dentist: bar colour = dentist identity (same slot as the schedule)
  const dents = byDentist(data, from, to);
  chartCard(root, 'dentists', {
    type: 'bar', horizontal: true, animate,
    labels: dents.map((d) => d.dentist.name),
    datasets: [{ label: t('table.revenue'), data: dents.map((d) => d.revenue), backgroundColor: dents.map((_, i) => seriesColor(i)) }],
    valueFormat: fmtMoneyShort,
    tooltipLabel: (c) => ` ${fmtMoney(c.parsed.x)}`,
  }, [t('table.dentist'), t('table.revenue')], dents.map((d) => [d.dentist.name, fmtMoney(d.revenue)]));

  // No-show rate trend
  chartCard(root, 'noshow', {
    type: 'line', labels, area: true, animate,
    datasets: [{ label: t('kpi.noShowRate'), data: tr.buckets.map((b) => (b.noShowRate == null ? null : b.noShowRate * 100)), borderColor: seriesColor(0) }],
    valueFormat: (v) => fmtPct(v / 100),
    tooltipLabel: (c) => ` ${fmtPct(c.parsed.y / 100, 1)}`,
  }, [t('table.period'), t('kpi.noShowRate')], tr.buckets.map((b, i) => [labels[i], fmtPct(b.noShowRate, 1)]));

  // Dentist performance table with a share-of-revenue bar
  const maxRevenue = Math.max(...dents.map((d) => d.revenue), 1);
  root.querySelector('#dentist-table').innerHTML = `
    <thead><tr>
      <th scope="col">${esc(t('table.dentist'))}</th>
      ${['visits', 'revenue', 'avg', 'noShows', 'noShowRate'].map((k) => `<th scope="col" class="num">${esc(t(`table.${k}`))}</th>`).join('')}
    </tr></thead>
    <tbody>${dents.map((d, i) => `<tr>
      <th scope="row"><div class="who"><span class="avatar" style="--c:${seriesColor(i)}">${esc(initials(d.dentist.name))}</span>
        <span><span class="who-name">${esc(d.dentist.name)}</span><span class="muted small block">${esc(d.dentist.specialty ?? '')}</span></span></div></th>
      <td class="num">${fmtNum(d.visits)}</td>
      <td class="num"><div class="bar-cell"><span>${fmtMoney(d.revenue)}</span><span class="minibar"><i style="width:${(d.revenue / maxRevenue) * 100}%; background:${seriesColor(i)}"></i></span></div></td>
      <td class="num">${fmtMoney(d.avgPerVisit)}</td>
      <td class="num">${fmtNum(d.noShows)}</td>
      <td class="num">${fmtPct(d.noShowRate, 1)}</td>
    </tr>`).join('')}</tbody>`;
}

// Renders a chart and its table twin (the accessible view); the card's toggle picks which shows.
function chartCard(root, id, chart, headers, rows) {
  const card = root.querySelector(`[data-chart="${id}"]`);
  renderChart(card.querySelector('canvas'), chart);
  card.querySelector('table').innerHTML = rows.length ? tableHtml(headers, rows) : `<caption>${esc(t('empty'))}</caption>`;
}
