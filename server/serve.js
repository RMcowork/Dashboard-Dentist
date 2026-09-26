// Static file server for public/ plus a small JSON API.
//   GET /api/data[?force=1] -> { source, airtableConfigured, sync, data: { dentists, treatments, patients, appointments } }
// The data source is chosen by DATA_SOURCE: demo | airtable | auto (default: airtable when a token is set).

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { ROOT, loadEnv } from './env.js';
import * as demo from './adapters/demo.js';
import * as airtable from './adapters/airtable.js';

loadEnv();

const ADAPTERS = { demo, airtable };
const PUBLIC = join(ROOT, 'public');
const PORT = Number(process.env.PORT) || 8940;
const airtableConfigured = Boolean(process.env.AIRTABLE_TOKEN && process.env.AIRTABLE_BASE_ID);
const requested = process.env.DATA_SOURCE || 'auto';
const adapter = requested === 'auto' ? (airtableConfigured ? airtable : demo) : ADAPTERS[requested];
if (!adapter) throw new Error(`Unknown DATA_SOURCE "${requested}". Use one of: auto, ${Object.keys(ADAPTERS).join(', ')}`);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function handleApi(req, res, path, query) {
  if (path === '/api/data') {
    try {
      const { data, sync } = await adapter.getData({ force: query.get('force') === '1' });
      sendJson(res, 200, { source: adapter.name, airtableConfigured, sync, data });
    } catch (err) {
      console.error(err);
      sendJson(res, 502, { error: err.message });
    }
    return;
  }
  sendJson(res, 404, { error: 'Not found' });
}

async function handleStatic(res, path) {
  const filePath = normalize(join(PUBLIC, path === '/' ? '/index.html' : path));
  if (!filePath.startsWith(PUBLIC + sep)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  try {
    const body = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const path = decodeURIComponent(url.pathname);
  if (path.startsWith('/api/')) handleApi(req, res, path, url.searchParams);
  else handleStatic(res, path);
}).listen(PORT, () => {
  console.log(`Dental dashboard (${adapter.name} data) at http://localhost:${PORT}`);
});
