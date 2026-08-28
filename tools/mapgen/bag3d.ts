import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { BBox, Vec2 } from "./types.ts";
import type { Projector } from "./project.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(HERE, ".cache");

/**
 * 3DBAG publishes LoD 1.2 building blocks. We only need one number per pand,
 * the roof height, so we ask the WFS for the pand layer and keep centroids.
 */
const WFS = "https://data.3dbag.nl/api/BAG3D/wfs";
const LAYER = "BAG3D:lod12";

/** Everything 3DBAG knows about a pand that changes how it should look. */
export interface BagPand {
  readonly x: number;
  readonly z: number;
  /** Main roof level above ground, metres. */
  readonly hoogte: number;
  /** Ridge height above the main roof level, metres. 0 for a flat roof. */
  readonly kap: number;
  /** Storeys, or 0 when 3DBAG does not know. */
  readonly bouwlagen: number;
  /** Year of construction, or 0 when unknown. */
  readonly bouwjaar: number;
}

interface RawFeature {
  readonly geometry?: {
    readonly type?: string;
    readonly coordinates?: unknown;
  };
  readonly properties?: Readonly<Record<string, unknown>>;
}

interface RawCollection {
  readonly features?: readonly RawFeature[];
}

// 3DBAG stores absolute NAP heights, so a roof percentile only becomes a
// building height after subtracting the ground level.
const HEIGHT_KEYS = ["b3_h_70p", "b3_h_50p", "b3_h_max", "h_dak_70p", "roof_height"];
const GROUND_KEYS = ["b3_h_maaiveld", "h_maaiveld", "ground_height"];

/**
 * b3_h_min is the lowest point of the roof surface, which on a canal house can
 * dip to a low rear extension, so it is useless as an eaves line. The 70th
 * percentile is the main roof plane; the ridge sits above it.
 */
const MAX_KAP = 4.5;
const MIN_KAP = 0.3;

function num(v: unknown): number | null {
  const n = typeof v === "string" ? Number.parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

function flattenCoords(input: unknown, out: number[][]): void {
  if (!Array.isArray(input)) return;
  if (typeof input[0] === "number" && typeof input[1] === "number") {
    out.push([input[0] as number, input[1] as number]);
    return;
  }
  for (const child of input) flattenCoords(child, out);
}

async function fetchRaw(zoneId: string, bbox: BBox, refresh: boolean): Promise<RawCollection | null> {
  await mkdir(CACHE_DIR, { recursive: true });
  const cachePath = join(CACHE_DIR, `${zoneId}.3dbag.json`);

  if (!refresh && existsSync(cachePath)) {
    const raw = await readFile(cachePath, "utf8");
    if (raw.trim() === "null") return null;
    return JSON.parse(raw) as RawCollection;
  }

  const [south, west, north, east] = bbox;
  const url =
    `${WFS}?service=WFS&version=2.0.0&request=GetFeature` +
    `&typeNames=${encodeURIComponent(LAYER)}` +
    `&outputFormat=${encodeURIComponent("application/json")}` +
    `&srsName=${encodeURIComponent("urn:ogc:def:crs:EPSG::4326")}` +
    `&count=20000` +
    `&bbox=${south},${west},${north},${east},urn:ogc:def:crs:EPSG::4326`;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "spaak-mapgen/0.1 (offline asset pipeline)" },
      });
      if (!res.ok) {
        await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt));
        continue;
      }
      const text = await res.text();
      if (!text.trimStart().startsWith("{")) {
        // The WFS answers with an XML exception report when the layer moved.
        // That is a real answer, so it is safe to remember.
        await writeFile(cachePath, "null", "utf8");
        console.warn("  3DBAG gaf geen GeoJSON terug, hoogtes vallen terug op OSM.");
        return null;
      }
      await writeFile(cachePath, text, "utf8");
      return JSON.parse(text) as RawCollection;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`  3DBAG poging ${attempt + 1} mislukt: ${msg}`);
      await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt));
    }
  }

  // Deliberately not cached: the service was unreachable, which says nothing
  // about the data. Caching that would make one bad minute permanent.
  console.warn(
    "  3DBAG onbereikbaar. Draai de zone opnieuw voor daken, bouwlagen en bouwjaren.",
  );
  return null;
}

