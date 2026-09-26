// Overview tab (owner/manager): KPIs vs previous period, trends, mix, per-dentist performance.

import { addDays, diffDays, monthStart } from './dates.js';
import { byDentist, categoryMix, computeKpis, previousPeriod, trend } from './metrics.js';
import { fmtDate, fmtMoney, fmtMoneyShort, fmtNum, fmtPct, t } from './i18n.js';
import { renderChart, seriesColor } from './charts.js';
import { esc, tableHtml } from './dom.js';

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

const fmtValue = (kind, v) => (kind === 'money' ? fmtMoney(v) : kind === 'rate' ? fmtPct(v, 1) : fmtNum(v));

// Money/count KPIs change in percent; rate KPIs change in percentage points.
function deltaHtml(kpi, cur, prev) {
  if (cur == null || prev == null || (kpi.kind !== 'rate' && prev === 0)) {
    return `<span class="delta neutral">${esc(t('delta.none'))}</span>`;
  }
  const diff = kpi.kind === 'rate' ? (cur - prev) * 100 : (cur - prev) / prev;
  if (Math.abs(diff) < (kpi.kind === 'rate' ? 0.05 : 0.005)) return '<span class="delta neutral">±0</span>';
  const shown = kpi.kind === 'rate' ? t('delta.pp', { value: fmtNum(Math.abs(diff), 1) }) : fmtPct(Math.abs(diff));
  const up = diff > 0;
  const good = up !== Boolean(kpi.lowerIsBetter);
  return `<span class="delta ${good ? 'good' : 'bad'}"><span aria-hidden="true">${up ? '▲' : '▼'}</span> ${esc(shown)}</span>`;
}

export function renderOverview(root, data, { from, to }) {
  const prev = previousPeriod(from, to);
  const cur = computeKpis(data, from, to);
  const old = computeKpis(data, prev.from, prev.to);

  root.querySelector('#range-compare').textContent = t('range.vsPrev', { days: fmtNum(diffDays(from, to) + 1) });

  root.querySelector('#kpi-grid').innerHTML = KPIS.map((k) => `
    <article class="kpi">
      <h3>${esc(t(`kpi.${k.key}`))}</h3>
      <div class="kpi-value">${esc(fmtValue(k.kind, cur[k.key]))}</div>
      <div class="kpi-foot">${deltaHtml(k, cur[k.key], old[k.key])}</div>
      ${k.note ? `<div class="kpi-note">${esc(k.note(cur))}</div>` : ''}
    </article>`).join('');

  // Revenue trend: billed vs collected
  const tr = trend(data, from, to);
  const labels = tr.buckets.map((b) => fmtDate(b.start));
  const unitNote = t(tr.unit === 'week' ? 'chart.perWeek' : 'chart.perDay');
  root.querySelectorAll('.unit-note').forEach((n) => { n.textContent = unitNote; });

  chartCard(root, 'revenue', {
    type: 'line', labels, legend: true,
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
    type: 'bar', horizontal: true,
    labels: mix.map(([c]) => t(`category.${c}`)),
    datasets: [{ label: t('table.revenue'), data: mix.map(([, v]) => v), backgroundColor: seriesColor(0) }],
    valueFormat: fmtMoneyShort,
    tooltipLabel: (c) => ` ${fmtMoney(c.parsed.x)}`,
  }, [t('col.treatment'), t('table.revenue')], mix.map(([c, v]) => [t(`category.${c}`), fmtMoney(v)]));

  // Per dentist: bar colour = dentist identity (same slot as the schedule)
  const dents = byDentist(data, from, to);
  chartCard(root, 'dentists', {
    type: 'bar', horizontal: true,
    labels: dents.map((d) => d.dentist.name),
    datasets: [{ label: t('table.revenue'), data: dents.map((d) => d.revenue), backgroundColor: dents.map((_, i) => seriesColor(i)) }],
    valueFormat: fmtMoneyShort,
    tooltipLabel: (c) => ` ${fmtMoney(c.parsed.x)}`,
  }, [t('table.dentist'), t('table.revenue')], dents.map((d) => [d.dentist.name, fmtMoney(d.revenue)]));

  // No-show rate trend
  chartCard(root, 'noshow', {
    type: 'line', labels,
    datasets: [{ label: t('kpi.noShowRate'), data: tr.buckets.map((b) => (b.noShowRate == null ? null : b.noShowRate * 100)), borderColor: seriesColor(0) }],
    valueFormat: (v) => fmtPct(v / 100),
    tooltipLabel: (c) => ` ${fmtPct(c.parsed.y / 100, 1)}`,
  }, [t('table.period'), t('kpi.noShowRate')], tr.buckets.map((b, i) => [labels[i], fmtPct(b.noShowRate, 1)]));

  // Dentist performance table
  root.querySelector('#dentist-table').innerHTML = `
    <thead><tr>
      <th scope="col">${esc(t('table.dentist'))}</th>
      ${['visits', 'revenue', 'avg', 'noShows', 'noShowRate'].map((k) => `<th scope="col" class="num">${esc(t(`table.${k}`))}</th>`).join('')}
    </tr></thead>
    <tbody>${dents.map((d, i) => `<tr>
      <th scope="row"><span class="swatch" style="background:${seriesColor(i)}"></span>${esc(d.dentist.name)}
        <div class="muted small">${esc(d.dentist.specialty ?? '')}</div></th>
      <td class="num">${fmtNum(d.visits)}</td>
      <td class="num">${fmtMoney(d.revenue)}</td>
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
