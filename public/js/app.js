// Entry point: owns UI state, the refresh cycle (fetch → loading animation → render), and controls.

import { addDays, todayStr } from './dates.js';
import { LANGS, fmtAgo, fmtDate, fmtDuration, fmtNum, savedLang, setLang, t } from './i18n.js';
import { PRESETS, presetRange, renderOverview } from './overview.js';
import { renderToday } from './today.js';
import { icon } from './icons.js';
import {
  DEFAULT_BASE_ID, getMode, loadAirtableConfig, loadData, saveAirtableConfig, testAirtable,
} from './data/source.js';

const INTERVALS = [0, 15, 30, 60, 120, 300, 900]; // seconds; 0 = off
const DEFAULT_INTERVAL = 60;
const MIN_LOADING_MS = 900; // every refresh visibly "loads", even when the data is instant
const STORE = { interval: 'dental-dash.refresh', theme: 'dental-dash.theme' };

const state = {
  data: null,
  source: null,
  sync: null,
  airtableConfigured: false,
  tab: location.hash === '#today' ? 'today' : 'overview',
  preset: '28d',
  range: presetRange('28d', todayStr()),
  day: todayStr(),
  interval: readInterval(),
  lastSyncAt: null,
  nextAt: null,
  loading: false,
  failed: false,
  changedIds: new Set(),
};

const $ = (sel) => document.querySelector(sel);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function readInterval() {
  try {
    const raw = localStorage.getItem(STORE.interval);
    if (raw !== null && INTERVALS.includes(Number(raw))) return Number(raw);
  } catch { /* storage unavailable */ }
  return DEFAULT_INTERVAL;
}
function writeStore(key, value) {
  try { localStorage.setItem(key, String(value)); } catch { /* storage unavailable */ }
}

// ---------- data ----------

async function fetchData(force) {
  const body = await loadData({ force });
  // Chairs define dentist order, which fixes each dentist's colour slot everywhere.
  body.data.dentists.sort((a, b) => (a.chair ?? 99) - (b.chair ?? 99));
  return body;
}

// Appointments whose status or payment changed, or that are new, since the previous data.
function diffAppointments(before, after) {
  const changed = new Set();
  if (!before) return changed;
  const old = new Map(before.appointments.map((a) => [a.id, a]));
  for (const a of after.appointments) {
    const o = old.get(a.id);
    if (!o || o.status !== a.status || o.paid !== a.paid || o.date !== a.date || o.start !== a.start) changed.add(a.id);
  }
  return changed;
}

// One refresh cycle: show loading state for at least MIN_LOADING_MS, then render with animations.
async function refresh({ manual = false } = {}) {
  if (state.loading) return;
  state.loading = true;
  clearTimeout(refresh.timer);
  document.body.classList.add('is-loading');
  setSyncState('syncing');
  const firstLoad = !state.data;
  try {
    const [body] = await Promise.all([fetchData(manual), sleep(MIN_LOADING_MS)]);
    state.changedIds = diffAppointments(state.data, body.data);
    Object.assign(state, {
      data: body.data, source: body.source, sync: body.sync, airtableConfigured: body.airtableConfigured,
      lastSyncAt: Date.now(), failed: body.sync?.mode === 'stale',
    });
    document.body.classList.remove('is-loading', 'is-first-load');
    render(firstLoad ? 'intro' : 'refresh');
    setSyncState(state.failed ? 'offline' : 'live');
    if (state.failed) toast(t('toast.error'), 'warn');
    else if (!firstLoad) toast(t('toast.synced'), 'ok', state.changedIds.size ? t('toast.changes', { n: fmtNum(state.changedIds.size) }) : t('toast.noChanges'));
  } catch (err) {
    document.body.classList.remove('is-loading');
    state.failed = true;
    setSyncState('offline');
    if (firstLoad) {
      const msg = $('#status-msg');
      msg.hidden = false;
      msg.textContent = t('error.load', { message: err.message });
    } else {
      toast(t('toast.error'), 'warn');
    }
  } finally {
    state.loading = false;
    schedule();
  }
}

function schedule() {
  clearTimeout(refresh.timer);
  state.nextAt = state.interval ? Date.now() + state.interval * 1000 : null;
  if (state.interval) refresh.timer = setTimeout(() => refresh(), state.interval * 1000);
}

// ---------- render ----------

