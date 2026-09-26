// Chart.js wrappers: theme tokens from CSS, RTL-aware axes, one instance per canvas.
/* global Chart */

import { isRtl } from './i18n.js';

const instances = new Map();

export function token(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// Categorical slot colors, assigned in fixed order (see docs/PRACTICE.md → Charts).
export function seriesColor(i) {
  return token(`--series-${(i % 8) + 1}`);
}

function baseOptions({ horizontal = false, valueFormat } = {}) {
  const rtl = isRtl();
  const muted = token('--text-muted');
  const grid = token('--grid');
  const valueAxis = { grid: { color: grid }, border: { display: false }, ticks: { color: muted, ...(valueFormat ? { callback: valueFormat } : {}) } };
  const categoryAxis = { grid: { display: false }, border: { color: token('--baseline') }, ticks: { color: muted } };
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    locale: document.documentElement.lang,
    interaction: horizontal ? { mode: 'nearest', axis: 'y', intersect: false } : { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false, rtl, textDirection: rtl ? 'rtl' : 'ltr', labels: { color: token('--text-secondary'), boxWidth: 10, boxHeight: 10, usePointStyle: true } },
      tooltip: { rtl, textDirection: rtl ? 'rtl' : 'ltr', backgroundColor: token('--tooltip-bg'), titleColor: token('--tooltip-text'), bodyColor: token('--tooltip-text'), padding: 10, boxPadding: 4 },
    },
    indexAxis: horizontal ? 'y' : 'x',
    scales: horizontal
      ? { x: { ...valueAxis, reverse: rtl, beginAtZero: true }, y: { ...categoryAxis, position: rtl ? 'right' : 'left' } }
      : { x: { ...categoryAxis, reverse: rtl }, y: { ...valueAxis, position: rtl ? 'right' : 'left', beginAtZero: true } },
  };
}

// valueFormat formats ticks on the value axis (y for vertical charts, x for horizontal bars).
export function renderChart(canvas, { type, labels, datasets, horizontal, valueFormat, legend = false, tooltipLabel }) {
  if (typeof Chart === 'undefined') return;
  instances.get(canvas)?.destroy();
  const options = baseOptions({ horizontal, valueFormat });
  options.plugins.legend.display = legend;
  if (tooltipLabel) options.plugins.tooltip.callbacks = { label: tooltipLabel };
  const styled = datasets.map((d) => (type === 'line'
    ? { borderWidth: 2, pointRadius: 0, pointHoverRadius: 5, pointHitRadius: 12, tension: 0, spanGaps: true, backgroundColor: d.borderColor, ...d }
    : { borderRadius: 4, borderSkipped: 'start', maxBarThickness: 28, borderColor: token('--surface'), borderWidth: 0, ...d }));
  instances.set(canvas, new Chart(canvas, { type, data: { labels, datasets: styled }, options }));
}
