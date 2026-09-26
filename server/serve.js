// Static file server for public/ plus a small JSON API.
//   GET /api/data  -> { source, data: { dentists, treatments, patients, appointments } }
// The data source is chosen by DATA_SOURCE (demo | airtable).

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
const adapter = ADAPTERS[process.env.DATA_SOURCE || 'demo'];
if (!adapter) throw new Error(`Unknown DATA_SOURCE "${process.env.DATA_SOURCE}". Use one of: ${Object.keys(ADAPTERS).join(', ')}`);

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

async function handleApi(req, res, path) {
  if (path === '/api/data') {
    try {
      sendJson(res, 200, { source: adapter.name, data: await adapter.getData() });
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
  const path = decodeURIComponent(req.url.split('?')[0]);
  if (path.startsWith('/api/')) handleApi(req, res, path);
  else handleStatic(res, path);
}).listen(PORT, () => {
  console.log(`Dental dashboard (${adapter.name} data) at http://localhost:${PORT}`);
});
