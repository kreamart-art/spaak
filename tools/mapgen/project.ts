import type { BBox, Vec2 } from "./types.ts";

const R_LAT = 110540;
const R_LON = 111320;

/**
 * Equirectangular projection onto a local metric plane. One unit is one metre.
 * This is the ONLY lat/lon to metre conversion in the codebase. Anything that
 * needs metres goes through a Projector, never through its own formula.
 */
export class Projector {
  readonly lat0: number;
  readonly lon0: number;
  private readonly kx: number;

  constructor(lat0: number, lon0: number) {
    this.lat0 = lat0;
    this.lon0 = lon0;
    this.kx = R_LON * Math.cos((lat0 * Math.PI) / 180);
  }

  static fromBBox(bbox: BBox): Projector {
    const [south, west, north, east] = bbox;
    return new Projector((south + north) / 2, (west + east) / 2);
  }

  project(lat: number, lon: number): Vec2 {
    return {
      x: (lon - this.lon0) * this.kx,
      z: -(lat - this.lat0) * R_LAT,
    };
  }

  /** Inverse, used only by the 3DBAG matcher to build a request bbox. */
  unproject(x: number, z: number): { lat: number; lon: number } {
    return {
      lat: this.lat0 - z / R_LAT,
      lon: this.lon0 + x / this.kx,
    };
  }
}

export function dist2(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
}

export function dist(a: Vec2, b: Vec2): number {
  return Math.sqrt(dist2(a, b));
}
