import { ROUTE_STEP, type Zone } from "../map/types.ts";

/** Deterministic noise so a fallback zone looks the same every run. */
function ruis(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

const NAMEN = [
  "Naamloze gracht",
  "Kade zonder naam",
  "Achterstraat",
  "Buitenwal",
];

/**
 * The generator the game falls back on when a zone file will not load. It emits
 * the exact same shape as the pipeline, so the streamer has one code path and a
 * missing download never costs a run.
 */
export function maakProcedureleZone(index: number, lengte = 1400): Zone {
  const n = Math.floor(lengte / ROUTE_STEP) + 1;
  const x = new Float32Array(n);
  const z = new Float32Array(n);
  const heading = new Float32Array(n);
  const kromming = new Float32Array(n);

  // A lazy double sine keeps the shader bend alive without inventing a city.
  let px = 0;
  let pz = 0;
  let hoek = -Math.PI / 2;
  for (let i = 0; i < n; i++) {
    const s = i * ROUTE_STEP;
    const k =
      Math.sin(s / 180 + index * 2.3) * 0.0035 +
      Math.sin(s / 61 + index) * 0.0012;
    kromming[i] = k;
    heading[i] = hoek;
    x[i] = px;
    z[i] = pz;
    hoek += k * ROUTE_STEP;
    px += Math.cos(hoek) * ROUTE_STEP;
    pz += Math.sin(hoek) * ROUTE_STEP;
  }

  const gs: number[] = [];
  const gt: number[] = [];
  const gb: number[] = [];
  const gd: number[] = [];
  const gh: number[] = [];
  const gk: number[] = [];
  const gr: number[] = [];
  const gl: number[] = [];
  const gj: number[] = [];
  for (let s = 4; s < lengte; s += 5.5 + ruis(s + index) * 3.5) {
    for (const kant of [-1, 1]) {
      const r = ruis(s * 3.1 + kant * 17 + index * 91);
      if (r < 0.08) continue;
      const ver = kant < 0 ? 26 + r * 8 : 7 + r * 4;
      const hoogte = 8 + r * 15;
      gs.push(s);
      gt.push(kant * ver);
      gb.push(4.5 + r * 4);
      gd.push(9 + r * 12);
      gh.push(hoogte);
      gk.push(r > 0.35 ? 1 + r * 2 : 0);
      gr.push((ruis(s + kant * 5) - 0.5) * 0.14);
      gl.push(Math.max(1, Math.round((hoogte - 1.5) / 3.2)));
      gj.push(1700 + Math.floor(ruis(s * 9.3 + kant) * 300));
    }
  }

  const ws: number[] = [];
  const wlo: number[] = [];
  const whi: number[] = [];
  for (let s = 0; s < lengte; s += 4) {
    ws.push(s);
    wlo[wlo.length] = -23;
    whi[whi.length] = -8;
  }

  const bs: number[] = [];
  const bt: number[] = [];
  const bh: number[] = [];
  const bso: number[] = [];
  for (let s = 12; s < lengte; s += 9) {
    const r = ruis(s * 7.7 + index);
    bs.push(s);
    bt.push(r < 0.5 ? -6.5 : 6.5);
    bh.push(9 + r * 6);
    bso.push(0);
  }

  const bruggen = [];
  for (let s = 130; s < lengte - 60; s += 190) {
    bruggen.push({ s, naam: "Brug", breedte: 9 });
  }

  return {
    id: `procedureel-${index}`,
    naam: NAMEN[index % NAMEN.length]!,
    lengte,
    origin: [52.3765, 4.885],
    route: { n, x, z, heading, kromming },
    gebouwen: {
      n: gs.length,
      s: Float32Array.from(gs),
      t: Float32Array.from(gt),
      breedte: Float32Array.from(gb),
      diepte: Float32Array.from(gd),
      hoogte: Float32Array.from(gh),
      kap: Float32Array.from(gk),
      rotatie: Float32Array.from(gr),
      bouwlagen: Float32Array.from(gl),
      bouwjaar: Float32Array.from(gj),
    },
    water: {
      n: ws.length,
      s: Float32Array.from(ws),
      tMin: Float32Array.from(wlo),
      tMax: Float32Array.from(whi),
    },
    bomen: {
      n: bs.length,
      s: Float32Array.from(bs),
      t: Float32Array.from(bt),
      hoogte: Float32Array.from(bh),
      soort: Float32Array.from(bso),
    },
    bruggen,
    rails: [],
    straten: [{ s: 0, naam: NAMEN[index % NAMEN.length]! }],
  };
}