function render(mode = 'static') {
  renderChrome();
  if (!state.data) return;
  for (const btn of document.querySelectorAll('[role="tab"]')) {
    const active = btn.dataset.tab === state.tab;
    btn.setAttribute('aria-selected', String(active));
    btn.tabIndex = active ? 0 : -1;
    $(`#${btn.dataset.tab}`).hidden = !active;
  }
  $('#overview-controls').hidden = state.tab !== 'overview';
  if (state.tab === 'overview') renderOverview($('#overview'), state.data, state.range, mode);
  else renderToday($('#today'), state.data, state.day, { changedIds: mode === 'refresh' ? state.changedIds : new Set() });
  const panel = $(`#${state.tab}`);
  panel.classList.remove('enter');
  void panel.offsetWidth; // restart the entrance animation
  panel.classList.add('enter');
}

function renderChrome() {
  const hour = new Date().getHours();
  $('#greeting').textContent = t(hour < 12 ? 'greet.morning' : hour < 18 ? 'greet.afternoon' : 'greet.evening');
  $('#today-date').textContent = fmtDate(todayStr(), 'long');
  if (state.source) {
    const badge = $('#source-badge');
    badge.hidden = false;
    badge.dataset.source = state.source;
    $('#source-text').textContent = t(`source.${state.source}`);
    const browser = getMode() === 'browser';
    badge.disabled = !browser;
    badge.classList.toggle('clickable', browser);
    badge.title = [
      browser ? t('source.click') : '',
      state.sync?.apiCallsTotal != null ? `Airtable API calls: ${state.sync.apiCallsTotal}` : '',
    ].filter(Boolean).join(' · ');
  }
  const browser = getMode() === 'browser';
  $('#demo-banner').hidden = state.source !== 'demo' || state.airtableConfigured;
  $('#banner-text').textContent = t(browser ? 'banner.demoStatic' : 'banner.demo');
  $('#banner-connect').hidden = !browser;
}

function setSyncState(s) {
  const el = $('#sync');
  el.dataset.state = state.interval || s !== 'live' ? s : 'paused';
  $('#sync-state').textContent = t(`sync.${el.dataset.state}`);
  tick();
}

// Once a second: "Updated 12 s ago" + the countdown ring to the next refresh.
function tick() {
  $('#sync-ago').textContent = state.lastSyncAt && !state.loading
    ? t('sync.updated', { ago: fmtAgo((Date.now() - state.lastSyncAt) / 1000) }) : '';
  const ring = $('#ring');
  if (state.nextAt && !state.loading) {
    const left = Math.max(0, state.nextAt - Date.now());
    ring.style.strokeDashoffset = String(100 - (left / (state.interval * 1000)) * 100);
    $('#sync').title = t('sync.next', { s: fmtDuration(Math.ceil(left / 1000)) });
  } else {
    ring.style.strokeDashoffset = state.loading ? '0' : '100';
    $('#sync').title = '';
  }
}

