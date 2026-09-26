// Single source of truth for the data model: normalized keys used by the app,
// and how they map to Airtable table/field names and select-option labels.
// Used by the Airtable adapter (read) and scripts/seed-airtable.js (write).

export const STATUSES = ['scheduled', 'checked_in', 'in_chair', 'completed', 'no_show', 'cancelled'];
export const CATEGORIES = ['preventive', 'restorative', 'endo', 'ortho', 'cosmetic', 'surgery'];
export const PAYMENT_METHODS = ['card', 'cash', 'insurance', 'bit'];
export const SOURCES = ['new', 'returning', 'referral'];
export const LANGUAGES = ['en', 'he', 'ar'];
export const GENDERS = ['female', 'male'];

// Airtable select-option labels, keyed by normalized value.
export const LABELS = {
  status: {
    scheduled: 'Scheduled', checked_in: 'Checked in', in_chair: 'In chair',
    completed: 'Completed', no_show: 'No-show', cancelled: 'Cancelled',
  },
  category: {
    preventive: 'Preventive', restorative: 'Restorative', endo: 'Endodontics',
    ortho: 'Orthodontics', cosmetic: 'Cosmetic', surgery: 'Surgery',
  },
  paymentMethod: { card: 'Card', cash: 'Cash', insurance: 'Insurance', bit: 'Bit' },
  source: { new: 'New', returning: 'Returning', referral: 'Referral' },
  language: { en: 'English', he: 'Hebrew', ar: 'Arabic' },
  gender: { female: 'Female', male: 'Male' },
};

export function labelToKey(group, label) {
  if (label == null) return null;
  const entry = Object.entries(LABELS[group]).find(([, l]) => l === label);
  return entry ? entry[0] : String(label).toLowerCase().replace(/[\s-]+/g, '_');
}

const choices = (group, colors) =>
  Object.values(LABELS[group]).map((name, i) => ({ name, ...(colors ? { color: colors[i] } : {}) }));

const currency = { precision: 0, symbol: '₪' };
const isoDate = { dateFormat: { name: 'iso' } };

// Airtable table definitions. `key` = normalized property, `name` = Airtable field name.
// The first field of each table is its primary field. Link fields reference other tables by key.
export const TABLES = {
  dentists: {
    name: 'Dentists',
    fields: [
      { key: 'name', name: 'Name', type: 'singleLineText' },
      { key: 'specialty', name: 'Specialty', type: 'singleLineText' },
      { key: 'chair', name: 'Chair', type: 'number', options: { precision: 0 } },
      { key: 'active', name: 'Active', type: 'checkbox', options: { icon: 'check', color: 'greenBright' } },
    ],
  },
  treatments: {
    name: 'Treatments',
    fields: [
      { key: 'name.en', name: 'Name', type: 'singleLineText' },
      { key: 'name.he', name: 'Name (Hebrew)', type: 'singleLineText' },
      { key: 'name.ar', name: 'Name (Arabic)', type: 'singleLineText' },
      { key: 'category', name: 'Category', type: 'singleSelect', options: { choices: choices('category') }, labels: 'category' },
      { key: 'price', name: 'Price', type: 'currency', options: currency },
      { key: 'duration', name: 'Duration (min)', type: 'number', options: { precision: 0 } },
    ],
  },
  patients: {
    name: 'Patients',
    fields: [
      { key: 'name', name: 'Name', type: 'singleLineText' },
      { key: 'phone', name: 'Phone', type: 'phoneNumber' },
      { key: 'birthDate', name: 'Birth date', type: 'date', options: isoDate },
      { key: 'gender', name: 'Gender', type: 'singleSelect', options: { choices: choices('gender') }, labels: 'gender' },
      { key: 'city', name: 'City', type: 'singleLineText' },
      { key: 'language', name: 'Language', type: 'singleSelect', options: { choices: choices('language') }, labels: 'language' },
      { key: 'firstVisit', name: 'First visit', type: 'date', options: isoDate },
      { key: 'lastVisit', name: 'Last visit', type: 'date', options: isoDate },
    ],
  },
  appointments: {
    name: 'Appointments',
    fields: [
      { key: 'label', name: 'Appointment', type: 'singleLineText' },
      { key: 'date', name: 'Date', type: 'date', options: isoDate },
      { key: 'start', name: 'Start', type: 'singleLineText' },
      { key: 'duration', name: 'Duration (min)', type: 'number', options: { precision: 0 } },
      { key: 'patientId', name: 'Patient', type: 'multipleRecordLinks', link: 'patients' },
      { key: 'dentistId', name: 'Dentist', type: 'multipleRecordLinks', link: 'dentists' },
      { key: 'treatmentId', name: 'Treatment', type: 'multipleRecordLinks', link: 'treatments' },
      { key: 'chair', name: 'Chair', type: 'number', options: { precision: 0 } },
      {
        key: 'status', name: 'Status', type: 'singleSelect', labels: 'status',
        options: { choices: choices('status', ['grayLight2', 'blueLight2', 'purpleLight2', 'greenLight2', 'redLight2', 'yellowLight2']) },
      },
      { key: 'fee', name: 'Fee', type: 'currency', options: currency },
      { key: 'paid', name: 'Paid', type: 'currency', options: currency },
      { key: 'paymentMethod', name: 'Payment method', type: 'singleSelect', options: { choices: choices('paymentMethod') }, labels: 'paymentMethod' },
      { key: 'source', name: 'Source', type: 'singleSelect', options: { choices: choices('source') }, labels: 'source' },
    ],
  },
};

// Order in which tables must be created/seeded so link targets exist first.
export const TABLE_ORDER = ['dentists', 'treatments', 'patients', 'appointments'];

// ---- Mapping helpers (normalized record <-> Airtable fields) ----

function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
}

function setPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  for (const k of keys.slice(0, -1)) o = o[k] ??= {};
  o[keys.at(-1)] = value;
}

// normalized record -> Airtable `fields` object. `idMap` maps local ids to Airtable record ids.
export function toAirtableFields(tableKey, record, idMap = {}) {
  const fields = {};
  for (const f of TABLES[tableKey].fields) {
    let value = f.key === 'label' ? appointmentLabel(record) : getPath(record, f.key);
    if (value == null || value === '') continue;
    if (f.link) value = [idMap[value] ?? value];
    else if (f.labels) value = LABELS[f.labels][value] ?? value;
    fields[f.name] = value;
  }
  return fields;
}

// Airtable record -> normalized record. `fieldNames` optionally overrides Airtable field names
// (key -> name) for real bases whose columns are named differently.
export function fromAirtableRecord(tableKey, rec, fieldNames = {}) {
  const out = { id: rec.id };
  for (const f of TABLES[tableKey].fields) {
    if (f.key === 'label') continue;
    let value = rec.fields[fieldNames[f.key] ?? f.name];
    if (f.link) value = Array.isArray(value) ? value[0] ?? null : null;
    else if (f.labels) value = labelToKey(f.labels, value);
    else if (f.type === 'checkbox') value = Boolean(value);
    else if (value === undefined) value = null;
    setPath(out, f.key, value);
  }
  return out;
}

function appointmentLabel(a) {
  return `${a.date} ${a.start} · Chair ${a.chair}`;
}
