// Front-desk tab: one day's schedule by chair, live counters, and call lists.

import { CLINIC_HOURS, minToTime, nextOpenDay, timeToMin, todayStr, weekday } from './dates.js';
import { dayAppointments, dayCounts, recallsDue, RECALL_MONTHS, unpaidBalances } from './metrics.js';
import { fmtDate, fmtMoney, fmtNum, t, treatmentName } from './i18n.js';
import { esc, initials } from './dom.js';
import { icon } from './icons.js';

const SLOT_MIN = 15;
const LIST_LIMIT = 8;
const STATUS_ICON = { scheduled: '○', checked_in: '◐', in_chair: '●', completed: '✓', no_show: '✕', cancelled: '–' };

// changedIds: appointments that changed in the last sync — flashed once so staff notice them.
export function renderToday(root, data, day, { changedIds = new Set() } = {}) {
  const lookups = {
    patient: new Map(data.patients.map((p) => [p.id, p])),
    treatment: new Map(data.treatments.map((x) => [x.id, x])),
    dentist: new Map(data.dentists.map((d, i) => [d.id, { ...d, slot: i }])),
  };
  const appts = dayAppointments(data, day);

  root.querySelector('#day-label').textContent = fmtDate(day, 'long');
  root.querySelector('#day-input').value = day;

  const counts = dayCounts(appts);
  root.querySelector('#day-counts').innerHTML = [
    ['booked', counts.booked], ['arrived', counts.arrived], ['inChair', counts.inChair],
    ['done', counts.done], ['noShow', counts.noShow],
  ].map(([k, n], i) => `<div class="count count-${k}" style="--i:${i}"><span class="count-dot" aria-hidden="true"></span><span class="count-n">${fmtNum(n)}</span><span class="count-l">${esc(t(`count.${k}`))}</span></div>`).join('');

  renderSchedule(root.querySelector('#schedule'), data, day, appts, lookups, changedIds);
  renderTomorrow(root.querySelector('#tomorrow'), data, day, lookups);
  renderUnpaid(root.querySelector('#unpaid'), data, day);
  renderRecalls(root.querySelector('#recalls'), data, day);
}

function renderSchedule(box, data, day, appts, { patient, treatment, dentist }, changedIds) {
  const hours = CLINIC_HOURS[weekday(day)];
  if (!hours) {
    box.innerHTML = `<p class="empty">${esc(t('today.closed'))}</p>`;
    return;
  }
  const [open, close] = hours.map(timeToMin);
  const rows = (close - open) / SLOT_MIN;
  const chairs = [...new Set(data.dentists.map((d) => d.chair))].sort((a, b) => a - b);
  const dentistOfChair = new Map(data.dentists.map((d, i) => [d.chair, { ...d, slot: i }]));
  const row = (min) => Math.floor((min - open) / SLOT_MIN) + 2; // row 1 is the header

  const header = `<div class="sch-corner"></div>${chairs.map((c, i) => {
    const d = dentistOfChair.get(c);
    return `<div class="sch-head" style="grid-column:${i + 2}"><span class="avatar sm" style="--c:var(--series-${(d?.slot ?? 0) + 1})">${esc(initials(d?.name ?? '?'))}</span>
      <span class="sch-head-text"><strong>${esc(t('today.chair', { n: c }))}</strong><span class="muted small">${esc(d?.name ?? '')}</span></span></div>`;
  }).join('')}`;

  const times = [];
  for (let m = open; m < close; m += 60) times.push(`<div class="sch-time" style="grid-row:${row(m)} / span ${60 / SLOT_MIN}">${minToTime(m)}</div>`);

  const blocks = appts.map((a) => {
    const start = timeToMin(a.start);
    const col = chairs.indexOf(a.chair) + 2;
    const den = dentist.get(a.dentistId);
    const pat = patient.get(a.patientId);
    const span = Math.max(1, Math.round(a.duration / SLOT_MIN));
    return `<div class="appt status-${a.status}${changedIds.has(a.id) ? ' flash' : ''}" style="grid-row:${row(start)} / span ${span}; grid-column:${col}; --dentist:var(--series-${(den?.slot ?? 0) + 1})"
        title="${esc(`${a.start} · ${pat?.name ?? ''} · ${treatmentName(treatment.get(a.treatmentId))} · ${t(`status.${a.status}`)}`)}">
      <div class="appt-top"><span class="appt-time">${esc(a.start)}</span>
        <span class="chip chip-${a.status}"><span aria-hidden="true">${STATUS_ICON[a.status]}</span> ${esc(t(`status.${a.status}`))}</span></div>
      <div class="appt-name">${esc(pat?.name ?? '—')}</div>
      ${span > 2 ? `<div class="appt-trt">${esc(treatmentName(treatment.get(a.treatmentId)))}</div>` : ''}
    </div>`;
  }).join('');

  // Current-time line when viewing today during opening hours
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const nowLine = day === todayStr() && nowMin >= open && nowMin < close
    ? `<div class="sch-now" style="grid-row:${row(nowMin)}; grid-column:2 / -1; --offset:${((nowMin - open) % SLOT_MIN) / SLOT_MIN}"></div>` : '';

  box.innerHTML = `
    ${appts.length ? '' : `<p class="empty">${esc(t('today.noAppointments'))}</p>`}
    <div class="sch-scroll"><div class="sch-grid" style="--chairs:${chairs.length}; --rows:${rows}">
      ${header}${times.join('')}${blocks}${nowLine}
    </div></div>`;
}

