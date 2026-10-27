import geoData from './data/districts.json';
import type { DataSource, District, DistrictAgg, DistrictCollection, Metric, Stage } from './types';
import { norm } from './util';

export const GEO = geoData as unknown as DistrictCollection;

export const districts: District[] = GEO.features.map((f) => ({
  f,
  name: f.properties.name,
  region: f.properties.region,
  key: norm(f.properties.name),
}));

export const byKey = new Map(districts.map((d) => [d.key, d]));

export interface State {
  metric: Metric;
  selected: string | null;
  stages: Stage[];
  source: DataSource;
  agg: Map<string, DistrictAgg>;
}

export const state: State = { metric: 'total', selected: null, stages: [], source: 'sample', agg: new Map() };

/** Adds the stages up per district. Call after `state.stages` changes. */
export function aggregate(): void {
  state.agg = new Map(districts.map((d) => [d.name, { name: d.name, region: d.region, total: 0, first: 0, stages: [] }]));
  for (const s of state.stages) {
    const a = state.agg.get(s.district);
    if (!a) continue;
    a.total += s.total;
    a.first += s.first;
    a.stages.push(s);
  }
}

export function nationalTotals(): { total: number; first: number } {
  let total = 0;
  let first = 0;
  state.agg.forEach((a) => {
    total += a.total;
    first += a.first;
  });
  return { total, first };
}

export const agg = (name: string): DistrictAgg => state.agg.get(name) as DistrictAgg;

/** The number used to colour a district under the current metric. */
export function metricValue(a: DistrictAgg): number | null {
  if (state.metric === 'total') return a.total;
  if (state.metric === 'first') return a.first;
  return a.total ? a.first / a.total : null;
}
