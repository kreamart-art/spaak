import * as THREE from "three";
import type { Baan } from "./baan.ts";
import type { Kromming } from "./kromming.ts";
import type { Doos } from "./speler.ts";
import { laadStroopwafel, maakStroopwafel } from "./stroopwafel.ts";
import { BAAN_X, RECYCLE } from "./constanten.ts";

export type Soort = "hek" | "balk" | "blok" | "tram";

interface Vorm {
  readonly breedte: number;
  readonly hoogte: number;
  /** Bottom of the box, in metres above the road. */
  readonly y0: number;
  readonly diepte: number;
  /** Whether the box spans every lane, so only a jump or duck clears it. */
  readonly overAlleBanen: boolean;
}

export const VORMEN: Readonly<Record<Soort, Vorm>> = {
  hek: { breedte: 2.1, hoogte: 1.0, y0: 0, diepte: 0.4, overAlleBanen: false },
  balk: { breedte: 2.3, hoogte: 1.6, y0: 1.7, diepte: 0.45, overAlleBanen: false },
  blok: { breedte: 2.3, hoogte: 2.9, y0: 0, diepte: 1.5, overAlleBanen: false },
  tram: { breedte: 9.4, hoogte: 0.34, y0: 0, diepte: 2.6, overAlleBanen: true },
};

interface Levend {
  soort: Soort;
  s: number;
  baan: number;
  mesh: THREE.Mesh;
}

const POOL: Readonly<Record<Soort, number>> = { hek: 9, balk: 6, blok: 7, tram: 3 };
const WAFEL_POOL = 48;
const HULP = new THREE.Object3D();

