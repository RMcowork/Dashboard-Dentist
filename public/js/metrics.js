// Pure KPI functions over the normalized data shape. No DOM, no I/O — unit-tested in test/.
// Every formula here is documented in docs/SPEC.md ("KPI definitions"); keep them in sync.

import { addDays, diffDays, eachDay, isOpen, openMinutes, weekStart, timeToMin } from './dates.js';

export const RECALL_MONTHS = 6;
const RECALL_DAYS = Math.round(RECALL_MONTHS * 30.4);

const inRange = (d, from, to) => d >= from && d <= to;
const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0);
const ratio = (a, b) => (b > 0 ? a / b : null);

// Appointments that occupied a chair (booked and not lost).
const OCCUPYING = new Set(['scheduled', 'checked_in', 'in_chair', 'completed']);

export function previousPeriod(from, to) {
  const len = diffDays(from, to) + 1;
  return { from: addDays(from, -len), to: addDays(from, -1) };
}

export function chairCount(data) {
  return new Set(data.dentists.filter((d) => d.active).map((d) => d.chair)).size || 1;
}

export function computeKpis(data, from, to) {
  const appts = data.appointments.filter((a) => inRange(a.date, from, to));
  const done = appts.filter((a) => a.status === 'completed');
  const noShows = appts.filter((a) => a.status === 'no_show').length;
  const revenue = sum(done, (a) => a.fee);
  const collected = sum(done, (a) => a.paid);
  const chairMinutes = chairCount(data) * sum(eachDay(from, to), openMinutes);
  const usedMinutes = sum(appts.filter((a) => OCCUPYING.has(a.status)), (a) => a.duration);

  return {
    revenue,
    collected,
    collectionRate: ratio(collected, revenue),
    completed: done.length,
    newPatients: data.patients.filter((p) => p.firstVisit && inRange(p.firstVisit, from, to)).length,
    noShowRate: ratio(noShows, done.length + noShows),
    utilization: ratio(usedMinutes, chairMinutes),
    avgPerVisit: ratio(revenue, done.length),
    outstanding: outstandingAsOf(data, to),
  };
}

export function outstandingAsOf(data, date) {
  return sum(
    data.appointments.filter((a) => a.status === 'completed' && a.date <= date),
    (a) => Math.max(0, a.fee - a.paid),
  );
}

// Buckets by open day for ranges up to 31 days (closed days are skipped), otherwise by week (Sunday start).
export function trend(data, from, to) {
  const byWeek = diffDays(from, to) + 1 > 31;
  const keyOf = byWeek ? weekStart : (d) => d;
  const buckets = new Map();
  for (const d of eachDay(from, to)) {
    if (!byWeek && !isOpen(d)) continue;
    const k = keyOf(d);
    if (!buckets.has(k)) buckets.set(k, { start: k, revenue: 0, collected: 0, completed: 0, noShows: 0 });
  }
  for (const a of data.appointments) {
    if (!inRange(a.date, from, to)) continue;
    const b = buckets.get(keyOf(a.date));
    if (!b) continue;
    if (a.status === 'completed') {
      b.revenue += a.fee;
      b.collected += a.paid;
      b.completed += 1;
    } else if (a.status === 'no_show') {
      b.noShows += 1;
    }
  }
  return {
    unit: byWeek ? 'week' : 'day',
    buckets: [...buckets.values()].map((b) => ({ ...b, noShowRate: ratio(b.noShows, b.completed + b.noShows) })),
  };
}

export function categoryMix(data, from, to) {
  const trt = new Map(data.treatments.map((t) => [t.id, t]));
  const mix = {};
  for (const a of data.appointments) {
    if (a.status !== 'completed' || !inRange(a.date, from, to)) continue;
    const cat = trt.get(a.treatmentId)?.category ?? 'other';
    mix[cat] = (mix[cat] ?? 0) + a.fee;
  }
  return mix;
}

export function byDentist(data, from, to) {
  return data.dentists.map((d) => {
    const appts = data.appointments.filter((a) => a.dentistId === d.id && inRange(a.date, from, to));
    const done = appts.filter((a) => a.status === 'completed');
    const noShows = appts.filter((a) => a.status === 'no_show').length;
    const revenue = sum(done, (a) => a.fee);
    return {
      dentist: d,
      visits: done.length,
      revenue,
      avgPerVisit: ratio(revenue, done.length),
      noShows,
      noShowRate: ratio(noShows, done.length + noShows),
    };
  });
}

// ---- Front desk ----

export function dayAppointments(data, date) {
  return data.appointments
    .filter((a) => a.date === date)
    .sort((a, b) => timeToMin(a.start) - timeToMin(b.start) || a.chair - b.chair);
}

export function dayCounts(appts) {
  const count = (s) => appts.filter((a) => a.status === s).length;
  return {
    booked: appts.filter((a) => a.status !== 'cancelled').length,
    arrived: count('checked_in'),
    inChair: count('in_chair'),
    done: count('completed'),
    noShow: count('no_show'),
  };
}

export function unpaidBalances(data, asOf) {
  const balances = new Map();
  for (const a of data.appointments) {
    if (a.status !== 'completed' || a.date > asOf) continue;
    const due = a.fee - a.paid;
    if (due > 0) balances.set(a.patientId, (balances.get(a.patientId) ?? 0) + due);
  }
  const patients = new Map(data.patients.map((p) => [p.id, p]));
  return [...balances]
    .map(([id, balance]) => ({ patient: patients.get(id), balance }))
    .filter((r) => r.patient)
    .sort((a, b) => b.balance - a.balance);
}

// Patients whose last completed visit is more than RECALL_MONTHS ago and who have nothing booked.
export function recallsDue(data, asOf) {
  const last = new Map();
  const booked = new Set();
  for (const p of data.patients) if (p.lastVisit && p.lastVisit <= asOf) last.set(p.id, p.lastVisit);
  for (const a of data.appointments) {
    if (a.status === 'completed' && a.date <= asOf && a.date > (last.get(a.patientId) ?? '')) last.set(a.patientId, a.date);
    if (a.date > asOf && (a.status === 'scheduled' || a.status === 'checked_in')) booked.add(a.patientId);
  }
  return data.patients
    .filter((p) => last.has(p.id) && !booked.has(p.id))
    .map((p) => ({ patient: p, lastVisit: last.get(p.id), overdueDays: diffDays(last.get(p.id), asOf) - RECALL_DAYS }))
    .filter((r) => r.overdueDays > 0)
    .sort((a, b) => b.overdueDays - a.overdueDays);
}
