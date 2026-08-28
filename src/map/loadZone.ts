import {
  CURV,
  DM,
  MRAD,
  ROUTE_STEP,
  type RawZoneData,
  type Zone,
  type ZoneIndex,
} from "./types.ts";

const BASE = `${import.meta.env.BASE_URL}mapdata`;

const zoneCache = new Map<string, Zone>();
const inFlight = new Map<string, Promise<Zone | null>>();
let indexCache: ZoneIndex | null = null;
let indexInFlight: Promise<ZoneIndex | null> | null = null;

function decode(raw: RawZoneData): Zone {
  const punten = raw.route.punten;
  const n = punten.length >> 1;
  const x = new Float32Array(n);
  const z = new Float32Array(n);
  const kromming = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    x[i] = punten[i * 2]! / DM;
    z[i] = punten[i * 2 + 1]! / DM;
    kromming[i] = (raw.route.kromming[i] ?? 0) / CURV;
  }

  // Heading is derivable from the points, so it is not stored.
  const heading = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - 1);
    const hi = Math.min(n - 1, i + 1);
    heading[i] = Math.atan2(z[hi]! - z[lo]!, x[hi]! - x[lo]!);
  }

  const gn = Math.floor(raw.gebouwen.length / 9);
  const gs = new Float32Array(gn);
  const gt = new Float32Array(gn);
  const gb = new Float32Array(gn);
  const gd = new Float32Array(gn);
  const gh = new Float32Array(gn);
  const gk = new Float32Array(gn);
  const gr = new Float32Array(gn);
  const gl = new Float32Array(gn);
  const gj = new Float32Array(gn);
  for (let i = 0; i < gn; i++) {
    const o = i * 9;
    gs[i] = raw.gebouwen[o]! / DM;
    gt[i] = raw.gebouwen[o + 1]! / DM;
    gb[i] = raw.gebouwen[o + 2]! / DM;
    gd[i] = raw.gebouwen[o + 3]! / DM;
    gh[i] = raw.gebouwen[o + 4]! / DM;
    gk[i] = raw.gebouwen[o + 5]! / DM;
    gr[i] = raw.gebouwen[o + 6]! / MRAD;
    gl[i] = raw.gebouwen[o + 7]!;
    gj[i] = raw.gebouwen[o + 8]!;
  }

  const wn = Math.floor(raw.water.length / 3);
  const ws = new Float32Array(wn);
  const wlo = new Float32Array(wn);
  const whi = new Float32Array(wn);
  for (let i = 0; i < wn; i++) {
    const o = i * 3;
    ws[i] = raw.water[o]! / DM;
    wlo[i] = raw.water[o + 1]! / DM;
    whi[i] = raw.water[o + 2]! / DM;
  }

  const bn = Math.floor(raw.bomen.length / 4);
  const bs = new Float32Array(bn);
  const bt = new Float32Array(bn);
  const bh = new Float32Array(bn);
  const bso = new Float32Array(bn);
  for (let i = 0; i < bn; i++) {
    const o = i * 4;
    bs[i] = raw.bomen[o]! / DM;
    bt[i] = raw.bomen[o + 1]! / DM;
    bh[i] = raw.bomen[o + 2]! / DM;
    bso[i] = raw.bomen[o + 3]!;
  }

  return {
    id: raw.id,
    naam: raw.naam,
    lengte: raw.lengte,
    origin: raw.origin,
    route: { n, x, z, heading, kromming },
    gebouwen: {
      n: gn,
      s: gs,
      t: gt,
      breedte: gb,
      diepte: gd,
      hoogte: gh,
      kap: gk,
      rotatie: gr,
      bouwlagen: gl,
      bouwjaar: gj,
    },
    water: { n: wn, s: ws, tMin: wlo, tMax: whi },
    bomen: { n: bn, s: bs, t: bt, hoogte: bh, soort: bso },
    bruggen: raw.bruggen,
    rails: raw.rails,
    straten: raw.straten,
  };
}

export function cachedZone(id: string): Zone | null {
  return zoneCache.get(id) ?? null;
}

/**
 * Never throws. A zone that will not load returns null and the caller keeps the
 * procedural world running; a missing decor file is not a reason to lose a run.
 */
export async function loadZone(id: string): Promise<Zone | null> {
  const hit = zoneCache.get(id);
  if (hit) return hit;

  const pending = inFlight.get(id);
  if (pending) return pending;

  const task = (async (): Promise<Zone | null> => {
    try {
      const res = await fetch(`${BASE}/${id}.json`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = (await res.json()) as RawZoneData;
      const zone = decode(raw);
      zoneCache.set(id, zone);
      return zone;
    } catch (err) {
      console.warn(
        `[spaak] zone "${id}" kon niet geladen worden, terug naar de procedurele wereld.`,
        err,
      );
      return null;
    } finally {
      inFlight.delete(id);
    }
  })();

  inFlight.set(id, task);
  return task;
}

export async function loadIndex(): Promise<ZoneIndex | null> {
  if (indexCache) return indexCache;
  if (indexInFlight) return indexInFlight;

  indexInFlight = (async (): Promise<ZoneIndex | null> => {
    try {
      const res = await fetch(`${BASE}/index.json`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const parsed = (await res.json()) as ZoneIndex;
      indexCache = parsed;
      return parsed;
    } catch (err) {
      console.warn("[spaak] mapdata index niet gevonden.", err);
      return null;
    } finally {
      indexInFlight = null;
    }
  })();

  return indexInFlight;
}

/** Route point index for an arc length. The pipeline guarantees fixed spacing. */
export function routeIndexAt(zone: Zone, s: number): number {
  const i = Math.round(s / ROUTE_STEP);
  return i < 0 ? 0 : i >= zone.route.n ? zone.route.n - 1 : i;
}

/** Curvature at an arc length, linearly interpolated between route samples. */
export function krommingAt(zone: Zone, s: number): number {
  const f = s / ROUTE_STEP;
  const i = Math.floor(f);
  if (i < 0) return zone.route.kromming[0] ?? 0;
  if (i >= zone.route.n - 1) return zone.route.kromming[zone.route.n - 1] ?? 0;
  const a = zone.route.kromming[i]!;
  const b = zone.route.kromming[i + 1]!;
  return a + (b - a) * (f - i);
}

/** Street name in force at an arc length. */
export function straatAt(zone: Zone, s: number): string {
  let naam = zone.straten[0]?.naam ?? zone.naam;
  for (const straat of zone.straten) {
    if (straat.s <= s) naam = straat.naam;
    else break;
  }
  return naam;
}
