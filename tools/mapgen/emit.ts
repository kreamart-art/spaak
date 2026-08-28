import { gzipSync } from "node:zlib";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  Brug,
  PlacedBuilding,
  PlacedTree,
  PlacedWater,
  Rail,
  RoutePoint,
  Straat,
  ZoneConfig,
  ZoneData,
  ZoneIndex,
  ZoneIndexEntry,
} from "./types.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
export const OUT_DIR = join(HERE, "..", "..", "public", "mapdata");

/** Lengths are stored in decimetres, angles in milliradians. */
const DM = 10;
const MRAD = 1000;
/** Curvature is tiny, so it gets its own finer unit of 1e-4 rad/m. */
const CURV = 10000;

const round = (v: number): number => Math.round(v);
const dec = (v: number, places: number): number => {
  const f = 10 ** places;
  return Math.round(v * f) / f;
};

export interface EmitInput {
  readonly zone: ZoneConfig;
  readonly origin: readonly [number, number];
  readonly punten: readonly RoutePoint[];
  readonly gebouwen: readonly PlacedBuilding[];
  readonly water: readonly PlacedWater[];
  readonly bomen: readonly PlacedTree[];
  readonly bruggen: readonly Brug[];
  readonly rails: readonly Rail[];
  readonly straten: readonly Straat[];
}

export function buildZoneData(input: EmitInput): ZoneData {
  const punten: number[] = [];
  const kromming: number[] = [];
  for (const p of input.punten) {
    punten.push(round(p.x * DM), round(p.z * DM));
    kromming.push(round(p.curvature * CURV));
  }

  const gebouwen: number[] = [];
  for (const b of input.gebouwen) {
    gebouwen.push(
      round(b.s * DM),
      round(b.t * DM),
      round(b.breedte * DM),
      round(b.diepte * DM),
      round(b.hoogte * DM),
      round(b.kap * DM),
      round(b.rotatie * MRAD),
      b.bouwlagen,
      b.bouwjaar,
    );
  }

  const water: number[] = [];
  for (const w of input.water) {
    water.push(round(w.s * DM), round(w.tMin * DM), round(w.tMax * DM));
  }

  const bomen: number[] = [];
  for (const t of input.bomen) {
    bomen.push(round(t.s * DM), round(t.t * DM), round(t.hoogte * DM), t.soort);
  }

  return {
    id: input.zone.id,
    naam: input.zone.naam,
    lengte: round(input.punten[input.punten.length - 1]!.s),
    origin: input.origin,
    route: { punten, kromming },
    gebouwen,
    water,
    bomen,
    bruggen: input.bruggen.map((b) => ({
      s: dec(b.s, 1),
      naam: b.naam,
      breedte: dec(b.breedte, 1),
    })),
    rails: input.rails.map((r) => ({ s: round(r.s), hoek: dec(r.hoek, 2) })),
    straten: input.straten.map((s) => ({ s: round(s.s), naam: s.naam })),
  };
}

export interface WriteResult {
  readonly path: string;
  readonly bytes: number;
  readonly gzipped: number;
}

export async function writeZone(data: ZoneData): Promise<WriteResult> {
  await mkdir(OUT_DIR, { recursive: true });
  const json = JSON.stringify(data);
  const path = join(OUT_DIR, `${data.id}.json`);
  await writeFile(path, json, "utf8");
  return {
    path,
    bytes: Buffer.byteLength(json, "utf8"),
    gzipped: gzipSync(json, { level: 9 }).byteLength,
  };
}

export async function writeIndex(entries: readonly ZoneIndexEntry[]): Promise<string> {
  await mkdir(OUT_DIR, { recursive: true });
  const index: ZoneIndex = {
    zones: entries,
    attributie: [
      "© OpenStreetMap contributors",
      "3DBAG, TU Delft (CC BY 4.0)",
    ],
  };
  const path = join(OUT_DIR, "index.json");
  await writeFile(path, JSON.stringify(index, null, 2), "utf8");
  return path;
}
