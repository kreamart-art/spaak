import * as THREE from "three";
import type { Kromming } from "./kromming.ts";
import { hechtGevel } from "./gevel.ts";

/** Amsterdam brick, sandstone, painted stucco and near-black trim. */
export const GEVEL_PALET: readonly number[] = [
  0x8c4a3a, 0x7a3d33, 0xa8654a, 0xb08a5e, 0x6f5544, 0x9a8b76, 0x565b60,
  0x3f4348, 0xc2a37a, 0x6b3f45,
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
      new THREE.MeshLambertMaterial({ color: 0x35606f, transparent: true, opacity: 0.95 }),
    ),
    stam: hecht(new THREE.MeshLambertMaterial({ color: 0x4a3b2c })),
    kruin: hecht(new THREE.MeshLambertMaterial({ color: 0x3d6b3a })),
    grond: hecht(new THREE.MeshLambertMaterial({ color: 0x5d5a53 })),
    kade: hecht(new THREE.MeshLambertMaterial({ color: 0x8b8478 })),
    weg: hecht(new THREE.MeshLambertMaterial({ map: wegTextuur })),
    brug: hecht(new THREE.MeshLambertMaterial({ color: 0x6b6257 })),
    brugDek: hecht(new THREE.MeshLambertMaterial({ color: 0x574f46 })),
    bord: new THREE.MeshBasicMaterial({ transparent: true }),
  };
}

/** Cobbles with two dashed lane separators, drawn once into a canvas. */
export function maakWegTextuur(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 256;
  const g = c.getContext("2d")!;

  g.fillStyle = "#33322f";
  g.fillRect(0, 0, 128, 256);

  // Cobble noise.
  for (let y = 0; y < 256; y += 8) {
    for (let x = 0; x < 128; x += 8) {
      const n = (Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1;
      const v = 0.5 + Math.abs(n) * 0.5;
      g.fillStyle = `rgba(${Math.round(60 * v)},${Math.round(58 * v)},${Math.round(54 * v)},0.55)`;
      g.fillRect(x, y, 7, 7);
    }
  }

  g.strokeStyle = "rgba(226,226,220,0.55)";
  g.lineWidth = 3;
  g.setLineDash([26, 26]);
  for (const x of [128 / 3, (128 / 3) * 2]) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, 256);
    g.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}
