import {
  Map as MapLibreMap,
  Popup,
  setWorkerUrl,
  type ExpressionSpecification,
  type GeoJSONSource,
  type LayerSpecification,
  type LngLatBoundsLike,
  type MapGeoJSONFeature,
  type StyleSpecification,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// MapLibre runs its tile work in a web worker. Loading it from a Blob keeps this
// working wherever the page is hosted, including as a single file.
import workerSource from 'maplibre-gl/dist/maplibre-gl-worker.mjs?raw';
import type { FeatureCollection } from 'geojson';
import type { Paint } from './colors';
import { DEMO, LOD, TERRARIUM_URL, VECTOR_TILEJSON } from './config';
import { demoBuildings, registerDemoTerrain } from './demo';
import { agg, GEO } from './state';
import type { AutoInfo, ViewFlags, ViewMode } from './types';
import { cssVar, esc, nf } from './util';

setWorkerUrl(URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' })));
if (DEMO) registerDemoTerrain();

export interface MapHandlers {
  onSelect(name: string): void;
  onAuto(info: AutoInfo): void;
  onFlags(flags: ViewFlags): void;
  onNotice(message: string | null): void;
}

export interface MapView {
  refreshData(paint: Paint): void;
  applyTheme(): void;
  select(name: string | null): void;
  setAuto(on: boolean): void;
  setTerrain(on: boolean): void;
  setBuildings(on: boolean): void;
  setDistricts3d(on: boolean): void;
  setExaggeration(value: number): void;
  toggleTilt(): void;
  zoomBy(factor: number): void;
  home(): void;
}

type Bounds = [[number, number], [number, number]];

function boundsOf(geometry: { coordinates: unknown }): Bounds {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  const walk = (c: unknown): void => {
    if (Array.isArray(c) && typeof c[0] === 'number') {
      const [lng, lat] = c as number[];
      minLng = Math.min(minLng, lng);
      maxLng = Math.max(maxLng, lng);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
    } else if (Array.isArray(c)) c.forEach(walk);
  };
  walk(geometry.coordinates);
  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}

const districtBounds = new Map(GEO.features.map((f) => [f.properties.name, boundsOf(f.geometry)]));
const countryBounds: Bounds = (() => {
  const all = [...districtBounds.values()];
  return [
    [Math.min(...all.map((b) => b[0][0])), Math.min(...all.map((b) => b[0][1]))],
    [Math.max(...all.map((b) => b[1][0])), Math.max(...all.map((b) => b[1][1]))],
  ];
})();

function districtCollection(paint: Paint): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: GEO.features.map((f) => {
      const name = f.properties.name;
      const a = agg(name);
      return {
        type: 'Feature',
        geometry: f.geometry,
        properties: {
          name,
          region: f.properties.region,
          total: a.total,
          first: a.first,
          color: paint.colors.get(name) ?? '#cccccc',
          h01: paint.h01.get(name) ?? 0,
        },
      };
    }),
  };
}

/** Tower height for 3D districts. Big at country scale, smaller as you zoom in so towers never swamp the view. */
const towerHeight = (): ExpressionSpecification => [
  'interpolate',
  ['linear'],
  ['zoom'],
  5,
  ['*', ['get', 'h01'], 50000],
  8,
  ['*', ['get', 'h01'], 15000],
  11,
  ['*', ['get', 'h01'], 3000],
];

