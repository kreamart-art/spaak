import * as THREE from "three";

/**
 * Split a fused mesh into its separate shells.
 *
 * An image-to-3D service will export a textured model as one mesh, and its
 * "split into parts" option throws the texture away. So the split has to happen
 * here, on the geometry, keeping every attribute including the UVs.
 *
 * Vertices are welded on position first: a UV seam duplicates vertices that sit
 * in exactly the same place, and without welding every seam looks like a
 * boundary between shells.
 */

export interface Schil {
  readonly geometrie: THREE.BufferGeometry;
  readonly doos: THREE.Box3;
  readonly driehoeken: number;
}

function welding(pos: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): {
  naar: Int32Array;
  aantal: number;
} {
  const n = pos.count;
  const naar = new Int32Array(n);
  const kaart = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const k =
      `${Math.round(pos.getX(i) * 1e4)},` +
      `${Math.round(pos.getY(i) * 1e4)},` +
      `${Math.round(pos.getZ(i) * 1e4)}`;
    let v = kaart.get(k);
    if (v === undefined) {
      v = kaart.size;
      kaart.set(k, v);
    }
    naar[i] = v;
  }
  return { naar, aantal: kaart.size };
}

/** Connected components over the triangle graph, after welding. */
export function schillen(geo: THREE.BufferGeometry, minDriehoeken = 12): Schil[] {
  const pos = geo.getAttribute("position");
  const index = geo.getIndex();
  const driehoeken = index ? index.count / 3 : pos.count / 3;
  const { naar, aantal } = welding(pos);

  const ouder = new Int32Array(aantal);
  for (let i = 0; i < aantal; i++) ouder[i] = i;
  const zoek = (a: number): number => {
    let x = a;
    while (ouder[x] !== x) {
      ouder[x] = ouder[ouder[x]!]!;
      x = ouder[x]!;
    }
    return x;
  };
  const voeg = (a: number, b: number): void => {
    const ra = zoek(a);
    const rb = zoek(b);
    if (ra !== rb) ouder[ra] = rb;
  };

  const hoek = (t: number, k: number): number =>
    index ? index.getX(t * 3 + k) : t * 3 + k;

  for (let t = 0; t < driehoeken; t++) {
    const a = naar[hoek(t, 0)]!;
    const b = naar[hoek(t, 1)]!;
    const c = naar[hoek(t, 2)]!;
    voeg(a, b);
    voeg(b, c);
  }

  // Bucket triangles by the component their first corner belongs to.
  const perGroep = new Map<number, number[]>();
  for (let t = 0; t < driehoeken; t++) {
    const r = zoek(naar[hoek(t, 0)]!);
    const lijst = perGroep.get(r);
    if (lijst) lijst.push(t);
    else perGroep.set(r, [t]);
  }

  const uit: Schil[] = [];
  for (const driehoekLijst of perGroep.values()) {
    if (driehoekLijst.length < minDriehoeken) continue;
    uit.push(bouwSchil(geo, driehoekLijst));
  }
  return uit.sort((a, b) => b.driehoeken - a.driehoeken);
}

/** Copy a set of triangles into their own geometry, attributes and all. */
export function bouwSchil(
  geo: THREE.BufferGeometry,
  driehoekLijst: readonly number[],
): Schil {
  const index = geo.getIndex();
  const hoek = (t: number, k: number): number =>
    index ? index.getX(t * 3 + k) : t * 3 + k;

  const hergebruik = new Map<number, number>();
  const nieuweIndex: number[] = [];
  const bron: number[] = [];

  for (const t of driehoekLijst) {
    for (let k = 0; k < 3; k++) {
      const oud = hoek(t, k);
      let nieuw = hergebruik.get(oud);
      if (nieuw === undefined) {
        nieuw = bron.length;
        hergebruik.set(oud, nieuw);
        bron.push(oud);
      }
      nieuweIndex.push(nieuw);
    }
  }

  const nieuw = new THREE.BufferGeometry();
  for (const naam of Object.keys(geo.attributes)) {
    const attr = geo.getAttribute(naam);
    const grootte = attr.itemSize;
    const data = new Float32Array(bron.length * grootte);
    for (let i = 0; i < bron.length; i++) {
      const o = bron[i]!;
      for (let k = 0; k < grootte; k++) {
        data[i * grootte + k] = attr.getComponent(o, k);
      }
    }
    nieuw.setAttribute(naam, new THREE.BufferAttribute(data, grootte));
  }
  nieuw.setIndex(nieuweIndex);
  nieuw.computeBoundingBox();

  return {
    geometrie: nieuw,
    doos: nieuw.boundingBox!.clone(),
    driehoeken: driehoekLijst.length,
  };
}


// ---------------------------------------------------------------------------
// Geometric split
// ---------------------------------------------------------------------------

export interface WielSchatting {
  /** Axle height above the ground. */
  readonly straal: number;
  /** Arc positions of the two axles along the length axis. */
  readonly zVoor: number;
  readonly zAchter: number;
  /** Half the tyre width. */
  readonly halveBreedte: number;
}

