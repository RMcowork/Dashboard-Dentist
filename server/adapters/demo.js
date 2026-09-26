// Demo adapter: see public/js/data/demo-source.js (shared with the static build).

import { getDemoData } from '../../public/js/data/demo-source.js';

export const name = 'demo';

export async function getData() {
  return getDemoData();
}
