import type { Vec2 } from "./types.ts";

export function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, z: a.z - b.z };
}

export function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.z * b.z;
}

export function len(a: Vec2): number {
  return Math.hypot(a.x, a.z);
}

export function norm(a: Vec2): Vec2 {
  const l = len(a) || 1;
  return { x: a.x / l, z: a.z / l };
}

/**
 * Right-hand normal of a forward vector, in the convention the runtime uses:
 * the route forward maps to scene -z and this normal maps to scene +x, so a
 * point with a positive projection sits to the right of the direction of travel.
 */
export function rightOf(f: Vec2): Vec2 {
  return { x: -f.z, z: f.x };
}

/** Shortest signed difference between two angles, in (-PI, PI]. */
export function angleDelta(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

export function polylineLength(pts: readonly Vec2[]): number {
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    total += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.z - pts[i - 1]!.z);
  }
  return total;
}

export function centroid(pts: readonly Vec2[]): Vec2 {
  let x = 0;
  let z = 0;
  for (const p of pts) {
    x += p.x;
    z += p.z;
  }
  return { x: x / pts.length, z: z / pts.length };
}

/** Shoelace area of a closed ring, always positive. */
export function ringArea(pts: readonly Vec2[]): number {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    a += pts[j]!.x * pts[i]!.z - pts[i]!.x * pts[j]!.z;
  }
  return Math.abs(a) / 2;
}

export interface MinAreaBox {
  readonly center: Vec2;
  /** Unit vector along the box' first axis. */
  readonly axis: Vec2;
  /** Extent along `axis`. */
  readonly a: number;
  /** Extent perpendicular to `axis`. */
  readonly b: number;
}

/**
 * Rotating-calipers-lite: test every edge direction of the convex hull and keep
 * the orientation with the smallest area. Amsterdam facades are rarely axis
 * aligned, so an axis aligned box would leave every canal house skewed.
 */
export function minAreaBox(ring: readonly Vec2[]): MinAreaBox {
  const hull = convexHull(ring);
  if (hull.length < 3) {
    const c = centroid(ring);
    return { center: c, axis: { x: 1, z: 0 }, a: 1, b: 1 };
  }

  let best: MinAreaBox | null = null;
  let bestArea = Infinity;

  for (let i = 0; i < hull.length; i++) {
    const p = hull[i]!;
    const q = hull[(i + 1) % hull.length]!;
    const edge = norm(sub(q, p));
    const perp = rightOf(edge);

    let minU = Infinity;
    let maxU = -Infinity;
    let minV = Infinity;
    let maxV = -Infinity;
    for (const h of hull) {
      const u = dot(h, edge);
      const v = dot(h, perp);
      if (u < minU) minU = u;
      if (u > maxU) maxU = u;
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    }

    const a = maxU - minU;
    const b = maxV - minV;
    const area = a * b;
    if (area < bestArea) {
      bestArea = area;
      const cu = (minU + maxU) / 2;
      const cv = (minV + maxV) / 2;
      best = {
        center: {
          x: edge.x * cu + perp.x * cv,
          z: edge.z * cu + perp.z * cv,
        },
        axis: edge,
        a,
        b,
      };
    }
  }

  return best!;
}

/** Andrew's monotone chain. */
export function convexHull(input: readonly Vec2[]): Vec2[] {
  const pts = [...input].sort((p, q) => (p.x === q.x ? p.z - q.z : p.x - q.x));
  if (pts.length < 3) return pts;

  const cross = (o: Vec2, a: Vec2, b: Vec2): number =>
    (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);

  const lower: Vec2[] = [];
  for (const p of pts) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0
    ) {
      lower.pop();
    }
    lower.push(p);
  }

  const upper: Vec2[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]!;
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0
    ) {
      upper.pop();
    }
    upper.push(p);
  }

  lower.pop();
  upper.pop();
  return lower.concat(upper);
}
