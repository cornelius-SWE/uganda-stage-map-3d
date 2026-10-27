# Uganda Stage Map (3D)

An interactive map of Uganda's 134 districts. Tap a district to zoom in and see how many people were transported, how many were first-timers, and the same figures for each stage. As you zoom in, the map switches on 3D terrain or 3D buildings by itself, depending on where you are looking.

Built with TypeScript, Vite, MapLibre GL JS and D3.

## Run it

You need Node.js 18 or newer.

```bash
npm install
npm run dev            # real terrain and buildings (needs internet)
npm run dev:preview    # simulated terrain and buildings (works offline)
npm run build          # type-check, then build into dist/
npm run build:preview  # one self-contained HTML file in dist-preview/
```

Serve the built files over HTTP (`npm run preview`, or any static host). Opening `dist/index.html` straight from disk does not work, because browsers block the map's background worker on `file://` pages.

## How the automatic 3D works

The rules live in `src/config.ts` (`LOD`) and `evaluate()` in `src/mapview.ts`.

| Where you are looking | What the map does |
| --- | --- |
| Zoomed out (below zoom 7) | Flat district map |
| Zoomed in, level ground (under 300 m height difference in view) | Terrain loaded, stays top-down |
| Zoomed in, hilly or mountainous | Tilts to 60 degrees, shows 3D terrain and stronger hillshade |
| Zoom 14 or closer, with 10 or more buildings in view | Tilts to 55 degrees, shows 3D buildings |

The height difference is measured from the loaded terrain across the current view. Turn off "Auto 3D" to use the Terrain and Buildings buttons yourself. "3D districts" raises each district as a tower scaled to the number of people transported.

## Data sources

- **District boundaries:** Uganda Elections Data Portal (IRI and Keshif), 2019 set of 134 districts, simplified.
- **Terrain:** AWS Terrain Tiles (Terrarium encoding), free, no key.
- **Buildings and water:** OpenStreetMap data served by OpenFreeMap (OpenMapTiles schema), free, no key. Building heights come from the `render_height` field; many buildings have none, so those are drawn at a default 6 m.

These hosts are set in `src/config.ts`. Both are public free services with no guarantees; for a production system use your own tile provider or host the tiles yourself.

The preview build replaces terrain and buildings with simulated ones (mountain ranges near the Rwenzori, Elgon, Kigezi and Moroto, and building clusters around six towns). It is for trying the behaviour offline and is not real data.

## Your data

The map starts with invented sample figures. Open "Use your own data" in the side panel and paste or upload a CSV:

```csv
district,stage,transported,first_timers,lat,lng
Kampala,Stage A,1200,310,,
Gulu,Stage A,540,95,,
```

- `district`, `stage` and `transported` are required. `first_timers` defaults to 0 and can never exceed `transported`.
- District names match ignoring case and punctuation. Unknown names are reported and skipped.
- Loaded data is remembered in that browser only.

## Project layout

| File | What it does |
| --- | --- |
| `src/main.ts` | Wires the page together: buttons, legend, panel, data loading |
| `src/mapview.ts` | MapLibre map: layers, automatic 3D, hover and tap, camera |
| `src/config.ts` | Tile sources and the automatic 3D thresholds |
| `src/demo.ts` | Simulated terrain and buildings for the preview build |
| `src/colors.ts` | District colours, heights and legend for the chosen metric |
| `src/panel.ts` | Side panel (country totals, district and stage detail) |
| `src/state.ts` | Data state and per-district totals |
| `src/csv.ts`, `src/sample.ts`, `src/util.ts`, `src/types.ts` | CSV parsing, sample data, helpers, types |
| `src/data/districts.json` | District boundaries |
