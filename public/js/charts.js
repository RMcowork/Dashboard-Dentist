// Chart.js wrappers: theme tokens from CSS, RTL-aware axes, one instance per canvas.
/* global Chart */

import { isRtl, t } from './i18n.js';
import { esc, tableHtml } from './dom.js';

const instances = new Map();

export function token(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// Categorical slot colors, assigned in fixed order (see docs/PRACTICE.md → Charts).
export function seriesColor(i) {
  return token(`--series-${(i % 8) + 1}`);
}

export function withAlpha(hex, alpha) {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

// Vertical fade under a line: series color at the top, transparent at the baseline.
function areaGradient(color) {
  return (ctx) => {
    const { chart } = ctx;
    const area = chart.chartArea;
    if (!area) return withAlpha(color, 0.12);
    const g = chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
    g.addColorStop(0, withAlpha(color, 0.28));
    g.addColorStop(1, withAlpha(color, 0));
    return g;
  };
}

function baseOptions({ horizontal = false, valueFormat, animate }) {
  const rtl = isRtl();
  const muted = token('--text-muted');
  const grid = token('--grid');
  const font = { family: token('--font-ui'), size: 12 };
  const valueAxis = { grid: { color: grid, drawTicks: false }, border: { display: false }, ticks: { color: muted, font, padding: 8, ...(valueFormat ? { callback: valueFormat } : {}) } };
  const categoryAxis = { grid: { display: false }, border: { color: token('--baseline') }, ticks: { color: muted, font, padding: 6, maxRotation: 0, autoSkipPadding: 12 } };
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: animate ? { duration: 750, easing: 'easeOutQuart' } : false,
    locale: document.documentElement.lang,
    interaction: horizontal ? { mode: 'nearest', axis: 'y', intersect: false } : { mode: 'index', intersect: false },
    layout: { padding: { top: 4 } },
    plugins: {
      legend: {
        display: false, rtl, align: 'end', textDirection: rtl ? 'rtl' : 'ltr',
        labels: { color: token('--text-secondary'), boxWidth: 8, boxHeight: 8, usePointStyle: true, pointStyle: 'circle', font },
      },
      tooltip: {
        rtl, textDirection: rtl ? 'rtl' : 'ltr',
        backgroundColor: token('--tooltip-bg'), titleColor: token('--tooltip-text'), bodyColor: token('--tooltip-text'),
        titleFont: { ...font, weight: '600' }, bodyFont: font,
        padding: 12, cornerRadius: 10, boxPadding: 6, usePointStyle: true,
      },
    },
    indexAxis: horizontal ? 'y' : 'x',
    scales: horizontal
      ? { x: { ...valueAxis, reverse: rtl, beginAtZero: true }, y: { ...categoryAxis, ticks: { ...categoryAxis.ticks, autoSkip: false }, position: rtl ? 'right' : 'left' } }
      : { x: { ...categoryAxis, reverse: rtl }, y: { ...valueAxis, position: rtl ? 'right' : 'left', beginAtZero: true } },
  };
}

// valueFormat formats ticks on the value axis (y for vertical charts, x for horizontal bars).
// area: fill the first line dataset with a fade to the baseline.
export function renderChart(canvas, { type, labels, datasets, horizontal, valueFormat, legend = false, tooltipLabel, area, animate }) {
  if (typeof Chart === 'undefined') return;
  instances.get(canvas)?.destroy();
  const options = baseOptions({ horizontal, valueFormat, animate });
  options.plugins.legend.display = legend;
  if (tooltipLabel) options.plugins.tooltip.callbacks = { label: tooltipLabel };
  const styled = datasets.map((d, i) => (type === 'line'
    ? {
      borderWidth: 2, pointRadius: 0, pointHoverRadius: 5, pointHitRadius: 14, cubicInterpolationMode: 'monotone', spanGaps: true,
      pointBackgroundColor: d.borderColor, pointBorderColor: token('--surface'), pointHoverBorderWidth: 2,
      backgroundColor: area && i === 0 ? areaGradient(d.borderColor) : d.borderColor,
      fill: area && i === 0 ? 'origin' : false,
      ...d,
    }
    : { borderRadius: 6, borderSkipped: 'start', maxBarThickness: 26, borderWidth: 0, ...d }));
  instances.set(canvas, new Chart(canvas, { type, data: { labels, datasets: styled }, options }));
}

// Renders a chart and its table twin (the accessible view); the card's toggle picks which shows.
export function chartCard(root, id, chart, headers, rows) {
  const card = root.querySelector(`[data-chart="${id}"]`);
  renderChart(card.querySelector('canvas'), chart);
  card.querySelector('table').innerHTML = rows.length ? tableHtml(headers, rows) : `<caption>${esc(t('empty'))}</caption>`;
}
