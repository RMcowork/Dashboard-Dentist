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
