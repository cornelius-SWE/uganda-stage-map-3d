import { interpolateRgb, max as dMax, min as dMin, scaleSequential, scaleSequentialSqrt } from 'd3';
import type { ScaleSequential } from 'd3';
import type { Metric } from './types';
import { agg, districts, metricValue, state } from './state';
import { cssVar, nf } from './util';

export interface Legend {
  title: string;
  min: string;
  mid: string;
  max: string;
  amber: boolean;
}

export interface Paint {
  /** Fill colour per district name. */
  colors: Map<string, string>;
  /** Height per district on a 0 to 1 scale, for 3D districts. */
  h01: Map<string, number>;
  legend: Legend;
}

const TITLES: Record<Metric, string> = {
  total: 'People transported',
  first: 'First-timers',
  share: 'First-timers as % of transported',
};

/** Works out each district's colour and height for the current metric and theme. */
export function computePaint(): Paint {
  const amber = state.metric !== 'total';
  const interpolate = interpolateRgb(cssVar(amber ? '--f0' : '--r0'), cssVar(amber ? '--f1' : '--r1'));
  const values = districts.map((d) => metricValue(agg(d.name))).filter((v): v is number => v !== null);
  const max = dMax(values) ?? 1;
  const min = state.metric === 'share' ? dMin(values) ?? 0 : 0;
  // Counts are skewed (a few very busy districts), so they use a square-root scale.
  const scale: ScaleSequential<string, never> =
    state.metric === 'share'
      ? scaleSequential(interpolate).domain([min, max])
      : scaleSequentialSqrt(interpolate).domain([0, max]);
  const noData = cssVar('--nodata');

  const colors = new Map<string, string>();
  const h01 = new Map<string, number>();
  for (const d of districts) {
    const a = agg(d.name);
    const v = metricValue(a);
    const has = v !== null && a.total > 0;
    colors.set(d.name, has ? scale(v) : noData);
    h01.set(d.name, has ? (state.metric === 'share' ? v / (max || 1) : Math.sqrt(v / (max || 1))) : 0);
  }

  const fmt = (v: number) => (state.metric === 'share' ? `${Math.round(v * 100)}%` : nf.format(Math.round(v)));
  const mid = state.metric === 'share' ? (min + max) / 2 : max * 0.25;
  return { colors, h01, legend: { title: TITLES[state.metric], min: fmt(min), mid: fmt(mid), max: fmt(max), amber } };
}