function buildStyle(paint: Paint): StyleSpecification {
  const sources: StyleSpecification['sources'] = {
    districts: { type: 'geojson', data: districtCollection(paint) },
  };
  const layers: LayerSpecification[] = [{ id: 'land', type: 'background', paint: { 'background-color': '#e8edeb' } }];

  if (DEMO) {
    sources.dem = { type: 'raster-dem', tiles: ['demo-dem://{z}/{x}/{y}'], tileSize: 256, maxzoom: 9, encoding: 'terrarium' };
    sources['dem-hs'] = { type: 'raster-dem', tiles: ['demo-dem://{z}/{x}/{y}'], tileSize: 256, maxzoom: 9, encoding: 'terrarium' };
    sources['demo-buildings'] = { type: 'geojson', data: demoBuildings() };
  } else {
    sources.dem = { type: 'raster-dem', tiles: [TERRARIUM_URL], tileSize: 256, maxzoom: 15, encoding: 'terrarium', attribution: 'Terrain: Mapzen, AWS Terrain Tiles' };
    sources['dem-hs'] = { type: 'raster-dem', tiles: [TERRARIUM_URL], tileSize: 256, maxzoom: 15, encoding: 'terrarium' };
    sources.osm = { type: 'vector', url: VECTOR_TILEJSON };
  }

  layers.push({
    id: 'hillshade',
    type: 'hillshade',
    source: 'dem-hs',
    layout: { visibility: 'none' },
    paint: { 'hillshade-exaggeration': 0.35 },
  });

  if (!DEMO) {
    layers.push(
      { id: 'water', type: 'fill', source: 'osm', 'source-layer': 'water', paint: { 'fill-color': '#b9d3e6' } },
      {
        id: 'roads',
        type: 'line',
        source: 'osm',
        'source-layer': 'transportation',
        minzoom: 6,
        filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary']]],
        paint: { 'line-color': '#c3ccd0', 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.4, 14, 2.5] },
      },
    );
  }

  layers.push(
    {
      id: 'districts-fill',
      type: 'fill',
      source: 'districts',
      paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.82 },
    },
    {
      id: 'districts-3d',
      type: 'fill-extrusion',
      source: 'districts',
      layout: { visibility: 'none' },
      paint: {
        'fill-extrusion-color': ['get', 'color'],
        'fill-extrusion-height': towerHeight(),
        'fill-extrusion-base': 0,
        'fill-extrusion-opacity': 0.92,
      },
    },
    {
      id: 'districts-line',
      type: 'line',
      source: 'districts',
      paint: { 'line-color': '#ffffff', 'line-width': 0.7 },
    },
    {
      id: 'districts-sel',
      type: 'line',
      source: 'districts',
      filter: ['==', ['get', 'name'], ''],
      paint: { 'line-color': '#12222b', 'line-width': 2.5 },
    },
    DEMO
      ? {
          id: 'buildings',
          type: 'fill-extrusion',
          source: 'demo-buildings',
          minzoom: LOD.buildingsFromZoom - 1,
          layout: { visibility: 'none' },
          paint: { 'fill-extrusion-color': '#9aa7b0', 'fill-extrusion-height': ['get', 'height'], 'fill-extrusion-base': 0, 'fill-extrusion-opacity': 0.95 },
        }
      : {
          id: 'buildings',
          type: 'fill-extrusion',
          source: 'osm',
          'source-layer': 'building',
          minzoom: LOD.buildingsFromZoom - 1,
          layout: { visibility: 'none' },
          paint: {
            'fill-extrusion-color': '#9aa7b0',
            // OpenMapTiles stores the height in metres as render_height. Many buildings have none, so assume a low building.
            'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 6],
            'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
            'fill-extrusion-opacity': 0.95,
          },
        },
  );

  return { version: 8, sources, layers };
}