/** Deterministic per-run noise; the seed changes each run, the sequence does not. */
function ruis(n: number): number {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Obstacles stay procedural. Only the tram rails are pinned to the map, near the
 * crossings the pipeline found; if every obstacle came from the data every run
 * would be identical and it would stop being a runner.
 */
export class Obstakels {
  private readonly vrij: Record<Soort, THREE.Mesh[]> = {
    hek: [], balk: [], blok: [], tram: [],
  };
  private readonly levend: Levend[] = [];

  private readonly wafels: THREE.InstancedMesh;
  private readonly wafelS: number[] = [];
  private readonly wafelX: number[] = [];
  private readonly wafelY: number[] = [];
  private readonly wafelOp: boolean[] = [];

  private volgendeS = 90;
  private gebruikteRails = new Set<number>();
  private zaad = 1;

  constructor(scene: THREE.Scene, kromming: Kromming) {
    const materialen: Record<Soort, THREE.MeshLambertMaterial> = {
      hek: kromming.hecht(new THREE.MeshLambertMaterial({ color: 0xe4501f })),
      balk: kromming.hecht(new THREE.MeshLambertMaterial({ color: 0x2f3a52 })),
      blok: kromming.hecht(new THREE.MeshLambertMaterial({ color: 0x3d4249 })),
      tram: kromming.hecht(new THREE.MeshLambertMaterial({ color: 0x8d9299 })),
    };

    for (const soort of Object.keys(POOL) as Soort[]) {
      const v = VORMEN[soort];
      const geo = new THREE.BoxGeometry(v.breedte, v.hoogte, v.diepte);
      geo.translate(0, v.hoogte / 2, 0);
      for (let i = 0; i < POOL[soort]; i++) {
        const m = new THREE.Mesh(geo, materialen[soort]);
        m.visible = false;
        scene.add(m);
        this.vrij[soort].push(m);
      }
    }

    const wafel = maakStroopwafel();
    for (const m of wafel.materialen) kromming.hecht(m);
    this.wafels = new THREE.InstancedMesh(
      wafel.geometrie,
      wafel.materialen,
      WAFEL_POOL,
    );
    this.wafels.frustumCulled = false;
    this.wafels.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.wafels);
    // A generated waffle replaces the drawn one as soon as it is there.
    void laadStroopwafel().then((model) => {
      if (!model) return;
      this.wafels.geometry = model.geometrie;
      this.wafels.material = model.materiaal;
      kromming.hecht(model.materiaal);
      console.info("[spaak] stroopwafel.glb geladen.");
    });

    for (let i = 0; i < WAFEL_POOL; i++) {
      this.wafelS.push(0);
      this.wafelX.push(0);
      this.wafelY.push(0);
      this.wafelOp.push(true);
      this.verbergWafel(i);
    }
  }

  private verbergWafel(i: number): void {
    HULP.position.set(0, -9999, 0);
    HULP.rotation.set(0, 0, 0);
    HULP.scale.setScalar(0.0001);
    HULP.updateMatrix();
    this.wafels.setMatrixAt(i, HULP.matrix);
  }

  herstel(seed: number): void {
    this.zaad = seed;
    this.volgendeS = 90;
    this.gebruikteRails.clear();
    for (const l of this.levend) {
      l.mesh.visible = false;
      this.vrij[l.soort].push(l.mesh);
    }
    this.levend.length = 0;
    for (let i = 0; i < WAFEL_POOL; i++) {
      this.wafelOp[i] = true;
      this.verbergWafel(i);
    }
    this.wafels.instanceMatrix.needsUpdate = true;
  }

  werkBij(baan: Baan, sSpeler: number, zicht: number, snelheid: number, dt: number): void {
    const tot = sSpeler + zicht;
    const achter = sSpeler - RECYCLE;

    for (let i = this.levend.length - 1; i >= 0; i--) {
      const l = this.levend[i]!;
      if (l.s < achter) {
        l.mesh.visible = false;
        this.vrij[l.soort].push(l.mesh);
        this.levend.splice(i, 1);
        continue;
      }
      l.mesh.position.z = -(l.s - sSpeler);
    }

    // A rail crossing in the window always gets its tram obstacle first.
    for (const rail of baan.railsIn(sSpeler + 40, tot)) {
      const sleutel = Math.round(rail);
      if (this.gebruikteRails.has(sleutel)) continue;
      this.gebruikteRails.add(sleutel);
      const plek = rail + (ruis(sleutel + this.zaad) - 0.5) * 40;
      this.zet("tram", plek, 1);
    }

    // Fair spacing scales with speed, so the reaction window stays constant.
    const gat = Math.max(26, snelheid * 1.55);
    while (this.volgendeS < tot) {
      this.patroon(this.volgendeS);
      this.volgendeS += gat * (0.85 + ruis(this.volgendeS + this.zaad) * 0.5);
    }

    this.werkWafelsBij(sSpeler, achter, dt);
  }

  private patroon(s: number): void {
    const r = ruis(s * 1.7 + this.zaad);
    const baan = Math.floor(ruis(s * 3.3 + this.zaad) * 3);

    if (r < 0.3) {
      this.zet("hek", s, baan);
      this.wafelBoog(s, baan);
    } else if (r < 0.5) {
      this.zet("balk", s, baan);
      this.wafelRij(s + 8, baan, true);
    } else if (r < 0.7) {
      this.zet("blok", s, baan);
      this.wafelRij(s + 10, (baan + 1) % 3, false);
    } else if (r < 0.86) {
      // Two lanes blocked, one always open.
      const open = Math.floor(ruis(s * 5.1 + this.zaad) * 3);
      for (let b = 0; b < 3; b++) {
        if (b === open) continue;
        this.zet(ruis(s + b) < 0.5 ? "hek" : "blok", s, b);
      }
      this.wafelRij(s + 9, open, false);
    } else {
      // A full duck bar across the road.
      for (let b = 0; b < 3; b++) this.zet("balk", s, b);
      this.wafelRij(s + 9, 1, false);
    }
  }

  private zet(soort: Soort, s: number, baan: number): void {
    const mesh = this.vrij[soort].pop();
    if (!mesh) return;
    const v = VORMEN[soort];
    mesh.visible = true;
    mesh.position.set(v.overAlleBanen ? 0 : BAAN_X[baan]!, v.y0, 0);
    this.levend.push({ soort, s, baan, mesh });
  }

  private wafelRij(s: number, baan: number, hoog: boolean): void {
    for (let k = 0; k < 5; k++) {
      this.wafel(s + k * 2.2, BAAN_X[baan]!, hoog ? 0.7 : 1.05);
    }
  }

  /** An arc of waffles over a barrier, so jumping is worth something. */
  private wafelBoog(s: number, baan: number): void {
    for (let k = 0; k < 5; k++) {
      const f = k / 4;
      this.wafel(s - 4 + k * 2.4, BAAN_X[baan]!, 0.9 + Math.sin(f * Math.PI) * 1.4);
    }
  }

  private wafel(s: number, x: number, y: number): void {
    const i = this.wafelOp.indexOf(true);
    if (i < 0) return;
    this.wafelOp[i] = false;
    this.wafelS[i] = s;
    this.wafelX[i] = x;
    this.wafelY[i] = y;
  }

  private draai = 0;

  private werkWafelsBij(sSpeler: number, achter: number, dt: number): void {
    this.draai += dt * 2.4;
    for (let i = 0; i < WAFEL_POOL; i++) {
      if (this.wafelOp[i]) continue;
      if (this.wafelS[i]! < achter) {
        this.wafelOp[i] = true;
        this.verbergWafel(i);
        continue;
      }
      HULP.position.set(this.wafelX[i]!, this.wafelY[i]!, -(this.wafelS[i]! - sSpeler));
      // Standing upright and spinning on its own axis, so you always catch the
      // waffle pattern rather than the caramel edge.
      HULP.rotation.set(0, this.draai, 0);
      HULP.scale.setScalar(1);
      HULP.updateMatrix();
      this.wafels.setMatrixAt(i, HULP.matrix);
    }
    this.wafels.instanceMatrix.needsUpdate = true;
  }

  /** Waffles the player touched this frame. Returns how many were collected. */
  oogst(doos: Doos, sSpeler: number): number {
    let aantal = 0;
    for (let i = 0; i < WAFEL_POOL; i++) {
      if (this.wafelOp[i]) continue;
      const dz = this.wafelS[i]! - sSpeler;
      if (Math.abs(dz) > 1.1) continue;
      if (Math.abs(this.wafelX[i]! - doos.x) > doos.halfB + 0.5) continue;
      const midden = doos.y + doos.halfH;
      if (Math.abs(this.wafelY[i]! - midden) > doos.halfH + 0.55) continue;
      this.wafelOp[i] = true;
      this.verbergWafel(i);
      aantal++;
    }
    if (aantal > 0) this.wafels.instanceMatrix.needsUpdate = true;
    return aantal;
  }

  /** Upcoming obstacles within a window, for the HUD-less debug readout. */
  vooruit(sSpeler: number, venster: number): { soort: Soort; ds: number; baan: number }[] {
    return this.levend
      .filter((l) => l.s > sSpeler && l.s < sSpeler + venster)
      .map((l) => ({ soort: l.soort, ds: Math.round(l.s - sSpeler), baan: l.baan }))
      .sort((a, b) => a.ds - b.ds);
  }

  /** True when the player box overlaps an obstacle box. Straight space only. */
  raakt(doos: Doos, sSpeler: number): Soort | null {
    const px = doos.x;
    const py = doos.y;
    const ph = doos.halfH * 2;

    for (const l of this.levend) {
      const dz = l.s - sSpeler;
      const v = VORMEN[l.soort];
      if (Math.abs(dz) > v.diepte / 2 + doos.halfD) continue;

      const ox = v.overAlleBanen ? 0 : BAAN_X[l.baan]!;
      if (Math.abs(ox - px) > v.breedte / 2 + doos.halfB) continue;

      const oLo = v.y0;
      const oHi = v.y0 + v.hoogte;
      const pLo = py;
      const pHi = py + ph;
      if (pHi <= oLo || pLo >= oHi) continue;

      return l.soort;
    }
    return null;
  }
}