function renderTomorrow(box, data, day, { patient, treatment, dentist }) {
  const next = nextOpenDay(day);
  const appts = dayAppointments(data, next).filter((a) => a.status === 'scheduled');
  box.querySelector('h3').textContent = t('today.tomorrow', { date: fmtDate(next, 'long') });
  box.querySelector('.list-body').innerHTML = appts.length
    ? `<table class="list-table"><thead><tr>
        <th scope="col">${esc(t('col.time'))}</th><th scope="col">${esc(t('col.patient'))}</th>
        <th scope="col">${esc(t('col.phone'))}</th><th scope="col">${esc(t('col.treatment'))}</th><th scope="col">${esc(t('col.dentist'))}</th>
      </tr></thead><tbody>${appts.map((a) => {
        const p = patient.get(a.patientId);
        return `<tr><td class="num">${esc(a.start)}</td><th scope="row">${esc(p?.name)}</th>
          <td><a class="tel" href="tel:${esc(p?.phone)}" dir="ltr">${icon('phone', { size: 13 })}${esc(p?.phone)}</a></td>
          <td>${esc(treatmentName(treatment.get(a.treatmentId)))}</td><td>${esc(dentist.get(a.dentistId)?.name)}</td></tr>`;
      }).join('')}</tbody></table>`
    : `<p class="empty">${esc(t('today.noAppointments'))}</p>`;
}

function renderUnpaid(box, data, day) {
  const rows = unpaidBalances(data, day);
  box.querySelector('.list-body').innerHTML = listHtml(rows, (r) => `
    <li><span class="li-main">${esc(r.patient.name)} <a class="muted small" href="tel:${esc(r.patient.phone)}" dir="ltr">${esc(r.patient.phone)}</a></span>
      <span class="li-value">${esc(fmtMoney(r.balance))}</span></li>`);
}

function renderRecalls(box, data, day) {
  box.querySelector('.list-note').textContent = t('today.recallsNote', { months: fmtNum(RECALL_MONTHS) });
  const rows = recallsDue(data, day);
  box.querySelector('.list-body').innerHTML = listHtml(rows, (r) => `
    <li><span class="li-main">${esc(r.patient.name)} <a class="muted small" href="tel:${esc(r.patient.phone)}" dir="ltr">${esc(r.patient.phone)}</a>
      <span class="muted small block">${esc(t('today.lastVisit', { date: fmtDate(r.lastVisit, 'full') }))}</span></span>
      <span class="li-value">${esc(t('today.overdue', { days: fmtNum(r.overdueDays) }))}</span></li>`);
}

function listHtml(rows, item) {
  if (!rows.length) return `<p class="empty">${esc(t('empty'))}</p>`;
  const more = rows.length > LIST_LIMIT ? `<p class="muted small">${esc(t('today.more', { n: fmtNum(rows.length - LIST_LIMIT) }))}</p>` : '';
  return `<ul class="list">${rows.slice(0, LIST_LIMIT).map(item).join('')}</ul>${more}`;
}
