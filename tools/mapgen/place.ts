import type {
  Brug,
  OverpassElement,
  PlacedBuilding,
  PlacedTree,
  PlacedWater,
  Rail,
  Vec2,
} from "./types.ts";
import type { Projector } from "./project.ts";
import type { BagPand } from "./bag3d.ts";
import type { Boom } from "./bomen.ts";
import type { RouteIndex } from "./index_grid.ts";
import { angleDelta, centroid, minAreaBox, norm, ringArea, sub } from "./geom.ts";

/**
 * Nothing further off the route than this is ever visible from the lane.
 * A canal is about 25 m wide with a quay on either side, so the far row of
 * canal houses sits at 45 to 60 m. At 45 m that whole facade wall, the most
 * recognisable thing about the city, falls outside the data.
 */
export const MAX_T = 65;
/** Sheds and bike lockers only cost frames. */
export const MIN_FOOTPRINT = 12;
/** Facades this close together along the route become one wider block. */
const MERGE_S = 1.5;
/**
 * ...but only within the same row. Past the canal there is a second and a third
 * row of houses on the same side, and fusing across them would drop a phantom
 * block in the gap between them.
 */
const MERGE_T = 6;
/**
 * The three lanes span 9 m. Decor may not reach into that, plus a margin, or the
 * player runs through a facade. Deep blocks and irregular footprints whose
 * minimum-area box overshoots are the usual offenders, so they get pushed out
 * rather than dropped: a shifted facade is invisible at speed, a hole in the
 * canal wall is not.
 */
export const LANE_CLEARANCE = 6;
/**
 * A building is dropped when a nearer one on the same side covers its frontage
 * and is at least as tall. The runtime pool holds 60 facades; spending them on
 * back rows that never clear the front row costs view distance for nothing.
 * A taller back building still survives, because that silhouette is visible.
 */
const OCCLUSIE_MARGE = 2;
const OCCLUSIE_DEKKING = 0.75;

const FLOOR = 3.2;
const ROOF = 1.5;
export const FALLBACK_LEVELS = 4;

/**
 * Building types that are not panden, so 3DBAG will never know them. Amsterdam
 * canals are lined with houseboats; matched to the nearest pand they would come
 * out as 14 m towers floating in the water.
 */
const TYPE_HOOGTE: Readonly<Record<string, number>> = {
  houseboat: 3.4,
  boat: 3.4,
  static_caravan: 3,
  houseboat_mooring: 3.4,
  roof: 3.5,
  carport: 2.6,
  shed: 2.6,
  garage: 2.6,
  garages: 2.8,
  kiosk: 3,
  hut: 2.6,
};

export interface PlaceStats {
  osm: number;
  bag: number;
  fallback: number;
  teKlein: number;
  teVer: number;
  samengevoegd: number;
  verdekt: number;
  verschoven: number;
}

