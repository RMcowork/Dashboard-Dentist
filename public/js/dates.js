// Date helpers on 'YYYY-MM-DD' strings (local calendar dates, no time zone math).
// Shared by the browser and by Node (server, generator, tests).

export const WEEK_START_DAY = 0; // Sunday

// Clinic opening hours per weekday (0 = Sunday). null = closed.
export const CLINIC_HOURS = {
  0: ['08:00', '18:00'],
  1: ['08:00', '18:00'],
  2: ['08:00', '18:00'],
  3: ['08:00', '18:00'],
  4: ['08:00', '18:00'],
  5: ['08:00', '13:00'],
  6: null,
};

const pad = (n) => String(n).padStart(2, '0');

export function toDateStr(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayStr() {
  return toDateStr(new Date());
}

export function parseDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(str, days) {
  const d = parseDate(str);
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}

// Whole days from a to b (b - a).
export function diffDays(a, b) {
  return Math.round((parseDate(b) - parseDate(a)) / 86400000);
}

export function weekday(str) {
  return parseDate(str).getDay();
}

export function weekStart(str) {
  return addDays(str, -((weekday(str) - WEEK_START_DAY + 7) % 7));
}

export function monthStart(str) {
  return str.slice(0, 8) + '01';
}

export function eachDay(from, to) {
  const days = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  return days;
}

export function timeToMin(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function minToTime(min) {
  return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
}

export function openMinutes(str) {
  const hours = CLINIC_HOURS[weekday(str)];
  return hours ? timeToMin(hours[1]) - timeToMin(hours[0]) : 0;
}

export function isOpen(str) {
  return CLINIC_HOURS[weekday(str)] != null;
}

export function nextOpenDay(str) {
  let d = addDays(str, 1);
  while (!isOpen(d)) d = addDays(d, 1);
  return d;
}
