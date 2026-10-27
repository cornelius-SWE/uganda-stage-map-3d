import { max, rollups, sum } from 'd3';
import { CSV_TEMPLATE } from './csv';
import { agg, districts, metricValue, nationalTotals, state } from './state';
import type { Metric } from './types';
import { esc, nf, pct } from './util';

export interface PanelHandlers {
  /** A district name to open, or null for the whole country. */
  onSelect(name: string | null): void;
  onApply(csv: string): void;
  onReset(): void;
}

export const byId = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
};

const jumpHTML = (): string => {
  const options = districts
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((d) => `<option value="${esc(d.name)}"${d.name === state.selected ? ' selected' : ''}>${esc(d.name)}</option>`)
    .join('');
  return `<select class="jump" id="jump" aria-label="Jump to a district"><option value="">Jump to a district…</option>${options}</select>`;
};

const statsHTML = (total: number, first: number): string => `<div class="stats">
  <div class="stat tot"><span class="k">Transported</span><span class="v">${nf.format(total)}</span></div>
  <div class="stat first"><span class="k">First-timers</span><span class="v">${nf.format(first)}</span></div>
  <div class="stat"><span class="k">First-timer share</span><span class="v">${pct(first, total)}%</span></div></div>`;

const splitHTML = (total: number, first: number): string => `<div>
  <div class="split" role="img" aria-label="${pct(first, total)} percent first-timers"><span style="width:${pct(first, total)}%"></span></div>
  <div class="key"><span>Returning</span><span class="f">First-timers</span></div></div>`;

/** One labelled bar: the full bar is the total, the amber part is first-timers. */
function barRow(name: string, total: number, first: number, top: number, attrs = '', tag: 'li' | 'button' = 'li'): string {
  const width = top ? (total / top) * 100 : 0;
  return `<${tag} class="row" ${attrs}>
    <div class="top"><span class="nm">${esc(name)}</span><span class="nums">${nf.format(total)} · ${nf.format(first)} first (${pct(first, total)}%)</span></div>
    <div class="bar"><i style="width:${width}%"><b style="width:${pct(first, total)}%"></b></i></div></${tag}>`;
}

const dataBoxHTML = (): string => `<details id="dataBox"><summary>Use your own data</summary><div class="dbox">
  <p>Paste CSV or choose a file. Columns: <code>district</code>, <code>stage</code>, <code>transported</code>, <code>first_timers</code>. Optional <code>lat</code>, <code>lng</code> are kept with each stage.</p>
  <textarea id="csv" aria-label="CSV data" spellcheck="false" placeholder="district,stage,transported,first_timers"></textarea>
  <div class="btns"><button type="button" class="btn primary" id="apply">Apply data</button>
    <button type="button" class="btn" id="tpl">Insert template</button>
    <label class="btn" for="file">Choose file</label><input type="file" id="file" accept=".csv,text/csv,text/plain" hidden>
    <button type="button" class="btn" id="reset">Back to sample</button></div>
  <div id="status" role="status"></div></div></details>`;

function nationalHTML(): string {
  const totals = nationalTotals();
  const regions = rollups(
    [...state.agg.values()],
    (v) => ({ t: sum(v, (a) => a.total), f: sum(v, (a) => a.first) }),
    (a) => a.region,
  ).sort((a, b) => b[1].t - a[1].t);
  const maxRegion = max(regions, (r) => r[1].t) ?? 1;
  const top = [...state.agg.values()]
    .filter((a) => a.total > 0)
    .sort((a, b) => (metricValue(b) ?? -1) - (metricValue(a) ?? -1))
    .slice(0, 10);
  const maxTop = max(top, (a) => a.total) ?? 1;
  const label: Record<Metric, string> = { total: 'transported', first: 'first-timers', share: 'first-timer share' };

  return `<div class="p-head"><h2 class="p-title">All Uganda</h2>
    <span class="p-sub">${state.agg.size} districts · ${nf.format(state.stages.length)} stages</span>${jumpHTML()}</div>
    ${statsHTML(totals.total, totals.first)}${splitHTML(totals.total, totals.first)}
    <div><h3>By region</h3><ul class="rows">${regions.map(([name, v]) => barRow(name, v.t, v.f, maxRegion)).join('')}</ul></div>
    <div><h3>Top districts by ${label[state.metric]}</h3><div class="rows">${top
      .map((a) => barRow(a.name, a.total, a.first, maxTop, `type="button" data-d="${esc(a.name)}"`, 'button'))
      .join('')}</div></div>
    ${dataBoxHTML()}`;
}

function districtHTML(name: string): string {
  const a = agg(name);
  const stages = a.stages.slice().sort((x, y) => y.total - x.total);
  const maxStage = max(stages, (s) => s.total) ?? 1;
  const list = stages.length
    ? `<ul class="rows">${stages.map((s) => barRow(s.stage, s.total, s.first, maxStage)).join('')}</ul>`
    : '<p class="empty">No stage data for this district yet.</p>';

  return `<div class="p-head"><button type="button" class="back" id="back">← All Uganda</button>
    <h2 class="p-title">${esc(a.name)}</h2>
    <span class="p-sub">${esc(a.region)} region · ${stages.length} ${stages.length === 1 ? 'stage' : 'stages'}</span>${jumpHTML()}</div>
    ${statsHTML(a.total, a.first)}${a.total ? splitHTML(a.total, a.first) : ''}
    <div><h3>Stages</h3>${list}</div>
    ${dataBoxHTML()}`;
}

export function say(message: string, isError = false): void {
  const el = document.getElementById('status');
  if (!el) return;
  el.textContent = message;
  el.className = isError ? 'err' : '';
}

export function renderPanel(h: PanelHandlers): void {
  const panel = byId('panel');
  const wasOpen = document.querySelector<HTMLDetailsElement>('#dataBox')?.open ?? false;
  const draft = document.querySelector<HTMLTextAreaElement>('#csv')?.value ?? '';
  panel.innerHTML = state.selected ? districtHTML(state.selected) : nationalHTML();
  if (wasOpen) byId<HTMLDetailsElement>('dataBox').open = true;
  const csvBox = byId<HTMLTextAreaElement>('csv');
  csvBox.value = draft;

  byId<HTMLSelectElement>('jump').onchange = (e) => h.onSelect((e.target as HTMLSelectElement).value || null);
  const back = document.getElementById('back');
  if (back) back.onclick = () => h.onSelect(null);
  panel.querySelectorAll<HTMLElement>('[data-d]').forEach((b) => {
    b.onclick = () => h.onSelect(b.dataset.d ?? null);
  });
  byId('apply').onclick = () => h.onApply(csvBox.value);
  byId('tpl').onclick = () => {
    csvBox.value = CSV_TEMPLATE;
  };
  byId('reset').onclick = () => h.onReset();
  byId<HTMLInputElement>('file').onchange = (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      csvBox.value = text;
      h.onApply(text);
    };
    reader.readAsText(file);
  };
}
