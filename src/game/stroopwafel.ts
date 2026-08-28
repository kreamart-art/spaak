import * as THREE from "three";

/**
 * A stroopwafel: two thin waffle discs with a caramel layer between them.
 * The waffle grid is drawn once into a canvas, so the whole thing stays a
 * single instanced cylinder with three materials.
 */

const STRAAL = 0.34;
const DIKTE = 0.085;

function wafelTextuur(): THREE.CanvasTexture {
  const maat = 256;
  const c = document.createElement("canvas");
  c.width = maat;
  c.height = maat;
  const g = c.getContext("2d")!;

  g.clearRect(0, 0, maat, maat);
  const m = maat / 2;

  // Baked dough, darker towards the rim the way a waffle iron browns it.
  g.save();
  g.beginPath();
  g.arc(m, m, m - 2, 0, Math.PI * 2);
  g.clip();

  const grond = g.createRadialGradient(m, m * 0.85, m * 0.1, m, m, m);
  grond.addColorStop(0, "#b9752c");
  grond.addColorStop(0.72, "#9c5c1f");
  grond.addColorStop(1, "#7a4415");
  g.fillStyle = grond;
  g.fillRect(0, 0, maat, maat);

  // The grid: raised squares with scorched valleys between them.
  const vak = maat / 9;
  for (let y = 0; y < 9; y++) {
    for (let x = 0; x < 9; x++) {
      const px = x * vak;
      const py = y * vak;
      const dx = px + vak / 2 - m;
      const dy = py + vak / 2 - m;
      const val = Math.hypot(dx, dy) / m;
      // The raised squares catch the iron and go pale gold; the further out,
      // the more they scorch.
      const licht = Math.max(0, 1 - val * 0.5);
      const r = Math.round(243 * licht + 146 * (1 - licht));
      const gr = Math.round(176 * licht + 78 * (1 - licht));
      const b = Math.round(78 * licht + 24 * (1 - licht));
      g.fillStyle = `rgb(${r},${gr},${b})`;
      g.fillRect(px + 3.5, py + 3.5, vak - 7, vak - 7);
    }
  }

  // Scorch lines in the grooves.
  g.strokeStyle = "rgba(72,38,12,0.92)";
  g.lineWidth = 6;
  for (let i = 0; i <= 9; i++) {
    g.beginPath();
    g.moveTo(i * vak, 0);
    g.lineTo(i * vak, maat);
    g.moveTo(0, i * vak);
    g.lineTo(maat, i * vak);
    g.stroke();
  }
  g.restore();

  // A slightly darker rim, where the edge always catches most.
  g.strokeStyle = "rgba(86,46,14,0.95)";
  g.lineWidth = 11;
  g.beginPath();
  g.arc(m, m, m - 5, 0, Math.PI * 2);
  g.stroke();

  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}

export interface Stroopwafel {
  readonly geometrie: THREE.BufferGeometry;
  readonly materialen: THREE.Material[];
  readonly straal: number;
}

export function maakStroopwafel(): Stroopwafel {
  // Three groups on a cylinder: the caramel edge, then top and bottom waffle.
  const geometrie = new THREE.CylinderGeometry(STRAAL, STRAAL, DIKTE, 20, 1);
  // Lay it flat so it faces the player like a coin.
  geometrie.rotateX(Math.PI / 2);

  const wafel = wafelTextuur();
  // A pickup has to carry against a grey street under a cool sky, so it gets a
  // little warmth of its own rather than relying on the light of the day.
  const vlak = new THREE.MeshStandardMaterial({
    map: wafel,
    emissive: 0x3a2208,
    roughness: 0.68,
    metalness: 0,
  });
  // The caramel showing at the edge, a shade darker and glossier than the dough.
  // Caramel is glossy where the biscuit is not; that contrast is what says
  // stroopwafel rather than coin.
  const karamel = new THREE.MeshStandardMaterial({
    color: 0x6b3610,
    emissive: 0x2a1405,
    roughness: 0.22,
    metalness: 0,
  });

  return { geometrie, materialen: [karamel, vlak, vlak], straal: STRAAL };
}
