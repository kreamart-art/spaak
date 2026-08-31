import * as THREE from "three";

/**
 * The sky: a dome around the scene with a painted gradient, puffy clouds and a
 * sun, drawn once into a canvas.
 *
 * The fog colour has to match the dome's horizon band exactly, or distant
 * buildings fade to a colour the sky does not have and get a ghostly outline.
 * That is why the horizon colour lives here and the fog imports it.
 */
export const HORIZON_KLEUR = 0xc4e0f4;

/** Deterministic 0..1, so the sky looks the same every run. */
function ruis(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function luchtTextuur(): THREE.CanvasTexture {
  const B = 1024;
  const H = 512;
  const c = document.createElement("canvas");
  c.width = B;
  c.height = H;
  const g = c.getContext("2d")!;

  // Zenith to horizon. The last stop is HORIZON_KLEUR, and everything below the
  // equator keeps that tone so the seam with the fogged ground never shows.
  const grad = g.createLinearGradient(0, 0, 0, H * 0.55);
  grad.addColorStop(0, "#2e6fbe");
  grad.addColorStop(0.4, "#5d9dda");
  grad.addColorStop(0.8, "#9ac6ea");
  grad.addColorStop(1, "#c4e0f4");
  g.fillStyle = grad;
  g.fillRect(0, 0, B, H * 0.55);
  g.fillStyle = "#c4e0f4";
  g.fillRect(0, H * 0.55 - 1, B, H * 0.45 + 1);

  // The sun: a warm glow with a soft core, high to the left like the key light.
  const zonX = B * 0.68;
  const zonY = H * 0.16;
  const gloed = g.createRadialGradient(zonX, zonY, 4, zonX, zonY, 150);
  gloed.addColorStop(0, "rgba(255,250,225,0.95)");
  gloed.addColorStop(0.12, "rgba(255,244,200,0.75)");
  gloed.addColorStop(0.45, "rgba(255,240,205,0.22)");
  gloed.addColorStop(1, "rgba(255,240,210,0)");
  g.fillStyle = gloed;
  g.fillRect(zonX - 160, zonY - 160, 320, 320);

  // Clouds: clusters of soft blobs in a band above the horizon. A shadow pass
  // under a highlight pass is what turns a smudge into a cumulus.
  const blob = (
    x: number,
    y: number,
    rx: number,
    ry: number,
    kleur: string,
  ): void => {
    const gr = g.createRadialGradient(x, y, 0, x, y, rx);
    gr.addColorStop(0, kleur);
    gr.addColorStop(0.62, kleur);
    gr.addColorStop(0.86, kleur.replace(/[\d.]+\)$/, "0.4)"));
    gr.addColorStop(1, kleur.replace(/[\d.]+\)$/, "0)"));
    g.save();
    g.translate(x, y);
    g.scale(1, ry / rx);
    g.translate(-x, -y);
    g.fillStyle = gr;
    g.fillRect(x - rx, y - rx, rx * 2, rx * 2);
    g.restore();
  };

  // Small, dense clusters with a hard-ish core. Big soft radii on a dome this
  // close read as haze, not as clouds.
  for (let w = 0; w < 16; w++) {
    const cx = ((w + ruis(w * 3.7) * 0.7) / 16) * B;
    const cy = H * (0.12 + ruis(w * 9.1) * 0.24);
    const maat = 13 + ruis(w * 5.3) * 17;
    const blobs = 5 + Math.floor(ruis(w * 7.7) * 4);

    // Shadow pass, slightly low.
    for (let i = 0; i < blobs; i++) {
      const bx = cx + (ruis(w * 31 + i) - 0.5) * maat * 2.6;
      const by = cy + (ruis(w * 47 + i) - 0.3) * maat * 0.5 + maat * 0.3;
      blob(bx, by, maat * (0.55 + ruis(w + i * 13) * 0.45), maat * 0.4, "rgba(172,199,224,0.55)");
    }
    // Highlight pass on top.
    for (let i = 0; i < blobs; i++) {
      const bx = cx + (ruis(w * 31 + i) - 0.5) * maat * 2.6;
      const by = cy + (ruis(w * 47 + i) - 0.5) * maat * 0.5;
      blob(bx, by, maat * (0.58 + ruis(w + i * 13) * 0.45), maat * 0.44, "rgba(255,255,255,0.95)");
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

/** The dome itself. Never fogged, never bent, always behind everything. */
export function maakLucht(): THREE.Mesh {
  const geo = new THREE.SphereGeometry(380, 32, 20);
  const mat = new THREE.MeshBasicMaterial({
    map: luchtTextuur(),
    side: THREE.BackSide,
    fog: false,
    depthWrite: false,
  });
  const dome = new THREE.Mesh(geo, mat);
  dome.renderOrder = -1;
  dome.frustumCulled = false;
  return dome;
}