function parseMetres(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number.parseFloat(v.replace(",", ".").replace(/[^\d.\-]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function ring(el: OverpassElement, proj: Projector): Vec2[] | null {
  if (!el.geometry || el.geometry.length < 4) return null;
  const pts = el.geometry.map((g) => proj.project(g.lat, g.lon));
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  if (Math.hypot(first.x - last.x, first.z - last.z) < 0.5) pts.pop();
  return pts.length >= 3 ? pts : null;
}

/** Deterministic 0..1 from an OSM id, so a rebuild never reshuffles the world. */
function hash01(id: number): number {
  let h = id >>> 0;
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function placeBuildings(
  elements: readonly OverpassElement[],
  proj: Projector,
  index: RouteIndex,
  bagPand: (p: Vec2) => BagPand | null,
): { gebouwen: PlacedBuilding[]; stats: PlaceStats } {
  const stats: PlaceStats = {
    osm: 0,
    bag: 0,
    fallback: 0,
    teKlein: 0,
    teVer: 0,
    samengevoegd: 0,
    verdekt: 0,
    verschoven: 0,
  };
  const raw: PlacedBuilding[] = [];

  for (const el of elements) {
    if (!el.tags?.building) continue;
    const r = ring(el, proj);
    if (!r) continue;

    const opp = ringArea(r);
    if (opp < MIN_FOOTPRINT) {
      stats.teKlein++;
      continue;
    }

    const c = centroid(r);
    const anchor = index.nearest(c);
    if (Math.abs(anchor.t) > MAX_T) {
      stats.teVer++;
      continue;
    }

    // Always consult 3DBAG, even when OSM knows the height: the roof type,
    // storey count and year of construction are what make a facade Amsterdam,
    // and OSM has none of them.
    const pand = bagPand(c);

    let hoogte: number | null = parseMetres(el.tags.height);
    let bron: PlacedBuilding["bron"] = "osm";
    if (hoogte === null) {
      const levels = parseMetres(el.tags["building:levels"]);
      if (levels !== null) hoogte = levels * FLOOR + ROOF;
    }
    const typeHoogte = TYPE_HOOGTE[el.tags.building];
    if (hoogte === null && typeHoogte !== undefined) hoogte = typeHoogte;
    if (hoogte === null && pand) {
      hoogte = pand.hoogte;
      bron = "3dbag";
    }
    if (hoogte === null) {
      hoogte = FALLBACK_LEVELS * FLOOR + ROOF;
      bron = "fallback";
    }
    hoogte = Math.min(90, Math.max(3, hoogte));

    // A houseboat or a shed never gets a canal-house roof.
    const eigenType = typeHoogte !== undefined;
    const kap = eigenType ? 0 : Math.min(hoogte * 0.4, pand?.kap ?? 0);
    const bouwlagen =
      pand?.bouwlagen && pand.bouwlagen > 0
        ? pand.bouwlagen
        : Math.max(1, Math.round((hoogte - ROOF) / FLOOR));
    const bouwjaar = pand?.bouwjaar ?? 0;

    const box = minAreaBox(r);
    const rp = index.point(anchor.index);
    const f: Vec2 = { x: Math.cos(rp.heading), z: Math.sin(rp.heading) };
    const right: Vec2 = { x: -f.z, z: f.x };

    // Use whichever box axis lies closest to the route as the frontage, so
    // "breedte" really is the width you see when you run past it.
    const axisA = box.axis;
    const axisB: Vec2 = { x: -axisA.z, z: axisA.x };
    const alignA = Math.abs(axisA.x * f.x + axisA.z * f.z);
    const alignB = Math.abs(axisB.x * f.x + axisB.z * f.z);
    const primary = alignA >= alignB ? axisA : axisB;
    const breedte = alignA >= alignB ? box.a : box.b;
    const diepte = alignA >= alignB ? box.b : box.a;

    // rotation.y in the scene: local +x maps to (cos, -sin) in scene x/z, and
    // the route frame maps forward to -z and right to +x.
    const rotatie = Math.atan2(
      primary.x * f.x + primary.z * f.z,
      primary.x * right.x + primary.z * right.z,
    );

    raw.push({
      s: anchor.s,
      t: anchor.t,
      breedte: Math.min(60, Math.max(2, breedte)),
      diepte: Math.min(60, Math.max(2, diepte)),
      hoogte,
      kap,
      bouwlagen,
      bouwjaar,
      rotatie,
      bron,
    });
  }

  // Count the sources on what actually ships, not on what went into the merge.
  const samengevoegd = mergeNeighbours(raw);
  const zichtbaar = cullVerdekt(samengevoegd);
  const vrij = vrijmakenBaan(zichtbaar.gebouwen);
  const gebouwen = vrij.gebouwen;
  stats.samengevoegd = raw.length - samengevoegd.length;
  stats.verdekt = zichtbaar.verdekt;
  stats.verschoven = vrij.verschoven;
  for (const b of gebouwen) {
    if (b.bron === "osm") stats.osm++;
    else if (b.bron === "3dbag") stats.bag++;
    else stats.fallback++;
  }

  return { gebouwen, stats };
}

/** Drop what can never clear the row in front of it. */
function cullVerdekt(input: readonly PlacedBuilding[]): {
  gebouwen: PlacedBuilding[];
  verdekt: number;
} {
  const perKant = [
    input.filter((b) => b.t < 0),
    input.filter((b) => b.t >= 0),
  ];
  const houden: PlacedBuilding[] = [];
  let verdekt = 0;

  for (const kant of perKant) {
    // Nearest first, so every candidate only has to look at what came before.
    const opAfstand = [...kant].sort((a, b) => Math.abs(a.t) - Math.abs(b.t));
    const voorgrond: PlacedBuilding[] = [];

    for (const b of opAfstand) {
      const lo = b.s - b.breedte / 2;
      const hi = b.s + b.breedte / 2;
      const span = Math.max(0.5, hi - lo);
      let gedekt = 0;

      for (const a of voorgrond) {
        if (Math.abs(a.t) > Math.abs(b.t) - OCCLUSIE_MARGE) continue;
        if (a.hoogte < b.hoogte) continue;
        const overlap =
          Math.min(hi, a.s + a.breedte / 2) - Math.max(lo, a.s - a.breedte / 2);
        if (overlap > 0) gedekt += overlap;
      }

      if (gedekt / span >= OCCLUSIE_DEKKING) {
        verdekt++;
        continue;
      }
      voorgrond.push(b);
      houden.push(b);
    }
  }

  return { gebouwen: houden.sort((a, b) => a.s - b.s), verdekt };
}

/** Half the box extent measured along the t axis. */
function halfBreedteT(b: PlacedBuilding): number {
  return (
    Math.abs(Math.cos(b.rotatie)) * b.breedte * 0.5 +
    Math.abs(Math.sin(b.rotatie)) * b.diepte * 0.5
  );
}

/** Slide anything whose near face reaches into the lane back out of it. */
function vrijmakenBaan(input: readonly PlacedBuilding[]): {
  gebouwen: PlacedBuilding[];
  verschoven: number;
} {
  let verschoven = 0;
  const gebouwen = input.map((b) => {
    const near = Math.abs(b.t) - halfBreedteT(b);
    if (near >= LANE_CLEARANCE) return b;
    verschoven++;
    const kant = b.t < 0 ? -1 : 1;
    return { ...b, t: kant * (halfBreedteT(b) + LANE_CLEARANCE) };
  });
  return { gebouwen, verschoven };
}

/** Adjacent canal houses on the same side collapse into one wider block. */
function mergeNeighbours(input: readonly PlacedBuilding[]): PlacedBuilding[] {
  const left = input.filter((b) => b.t < 0).sort((a, b) => a.s - b.s);
  const right = input.filter((b) => b.t >= 0).sort((a, b) => a.s - b.s);
  const out: PlacedBuilding[] = [];

  for (const side of [left, right]) {
    let group: PlacedBuilding[] = [];
    const flush = (): void => {
      if (group.length === 0) return;
      out.push(group.length === 1 ? group[0]! : fuse(group));
      group = [];
    };
    for (const b of side) {
      const prev = group[group.length - 1];
      if (prev && b.s - prev.s < MERGE_S && Math.abs(b.t - prev.t) < MERGE_T) {
        group.push(b);
      } else {
        flush();
        group = [b];
      }
    }
    flush();
  }

  return out.sort((a, b) => a.s - b.s);
}

function fuse(group: readonly PlacedBuilding[]): PlacedBuilding {
  let lo = Infinity;
  let hi = -Infinity;
  let t = 0;
  let diepte = 0;
  let hoogte = 0;
  let kap = 0;
  let bouwlagen = 0;
  let bouwjaar = 0;
  let bron: PlacedBuilding["bron"] = "fallback";
  let rotSin = 0;
  let rotCos = 0;

  for (const b of group) {
    lo = Math.min(lo, b.s - b.breedte / 2);
    hi = Math.max(hi, b.s + b.breedte / 2);
    t += b.t;
    diepte = Math.max(diepte, b.diepte);
    if (b.hoogte > hoogte) {
      hoogte = b.hoogte;
      kap = b.kap;
      bouwlagen = b.bouwlagen;
      bouwjaar = b.bouwjaar;
      bron = b.bron;
    }
    rotSin += Math.sin(b.rotatie);
    rotCos += Math.cos(b.rotatie);
  }

  return {
    s: (lo + hi) / 2,
    t: t / group.length,
    breedte: Math.min(60, hi - lo),
    diepte,
    hoogte,
    kap,
    bouwlagen,
    bouwjaar,
    rotatie: Math.atan2(rotSin, rotCos),
    bron,
  };
}

/** Sampling step for the water cross-section, metres. */
const WATER_STAP = 4;

interface Span {
  min: number;
  max: number;
}

/**
 * Turns the real gracht outlines into a cross-section per route step. Sampling
 * the polygon edges and bucketing by `s` catches the narrowings at bridges and
 * the widening at a junction, which a centreline plus a fixed width cannot.
 *
 * Each water body is bucketed on its own and only merged afterwards where the
 * spans actually overlap. Pooling them up front turns the main gracht and a
 * side canal crossing it into one impossible 90 m lake.
 */
export function placeWater(
  elements: readonly OverpassElement[],
  proj: Projector,
  index: RouteIndex,
): PlacedWater[] {
  const perStap = new Map<number, Span[]>();

  const voegSpanToe = (stap: number, span: Span): void => {
    const lijst = perStap.get(stap);
    if (lijst) lijst.push(span);
    else perStap.set(stap, [span]);
  };

  const bemonster = (pts: readonly Vec2[], gesloten: boolean): void => {
    const eigen = new Map<number, Span>();
    const raak = (p: Vec2): void => {
      const anchor = index.nearest(p);
      if (Math.abs(anchor.t) > MAX_T) return;
      if (anchor.s < 0 || anchor.s > index.length) return;
      const stap = Math.round(anchor.s / WATER_STAP);
      const span = eigen.get(stap);
      if (!span) eigen.set(stap, { min: anchor.t, max: anchor.t });
      else {
        if (anchor.t < span.min) span.min = anchor.t;
        if (anchor.t > span.max) span.max = anchor.t;
      }
    };

    const n = pts.length;
    const laatste = gesloten ? n : n - 1;
    for (let i = 0; i < laatste; i++) {
      const a = pts[i]!;
      const b = pts[(i + 1) % n]!;
      const lengte = Math.hypot(b.x - a.x, b.z - a.z);
      const stappen = Math.max(1, Math.round(lengte / 2));
      for (let k = 0; k < stappen; k++) {
        const f = k / stappen;
        raak({ x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f });
      }
    }

    for (const [stap, span] of eigen) voegSpanToe(stap, span);
  };

  let vlakken = 0;
  for (const el of elements) {
    const t = el.tags;
    if (!t || !el.geometry || el.geometry.length < 3) continue;
    const isVlak = t.natural === "water";
    const isLijn = t.waterway === "canal";
    if (!isVlak && !isLijn) continue;
    if (isVlak) vlakken++;
    bemonster(
      el.geometry.map((g) => proj.project(g.lat, g.lon)),
      isVlak,
    );
  }

  // Without a single outline in the data, fall back on the centreline width so
  // the canal does not disappear entirely.
  if (vlakken === 0) {
    for (const el of elements) {
      if (el.tags?.waterway !== "canal" || !el.geometry) continue;
      const halve = (parseMetres(el.tags.width) ?? 11) / 2;
      for (const g of el.geometry) {
        const anchor = index.nearest(proj.project(g.lat, g.lon));
        if (Math.abs(anchor.t) > MAX_T) continue;
        if (anchor.s < 0 || anchor.s > index.length) continue;
        voegSpanToe(Math.round(anchor.s / WATER_STAP), {
          min: anchor.t - halve,
          max: anchor.t + halve,
        });
      }
    }
  }

  const uit: PlacedWater[] = [];
  for (const [stap, spans] of perStap) {
    // Union the spans that genuinely touch, keep the rest apart.
    spans.sort((a, b) => a.min - b.min);
    const samen: Span[] = [];
    for (const span of spans) {
      const vorige = samen[samen.length - 1];
      if (vorige && span.min <= vorige.max + 1) {
        if (span.max > vorige.max) vorige.max = span.max;
      } else {
        samen.push({ ...span });
      }
    }

    for (const span of samen) {
      if (span.max - span.min < 2) continue;
      // Keep the lane clear: a gracht never runs over the track.
      const tMin = span.min > 0 ? Math.max(span.min, LANE_CLEARANCE) : span.min;
      const tMax = span.max < 0 ? Math.min(span.max, -LANE_CLEARANCE) : span.max;
      if (tMax - tMin < 2) continue;
      uit.push({ s: stap * WATER_STAP, tMin, tMax });
    }
  }

  return uit.sort((a, b) => a.s - b.s || a.tMin - b.tMin);
}

/**
 * The city dataset is the real tree line; OSM only fills in when it is empty,
 * because outside Amsterdam there is no such dataset.
 */
export function placeTrees(
  stadsbomen: readonly Boom[],
  elements: readonly OverpassElement[],
  proj: Projector,
  index: RouteIndex,
): { bomen: PlacedTree[]; bron: "amsterdam" | "osm" } {
  const uit: PlacedTree[] = [];

  const plaats = (p: Vec2, hoogte: number, soort: number): void => {
    const anchor = index.nearest(p);
    if (Math.abs(anchor.t) > MAX_T) return;
    if (anchor.s < 0 || anchor.s > index.length) return;
    // A tree that lands inside the lane is a projection artefact. Pushing it to
    // the edge builds a hedge along the track; dropping it just loses one tree.
    if (Math.abs(anchor.t) < LANE_CLEARANCE + 1) return;
    uit.push({ s: anchor.s, t: anchor.t, hoogte, soort });
  };

  for (const b of stadsbomen) {
    plaats({ x: b.x, z: b.z }, b.hoogte, b.soort === "smal" ? 1 : 0);
  }

  if (uit.length > 0) {
    return { bomen: uit.sort((a, b) => a.s - b.s), bron: "amsterdam" };
  }

  for (const el of elements) {
    if (el.type !== "node") continue;
    if (el.tags?.natural !== "tree") continue;
    if (el.lat === undefined || el.lon === undefined) continue;
    const tagged = parseMetres(el.tags.height);
    plaats(
      proj.project(el.lat, el.lon),
      tagged ?? 7 + hash01(el.id) * 6,
      hash01(el.id * 3) < 0.2 ? 1 : 0,
    );
  }
  return { bomen: uit.sort((a, b) => a.s - b.s), bron: "osm" };
}

export function placeBridges(
  elements: readonly OverpassElement[],
  proj: Projector,
  index: RouteIndex,
): Brug[] {
  const out: Brug[] = [];

  for (const el of elements) {
    if (el.tags?.bridge !== "yes") continue;
    if (!el.geometry || el.geometry.length < 2) continue;

    const pts = el.geometry.map((g) => proj.project(g.lat, g.lon));
    const c = centroid(pts);
    const anchor = index.nearest(c);
    if (Math.abs(anchor.t) > 20) continue;
    if (anchor.s < 5 || anchor.s > index.length - 5) continue;

    // A gate is a bridge that crosses us. A bridge carrying our own street runs
    // parallel and would be a wall across the lane.
    const dir = norm(sub(pts[pts.length - 1]!, pts[0]!));
    const rp = index.point(anchor.index);
    const cross = Math.abs(
      angleDelta(rp.heading, Math.atan2(dir.z, dir.x)),
    );
    const perp = Math.min(cross, Math.PI - cross);
    if (perp < (40 * Math.PI) / 180) continue;

    const lanes = parseMetres(el.tags.lanes);
    const breedte = parseMetres(el.tags.width) ?? (lanes ? lanes * 3.2 : 9);
    out.push({
      s: anchor.s,
      naam: el.tags.name ?? "Brug",
      breedte: Math.min(24, Math.max(4, breedte)),
    });
  }

  // One gate per 25 m of route, otherwise stacked OSM ways become a tunnel.
  const kept: Brug[] = [];
  for (const b of out.sort((a, z) => a.s - z.s)) {
    const prev = kept[kept.length - 1];
    if (prev && b.s - prev.s < 25) continue;
    kept.push(b);
  }
  return kept;
}

export function placeRails(
  elements: readonly OverpassElement[],
  proj: Projector,
  index: RouteIndex,
): Rail[] {
  const out: Rail[] = [];

  for (const el of elements) {
    if (el.tags?.railway !== "tram") continue;
    if (!el.geometry || el.geometry.length < 2) continue;
    const pts = el.geometry.map((g) => proj.project(g.lat, g.lon));

    let prev = index.nearest(pts[0]!);
    for (let i = 1; i < pts.length; i++) {
      const cur = index.nearest(pts[i]!);
      const crosses = prev.t < 0 !== cur.t < 0;
      const near = Math.abs(prev.t) < 40 && Math.abs(cur.t) < 40;
      if (crosses && near) {
        const f = Math.abs(prev.t) / (Math.abs(prev.t) + Math.abs(cur.t) || 1);
        const s = prev.s + (cur.s - prev.s) * f;
        if (s > 10 && s < index.length - 10) {
          const dir = norm(sub(pts[i]!, pts[i - 1]!));
          const rp = index.point(cur.index);
          const hoek = angleDelta(rp.heading, Math.atan2(dir.z, dir.x));
          out.push({ s, hoek });
        }
      }
      prev = cur;
    }
  }

  const kept: Rail[] = [];
  for (const r of out.sort((a, b) => a.s - b.s)) {
    const prev = kept[kept.length - 1];
    if (prev && r.s - prev.s < 15) continue;
    kept.push(r);
  }
  return kept;
}