export function createMapView(container: string, handlers: MapHandlers, initialPaint: Paint): MapView {
  const map = new MapLibreMap({
    container,
    style: buildStyle(initialPaint),
    bounds: countryBounds as LngLatBoundsLike,
    fitBoundsOptions: { padding: 16 },
    maxPitch: 70,
    minZoom: 5,
    attributionControl: {
      compact: true,
      customAttribution: DEMO
        ? 'Boundaries: IRI / Keshif UEDP · Preview terrain and buildings are simulated'
        : 'Boundaries: IRI / Keshif UEDP · © OpenStreetMap contributors · OpenFreeMap',
    },
  });

  const flags: ViewFlags = { auto: true, terrain: false, buildings: false, districts3d: false };
  let exaggeration: number = LOD.defaultExaggeration;
  let selected: string | null = null;
  let mode: ViewMode | null = null;
  let evaluatePending = false;
  /** How many times in a row we have waited for terrain tiles to arrive. */
  let retries = 0;
  let noticeShown = false;
  let settleTimer = 0;

  const emitFlags = () => handlers.onFlags({ ...flags });

  /* ---------- switching 3D layers ---------- */

  function showTerrain(on: boolean): boolean {
    if (flags.terrain === on) return false;
    flags.terrain = on;
    if (map.getLayer('hillshade')) map.setLayoutProperty('hillshade', 'visibility', on ? 'visible' : 'none');
    map.setTerrain(on ? { source: 'dem', exaggeration } : null);
    return true;
  }

  function showBuildings(on: boolean): boolean {
    if (flags.buildings === on) return false;
    flags.buildings = on;
    if (map.getLayer('buildings')) map.setLayoutProperty('buildings', 'visibility', on ? 'visible' : 'none');
    return true;
  }

  /* ---------- automatic level of detail ---------- */

  /** Height difference across the view in true metres, or null if the ground hasn't loaded. */
  function sampleRelief(): number | null {
    const canvas = map.getCanvas();
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    let lo = Infinity;
    let hi = -Infinity;
    let count = 0;
    for (let i = 0; i < 7; i++) {
      for (let j = 0; j < 7; j++) {
        const p = map.unproject([w * (0.15 + (0.7 * i) / 6), h * (0.35 + (0.6 * j) / 6)]);
        const e = map.queryTerrainElevation(p);
        if (e !== null && Number.isFinite(e)) {
          lo = Math.min(lo, e);
          hi = Math.max(hi, e);
          count++;
        }
      }
    }
    return count >= 12 ? (hi - lo) / exaggeration : null;
  }

  function targetPitch(m: ViewMode): number {
    if (m === 'country' && flags.districts3d) return LOD.tilt.districts3d;
    return LOD.tilt[m];
  }

  function evaluate(): void {
    if (!flags.auto) return;
    const z = map.getZoom();
    const wantTerrain = z >= LOD.terrainFromZoom;
    const terrainJustOn = showTerrain(wantTerrain);
    const buildingsJustOn = showBuildings(z >= LOD.buildingsFromZoom);

    const relief = wantTerrain ? sampleRelief() : null;
    const buildings = z >= LOD.buildingsFromZoom && map.getLayer('buildings') ? map.queryRenderedFeatures({ layers: ['buildings'] }).length : 0;

    // Terrain and building tiles need a moment after switching on, so look again once they have arrived.
    // Give up after three tries so a failed download can't loop forever.
    const waitingForTerrain = wantTerrain && (terrainJustOn || relief === null);
    const waitingForBuildings = buildingsJustOn || (z >= LOD.buildingsFromZoom && buildings === 0 && retries === 0);
    if ((waitingForTerrain || waitingForBuildings) && retries < 3) {
      retries++;
      evaluatePending = true;
    }

    let next: ViewMode;
    if (!wantTerrain) next = 'country';
    else if (buildings >= LOD.townBuildings) next = 'urban';
    else if (relief !== null && relief >= LOD.mountainReliefM) next = 'mountain';
    else next = 'flat';

    if (map.getLayer('hillshade')) {
      // Strong shading where the ground is rugged, a faint hint on level ground.
      map.setPaintProperty('hillshade', 'hillshade-exaggeration', relief !== null && relief >= LOD.mountainReliefM ? 0.6 : 0.25);
    }

    if (next !== mode) {
      mode = next;
      const pitch = targetPitch(next);
      if (Math.abs(map.getPitch() - pitch) > 1) map.easeTo({ pitch, duration: 900 }, { auto: true });
    }
    handlers.onAuto({ mode: next, reliefM: relief, buildings });
    emitFlags();
  }

  map.on('moveend', (e) => {
    // Camera moves made by the auto mode itself must not trigger another evaluation.
    if ((e as { auto?: boolean }).auto) return;
    retries = 0;
    if (!flags.auto) return;
    evaluatePending = true;
    // Check soon after the camera stops. If tiles are still arriving, the idle handler below checks again.
    window.clearTimeout(settleTimer);
    settleTimer = window.setTimeout(() => {
      if (!evaluatePending) return;
      evaluatePending = false;
      evaluate();
    }, 400);
  });
  // Wait until the map has finished loading tiles, so relief and building counts are real.
  map.on('idle', () => {
    if (!evaluatePending) return;
    evaluatePending = false;
    evaluate();
  });

  /* ---------- data, theme, selection ---------- */

  function applyTheme(): void {
    if (!map.getLayer('land')) return;
    map.setPaintProperty('land', 'background-color', cssVar('--land'));
    map.setPaintProperty('districts-line', 'line-color', cssVar('--mapline'));
    map.setPaintProperty('districts-sel', 'line-color', cssVar('--ink'));
    map.setPaintProperty('buildings', 'fill-extrusion-color', cssVar('--bldg'));
    map.setPaintProperty('hillshade', 'hillshade-shadow-color', cssVar('--hs-shadow'));
    map.setPaintProperty('hillshade', 'hillshade-highlight-color', cssVar('--hs-high'));
    if (map.getLayer('water')) map.setPaintProperty('water', 'fill-color', cssVar('--water'));
    if (map.getLayer('roads')) map.setPaintProperty('roads', 'line-color', cssVar('--road'));
  }

  function refreshData(paint: Paint): void {
    const source = map.getSource('districts') as GeoJSONSource | undefined;
    source?.setData(districtCollection(paint));
  }

  function applySelection(): void {
    const name = selected ?? '';
    map.setFilter('districts-sel', ['==', ['get', 'name'], name]);
    // The chosen district stays stronger than its neighbours.
    const level = (base: number): ExpressionSpecification | number =>
      selected ? ['case', ['==', ['get', 'name'], name], Math.min(1, base + 0.13), base * 0.55] : base;
    // The colour fades as you zoom in, so the terrain and buildings underneath show through.
    map.setPaintProperty('districts-fill', 'fill-opacity', ['interpolate', ['linear'], ['zoom'], 6, level(0.82), 9, level(0.5), 13, level(0.22)]);
    map.setPaintProperty('districts-3d', 'fill-extrusion-opacity', level(0.92));
  }

  map.on('load', () => {
    applyTheme();
    applySelection();
    evaluatePending = true;
    emitFlags();
  });

  /* ---------- hover and tap ---------- */

  const popup = new Popup({ closeButton: false, closeOnClick: false, offset: 12, className: 'tipbox', maxWidth: 'none' });
  const pick = (point: { x: number; y: number }): MapGeoJSONFeature | undefined =>
    map.queryRenderedFeatures([point.x, point.y], { layers: ['districts-3d', 'districts-fill'] })[0];

  map.on('mousemove', (e) => {
    const f = pick(e.point);
    map.getCanvas().style.cursor = f ? 'pointer' : '';
    if (!f) {
      popup.remove();
      return;
    }
    const p = f.properties as { name: string; total: number; first: number };
    popup
      .setLngLat(e.lngLat)
      .setHTML(`<b>${esc(p.name)}</b><br>${nf.format(p.total)} transported · ${nf.format(p.first)} first-timers`)
      .addTo(map);
  });
  map.getCanvas().addEventListener('pointerleave', () => popup.remove());
  map.on('click', (e) => {
    const f = pick(e.point);
    if (f) handlers.onSelect((f.properties as { name: string }).name);
  });

  map.on('error', (e) => {
    const sourceId = (e as { sourceId?: string }).sourceId;
    if (noticeShown || !sourceId || !['dem', 'dem-hs', 'osm'].includes(sourceId)) return;
    noticeShown = true;
    handlers.onNotice('Terrain or building tiles could not load. Check your internet connection. Districts still work.');
  });

  /* ---------- public controls ---------- */

  return {
    refreshData,
    applyTheme,

    select(name) {
      selected = name;
      if (map.isStyleLoaded()) applySelection();
      if (name) {
        const b = districtBounds.get(name);
        if (b) map.fitBounds(b as LngLatBoundsLike, { padding: 48, maxZoom: 11, duration: 1400 });
      } else {
        map.fitBounds(countryBounds as LngLatBoundsLike, { padding: 16, pitch: flags.districts3d ? LOD.tilt.districts3d : 0, bearing: 0, duration: 1000 });
      }
    },

    setAuto(on) {
      flags.auto = on;
      mode = null;
      if (on) evaluate();
      emitFlags();
    },

    setTerrain(on) {
      flags.auto = false;
      showTerrain(on);
      emitFlags();
    },

    setBuildings(on) {
      flags.auto = false;
      showBuildings(on);
      emitFlags();
    },

    setDistricts3d(on) {
      flags.districts3d = on;
      map.setLayoutProperty('districts-fill', 'visibility', on ? 'none' : 'visible');
      map.setLayoutProperty('districts-3d', 'visibility', on ? 'visible' : 'none');
      if (on && map.getPitch() < 10) map.easeTo({ pitch: LOD.tilt.districts3d, duration: 800 }, { auto: true });
      if (!on && !flags.terrain && map.getPitch() > 1) map.easeTo({ pitch: 0, duration: 800 }, { auto: true });
      emitFlags();
    },

    setExaggeration(value) {
      exaggeration = value;
      if (flags.terrain) map.setTerrain({ source: 'dem', exaggeration });
    },

    toggleTilt() {
      map.easeTo({ pitch: map.getPitch() > 5 ? 0 : 55, duration: 700 }, { auto: true });
    },

    zoomBy(factor) {
      map.easeTo({ zoom: map.getZoom() + Math.log2(factor), duration: 300 });
    },

    home() {
      selected = null;
      applySelection();
      map.fitBounds(countryBounds as LngLatBoundsLike, { padding: 16, pitch: flags.districts3d ? LOD.tilt.districts3d : 0, bearing: 0, duration: 1000 });
    },
  };
}
