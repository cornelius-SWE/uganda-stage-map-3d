import type { Feature, FeatureCollection, MultiPolygon } from 'geojson';

export interface DistrictProps {
  id: string;
  name: string;
  region: string;
}

export type DistrictFeature = Feature<MultiPolygon, DistrictProps>;
export type DistrictCollection = FeatureCollection<MultiPolygon, DistrictProps>;

/** One stage (for example a taxi or boda stage) and the people it moved. */
export interface Stage {
  district: string;
  stage: string;
  /** Total people transported. */
  total: number;
  /** First-timers: always a portion of `total`. */
  first: number;
  lat: number | null;
  lng: number | null;
}

/** A district with its stages added up. */
export interface DistrictAgg {
  name: string;
  region: string;
  total: number;
  first: number;
  stages: Stage[];
}

export interface District {
  f: DistrictFeature;
  name: string;
  region: string;
  key: string;
}

export type Metric = 'total' | 'first' | 'share';
export type DataSource = 'sample' | 'yours';

/**
 * What the auto 3D mode decided for the current view.
 * - country: zoomed out, flat district map
 * - flat: zoomed in on level ground, stays top-down
 * - mountain: zoomed in where the ground rises and falls, tilts to show terrain
 * - urban: zoomed in on a town with building data, tilts to show buildings
 */
export type ViewMode = 'country' | 'flat' | 'mountain' | 'urban';

export interface AutoInfo {
  mode: ViewMode;
  /** Height difference across the view in metres, or null if not measured. */
  reliefM: number | null;
  /** Buildings counted in the view. */
  buildings: number;
}

export interface ViewFlags {
  auto: boolean;
  terrain: boolean;
  buildings: boolean;
  districts3d: boolean;
}
