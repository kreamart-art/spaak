// Runtime mirror of what tools/mapgen writes. Keep in sync with
// tools/mapgen/types.ts; the pipeline is the only writer.

/** Lengths on disk are decimetres, angles milliradians, curvature 1e-4 rad/m. */
export const DM = 10;
export const MRAD = 1000;
export const CURV = 10000;
/** Spacing of the route samples, in metres. Fixed by the pipeline. */
export const ROUTE_STEP = 2;

export interface Brug {
  readonly s: number;
  readonly naam: string;
  readonly breedte: number;
}

export interface Rail {
  readonly s: number;
  readonly hoek: number;
}

export interface Straat {
  readonly s: number;
  readonly naam: string;
}

/** The JSON exactly as it sits in public/mapdata. */
export interface RawZoneData {
  readonly id: string;
  readonly naam: string;
  readonly lengte: number;
  readonly origin: readonly [number, number];
  readonly route: {
    readonly punten: readonly number[];
    readonly kromming: readonly number[];
  };
  readonly gebouwen: readonly number[];
  readonly water: readonly number[];
  readonly bomen: readonly number[];
  readonly bruggen: readonly Brug[];
  readonly rails: readonly Rail[];
  readonly straten: readonly Straat[];
}

/** Struct of arrays: the streamer walks one cursor over parallel columns. */
export interface Gebouwen {
  readonly n: number;
  readonly s: Float32Array;
  readonly t: Float32Array;
  readonly breedte: Float32Array;
  readonly diepte: Float32Array;
  /** Height of the main roof plane. */
  readonly hoogte: Float32Array;
  /** Ridge height above that plane. 0 means a flat roof. */
  readonly kap: Float32Array;
  readonly rotatie: Float32Array;
  /** Storeys, drives the window rows. */
  readonly bouwlagen: Float32Array;
  /** Year of construction, drives the facade palette. */
  readonly bouwjaar: Float32Array;
}

export interface Water {
  readonly n: number;
  readonly s: Float32Array;
  /** Both edges of one stretch of open water, signed, left edge first. */
  readonly tMin: Float32Array;
  readonly tMax: Float32Array;
}

export interface Bomen {
  readonly n: number;
  readonly s: Float32Array;
  readonly t: Float32Array;
  readonly hoogte: Float32Array;
  /** 0 = wide crown, 1 = narrow crown. */
  readonly soort: Float32Array;
}

export interface RouteBaan {
  readonly n: number;
  /** World x per route point, metres. */
  readonly x: Float32Array;
  /** World z per route point, metres. */
  readonly z: Float32Array;
  /** Heading per route point, radians. */
  readonly heading: Float32Array;
  /** Curvature per route point, radians per metre. */
  readonly kromming: Float32Array;
}

export interface Zone {
  readonly id: string;
  readonly naam: string;
  readonly lengte: number;
  readonly origin: readonly [number, number];
  readonly route: RouteBaan;
  readonly gebouwen: Gebouwen;
  readonly water: Water;
  readonly bomen: Bomen;
  readonly bruggen: readonly Brug[];
  readonly rails: readonly Rail[];
  readonly straten: readonly Straat[];
}

export interface ZoneIndexEntry {
  readonly id: string;
  readonly naam: string;
  readonly lengte: number;
  readonly bytes: number;
}

export interface ZoneIndex {
  readonly zones: readonly ZoneIndexEntry[];
  readonly attributie: readonly string[];
}
