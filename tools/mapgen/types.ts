// Shared types for the offline map pipeline.
// The output types are mirrored 1:1 in src/map/types.ts for the runtime.

/** Geographic bounding box as Overpass wants it: [south, west, north, east]. */
export type BBox = readonly [number, number, number, number];

export interface ZoneConfig {
  /** Slug used for the output filename and the runtime cache key. */
  readonly id: string;
  /** Human readable Dutch name shown in the HUD. */
  readonly naam: string;
  readonly bbox: BBox;
  /** OSM street/path names, in order, that make up the runnable route. */
  readonly route: readonly string[];
}

// ---------------------------------------------------------------------------
// Overpass response shapes (only the parts we consume)
// ---------------------------------------------------------------------------

export interface OverpassGeom {
  readonly lat: number;
  readonly lon: number;
}

export interface OverpassElement {
  readonly type: "node" | "way" | "relation";
  readonly id: number;
  readonly lat?: number;
  readonly lon?: number;
  readonly geometry?: readonly OverpassGeom[];
  readonly nodes?: readonly number[];
  readonly tags?: Readonly<Record<string, string>>;
}

export interface OverpassResponse {
  readonly elements: readonly OverpassElement[];
}

// ---------------------------------------------------------------------------
// Local metric space
// ---------------------------------------------------------------------------

/** A point in the local metric plane. One unit is one metre. */
export interface Vec2 {
  x: number;
  z: number;
}

/** One resampled point along the route polyline. */
export interface RoutePoint {
  readonly x: number;
  readonly z: number;
  /** Cumulative arc length from the route start, in metres. */
  readonly s: number;
  /** Heading in radians, atan2(dz, dx) of the local tangent. */
  readonly heading: number;
  /** d(heading)/ds, in radians per metre. */
  readonly curvature: number;
}

/** An object placed relative to the route. */
export interface Placed {
  /** Arc length position along the route, metres. */
  readonly s: number;
  /** Signed perpendicular offset, metres. Negative is left of travel. */
  readonly t: number;
}

export interface PlacedBuilding extends Placed {
  /** Extent along the route direction. */
  readonly breedte: number;
  /** Extent perpendicular to the route. */
  readonly diepte: number;
  /** Height of the main roof plane, metres. */
  readonly hoogte: number;
  /** Ridge height above the main roof plane. 0 means a flat roof. */
  readonly kap: number;
  /** Storeys, drives the window rows on the facade. */
  readonly bouwlagen: number;
  /** Year of construction, drives the facade style. 0 when unknown. */
  readonly bouwjaar: number;
  /** Rotation relative to the route heading, radians. */
  readonly rotatie: number;
  /** Where the height came from, for the pipeline summary only. */
  readonly bron: "osm" | "3dbag" | "fallback";
}

/**
 * A cross-section of open water at one point along the route: both edges as
 * signed offsets, left edge first. Real gracht outlines narrow at bridges,
 * which a centreline with a fixed width cannot express.
 */
export interface PlacedWater {
  readonly s: number;
  readonly tMin: number;
  readonly tMax: number;
}

export interface PlacedTree extends Placed {
  readonly hoogte: number;
  /** 0 = wide crown, 1 = narrow crown. */
  readonly soort: number;
}

export interface Brug {
  readonly s: number;
  readonly naam: string;
  readonly breedte: number;
}

export interface Rail {
  readonly s: number;
  /** Crossing angle relative to the route heading, radians. */
  readonly hoek: number;
}

export interface Straat {
  readonly s: number;
  readonly naam: string;
}

// ---------------------------------------------------------------------------
// Emitted JSON (public/mapdata/<zone>.json)
// ---------------------------------------------------------------------------

export interface ZoneRouteData {
  /** Flat [x, z, x, z, ...] in decimetres. */
  readonly punten: readonly number[];
  /** Curvature per route point, in milliradians per metre. */
  readonly kromming: readonly number[];
}

export interface ZoneData {
  readonly id: string;
  readonly naam: string;
  /** Route length in metres. */
  readonly lengte: number;
  /** [lat, lon] of the local origin. */
  readonly origin: readonly [number, number];
  readonly route: ZoneRouteData;
  /**
   * Flat [s, t, breedte, diepte, hoogte, kap, rotatie, bouwlagen, bouwjaar] * n.
   * Lengths in decimetres, rotation in milliradians, the last two as integers.
   */
  readonly gebouwen: readonly number[];
  /** Flat [s, tMin, tMax] * n, decimetres. */
  readonly water: readonly number[];
  /** Flat [s, t, hoogte, soort] * n, decimetres plus a 0/1 flag. */
  readonly bomen: readonly number[];
  readonly bruggen: readonly Brug[];
  readonly rails: readonly Rail[];
  readonly straten: readonly Straat[];
}

export interface ZoneIndexEntry {
  readonly id: string;
  readonly naam: string;
  readonly lengte: number;
  /** Gzipped size in bytes. */
  readonly bytes: number;
}

export interface ZoneIndex {
  readonly zones: readonly ZoneIndexEntry[];
  readonly attributie: readonly string[];
}
