import type { Uitslag } from "../game/Spaak.ts";

export const KAART_B = 1080;
export const KAART_H = 1350;

const ORANJE = "#ff8a1f";
const INKT = "#0d1013";
const PAPIER = "#e7edf2";

/**
 * The shareable image: the route actually ridden, drawn as a polyline with a
 * marker where the run ended.
 */
export function tekenRoutekaart(doek: HTMLCanvasElement, uitslag: Uitslag): void {
  doek.width = KAART_B;
  doek.height = KAART_H;
  const g = doek.getContext("2d")!;

  const lucht = g.createLinearGradient(0, 0, 0, KAART_H);
  lucht.addColorStop(0, "#141b23");
  lucht.addColorStop(0.55, INKT);
  lucht.addColorStop(1, "#080a0c");
  g.fillStyle = lucht;
  g.fillRect(0, 0, KAART_B, KAART_H);

  // Wordmark.
  g.fillStyle = ORANJE;
  g.font = "800 78px ui-sans-serif, system-ui, sans-serif";
  g.textAlign = "left";
  g.textBaseline = "alphabetic";
  g.letterSpacing = "14px";
  g.fillText("SPAAK", 88, 152);
  g.letterSpacing = "0px";

  g.fillStyle = "rgba(231,237,242,0.55)";
  g.font = "500 30px ui-monospace, SFMono-Regular, monospace";
  g.fillText(uitslag.zone.toUpperCase(), 92, 198);

  // The route itself.
  const vak = { x: 100, y: 262, w: KAART_B - 200, h: 566 };
  tekenSpoor(g, uitslag.spoor, vak);

  // Numbers.
  const basis = 952;
  g.fillStyle = PAPIER;
  g.font = "800 138px ui-sans-serif, system-ui, sans-serif";
  g.fillText(`${uitslag.afstand}`, 88, basis);
  const breedte = g.measureText(`${uitslag.afstand}`).width;
  g.fillStyle = ORANJE;
  g.font = "700 52px ui-sans-serif, system-ui, sans-serif";
  g.fillText("m", 100 + breedte, basis);

  g.fillStyle = "rgba(231,237,242,0.62)";
  g.font = "500 34px ui-sans-serif, system-ui, sans-serif";
  g.fillText("Gevallen op", 92, basis + 66);
  g.fillStyle = PAPIER;
  g.font = "700 54px ui-sans-serif, system-ui, sans-serif";
  g.fillText(uitslag.straat || "onbekend", 92, basis + 126);

  // Score strip.
  const strook = basis + 178;
  g.fillStyle = "rgba(255,138,31,0.12)";
  g.fillRect(88, strook, KAART_B - 176, 96);
  g.fillStyle = ORANJE;
  g.fillRect(88, strook, 6, 96);

  g.fillStyle = "rgba(231,237,242,0.6)";
  g.font = "500 27px ui-monospace, monospace";
  g.fillText("PUNTEN", 124, strook + 40);
  g.fillText("STROOPWAFELS", 452, strook + 40);
  g.fillStyle = PAPIER;
  g.font = "700 40px ui-sans-serif, system-ui, sans-serif";
  g.fillText(`${uitslag.punten}`, 124, strook + 78);
  g.fillText(`${uitslag.wafels}`, 452, strook + 78);

  g.fillStyle = "rgba(231,237,242,0.32)";
  g.font = "400 22px ui-sans-serif, system-ui, sans-serif";
  g.fillText(
    "© OpenStreetMap contributors  ·  3DBAG, TU Delft (CC BY 4.0)",
    88,
    KAART_H - 48,
  );
}

interface Vak {
  x: number;
  y: number;
  w: number;
  h: number;
}

function tekenSpoor(
  g: CanvasRenderingContext2D,
  spoor: readonly { x: number; z: number }[],
  vak: Vak,
): void {
  if (spoor.length < 2) return;

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of spoor) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }

  const spanX = Math.max(1, maxX - minX);
  const spanZ = Math.max(1, maxZ - minZ);
  const schaal = Math.min(vak.w / spanX, vak.h / spanZ) * 0.88;
  const offX = vak.x + vak.w / 2 - ((minX + maxX) / 2) * schaal;
  const offZ = vak.y + vak.h / 2 - ((minZ + maxZ) / 2) * schaal;
  const naar = (p: { x: number; z: number }): [number, number] => [
    offX + p.x * schaal,
    offZ + p.z * schaal,
  ];

  g.lineJoin = "round";
  g.lineCap = "round";

  // Soft halo under the line so it lifts off the background.
  g.strokeStyle = "rgba(255,138,31,0.16)";
  g.lineWidth = 26;
  g.beginPath();
  spoor.forEach((p, i) => {
    const [x, y] = naar(p);
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  });
  g.stroke();

  g.strokeStyle = ORANJE;
  g.lineWidth = 8;
  g.stroke();

  const [sx, sy] = naar(spoor[0]!);
  g.fillStyle = "rgba(231,237,242,0.85)";
  g.beginPath();
  g.arc(sx, sy, 12, 0, Math.PI * 2);
  g.fill();

  // Where the run ended.
  const [ex, ey] = naar(spoor[spoor.length - 1]!);
  g.fillStyle = "rgba(255,79,79,0.22)";
  g.beginPath();
  g.arc(ex, ey, 42, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#ff4f4f";
  g.beginPath();
  g.arc(ex, ey, 17, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = INKT;
  g.lineWidth = 5;
  g.stroke();
}
