import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { BBox, Vec2 } from "./types.ts";
import type { Projector } from "./project.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(HERE, ".cache");

/**
 * The city of Amsterdam maps roughly 300,000 street trees with a height class
 * and a species. OSM has a fraction of them, and along a gracht that difference
 * is the whole tree line.
 */
const WFS = "https://api.data.amsterdam.nl/v1/wfs/bomen/";

export interface Boom {
  readonly x: number;
  readonly z: number;
  readonly hoogte: number;
  /** Broad crown shape, from the species. */
  readonly soort: "breed" | "smal";
}

interface RawFeature {
  readonly geometry?: { readonly coordinates?: readonly number[] };
  readonly properties?: Readonly<Record<string, unknown>>;
}

interface RawCollection {
  readonly features?: readonly RawFeature[];
}

/**
 * Height classes read "d. 12 tot 15 m."; take the middle of the range. Anything
 * unparseable becomes a normal street tree.
 */
function hoogteUitKlasse(klasse: unknown): number {
  if (typeof klasse !== "string") return 9;
  const getallen = klasse.match(/\d+/g);
  if (!getallen || getallen.length === 0) return 9;
  if (getallen.length === 1) return Number(getallen[0]) + 1.5;
  const lo = Number(getallen[0]);
  const hi = Number(getallen[1]);
  return Number.isFinite(lo) && Number.isFinite(hi) ? (lo + hi) / 2 : 9;
}

/** Poplars and the like are narrow; elms, limes and planes carry a wide crown. */
const SMAL = /populus|carpinus|taxus|cupress|juniper|thuja/i;

async function fetchRaw(
  zoneId: string,
  bbox: BBox,
  refresh: boolean,
): Promise<RawCollection | null> {
  await mkdir(CACHE_DIR, { recursive: true });
  const cachePath = join(CACHE_DIR, `${zoneId}.bomen.json`);

  if (!refresh && existsSync(cachePath)) {
    const raw = await readFile(cachePath, "utf8");
    if (raw.trim() === "null") return null;
    return JSON.parse(raw) as RawCollection;
  }

  const [south, west, north, east] = bbox;
  const url =
    `${WFS}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature` +
    `&TYPENAMES=stamgegevens&OUTPUTFORMAT=geojson&COUNT=20000` +
    `&SRSNAME=${encodeURIComponent("urn:ogc:def:crs:EPSG::4326")}` +
    `&BBOX=${south},${west},${north},${east},urn:ogc:def:crs:EPSG::4326`;

  for (let poging = 0; poging < 3; poging++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "spaak-mapgen/0.1 (offline asset pipeline)" },
      });
      if (!res.ok) {
        await new Promise((r) => setTimeout(r, 1500 * 2 ** poging));
        continue;
      }
      const tekst = await res.text();
      if (!tekst.trimStart().startsWith("{")) {
        await writeFile(cachePath, "null", "utf8");
        return null;
      }
      await writeFile(cachePath, tekst, "utf8");
      return JSON.parse(tekst) as RawCollection;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`  bomen poging ${poging + 1} mislukt: ${msg}`);
      await new Promise((r) => setTimeout(r, 1500 * 2 ** poging));
    }
  }

  // A network failure is not an answer, so it is not remembered either.
  console.warn("  Bomendataset onbereikbaar, deze zone krijgt de OSM-bomen.");
  return null;
}

export async function laadBomen(
  zoneId: string,
  bbox: BBox,
  proj: Projector,
  refresh: boolean,
): Promise<Boom[]> {
  const raw = await fetchRaw(zoneId, bbox, refresh);
  const uit: Boom[] = [];

  for (const f of raw?.features ?? []) {
    const c = f.geometry?.coordinates;
    if (!c || c.length < 2) continue;
    const lon = c[0]!;
    const lat = c[1]!;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const props = f.properties ?? {};
    const soortnaam = typeof props["soortnaam"] === "string" ? props["soortnaam"] : "";
    const p: Vec2 = proj.project(lat, lon);
    uit.push({
      x: p.x,
      z: p.z,
      hoogte: Math.min(28, Math.max(3, hoogteUitKlasse(props["boomhoogteklasse_actueel"]))),
      soort: SMAL.test(soortnaam) ? "smal" : "breed",
    });
  }

  if (uit.length > 0) console.log(`  bomen: ${uit.length} uit de Amsterdamse dataset.`);
  return uit;
}
