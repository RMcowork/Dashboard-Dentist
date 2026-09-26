// Entry point: loads data from /api/data, owns UI state, wires controls, re-renders on change.

import { addDays, todayStr } from './dates.js';
import { LANGS, savedLang, setLang, t } from './i18n.js';
import { PRESETS, presetRange, renderOverview } from './overview.js';
import { renderToday } from './today.js';

const REFRESH_MS = 60_000;

const state = {
  data: null,
  source: null,
  tab: location.hash === '#today' ? 'today' : 'overview',
  preset: '28d',
  range: presetRange('28d', todayStr()),
  day: todayStr(),
};

const $ = (sel) => document.querySelector(sel);

async function loadData() {
  const res = await fetch('/api/data');
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || res.statusText);
  // Chairs define dentist order, which fixes each dentist's colour slot everywhere.
  body.data.dentists.sort((a, b) => (a.chair ?? 99) - (b.chair ?? 99));
  state.data = body.data;
  state.source = body.source;
}

function render() {
  if (!state.data) return;
  $('#status-msg').hidden = true;
  const badge = $('#source-badge');
  badge.hidden = false;
  badge.textContent = t(`source.${state.source}`);
  badge.dataset.source = state.source;

  for (const btn of document.querySelectorAll('[role="tab"]')) {
    const active = btn.dataset.tab === state.tab;
    btn.setAttribute('aria-selected', String(active));
    btn.tabIndex = active ? 0 : -1;
    $(`#${btn.dataset.tab}`).hidden = !active;
  }
  if (state.tab === 'overview') renderOverview($('#overview'), state.data, state.range);
  else renderToday($('#today'), state.data, state.day);
}

function fillSelects() {
  $('#lang-select').innerHTML = Object.entries(LANGS)
    .map(([code, l]) => `<option value="${code}" lang="${code}">${l.label}</option>`).join('');
  $('#range-preset').innerHTML = PRESETS.map((p) => `<option value="${p}">${t(`range.${p}`)}</option>`).join('');
  $('#range-preset').value = state.preset;
}

function syncRangeInputs() {
  $('#custom-range').hidden = state.preset !== 'custom';
  $('#range-from').value = state.range.from;
  $('#range-to').value = state.range.to;
}

function wire() {
  $('#lang-select').addEventListener('change', async (e) => {
    const code = e.target.value;
    await setLang(code);
    fillSelects();
    $('#lang-select').value = code;
    render();
  });

  for (const btn of document.querySelectorAll('[role="tab"]')) {
    btn.addEventListener('click', () => {
      state.tab = btn.dataset.tab;
      history.replaceState(null, '', state.tab === 'today' ? '#today' : '#');
      render();
    });
  }
  // Arrow keys move between tabs (respecting reading direction)
  $('.tabs').addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const next = document.querySelector(`[role="tab"]:not([aria-selected="true"])`);
    next.focus();
    next.click();
  });

  $('#range-preset').addEventListener('change', (e) => {
    state.preset = e.target.value;
    if (state.preset !== 'custom') state.range = presetRange(state.preset, todayStr());
    syncRangeInputs();
    render();
  });
  for (const id of ['#range-from', '#range-to']) {
    $(id).addEventListener('change', () => {
      const from = $('#range-from').value;
      const to = $('#range-to').value;
      if (from && to && from <= to) {
        state.range = { from, to };
        render();
      }
    });
  }

  $('#day-prev').addEventListener('click', () => { state.day = addDays(state.day, -1); render(); });
  $('#day-next').addEventListener('click', () => { state.day = addDays(state.day, 1); render(); });
  $('#day-today').addEventListener('click', () => { state.day = todayStr(); render(); });
  $('#day-input').addEventListener('change', (e) => { if (e.target.value) { state.day = e.target.value; render(); } });

  // Chart/table toggle on each chart card
  for (const card of document.querySelectorAll('.chart-card')) {
    const btn = card.querySelector('.toggle-table');
    btn.addEventListener('click', () => {
      const showTable = card.querySelector('.table-box').hidden;
      card.querySelector('.table-box').hidden = !showTable;
      card.querySelector('.chart-box').hidden = showTable;
      btn.dataset.i18n = showTable ? 'chart.showChart' : 'chart.showTable';
      btn.textContent = t(btn.dataset.i18n);
    });
  }

  // Charts read colours from CSS tokens, so re-render when the colour scheme flips
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', render);
}

async function refresh() {
  try {
    await loadData();
    render();
  } catch (err) {
    const msg = $('#status-msg');
    msg.hidden = false;
    msg.classList.add('error');
    msg.textContent = t('error.load', { message: err.message });
  }
}

async function init() {
  await setLang(savedLang());
  fillSelects();
  $('#lang-select').value = savedLang();
  syncRangeInputs();
  wire();
  await refresh();
  // Keep the front desk live; the overview doesn't need it but a refresh is cheap.
  setInterval(refresh, REFRESH_MS);
}

// Chart.js is a deferred classic script; wait for it before the first render.
if (document.readyState === 'complete') init();
else window.addEventListener('load', init);
