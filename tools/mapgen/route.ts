import type {
  OverpassElement,
  RoutePoint,
  Straat,
  Vec2,
  ZoneConfig,
} from "./types.ts";
import type { Projector } from "./project.ts";
import { angleDelta, polylineLength, sub } from "./geom.ts";

/** Two way ends count as the same junction below this distance, in metres. */
const STITCH_TOL = 3;
/** A continuation sharper than this is a U-turn, not a continuation. */
const MAX_TURN = (100 * Math.PI) / 180;
/** Named chains must approach each other at least this closely to be joined. */
const JOIN_TOL = 60;
/** Spacing of the final resampled route, in metres. */
export const STEP = 2;

interface NamedWay {
  readonly id: number;
  readonly naam: string;
  readonly pts: readonly Vec2[];
}

export interface BuiltRoute {
  readonly punten: readonly RoutePoint[];
  readonly straten: readonly Straat[];
  readonly lengte: number;
}

export class RouteError extends Error {
  readonly gevonden: readonly string[];
  constructor(message: string, gevonden: readonly string[]) {
    super(message);
    this.name = "RouteError";
    this.gevonden = gevonden;
  }
}

function isRoutable(el: OverpassElement): boolean {
  const t = el.tags;
  if (!t) return false;
  if (!el.geometry || el.geometry.length < 2) return false;
  return typeof t.highway === "string";
}

function collect(
  elements: readonly OverpassElement[],
  naam: string,
  proj: Projector,
): NamedWay[] {
  const out: NamedWay[] = [];
  for (const el of elements) {
    if (!isRoutable(el)) continue;
    if (el.tags?.name !== naam) continue;
    const pts = el.geometry!.map((g) => proj.project(g.lat, g.lon));
    if (polylineLength(pts) < 1) continue;
    out.push({ id: el.id, naam, pts });
  }
  return out;
}

function headingAt(pts: readonly Vec2[], fromEnd: boolean): number {
  // Average the direction over the last few metres so a single short segment
  // cannot flip the branch decision.
  const span = 5;
  if (fromEnd) {
    const tip = pts[pts.length - 1]!;
    for (let i = pts.length - 2; i >= 0; i--) {
      const d = sub(tip, pts[i]!);
      if (Math.hypot(d.x, d.z) >= span || i === 0) {
        return Math.atan2(d.z, d.x);
      }
    }
  } else {
    const tip = pts[0]!;
    for (let i = 1; i < pts.length; i++) {
      const d = sub(pts[i]!, tip);
      if (Math.hypot(d.x, d.z) >= span || i === pts.length - 1) {
        return Math.atan2(d.z, d.x);
      }
    }
  }
  return 0;
}

/**
 * Greedy walk over ways that share endpoints. At a junction we take the branch
 * with the smallest angular deviation, so the route carries straight on instead
 * of diving into a side street.
 */
function walk(ways: readonly NamedWay[], startIndex: number, reversed: boolean): Vec2[] {
  const used = new Set<number>([startIndex]);
  const start = ways[startIndex]!;
  const chain: Vec2[] = reversed ? [...start.pts].reverse() : [...start.pts];

  for (;;) {
    const tip = chain[chain.length - 1]!;
    const heading = headingAt(chain, true);

    let bestIndex = -1;
    let bestReversed = false;
    let bestDev = Infinity;

    for (let i = 0; i < ways.length; i++) {
      if (used.has(i)) continue;
      const w = ways[i]!;
      const head = w.pts[0]!;
      const tail = w.pts[w.pts.length - 1]!;

      const dHead = Math.hypot(head.x - tip.x, head.z - tip.z);
      const dTail = Math.hypot(tail.x - tip.x, tail.z - tip.z);

      if (dHead <= STITCH_TOL) {
        const dev = Math.abs(angleDelta(heading, headingAt(w.pts, false)));
        if (dev < bestDev) {
          bestDev = dev;
          bestIndex = i;
          bestReversed = false;
        }
      }
      if (dTail <= STITCH_TOL) {
        const rev = [...w.pts].reverse();
        const dev = Math.abs(angleDelta(heading, headingAt(rev, false)));
        if (dev < bestDev) {
          bestDev = dev;
          bestIndex = i;
          bestReversed = true;
        }
      }
    }

    if (bestIndex < 0 || bestDev > MAX_TURN) break;

    const next = ways[bestIndex]!;
    const pts = bestReversed ? [...next.pts].reverse() : next.pts;
    for (let i = 1; i < pts.length; i++) chain.push(pts[i]!);
    used.add(bestIndex);
  }

  return chain;
}