interface Driehoek {
  readonly t: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

function centroids(geo: THREE.BufferGeometry, matrix: THREE.Matrix4): Driehoek[] {
  const pos = geo.getAttribute("position");
  const index = geo.getIndex();
  const n = index ? index.count / 3 : pos.count / 3;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const uit: Driehoek[] = [];

  for (let t = 0; t < n; t++) {
    const i0 = index ? index.getX(t * 3) : t * 3;
    const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1;
    const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;
    a.fromBufferAttribute(pos, i0).applyMatrix4(matrix);
    b.fromBufferAttribute(pos, i1).applyMatrix4(matrix);
    c.fromBufferAttribute(pos, i2).applyMatrix4(matrix);
    uit.push({
      t,
      x: (a.x + b.x + c.x) / 3,
      y: (a.y + b.y + c.y) / 3,
      z: (a.z + b.z + c.z) / 3,
    });
  }
  return uit;
}

/**
 * Work out where the wheels are, from the shape alone.
 *
 * The contact patches sit on the ground at either end, which gives the axle
 * positions along the bike. The radius comes from the height at which the
 * length-wise extent is widest: on a circle that is exactly the axle line.
 */
export function schatWielen(driehoeken: readonly Driehoek[]): WielSchatting | null {
  if (driehoeken.length === 0) return null;

  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const d of driehoeken) {
    if (d.y < minY) minY = d.y;
    if (d.y > maxY) maxY = d.y;
    if (d.z < minZ) minZ = d.z;
    if (d.z > maxZ) maxZ = d.z;
  }
  const hoogte = maxY - minY;
  const middenZ = (minZ + maxZ) / 2;
  if (!(hoogte > 0)) return null;

  const grond = driehoeken.filter((d) => d.y < minY + hoogte * 0.035);
  const voorGrond = grond.filter((d) => d.z < middenZ);
  const achterGrond = grond.filter((d) => d.z >= middenZ);
  if (voorGrond.length < 4 || achterGrond.length < 4) return null;

  const gemiddelde = (lijst: Driehoek[], kies: (d: Driehoek) => number): number =>
    lijst.reduce((s, d) => s + kies(d), 0) / lijst.length;

  const zVoor = gemiddelde(voorGrond, (d) => d.z);
  const zAchter = gemiddelde(achterGrond, (d) => d.z);
  const halveBreedte = Math.max(
    ...grond.map((d) => Math.abs(d.x)),
  );

  // The radius, measured instead of searched for.
  //
  // A circle through the ground at height y has a half chord c with
  // c^2 + (y - r)^2 = r^2, so r = (c^2 + y^2) / 2y. Read that off several low
  // bands and take the median: down there the tyre is the only thing near the
  // wheel, so the frame cannot corrupt the reading, and a peak-finder over the
  // whole height cannot either.
  const wielbasis = Math.abs(zAchter - zVoor);
  const band = wielbasis * 0.45;
  const bakken = 24;
  const onder = hoogte * 0.03;
  const boven = hoogte * 0.22;
  const schattingen: number[] = [];

  for (let i = 0; i < bakken; i++) {
    const yLo = onder + ((boven - onder) * i) / bakken;
    const yHi = onder + ((boven - onder) * (i + 1)) / bakken;
    const yMidden = (yLo + yHi) / 2;
    let c = 0;
    let n = 0;
    for (const d of driehoeken) {
      const h = d.y - minY;
      if (h < yLo || h >= yHi) continue;
      if (Math.abs(d.x) > halveBreedte * 1.05) continue;
      const bijVoor = Math.abs(d.z - zVoor) < band;
      const bijAchter = Math.abs(d.z - zAchter) < band;
      if (!bijVoor && !bijAchter) continue;
      const dz = Math.abs(d.z - (bijVoor ? zVoor : zAchter));
      if (dz > c) c = dz;
      n++;
    }
    if (n < 4 || c <= 0) continue;
    schattingen.push((c * c + yMidden * yMidden) / (2 * yMidden));
  }

  if (schattingen.length < 4) return null;
  schattingen.sort((a, b) => a - b);
  const straal = schattingen[schattingen.length >> 1]!;
  if (!(straal > hoogte * 0.15 && straal < hoogte * 0.6)) return null;

  return { straal, zVoor, zAchter, halveBreedte };
}

export interface GesplitsteFiets {
  readonly wielVoor: Schil;
  readonly wielAchter: Schil;
  readonly rest: Schil;
  readonly schatting: WielSchatting;
}

/**
 * Carve the two wheels out of a fused mesh.
 *
 * A triangle belongs to a wheel when its centroid falls inside that wheel's
 * disc and it stays within the tyre's own width. The width test is what keeps
 * the fork legs and the mudguard, which pass straight through the disc, from
 * being taken along for the ride.
 */
export function splitsWielen(
  geo: THREE.BufferGeometry,
  matrix: THREE.Matrix4,
): GesplitsteFiets | null {
  const driehoeken = centroids(geo, matrix);
  const schatting = schatWielen(driehoeken);
  if (!schatting) return null;

  const { straal, zVoor, zAchter, halveBreedte } = schatting;
  // Strictly inside the tyre, and just inside its outer edge. A mudguard hugs
  // the tyre from just outside and a fork straddles it from just beside; both
  // run straight through a generous disc and come out torn in half.
  const binnenWiel = (d: Driehoek, anker: number): boolean => {
    if (Math.abs(d.x) > halveBreedte * 0.9) return false;
    const dz = d.z - anker;
    const dy = d.y - straal;
    return Math.hypot(dz, dy) <= straal * 0.96;
  };

  const voor: number[] = [];
  const achter: number[] = [];
  const rest: number[] = [];
  for (const d of driehoeken) {
    if (binnenWiel(d, zVoor)) voor.push(d.t);
    else if (binnenWiel(d, zAchter)) achter.push(d.t);
    else rest.push(d.t);
  }

  const minimaal = driehoeken.length * 0.02;
  if (voor.length < minimaal || achter.length < minimaal) return null;

  return {
    wielVoor: bouwSchil(geo, voor),
    wielAchter: bouwSchil(geo, achter),
    rest: bouwSchil(geo, rest),
    schatting,
  };
}
