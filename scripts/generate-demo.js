// Writes a demo-data snapshot to data/demo.json (the file seed-airtable.js uploads).
// Usage: node scripts/generate-demo.js [--today YYYY-MM-DD] [--weeks-back N] [--weeks-ahead N] [--patients N]

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generate } from '../public/js/data/generate.js';
import { todayStr } from '../public/js/dates.js';

const AIRTABLE_FREE_LIMIT = 1000;
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

const now = new Date();
const opts = {
  today: arg('today') ?? todayStr(),
  nowMin: now.getHours() * 60 + now.getMinutes(),
};
if (arg('weeks-back')) opts.weeksBack = Number(arg('weeks-back'));
if (arg('weeks-ahead')) opts.weeksAhead = Number(arg('weeks-ahead'));
if (arg('patients')) opts.patients = Number(arg('patients'));

const data = generate(opts);
const file = join(root, 'data', 'demo.json');
mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, JSON.stringify({ generatedFor: opts.today, ...data }, null, 2));

const counts = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.length]));
const total = Object.values(counts).reduce((a, b) => a + b, 0);
console.log(`Wrote ${file}`);
console.log(counts, `total records: ${total}`);
if (total > AIRTABLE_FREE_LIMIT) {
  console.warn(`⚠ ${total} records exceeds the Airtable free-plan limit of ${AIRTABLE_FREE_LIMIT} per base.`);
}