/** Longest chain reachable from any way end, for one street name. */
function longestChain(ways: readonly NamedWay[]): Vec2[] {
  let best: Vec2[] = [];
  let bestLen = 0;
  for (let i = 0; i < ways.length; i++) {
    for (const reversed of [false, true]) {
      const chain = walk(ways, i, reversed);
      const l = polylineLength(chain);
      if (l > bestLen) {
        bestLen = l;
        best = chain;
      }
    }
  }
  return best;
}

/** Index of the point on `chain` closest to any point of `other`. */
function nearestApproach(
  chain: readonly Vec2[],
  other: readonly Vec2[],
): { index: number; distance: number } {
  let bestIndex = 0;
  let bestD2 = Infinity;
  for (let i = 0; i < chain.length; i++) {
    const c = chain[i]!;
    for (const o of other) {
      const dx = c.x - o.x;
      const dz = c.z - o.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD2) {
        bestD2 = d2;
        bestIndex = i;
      }
    }
  }
  return { index: bestIndex, distance: Math.sqrt(bestD2) };
}

function resample(pts: readonly Vec2[], step: number): Vec2[] {
  if (pts.length < 2) return [...pts];
  const out: Vec2[] = [pts[0]!];
  let carry = 0;

  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const segLen = Math.hypot(b.x - a.x, b.z - a.z);
    if (segLen < 1e-9) continue;
    let travelled = step - carry;
    while (travelled <= segLen) {
      const f = travelled / segLen;
      out.push({ x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f });
      travelled += step;
    }
    carry = (segLen - (travelled - step)) % step;
  }

  const last = pts[pts.length - 1]!;
  const tip = out[out.length - 1]!;
  if (Math.hypot(last.x - tip.x, last.z - tip.z) > step * 0.4) out.push(last);
  return out;
}

/** Chaikin corner cutting. Keeps the endpoints, rounds every OSM vertex. */
function chaikin(pts: readonly Vec2[], passes: number): Vec2[] {
  let cur = [...pts];
  for (let p = 0; p < passes; p++) {
    if (cur.length < 3) break;
    const next: Vec2[] = [cur[0]!];
    for (let i = 0; i < cur.length - 1; i++) {
      const a = cur[i]!;
      const b = cur[i + 1]!;
      next.push({ x: a.x * 0.75 + b.x * 0.25, z: a.z * 0.75 + b.z * 0.25 });
      next.push({ x: a.x * 0.25 + b.x * 0.75, z: a.z * 0.25 + b.z * 0.75 });
    }
    next.push(cur[cur.length - 1]!);
    cur = next;
  }
  return cur;
}

function boxFilter(values: readonly number[], radius: number): number[] {
  const out = new Array<number>(values.length);
  for (let i = 0; i < values.length; i++) {
    let sum = 0;
    let n = 0;
    for (let k = -radius; k <= radius; k++) {
      const j = i + k;
      if (j < 0 || j >= values.length) continue;
      sum += values[j]!;
      n++;
    }
    out[i] = sum / n;
  }
  return out;
}

/** Turns a smoothed polyline into route points with s, heading and curvature. */
function measure(pts: readonly Vec2[]): RoutePoint[] {
  const n = pts.length;
  const s = new Array<number>(n);
  s[0] = 0;
  for (let i = 1; i < n; i++) {
    s[i] = s[i - 1]! + Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.z - pts[i - 1]!.z);
  }

  const heading = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)]!;
    const b = pts[Math.min(n - 1, i + 1)]!;
    heading[i] = Math.atan2(b.z - a.z, b.x - a.x);
  }

  const rawCurv = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - 1);
    const hi = Math.min(n - 1, i + 1);
    const ds = s[hi]! - s[lo]!;
    rawCurv[i] = ds > 1e-6 ? angleDelta(heading[lo]!, heading[hi]!) / ds : 0;
  }
  const curvature = boxFilter(rawCurv, 4);

  return pts.map((p, i) => ({
    x: p.x,
    z: p.z,
    s: s[i]!,
    heading: heading[i]!,
    curvature: curvature[i]!,
  }));
}

