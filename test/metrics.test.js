import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeKpis, previousPeriod, trend, categoryMix, byDentist, dayCounts, unpaidBalances, recallsDue,
} from '../public/js/metrics.js';
import { generate } from '../public/js/data/generate.js';

// Hand-built fixture. 2026-09-20 is a Sunday (600 open min), 2026-09-25 a Friday (300 min).
const fixture = {
  dentists: [
    { id: 'd1', name: 'A', chair: 1, active: true },
    { id: 'd2', name: 'B', chair: 2, active: true },
  ],
  treatments: [
    { id: 't1', category: 'preventive', price: 300, duration: 30 },
    { id: 't2', category: 'surgery', price: 1000, duration: 60 },
  ],
  patients: [
    { id: 'p1', firstVisit: '2020-01-01', lastVisit: '2026-01-01' },
    { id: 'p2', firstVisit: '2026-09-20', lastVisit: '2026-09-20' },
    { id: 'p3', firstVisit: '2019-01-01', lastVisit: '2025-01-01' }, // overdue, nothing booked
  ],
  appointments: [
    { id: 'a1', date: '2026-09-20', start: '09:00', duration: 30, patientId: 'p1', dentistId: 'd1', treatmentId: 't1', chair: 1, status: 'completed', fee: 300, paid: 300 },
    { id: 'a2', date: '2026-09-20', start: '10:00', duration: 60, patientId: 'p2', dentistId: 'd2', treatmentId: 't2', chair: 2, status: 'completed', fee: 1000, paid: 400 },
    { id: 'a3', date: '2026-09-20', start: '11:00', duration: 30, patientId: 'p1', dentistId: 'd1', treatmentId: 't1', chair: 1, status: 'no_show', fee: 300, paid: 0 },
    { id: 'a4', date: '2026-09-20', start: '12:00', duration: 30, patientId: 'p1', dentistId: 'd1', treatmentId: 't1', chair: 1, status: 'cancelled', fee: 300, paid: 0 },
    { id: 'a5', date: '2026-09-25', start: '09:00', duration: 60, patientId: 'p1', dentistId: 'd2', treatmentId: 't2', chair: 2, status: 'scheduled', fee: 1000, paid: 0 },
    { id: 'a6', date: '2026-09-10', start: '09:00', duration: 30, patientId: 'p1', dentistId: 'd1', treatmentId: 't1', chair: 1, status: 'completed', fee: 300, paid: 100 },
  ],
};

test('computeKpis follows the SPEC formulas', () => {
  const k = computeKpis(fixture, '2026-09-20', '2026-09-26');
  assert.equal(k.revenue, 1300);
  assert.equal(k.collected, 700);
  assert.equal(k.collectionRate, 700 / 1300);
  assert.equal(k.completed, 2);
  assert.equal(k.newPatients, 1);
  assert.equal(k.noShowRate, 1 / 3);
  // used: a1 30 + a2 60 + a5 60 = 150; available: 2 chairs × (5×600 + 300) = 6600
  assert.equal(k.utilization, 150 / 6600);
  assert.equal(k.avgPerVisit, 650);
  // outstanding as of end: a2 600 + a6 200
  assert.equal(k.outstanding, 800);
});

test('empty ranges return null ratios, not NaN', () => {
  const k = computeKpis(fixture, '2027-01-01', '2027-01-07');
  assert.equal(k.revenue, 0);
  assert.equal(k.noShowRate, null);
  assert.equal(k.avgPerVisit, null);
});

test('previousPeriod has equal length and ends the day before', () => {
  assert.deepEqual(previousPeriod('2026-09-20', '2026-09-26'), { from: '2026-09-13', to: '2026-09-19' });
});

test('trend buckets by day for short ranges and by week for long ones', () => {
  const short = trend(fixture, '2026-09-20', '2026-09-26');
  assert.equal(short.unit, 'day');
  assert.equal(short.buckets.length, 6); // Saturday skipped
  assert.equal(short.buckets[0].revenue, 1300);
  assert.equal(short.buckets[0].noShowRate, 1 / 3);

  const long = trend(fixture, '2026-08-01', '2026-09-26');
  assert.equal(long.unit, 'week');
  assert.equal(long.buckets.at(-1).start, '2026-09-20');
  assert.equal(long.buckets.at(-1).revenue, 1300);
});

test('categoryMix and byDentist', () => {
  assert.deepEqual(categoryMix(fixture, '2026-09-20', '2026-09-26'), { preventive: 300, surgery: 1000 });
  const [d1, d2] = byDentist(fixture, '2026-09-20', '2026-09-26');
  assert.equal(d1.visits, 1);
  assert.equal(d1.noShowRate, 0.5);
  assert.equal(d2.revenue, 1000);
});

test('front-desk helpers', () => {
  const day = fixture.appointments.filter((a) => a.date === '2026-09-20');
  assert.deepEqual(dayCounts(day), { booked: 3, arrived: 0, inChair: 0, done: 2, noShow: 1 });

  const unpaid = unpaidBalances(fixture, '2026-09-26');
  assert.deepEqual(unpaid.map((r) => [r.patient.id, r.balance]), [['p2', 600], ['p1', 200]]);

  // p1 has a booking on 09-25 → not recalled; p3 last visit 2025-01-01 → overdue
  const recalls = recallsDue(fixture, '2026-09-20');
  assert.deepEqual(recalls.map((r) => r.patient.id), ['p3']);
});

test('demo generator is deterministic and stays under the Airtable free-plan limit', () => {
  const a = generate({ today: '2026-09-24', nowMin: 11 * 60 });
  const b = generate({ today: '2026-09-24', nowMin: 11 * 60 });
  assert.deepEqual(a, b);
  const total = Object.values(a).reduce((s, arr) => s + arr.length, 0);
  assert.ok(total <= 1000, `total ${total}`);
  // Today (a Thursday) has appointments in several live statuses
  const statuses = new Set(a.appointments.filter((x) => x.date === '2026-09-24').map((x) => x.status));
  assert.ok(statuses.has('completed') && statuses.has('scheduled'));
  // Every link resolves
  const ids = (k) => new Set(a[k].map((x) => x.id));
  const [pats, dens, trts] = [ids('patients'), ids('dentists'), ids('treatments')];
  assert.ok(a.appointments.every((x) => pats.has(x.patientId) && dens.has(x.dentistId) && trts.has(x.treatmentId)));
});

test('kpiSeries has one KPI set per trend bucket', async () => {
  const { kpiSeries } = await import('../public/js/metrics.js');
  const s = kpiSeries(fixture, '2026-09-20', '2026-09-26');
  assert.equal(s.length, 6);
  assert.equal(s[0].revenue, 1300);
  assert.equal(s[5].revenue, 0); // Friday: only a scheduled visit
});
