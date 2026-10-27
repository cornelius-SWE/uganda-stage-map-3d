import type { Stage } from './types';
import { norm } from './util';

/** Splits CSV text into rows of fields. Handles quoted fields and both newline styles. */
export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const endRow = () => {
    row.push(field);
    field = '';
    if (row.some((x) => x.trim() !== '')) rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      endRow();
    } else field += c;
  }
  endRow();
  return rows;
}

type Column = 'district' | 'stage' | 'total' | 'first' | 'lat' | 'lng';

/** Accepted header spellings, compared after `norm()`. */
const ALIASES: Record<Column, string[]> = {
  district: ['district', 'districtname'],
  stage: ['stage', 'stagename', 'name'],
  total: ['transported', 'total', 'totaltransported', 'peopletransported', 'people'],
  first: ['firsttimers', 'firsttimer', 'first', 'firsttime', 'newcomers'],
  lat: ['lat', 'latitude'],
  lng: ['lng', 'lon', 'long', 'longitude'],
};

export type CsvResult =
  | { ok: true; stages: Stage[]; unmatched: string[]; invalid: number; capped: number }
  | { ok: false; error: string };

const toNumber = (s: string | undefined, fallback: string): number => Number((s ?? fallback).replace(/,/g, ''));

/**
 * Turns CSV text into stages.
 * @param resolve maps a district name from the file to the map's official name, or null if unknown.
 */
export function stagesFromCSV(text: string, resolve: (name: string) => string | null): CsvResult {
  const rows = parseCSV(text.trim());
  if (rows.length < 2) return { ok: false, error: 'Add a header row and at least one data row.' };

  const head = rows[0].map(norm);
  const col = {} as Record<Column, number>;
  for (const k of Object.keys(ALIASES) as Column[]) col[k] = head.findIndex((h) => ALIASES[k].includes(h));
  for (const k of ['district', 'stage', 'total'] as const) {
    if (col[k] < 0) return { ok: false, error: `Missing a "${k === 'total' ? 'transported' : k}" column.` };
  }

  const stages: Stage[] = [];
  const unmatched = new Set<string>();
  let invalid = 0;
  let capped = 0;

  for (const r of rows.slice(1)) {
    const raw = (r[col.district] ?? '').trim();
    const district = resolve(raw);
    if (!district) {
      unmatched.add(raw || '(blank)');
      continue;
    }
    const total = toNumber(r[col.total], '');
    let first = col.first >= 0 ? toNumber(r[col.first], '0') : 0;
    if (!isFinite(total) || total < 0 || !isFinite(first) || first < 0) {
      invalid++;
      continue;
    }
    if (first > total) {
      first = total;
      capped++;
    }
    const lat = col.lat >= 0 && r[col.lat] !== '' ? Number(r[col.lat]) : NaN;
    const lng = col.lng >= 0 && r[col.lng] !== '' ? Number(r[col.lng]) : NaN;
    stages.push({
      district,
      stage: (r[col.stage] ?? '').trim() || 'Stage',
      total,
      first,
      lat: isFinite(lat) ? lat : null,
      lng: isFinite(lng) ? lng : null,
    });
  }

  if (!stages.length) return { ok: false, error: 'No rows matched a Uganda district name. Check the spelling of the district column.' };
  return { ok: true, stages, unmatched: [...unmatched], invalid, capped };
}

export const CSV_TEMPLATE =
  'district,stage,transported,first_timers,lat,lng\nKampala,Stage A,1200,310,,\nKampala,Stage B,860,140,,\nGulu,Stage A,540,95,,';