export function buildRoute(
  zone: ZoneConfig,
  elements: readonly OverpassElement[],
  proj: Projector,
): BuiltRoute {
  const gevonden = new Set<string>();
  for (const el of elements) {
    if (isRoutable(el) && el.tags?.name) gevonden.add(el.tags.name);
  }

  // One stitched chain per street name, in the order the zone lists them.
  const chains: { naam: string; pts: Vec2[] }[] = [];
  for (const naam of zone.route) {
    const ways = collect(elements, naam, proj);
    if (ways.length === 0) {
      throw new RouteError(
        `Zone "${zone.id}": geen enkele way met naam "${naam}" in de bbox.`,
        [...gevonden].sort(),
      );
    }
    const chain = longestChain(ways);
    if (chain.length < 2) {
      throw new RouteError(
        `Zone "${zone.id}": "${naam}" leverde geen aaneengesloten lijn op.`,
        [...gevonden].sort(),
      );
    }
    chains.push({ naam, pts: chain });
  }

  // Join the chains at the point where consecutive streets meet, then walk each
  // one from the previous junction to the next.
  const merged: Vec2[] = [];
  const straten: Straat[] = [];
  let entry = 0;

  for (let c = 0; c < chains.length; c++) {
    const chain = chains[c]!;
    const next = chains[c + 1];

    let exit: number;
    if (next) {
      const approach = nearestApproach(chain.pts, next.pts);
      if (approach.distance > JOIN_TOL) {
        throw new RouteError(
          `Zone "${zone.id}": "${chain.naam}" en "${next.naam}" komen nergens ` +
            `dichter dan ${approach.distance.toFixed(0)} m bij elkaar.`,
          [...gevonden].sort(),
        );
      }
      exit = approach.index;
    } else {
      // Last street: run to whichever end is farthest from where we came in.
      exit = entry < chain.pts.length / 2 ? chain.pts.length - 1 : 0;
    }

    if (c === 0 && next) {
      // First street: start at the end that gives the longest run to the exit.
      entry = exit < chain.pts.length / 2 ? chain.pts.length - 1 : 0;
    }

    const slice: Vec2[] = [];
    const step = exit >= entry ? 1 : -1;
    for (let i = entry; step > 0 ? i <= exit : i >= exit; i += step) {
      slice.push(chain.pts[i]!);
    }
    if (slice.length < 2) continue;

    straten.push({
      s: Math.round(polylineLength(merged)),
      naam: chain.naam,
    });

    for (const p of slice) {
      const tip = merged[merged.length - 1];
      if (tip && Math.hypot(tip.x - p.x, tip.z - p.z) < 0.01) continue;
      merged.push(p);
    }

    if (next) {
      const approachBack = nearestApproach(next.pts, [chain.pts[exit]!]);
      entry = approachBack.index;
    }
  }

  if (merged.length < 2) {
    throw new RouteError(
      `Zone "${zone.id}": de samengevoegde route heeft te weinig punten.`,
      [...gevonden].sort(),
    );
  }

  // Resample, round the OSM corners, then resample again so the final spacing is
  // exactly STEP. The runtime looks up curvature by index, so that has to hold.
  const coarse = resample(merged, STEP);
  const smooth = chaikin(coarse, 3);
  const even = resample(smooth, STEP);
  const punten = measure(even);
  const lengte = punten[punten.length - 1]!.s;

  if (lengte < 400) {
    throw new RouteError(
      `Zone "${zone.id}": route is maar ${lengte.toFixed(0)} m, minimaal 400 m nodig.`,
      [...gevonden].sort(),
    );
  }

  return { punten, straten, lengte };
}
