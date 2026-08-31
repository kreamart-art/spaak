/** Lane centres in metres. The player only ever sits on one of these. */
export const BAAN_X = [-2.6, 0, 2.6] as const;
export const BAAN_BREEDTE = 2.6;
/** Total width of the running surface, matches LANE_CLEARANCE in the pipeline. */
export const BAAN_TOTAAL = 9;

/** How far ahead decor is streamed in, and how far behind it is recycled. */
export const ZICHT = 160;
export const RECYCLE = 20;

/**
 * Hard ceiling on visible facade meshes. Above this the view distance drops
 * instead of the pool growing, so an iPhone 12 keeps its frame budget.
 */
export const MAX_GEVELS = 60;
export const MIN_ZICHT = 90;

export const START_SNELHEID = 11;
export const MAX_SNELHEID = 27;
/** Metres per second added per second of running. */
export const VERSNELLING = 0.16;

export const SPRONG_HOOGTE = 2.1;
export const SPRONG_DUUR = 0.72;
export const BUK_DUUR = 0.62;
export const BAANWISSEL_DUUR = 0.16;

export const SPELER_BREEDTE = 0.9;
export const SPELER_HOOGTE = 1.85;
export const SPELER_GEBUKT = 0.95;

/**
 * Horizontal field of view, in degrees. A phone held upright is a narrow window
 * and a fixed vertical fov leaves only 50 degrees across, which hides the canal
 * running alongside the track. Locking the horizontal angle instead keeps both
 * sides of the street in frame whatever the aspect ratio.
 */
export const CAMERA_FOV_H = 74;
export const CAMERA_FOV_V_MIN = 58;
export const CAMERA_FOV_V_MAX = 88;

/**
 * Close, low, and aimed well down the road. From four metres, nearly level, the
 * rider stands about a quarter of the screen tall in the lower third, and the
 * three lanes fan out towards the camera instead of squashing together.
 */
export const CAMERA_Z = 4.3;
export const CAMERA_Y = 2.3;
export const CAMERA_KIJK_Z = -16;
export const CAMERA_KIJK_Y = 1.6;

/** Visual bend, clamped as specified. Collision never sees any of this. */
export const KROMMING_CLAMP = 1.4;
/** How hard the raw curvature in rad/m is pushed into the visual bend. */
export const KROMMING_WINST = 140;
/** Lerp rate per second toward the target bend. */
export const KROMMING_LERP = 3;

export const MIST_BASIS = 0.0041;
export const MIST_BOCHT = 0.0036;

export const STROOPWAFEL_PUNTEN = 15;
/** Points per metre travelled. */
export const METER_PUNTEN = 1;
