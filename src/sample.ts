import type { Stage } from './types';
import { norm } from './util';

/** Small seeded random generator, so the sample numbers stay the same on every load. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(s: string): number {
  let h = 2166136261;
  for (const c of s) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const POOL = [
  'Main Stage',
  'Market Stage',
  'Taxi Park',
  'Hospital Stage',
  'Church Stage',
  'Trading Centre',
  'Town Council',
  'Junction Stage',
  'School Stage',
  'Lakeside Stage',
];

/** Busier districts get a larger multiplier. */
const BUSY: Record<string, number> = {
  kampala: 3.2,
  wakiso: 2.6,
  mukono: 1.7,
  jinja: 1.6,
  mbarara: 1.6,
  gulu: 1.5,
  mbale: 1.4,
  masaka: 1.4,
  arua: 1.3,
  lira: 1.3,
};

/** Invented figures for every district. Replace with real data by loading a CSV. */
export function sampleStages(districtNames: string[]): Stage[] {
  const out: Stage[] = [];
  for (const name of districtNames) {
    const r = rng(hash(name));
    const factor = BUSY[norm(name)] ?? 0.5 + r() * 1.1;
    const count = Math.min(POOL.length, 3 + Math.floor(r() * 4 + factor * 1.2));
    const names = POOL.slice()
      .sort(() => r() - 0.5)
      .slice(0, count);
    for (const stage of names) {
      const total = Math.round((120 + Math.pow(r(), 1.7) * 2300) * factor);
      const first = Math.round(total * (0.08 + r() * 0.32));
      out.push({ district: name, stage, total, first, lat: null, lng: null });
    }
  }
  return out;
}
