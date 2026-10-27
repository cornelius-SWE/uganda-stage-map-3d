import { addProtocol } from 'maplibre-gl';
import type { Feature, FeatureCollection, Polygon } from 'geojson';

/*
 * Simulated terrain and buildings for the preview build.
 * None of this is real survey data. It only exists so the 3D behaviour can be
 * tried without internet access. The real build reads OpenStreetMap and AWS tiles.
 */

interface Bump {
  lat: number;
  lng: number;
  /** Height added at the peak, in metres. */
  amp: number;
  /** Spread in degrees. */
  sigma: number;
}

const RANGES: Bump[] = [
  { lat: 0.38, lng: 29.9, amp: 3900, sigma: 0.14 }, // Rwenzori
  { lat: 1.13, lng: 34.56, amp: 2900, sigma: 0.22 }, // Mount Elgon
  { lat: -1.3, lng: 29.65, amp: 2200, sigma: 0.18 }, // Kigezi highlands
  { lat: 2.53, lng: 34.72, amp: 1500, sigma: 0.12 }, // Moroto
];

function elevation(lng: number, lat: number): number {
  let ranges = 0;
  for (const b of RANGES) {
    const d2 = (lng - b.lng) ** 2 + (lat - b.lat) ** 2;
    ranges += b.amp * Math.exp(-d2 / (2 * b.sigma ** 2));
  }
  const plateau = 1150 + 150 * Math.sin(lng * 1.7) * Math.cos(lat * 2.1);
  // Ridges show up more in the high ground than on the plains.
  const ridges = (30 + ranges * 0.12) * Math.sin(lng * 55 + Math.sin(lat * 31) * 2) * Math.cos(lat * 47);
  return plateau + ranges + ridges;
}

const TILE = 256;

async function demTile(z: number, x: number, y: number): Promise<ArrayBuffer> {
  const canvas = new OffscreenCanvas(TILE, TILE);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2D canvas available');
  const img = ctx.createImageData(TILE, TILE);
  const n = 2 ** z;
  for (let py = 0; py < TILE; py++) {
    const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + py / TILE)) / n))) * 180) / Math.PI;
    for (let px = 0; px < TILE; px++) {
      const lng = ((x + px / TILE) / n) * 360 - 180;
      // Terrarium encoding: metres = (R * 256 + G + B / 256) - 32768
      const v = elevation(lng, lat) + 32768;
      const i = (py * TILE + px) * 4;
      img.data[i] = Math.floor(v / 256);
      img.data[i + 1] = Math.floor(v % 256);
      img.data[i + 2] = Math.floor((v - Math.floor(v)) * 256);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return blob.arrayBuffer();
}

/** Registers `demo-dem://z/x/y` as a tile URL that returns simulated elevation. */
export function registerDemoTerrain(): void {
  addProtocol('demo-dem', async (params) => {
    const [z, x, y] = params.url.replace('demo-dem://', '').split('/').map(Number);
    return { data: await demTile(z, x, y) };
  });
}

interface Town {
  name: string;
  lat: number;
  lng: number;
  count: number;
  /** Tallest building in metres. */
  tall: number;
}

const TOWNS: Town[] = [
  { name: 'Kampala', lat: 0.3136, lng: 32.5811, count: 900, tall: 120 },
  { name: 'Gulu', lat: 2.7746, lng: 32.299, count: 350, tall: 45 },
  { name: 'Mbale', lat: 1.0775, lng: 34.175, count: 350, tall: 40 },
  { name: 'Mbarara', lat: -0.6072, lng: 30.6545, count: 350, tall: 45 },
  { name: 'Jinja', lat: 0.4244, lng: 33.2041, count: 350, tall: 40 },
  { name: 'Fort Portal', lat: 0.671, lng: 30.275, count: 300, tall: 35 },
];

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Simulated building footprints clustered around six towns. */
export function demoBuildings(): FeatureCollection<Polygon, { height: number }> {
  const features: Feature<Polygon, { height: number }>[] = [];
  TOWNS.forEach((t, ti) => {
    const r = rng(1000 + ti);
    const mLat = 1 / 111320;
    const mLng = 1 / (111320 * Math.cos((t.lat * Math.PI) / 180));
    for (let i = 0; i < t.count; i++) {
      // Dense in the middle, thinning out towards the edge (about 2 km).
      const dist = Math.abs((r() + r() + r() - 1.5) / 1.5) * 2200;
      const ang = r() * Math.PI * 2;
      const cx = t.lng + Math.cos(ang) * dist * mLng;
      const cy = t.lat + Math.sin(ang) * dist * mLat;
      const w = (14 + r() * 30) / 2;
      const h = (14 + r() * 30) / 2;
      const centre = Math.exp(-((dist / 900) ** 2));
      const height = Math.round(4 + r() * 8 + centre * r() * r() * t.tall);
      features.push({
        type: 'Feature',
        properties: { height },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [cx - w * mLng, cy - h * mLat],
              [cx + w * mLng, cy - h * mLat],
              [cx + w * mLng, cy + h * mLat],
              [cx - w * mLng, cy + h * mLat],
              [cx - w * mLng, cy - h * mLat],
            ],
          ],
        },
      });
    }
  });
  return { type: 'FeatureCollection', features };
}
