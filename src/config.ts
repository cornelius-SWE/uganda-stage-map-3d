/**
 * Preview mode uses simulated terrain and buildings, so the 3D behaviour can be
 * tried with no internet access. Build it with `npm run build:preview`.
 */
export const DEMO: boolean = import.meta.env.VITE_DEMO === '1';

/** Free elevation tiles (Terrarium encoding) from the AWS Terrain Tiles dataset. */
export const TERRARIUM_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';

/** Free OpenStreetMap vector tiles (OpenMapTiles schema) from OpenFreeMap. */
export const VECTOR_TILEJSON = 'https://tiles.openfreemap.org/planet';

/** Rules for the automatic level of detail. */
export const LOD = {
  /** From this zoom the terrain is switched on and measured. */
  terrainFromZoom: 7,
  /** From this zoom buildings are drawn (only where the map data has them). */
  buildingsFromZoom: 14,
  /** At least this many buildings in view counts as a town. */
  townBuildings: 10,
  /** Height difference across the view (metres) that counts as hilly or mountainous. */
  mountainReliefM: 300,
  tilt: { country: 0, flat: 0, mountain: 60, urban: 55, districts3d: 45 },
  defaultExaggeration: 1.5,
} as const;
