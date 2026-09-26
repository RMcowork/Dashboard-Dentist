// Tiny DOM helpers. All data-derived text goes through esc() before hitting innerHTML.

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ENTITIES[c]);
}

// First column is the row header; the rest are right-aligned numbers.
export function tableHtml(headers, rows) {
  return `<thead><tr>${headers.map((h, i) => `<th scope="col"${i ? ' class="num"' : ''}>${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${r.map((c, i) => (i ? `<td class="num">${esc(c)}</td>` : `<th scope="row">${esc(c)}</th>`)).join('')}</tr>`).join('')}</tbody>`;
}

// "Dr. Noa Levi-Adler" -> "NL"
export function initials(name) {
  return name.replace(/^Dr\.?\s+/i, '').split(/[\s-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

// Tiny trend line for a KPI card. Values are drawn left→right; CSS mirrors it in RTL.
export function sparkline(values, id) {
  const pts = values.map((v, i) => [i, v]).filter(([, v]) => v != null);
  if (pts.length < 2) return '';
  const W = 120;
  const H = 36;
  const ys = pts.map(([, v]) => v);
  const min = Math.min(...ys);
  const span = Math.max(...ys) - min || 1;
  const x = (i) => (i / (values.length - 1)) * W;
  const y = (v) => H - 3 - ((v - min) / span) * (H - 6);
  const line = pts.map(([i, v], n) => `${n ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const areaPath = `${line}L${x(pts.at(-1)[0]).toFixed(1)},${H}L${x(pts[0][0]).toFixed(1)},${H}Z`;
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id="sg-${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".22"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs>
    <path d="${areaPath}" fill="url(#sg-${id})"/><path d="${line}" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
  </svg>`;
}
