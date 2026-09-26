import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TABLE_ORDER, fromAirtableRecord, toAirtableFields } from '../public/js/data/schema.js';
import { generate } from '../public/js/data/generate.js';

// What the seed script writes must read back identically through the Airtable adapter.
test('normalized -> Airtable fields -> normalized is lossless', () => {
  const data = generate({ today: '2026-09-24', nowMin: 11 * 60 });
  for (const key of TABLE_ORDER) {
    for (const rec of data[key]) {
      const fields = toAirtableFields(key, rec);
      // Airtable returns links as arrays of record ids; with no idMap the local ids pass through.
      const back = fromAirtableRecord(key, { id: rec.id, fields });
      assert.deepEqual(back, rec, `${key} ${rec.id}`);
    }
  }
});

test('select values are written as human labels', () => {
  const fields = toAirtableFields('appointments', {
    date: '2026-09-24', start: '09:00', chair: 1, status: 'no_show', paymentMethod: null, patientId: 'p1',
  }, { p1: 'recABC' });
  assert.equal(fields.Status, 'No-show');
  assert.deepEqual(fields.Patient, ['recABC']);
  assert.equal(fields.Appointment, '2026-09-24 09:00 · Chair 1');
  assert.ok(!('Payment method' in fields));
});
