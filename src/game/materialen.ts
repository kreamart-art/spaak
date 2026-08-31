import * as THREE from "three";
import type { Kromming } from "./kromming.ts";
import { hechtGevel } from "./gevel.ts";

/** Amsterdam brick, sandstone, painted stucco and near-black trim. */
export const GEVEL_PALET: readonly number[] = [
  0xa34a34, 0x8a3c2e, 0xc06a48, 0xc79a5f, 0x7d5c42, 0xb2a184, 0x5d646e,
  0x424852, 0xdcb684, 0x7c4048,
];

/** Dutch pantile red through weathered slate. */
export const KAP_PALET: readonly number[] = [
  0x7d4030, 0x8f4a34, 0x5d4a44, 0x46484c, 0x6b3a2c, 0x54524f,
];

export interface Materialen {
  readonly gevel: THREE.MeshLambertMaterial;
  readonly kap: THREE.MeshLambertMaterial;
  readonly water: THREE.MeshLambertMaterial;
  readonly stam: THREE.MeshLambertMaterial;
  readonly kruin: THREE.MeshLambertMaterial;
  readonly grond: THREE.MeshLambertMaterial;
  readonly kade: THREE.MeshLambertMaterial;
  readonly weg: THREE.MeshLambertMaterial;
  readonly brug: THREE.MeshLambertMaterial;
  readonly brugDek: THREE.MeshLambertMaterial;
  readonly bord: THREE.MeshBasicMaterial;
}

/** Every environment material carries the bend; the player never does. */
export function maakMaterialen(kromming: Kromming, wegTextuur: THREE.Texture): Materialen {
  const hecht = <T extends THREE.Material>(m: T): T => kromming.hecht(m);

  const gevel = hecht(new THREE.MeshLambertMaterial());
  // The bend goes on first, the facade second: both wrap onBeforeCompile and
  // the facade chains onto whatever is already there.
  hechtGevel(gevel);

  return {
    gevel,
    kap: hecht(new THREE.MeshLambertMaterial()),
    water: hecht(
      new THREE.MeshLambertMaterial({ color: 0x3a7287, transparent: true, opacity: 0.95 }),
    ),
    stam: hecht(new THREE.MeshLambertMaterial({ color: 0x4a3b2c })),
    kruin: hecht(new THREE.MeshLambertMaterial({ color: 0x3d6b3a })),
    grond: hecht(new THREE.MeshLambertMaterial({ color: 0x6f6a5e })),
    kade: hecht(new THREE.MeshLambertMaterial({ color: 0x9c9384 })),
    weg: hecht(new THREE.MeshLambertMaterial({ map: wegTextuur })),
    brug: hecht(new THREE.MeshLambertMaterial({ color: 0x6b6257 })),
    brugDek: hecht(new THREE.MeshLambertMaterial({ color: 0x574f46 })),
    bord: new THREE.MeshBasicMaterial({ transparent: true }),
  };
}

/**
 * The running surface: an Amsterdam red asphalt bike path.
 *
 * What makes a runner readable is that the three lanes are unmistakable, the
 * way rails and sleepers do it elsewhere. So: warm red asphalt, a heavy cream
 * dash between the lanes, and a solid edge line on both sides. Drawn once into
 * a canvas and repeated along z.
 */
export function maakWegTextuur(): THREE.Texture {
  const B = 256;
  const H = 256;
  const c = document.createElement("canvas");
  c.width = B;
  c.height = H;
  const g = c.getContext("2d")!;

  // Red asphalt with a coarse grain.
  g.fillStyle = "#9e3f33";
  g.fillRect(0, 0, B, H);
  for (let i = 0; i < 900; i++) {
    const x = (Math.sin(i * 127.1) * 43758.5453) % 1;
    const y = (Math.sin(i * 311.7) * 12543.8765) % 1;
    const v = (Math.sin(i * 74.7) * 9631.223) % 1;
    g.fillStyle = v > 0 ? "rgba(255,214,190,0.05)" : "rgba(40,10,8,0.09)";
    g.fillRect(Math.abs(x) * B, Math.abs(y) * H, 2.5, 2.5);
  }

  // Faint tar seams so the surface reads as ridden-on asphalt.
  g.fillStyle = "rgba(60,18,14,0.16)";
  for (const y of [40, 122, 208]) g.fillRect(0, y, B, 2);

  // The markings sit exactly on the gameplay lanes: centres at -2.6, 0, 2.6 on
  // a 9 m strip, so the boundaries lie at +-1.3 m and the outer edges of the
  // outer lanes at +-3.9 m. Drawn anywhere else, an obstacle parks itself just
  // beside the middle of its own painted lane.
  const meterNaarX = (m: number): number => ((m + 4.5) / 9) * B;
  g.fillStyle = "#f2ead8";
  const dash = 44;
  const gat = 34;
  for (const grens of [-1.3, 1.3]) {
    const x = meterNaarX(grens);
    for (let y = 0; y < H; y += dash + gat) {
      g.fillRect(x - 5, y, 10, dash);
    }
  }

  // Solid edge lines, brighter than the dashes so the track has a rim.
  g.fillStyle = "#f7f1e2";
  for (const rand of [-3.9, 3.9]) {
    g.fillRect(meterNaarX(rand) - 3.5, 0, 7, H);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}
