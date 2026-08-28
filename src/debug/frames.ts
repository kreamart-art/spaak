import { ROUTE_STEP, type Zone } from "../map/types.ts";

export interface Frame {
  /** Forward unit vector at this route point. */
  readonly fx: number;
  readonly fz: number;
  /** Right-hand unit vector; a positive t offset lies this way. */
  readonly rx: number;
  readonly rz: number;
  readonly x: number;
  readonly z: number;
}

/**
 * The local frame of the route at arc length s. This is the single place that
 * defines the (s, t) convention, so the viewer proves the same convention the
 * runtime uses instead of a lookalike of it.
 */
export function frameAt(zone: Zone, s: number): Frame {
  const f = s / ROUTE_STEP;
  const i = Math.max(0, Math.min(zone.route.n - 1, Math.round(f)));
  const h = zone.route.heading[i]!;
  const fx = Math.cos(h);
  const fz = Math.sin(h);

  // Slide along the tangent for the sub-sample remainder.
  const rest = s - i * ROUTE_STEP;
  return {
    fx,
    fz,
    rx: -fz,
    rz: fx,
    x: zone.route.x[i]! + fx * rest,
    z: zone.route.z[i]! + fz * rest,
  };
}

export interface Hoek {
  readonly x: number;
  readonly z: number;
}

/**
 * Rebuild a placed box back into world space from (s, t, rotatie). If the
 * pipeline anchored things correctly these land exactly on top of the real
 * Amsterdam footprints.
 */
export function wereldHoeken(
  zone: Zone,
  s: number,
  t: number,
  breedte: number,
  diepte: number,
  rotatie: number,
): Hoek[] {
  const fr = frameAt(zone, s);
  const cx = fr.x + fr.rx * t;
  const cz = fr.z + fr.rz * t;

  // rotatie = atan2(axis . forward, axis . right), so invert that here.
  const sin = Math.sin(rotatie);
  const cos = Math.cos(rotatie);
  const ax = fr.fx * sin + fr.rx * cos;
  const az = fr.fz * sin + fr.rz * cos;
  const bx = -az;
  const bz = ax;

  const hb = breedte / 2;
  const hd = diepte / 2;
  return [
    { x: cx + ax * hb + bx * hd, z: cz + az * hb + bz * hd },
    { x: cx - ax * hb + bx * hd, z: cz - az * hb + bz * hd },
    { x: cx - ax * hb - bx * hd, z: cz - az * hb - bz * hd },
    { x: cx + ax * hb - bx * hd, z: cz + az * hb - bz * hd },
  ];
}

/**
 * The same box in the straightened strip the game actually renders, where the
 * horizontal axis is s and the vertical axis is t.
 */
export function striptHoeken(
  s: number,
  t: number,
  breedte: number,
  diepte: number,
  rotatie: number,
): Hoek[] {
  // In the scene a mesh sits at (t, 0, -(s - s0)) with rotation.y = rotatie, so
  // its local +x runs along (sin, cos) and its local +z along (-cos, sin) in
  // (s, t) coordinates.
  const sin = Math.sin(rotatie);
  const cos = Math.cos(rotatie);
  const hb = breedte / 2;
  const hd = diepte / 2;
  return [
    { x: s + sin * hb - cos * hd, z: t + cos * hb + sin * hd },
    { x: s - sin * hb - cos * hd, z: t - cos * hb + sin * hd },
    { x: s - sin * hb + cos * hd, z: t - cos * hb - sin * hd },
    { x: s + sin * hb + cos * hd, z: t + cos * hb - sin * hd },
  ];
}
