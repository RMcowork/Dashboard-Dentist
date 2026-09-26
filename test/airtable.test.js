import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as airtable from '../server/adapters/airtable.js';

process.env.AIRTABLE_TOKEN = 'test-token';
process.env.AIRTABLE_BASE_ID = 'appTEST';
process.env.AIRTABLE_MIN_INTERVAL_SECONDS = '0';

const appt = (id, status) => ({ id, fields: { Date: '2026-09-24', Start: '09:00', Status: status, Fee: 250, Paid: 0, Patient: ['recP'] } });

// Fake Airtable: returns fixed rows per table; a filterByFormula request returns `delta` rows instead.
function mockFetch({ tables, delta = {}, fail = false }) {
  const calls = [];
  globalThis.fetch = async (url) => {
    const u = new URL(url);
    const table = decodeURIComponent(u.pathname.split('/').pop());
    const isDelta = u.searchParams.has('filterByFormula');
    calls.push({ table, isDelta, fields: u.searchParams.getAll('fields[]') });
    if (fail) return { ok: false, status: 429, text: async () => 'rate limited' };
    const records = isDelta ? delta[table] ?? [] : tables[table] ?? [];
    return { ok: true, json: async () => ({ records }) };
  };
  return calls;
}

beforeEach(() => airtable._reset());

test('first sync is a full load of every table, requesting only mapped fields', async () => {
  const calls = mockFetch({ tables: { Appointments: [appt('rec1', 'Scheduled')] } });
  const { data, sync } = await airtable.getData();
  assert.equal(sync.mode, 'full');
  assert.deepEqual(calls.map((c) => c.table), ['Dentists', 'Treatments', 'Patients', 'Appointments']);
  assert.ok(!calls.at(-1).fields.includes('Appointment'), 'primary label is not fetched');
  assert.equal(data.appointments[0].status, 'scheduled');
});

test('later syncs fetch only changed patients/appointments and merge them by id', async () => {
  mockFetch({ tables: { Appointments: [appt('rec1', 'Scheduled'), appt('rec2', 'Scheduled')] } });
  await airtable.getData();
  const calls = mockFetch({ tables: {}, delta: { Appointments: [appt('rec2', 'Completed'), appt('rec3', 'Scheduled')] } });
  const { data, sync } = await airtable.getData();
  assert.equal(sync.mode, 'delta');
  assert.equal(sync.changed, 2);
  assert.deepEqual(calls.map((c) => c.table), ['Patients', 'Appointments']);
  const byId = Object.fromEntries(data.appointments.map((a) => [a.id, a.status]));
  assert.deepEqual(byId, { rec1: 'scheduled', rec2: 'completed', rec3: 'scheduled' });
});

test('concurrent requests share one sync; within the min interval the cache is used', async () => {
  process.env.AIRTABLE_MIN_INTERVAL_SECONDS = '60';
  const calls = mockFetch({ tables: {} });
  await Promise.all([airtable.getData(), airtable.getData(), airtable.getData()]);
  assert.equal(calls.length, 4);
  const again = await airtable.getData();
  assert.equal(again.sync.mode, 'cached');
  assert.equal(calls.length, 4);
  process.env.AIRTABLE_MIN_INTERVAL_SECONDS = '0';
});

test('when Airtable fails after a good sync, the last data is served as stale', async () => {
  mockFetch({ tables: { Appointments: [appt('rec1', 'Scheduled')] } });
  await airtable.getData();
  mockFetch({ tables: {}, fail: true });
  const { data, sync } = await airtable.getData();
  assert.equal(sync.mode, 'stale');
  assert.match(sync.error, /429/);
  assert.equal(data.appointments.length, 1);
});
