// UI strings + locale-aware formatting. Strings live in /i18n/<lang>.json.

export const LANGS = {
  en: { label: 'English', locale: 'en-IL', dir: 'ltr' },
  he: { label: 'עברית', locale: 'he-IL', dir: 'rtl' },
  // Latin digits: the convention for Arabic speakers in Israel
  ar: { label: 'العربية', locale: 'ar-IL-u-nu-latn', dir: 'rtl' },
};

const STORAGE_KEY = 'dental-dash.lang';
let lang = 'en';
let strings = {};
let fallback = {};

export function currentLang() {
  return lang;
}

export function isRtl() {
  return LANGS[lang].dir === 'rtl';
}

export function savedLang() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v && LANGS[v]) return v;
  } catch { /* storage unavailable */ }
  return 'en';
}

async function load(code) {
  const res = await fetch(`i18n/${code}.json`);
  if (!res.ok) throw new Error(`Missing translations for ${code}`);
  return res.json();
}

export async function setLang(code) {
  if (!LANGS[code]) code = 'en';
  if (!Object.keys(fallback).length) fallback = await load('en');
  strings = code === 'en' ? fallback : await load(code);
  lang = code;
  document.documentElement.lang = code;
  document.documentElement.dir = LANGS[code].dir;
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch { /* storage unavailable */ }
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of document.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', t(el.dataset.i18nAria));
  document.title = t('app.title');
}

export function t(key, vars = {}) {
  const s = strings[key] ?? fallback[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`));
}

// ---- Formatting (always for the active locale) ----

const loc = () => LANGS[lang].locale;

export function fmtMoney(n) {
  if (n == null) return '—';
  return new Intl.NumberFormat(loc(), { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n);
}

export function fmtMoneyShort(n) {
  return new Intl.NumberFormat(loc(), { style: 'currency', currency: 'ILS', notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

export function fmtNum(n, digits = 0) {
  if (n == null) return '—';
  return new Intl.NumberFormat(loc(), { maximumFractionDigits: digits }).format(n);
}

export function fmtPct(r, digits = 0) {
  if (r == null) return '—';
  return new Intl.NumberFormat(loc(), { style: 'percent', maximumFractionDigits: digits, minimumFractionDigits: digits }).format(r);
}

// 'YYYY-MM-DD' -> localized date. style: 'short' (12 Sep), 'long' (Thursday, 24 September 2026), 'full' (24 Sep 2026)
export function fmtDate(str, style = 'short') {
  const [y, m, d] = str.split('-').map(Number);
  const opts = {
    short: { day: 'numeric', month: 'short' },
    full: { day: 'numeric', month: 'short', year: 'numeric' },
    long: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
  }[style];
  return new Intl.DateTimeFormat(loc(), opts).format(new Date(y, m - 1, d));
}

export function treatmentName(trt) {
  return trt?.name?.[lang] || trt?.name?.en || '—';
}
