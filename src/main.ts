import './style.css';
import { computePaint } from './colors';
import { DEMO } from './config';
import { stagesFromCSV } from './csv';
import { createMapView } from './mapview';
import { byId, renderPanel, say, type PanelHandlers } from './panel';
import { sampleStages } from './sample';
import { aggregate, byKey, districts, state } from './state';
import type { AutoInfo, Metric, ViewFlags, ViewMode } from './types';
import { norm } from './util';

const STORAGE_KEY = 'ugstage-csv';
const isPhone = () => window.matchMedia('(max-width: 880px)').matches;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- map ---------- */

state.stages = sampleStages(districts.map((d) => d.name));
aggregate();

const view = createMapView(
  'map',
  {
    onSelect: (name) => select(name),
    onAuto: showAutoInfo,
    onFlags: showFlags,
    onNotice: (message) => {
      const el = byId('notice');
      el.textContent = message ?? '';
      el.hidden = !message;
    },
  },
  computePaint(),
);

/* ---------- status pill and toggle buttons ---------- */

const MODE_TEXT: Record<ViewMode, string> = {
  country: 'Zoom in to see terrain and buildings',
  flat: 'Level ground, staying top-down',
  mountain: 'Hilly ground, showing 3D terrain',
  urban: 'Town, showing 3D buildings',
};

function showAutoInfo(info: AutoInfo): void {
  const bits = [MODE_TEXT[info.mode]];
  if (info.reliefM !== null) bits.push(`${nfm(info.reliefM)} m relief`);
  if (info.buildings > 0) bits.push(`${info.buildings} buildings`);
  const el = byId('autoInfo');
  el.textContent = bits.join(' · ');
  el.dataset.mode = info.mode;
}
const nfm = (n: number) => new Intl.NumberFormat('en').format(Math.round(n));

function showFlags(f: ViewFlags): void {
  byId('tAuto').setAttribute('aria-pressed', String(f.auto));
  byId('tTerrain').setAttribute('aria-pressed', String(f.terrain));
  byId('tBuildings').setAttribute('aria-pressed', String(f.buildings));
  byId('tDistricts').setAttribute('aria-pressed', String(f.districts3d));
  byId('autoInfo').hidden = !f.auto;
}

const pressed = (id: string) => byId(id).getAttribute('aria-pressed') === 'true';
byId('tAuto').onclick = () => view.setAuto(!pressed('tAuto'));
byId('tTerrain').onclick = () => view.setTerrain(!pressed('tTerrain'));
byId('tBuildings').onclick = () => view.setBuildings(!pressed('tBuildings'));
byId('tDistricts').onclick = () => view.setDistricts3d(!pressed('tDistricts'));
byId<HTMLInputElement>('exag').oninput = (e) => {
  const v = Number((e.target as HTMLInputElement).value);
  byId('exagOut').textContent = `${v.toFixed(1)}×`;
  view.setExaggeration(v);
};
byId('zin').onclick = () => view.zoomBy(1.7);
byId('zout').onclick = () => view.zoomBy(1 / 1.7);
byId('tilt').onclick = () => view.toggleTilt();
byId('zreset').onclick = () => select(null);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && state.selected) select(null);
});

/* ---------- legend and colours ---------- */

function repaint(): void {
  const paint = computePaint();
  view.refreshData(paint);
  const l = paint.legend;
  byId('legend').classList.toggle('amber', l.amber);
  byId('lgTitle').textContent = l.title;
  byId('lgMin').textContent = l.min;
  byId('lgMid').textContent = l.mid;
  byId('lgMax').textContent = l.max;
}

function onThemeChange(): void {
  view.applyTheme();
  repaint();
}
new MutationObserver(onThemeChange).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', onThemeChange);

document.querySelectorAll<HTMLButtonElement>('.seg button').forEach((button) => {
  button.onclick = () => {
    state.metric = button.dataset.m as Metric;
    document.querySelectorAll('.seg button').forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
    repaint();
    if (!state.selected) drawPanel();
  };
});

/* ---------- panel and selection ---------- */

const panelHandlers: PanelHandlers = {
  onSelect: (name) => select(name),
  onApply: (text) => applyCSV(text, true),
  onReset: () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage can be unavailable */
    }
    state.stages = sampleStages(districts.map((d) => d.name));
    state.source = 'sample';
    refresh();
    say('Showing sample data.');
  },
};

const drawPanel = () => renderPanel(panelHandlers);

function select(name: string | null): void {
  state.selected = name;
  view.select(name);
  drawPanel();
  if (name && isPhone()) byId('panel').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
}

/* ---------- loading data ---------- */

function applyCSV(text: string, persist: boolean): void {
  const result = stagesFromCSV(text, (name) => byKey.get(norm(name))?.name ?? null);
  if (!result.ok) {
    say(result.error, true);
    return;
  }
  state.stages = result.stages;
  state.source = 'yours';
  if (persist) {
    try {
      localStorage.setItem(STORAGE_KEY, text);
    } catch {
      /* storage can be unavailable */
    }
  }
  refresh();

  const notes = [`Loaded ${result.stages.length} stages.`];
  if (result.unmatched.length) {
    const shown = result.unmatched.slice(0, 6).join(', ');
    notes.push(`Skipped unknown districts: ${shown}${result.unmatched.length > 6 ? '…' : ''}.`);
  }
  if (result.invalid) notes.push(`${result.invalid} rows had invalid numbers.`);
  if (result.capped) notes.push(`${result.capped} rows had more first-timers than total, so they were capped.`);
  say(notes.join(' '), result.unmatched.length > 0 || result.invalid > 0);
}

/** Recomputes everything that depends on the data. */
function refresh(): void {
  aggregate();
  repaint();
  drawPanel();
  const chip = byId('srcChip');
  chip.textContent = state.source === 'sample' ? 'Sample data' : 'Your data';
  chip.classList.toggle('live', state.source !== 'sample');
}

/* ---------- start ---------- */

if (DEMO) {
  const el = byId('notice');
  el.textContent = 'Preview: terrain and buildings are simulated (towns: Kampala, Gulu, Mbale, Mbarara, Jinja, Fort Portal).';
  el.hidden = false;
}
repaint();
drawPanel();

try {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    applyCSV(saved, false);
    byId<HTMLTextAreaElement>('csv').value = saved;
  }
} catch {
  /* storage can be unavailable */
}