/**
 * Centroid-indexed 3DBAG heights. Buildings without an OSM height tag get the
 * height of the nearest pand centroid, which is what a footprint match comes
 * down to once both datasets describe the same block.
 */
export class Bag3D {
  private readonly cells = new Map<string, BagPand[]>();
  private readonly cell = 25;
  readonly count: number;

  private constructor(panden: readonly BagPand[]) {
    this.count = panden.length;
    for (const p of panden) {
      const key = `${Math.floor(p.x / this.cell)},${Math.floor(p.z / this.cell)}`;
      const bucket = this.cells.get(key);
      if (bucket) bucket.push(p);
      else this.cells.set(key, [p]);
    }
  }

  static async load(
    zoneId: string,
    bbox: BBox,
    proj: Projector,
    refresh: boolean,
  ): Promise<Bag3D> {
    const raw = await fetchRaw(zoneId, bbox, refresh);
    const panden: BagPand[] = [];

    for (const f of raw?.features ?? []) {
      const props = f.properties ?? {};
      let roof: number | null = null;
      for (const k of HEIGHT_KEYS) {
        const v = num(props[k]);
        if (v !== null) {
          roof = v;
          break;
        }
      }
      if (roof === null) continue;

      let ground = 0;
      for (const k of GROUND_KEYS) {
        const v = num(props[k]);
        if (v !== null) {
          ground = v;
          break;
        }
      }

      const hoogte = roof - ground;
      if (!(hoogte > 2 && hoogte < 200)) continue;

      // A pitched roof gets a cap; a flat one does not.
      let kap = 0;
      const nok = num(props["b3_h_nok"]);
      const daktype = typeof props["b3_dak_type"] === "string" ? props["b3_dak_type"] : "";
      if (daktype.includes("slanted") && nok !== null) {
        kap = Math.min(MAX_KAP, Math.max(0, nok - roof));
        if (kap < MIN_KAP) kap = 0;
      }

      const bouwlagen = num(props["b3_bouwlagen"]) ?? 0;
      const bouwjaar = num(props["oorspronkelijkbouwjaar"]) ?? 0;

      const coords: number[][] = [];
      flattenCoords(f.geometry?.coordinates, coords);
      if (coords.length === 0) continue;

      let lon = 0;
      let lat = 0;
      for (const c of coords) {
        lon += c[0]!;
        lat += c[1]!;
      }
      const p = proj.project(lat / coords.length, lon / coords.length);
      panden.push({
        x: p.x,
        z: p.z,
        hoogte,
        kap,
        bouwlagen: Math.min(12, Math.max(0, Math.round(bouwlagen))),
        bouwjaar: bouwjaar > 1000 && bouwjaar < 2100 ? Math.round(bouwjaar) : 0,
      });
    }

    if (panden.length > 0) {
      console.log(`  3DBAG: ${panden.length} panden met hoogte geladen.`);
    }
    return new Bag3D(panden);
  }

  /** Nearest pand within `radius` metres, or null. */
  pandAt(p: Vec2, radius = 12): BagPand | null {
    if (this.count === 0) return null;
    const cx = Math.floor(p.x / this.cell);
    const cz = Math.floor(p.z / this.cell);
    let best: BagPand | null = null;
    let bestD2 = radius * radius;

    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const bucket = this.cells.get(`${cx + dx},${cz + dz}`);
        if (!bucket) continue;
        for (const q of bucket) {
          const ddx = q.x - p.x;
          const ddz = q.z - p.z;
          const d2 = ddx * ddx + ddz * ddz;
          if (d2 < bestD2) {
            bestD2 = d2;
            best = q;
          }
        }
      }
    }
    return best;
  }
}
