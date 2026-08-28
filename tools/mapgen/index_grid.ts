import type { RoutePoint, Vec2 } from "./types.ts";

const CELL = 20;

export interface Anchor {
  /** Index into the route point array. */
  readonly index: number;
  /** Arc length along the route, metres. */
  readonly s: number;
  /** Signed perpendicular offset, metres. Negative is left of travel. */
  readonly t: number;
}

/**
 * Uniform grid over the route points. Without this, anchoring 5000 buildings to
 * a 1000 point route is 5 million distance tests per zone.
 */
export class RouteIndex {
  private readonly cells = new Map<string, number[]>();
  private readonly pts: readonly RoutePoint[];

  constructor(pts: readonly RoutePoint[]) {
    this.pts = pts;
    for (let i = 0; i < pts.length; i++) {
      const key = this.key(pts[i]!.x, pts[i]!.z);
      const bucket = this.cells.get(key);
      if (bucket) bucket.push(i);
      else this.cells.set(key, [i]);
    }
  }

  private key(x: number, z: number): string {
    return `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
  }

  /** Nearest route point, searching outward in cell rings. */
  nearest(p: Vec2): Anchor {
    const cx = Math.floor(p.x / CELL);
    const cz = Math.floor(p.z / CELL);

    let bestIndex = -1;
    let bestD2 = Infinity;

    for (let ring = 0; ring < 64; ring++) {
      for (let dx = -ring; dx <= ring; dx++) {
        for (let dz = -ring; dz <= ring; dz++) {
          // Only the outer shell of this ring is new.
          if (ring > 0 && Math.abs(dx) !== ring && Math.abs(dz) !== ring) continue;
          const bucket = this.cells.get(`${cx + dx},${cz + dz}`);
          if (!bucket) continue;
          for (const i of bucket) {
            const q = this.pts[i]!;
            const ddx = q.x - p.x;
            const ddz = q.z - p.z;
            const d2 = ddx * ddx + ddz * ddz;
            if (d2 < bestD2) {
              bestD2 = d2;
              bestIndex = i;
            }
          }
        }
      }
      // Everything closer than the ring boundary has now been seen.
      if (bestIndex >= 0 && Math.sqrt(bestD2) <= ring * CELL) break;
    }

    if (bestIndex < 0) return { index: 0, s: 0, t: Infinity };

    const rp = this.pts[bestIndex]!;
    const f = { x: Math.cos(rp.heading), z: Math.sin(rp.heading) };
    const right = { x: -f.z, z: f.x };
    const dx = p.x - rp.x;
    const dz = p.z - rp.z;

    // Refine s with the projection onto the local tangent so anchors are not
    // quantised to the 2 m route sampling.
    const along = dx * f.x + dz * f.z;
    return {
      index: bestIndex,
      s: rp.s + along,
      t: dx * right.x + dz * right.z,
    };
  }

  point(index: number): RoutePoint {
    return this.pts[Math.min(this.pts.length - 1, Math.max(0, index))]!;
  }

  get length(): number {
    return this.pts[this.pts.length - 1]!.s;
  }
}