let toastTimer;
function toast(title, kind = 'ok', detail = '') {
  const el = $('#toast');
  el.className = `toast show ${kind}`;
  el.innerHTML = `<span class="toast-dot"></span><strong></strong>${detail ? '<span class="toast-detail"></span>' : ''}`;
  el.querySelector('strong').textContent = title;
  if (detail) el.querySelector('.toast-detail').textContent = detail;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

// ---------- Airtable connect dialog (browser mode only) ----------

function openConnect() {
  const cfg = loadAirtableConfig();
  $('#cx-base').value = cfg?.baseId || DEFAULT_BASE_ID;
  $('#cx-token').value = '';
  $('#cx-token').required = !cfg;
  $('#cx-disconnect').hidden = !cfg;
  $('#cx-error').hidden = true;
  $('#connect-dialog').showModal();
}

async function submitConnect(e) {
  e.preventDefault();
  const current = loadAirtableConfig();
  const cfg = { baseId: $('#cx-base').value.trim(), token: $('#cx-token').value.trim() || current?.token };
  if (!cfg.token) return;
  const btn = $('#cx-submit');
  btn.disabled = true;
  btn.textContent = t('connect.testing');
  try {
    await testAirtable(cfg);
    saveAirtableConfig(cfg);
    state.data = null; // new source: render as a fresh load, not as "874 changes"
    $('#connect-dialog').close();
    toast(t('toast.connected'), 'ok');
    await refresh({ manual: true });
  } catch (err) {
    const msg = $('#cx-error');
    msg.hidden = false;
    msg.textContent = t('connect.error', { message: err.message.replace(/\s+/g, ' ').slice(0, 160) });
  } finally {
    btn.disabled = false;
    btn.textContent = t('connect.submit');
  }
}

// ---------- controls ----------

function fillSelects() {
  $('#lang-select').innerHTML = Object.entries(LANGS)
    .map(([code, l]) => `<option value="${code}" lang="${code}">${l.label}</option>`).join('');
  $('#range-preset').innerHTML = PRESETS.map((p) => `<option value="${p}">${t(`range.${p}`)}</option>`).join('');
  $('#range-preset').value = state.preset;
  $('#refresh-interval').innerHTML = INTERVALS
    .map((s) => `<option value="${s}">${s ? fmtDuration(s) : t('sync.off')}</option>`).join('');
  $('#refresh-interval').value = String(state.interval);
}

function syncRangeInputs() {
  $('#custom-range').hidden = state.preset !== 'custom';
  $('#range-from').value = state.range.from;
  $('#range-to').value = state.range.to;
}

function applyTheme(theme) {
  if (theme) document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
}

function isDark() {
  const th = document.documentElement.dataset.theme;
  return th ? th === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
}

function wire() {
  for (const el of document.querySelectorAll('[data-icon]')) el.innerHTML = icon(el.dataset.icon);

  $('#lang-select').addEventListener('change', async (e) => {
    const code = e.target.value;
    await setLang(code);
    fillSelects();
    $('#lang-select').value = code;
    setSyncState($('#sync').dataset.state === 'paused' ? 'live' : $('#sync').dataset.state);
    render('static');
  });

  for (const btn of document.querySelectorAll('[role="tab"]')) {
    btn.addEventListener('click', () => {
      state.tab = btn.dataset.tab;
      history.replaceState(null, '', state.tab === 'today' ? '#today' : '#');
      render('static');
    });
  }
  $('.tabs').addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const next = document.querySelector('[role="tab"]:not([aria-selected="true"])');
    next.focus();
    next.click();
  });

  $('#refresh-interval').addEventListener('change', (e) => {
    state.interval = Number(e.target.value);
    writeStore(STORE.interval, state.interval);
    schedule();
    if (!state.loading) setSyncState(state.failed ? 'offline' : 'live');
  });
  $('#refresh-now').addEventListener('click', () => refresh({ manual: true }));

  $('#source-badge').addEventListener('click', () => { if (getMode() === 'browser') openConnect(); });
  $('#banner-connect').addEventListener('click', openConnect);
  $('#connect-form').addEventListener('submit', submitConnect);
  $('#cx-cancel').addEventListener('click', () => $('#connect-dialog').close());
  $('#cx-disconnect').addEventListener('click', async () => {
    saveAirtableConfig(null);
    state.data = null;
    $('#connect-dialog').close();
    toast(t('toast.disconnected'), 'warn');
    await refresh({ manual: true });
  });

  $('#theme-toggle').addEventListener('click', () => {
    const next = isDark() ? 'light' : 'dark';
    applyTheme(next);
    writeStore(STORE.theme, next);
    render('static');
  });

  $('#range-preset').addEventListener('change', (e) => {
    state.preset = e.target.value;
    if (state.preset !== 'custom') state.range = presetRange(state.preset, todayStr());
    syncRangeInputs();
    render('static');
  });
  for (const id of ['#range-from', '#range-to']) {
    $(id).addEventListener('change', () => {
      const from = $('#range-from').value;
      const to = $('#range-to').value;
      if (from && to && from <= to) {
        state.range = { from, to };
        render('static');
      }
    });
  }

  $('#day-prev').addEventListener('click', () => { state.day = addDays(state.day, -1); render('static'); });
  $('#day-next').addEventListener('click', () => { state.day = addDays(state.day, 1); render('static'); });
  $('#day-today').addEventListener('click', () => { state.day = todayStr(); render('static'); });
  $('#day-input').addEventListener('change', (e) => { if (e.target.value) { state.day = e.target.value; render('static'); } });

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

  // Charts read colours from CSS tokens, so re-render when the OS colour scheme flips
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => render('static'));

  // Don't spend API calls on a hidden tab; catch up as soon as it's visible again
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearTimeout(refresh.timer);
    else if (state.interval && state.nextAt && Date.now() >= state.nextAt) refresh();
    else schedule();
  });

  setInterval(tick, 1000);
}

async function init() {
  await setLang(savedLang());
  fillSelects();
  $('#lang-select').value = savedLang();
  syncRangeInputs();
  wire();
  renderChrome();
  await refresh();
}

// Chart.js is a deferred classic script; wait for it before the first render.
if (document.readyState === 'complete') init();
else window.addEventListener('load', init);
