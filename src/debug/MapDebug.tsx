import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadIndex, loadZone, straatAt } from "../map/loadZone.ts";
import type { Zone, ZoneIndexEntry } from "../map/types.ts";
import { frameAt, striptHoeken, wereldHoeken, type Hoek } from "./frames.ts";
import "./mapdebug.css";

type Weergave = "wereld" | "recht";

interface Camera {
  /** Metres per pixel. */
  schaal: number;
  /** World point at the canvas centre. */
  cx: number;
  cz: number;
}

const KLEUR = {
  achtergrond: "#0d1013",
  raster: "#181d22",
  route: "#ff8a1f",
  routeKern: "#ffd9a8",
  linksLaag: "#3d5a3a",
  linksHoog: "#9fd68a",
  rechtsLaag: "#5a3a4a",
  rechtsHoog: "#d68fa8",
  water: "#12657f",
  boom: "#3f8a4a",
  brug: "#ffd166",
  rail: "#c77dff",
  baan: "#1b2228",
  tekst: "#e7edf2",
  zwak: "#7f8c98",
};

function hoogteKleur(hoogte: number, links: boolean): string {
  const f = Math.max(0, Math.min(1, (hoogte - 3) / 22));
  const a = links ? KLEUR.linksLaag : KLEUR.rechtsLaag;
  const b = links ? KLEUR.linksHoog : KLEUR.rechtsHoog;
  return mix(a, b, f);
}

function mix(a: string, b: string, f: number): string {
  const pa = [1, 3, 5].map((i) => Number.parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => Number.parseInt(b.slice(i, i + 2), 16));
  const out = pa.map((v, i) => Math.round(v + (pb[i]! - v) * f));
  return `rgb(${out[0]},${out[1]},${out[2]})`;
}

export function MapDebug(): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [zones, setZones] = useState<readonly ZoneIndexEntry[]>([]);
  const [zoneId, setZoneId] = useState<string>("jordaan");
  const [zone, setZone] = useState<Zone | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [weergave, setWeergave] = useState<Weergave>("wereld");
  const [toonGebouwen, setToonGebouwen] = useState(true);
  const [toonWater, setToonWater] = useState(true);
  const [toonBomen, setToonBomen] = useState(true);
  const [toonBaan, setToonBaan] = useState(true);
  const [cam, setCam] = useState<Camera>({ schaal: 1, cx: 0, cz: 0 });
  const [cursor, setCursor] = useState<{ s: number; t: number } | null>(null);
  const [maat, setMaat] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const sleep = useRef<{ x: number; y: number } | null>(null);

  // clientWidth right after a reload can still be pre-layout, and nothing
  // redrew on a window resize either. The observer settles both.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const box = entry.contentRect;
      setMaat({ w: Math.round(box.width), h: Math.round(box.height) });
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    void loadIndex().then((idx) => {
      if (!idx) {
        setFout("public/mapdata/index.json ontbreekt. Draai eerst: npm run mapgen");
        return;
      }
      setZones(idx.zones);
      if (idx.zones.length > 0 && !idx.zones.some((z) => z.id === zoneId)) {
        setZoneId(idx.zones[0]!.id);
      }
    });
    // Only on mount: the picker drives every later load.
     
  }, []);

  useEffect(() => {
    let levend = true;
    setZone(null);
    void loadZone(zoneId).then((z) => {
      if (!levend) return;
      if (!z) {
        setFout(`Zone "${zoneId}" kon niet geladen worden.`);
        return;
      }
      setFout(null);
      setZone(z);
    });
    return () => {
      levend = false;
    };
  }, [zoneId]);

  /** Fit the whole zone in view whenever the data or the view mode changes. */
  const passend = useCallback(() => {
    if (!zone || maat.w < 40 || maat.h < 40) return;
    const { w, h } = maat;

    if (weergave === "recht") {
      const schaal = Math.max(zone.lengte / (w - 60), 120 / (h - 60));
      setCam({ schaal, cx: zone.lengte / 2, cz: 0 });
      return;
    }

    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < zone.route.n; i++) {
      minX = Math.min(minX, zone.route.x[i]!);
      maxX = Math.max(maxX, zone.route.x[i]!);
      minZ = Math.min(minZ, zone.route.z[i]!);
      maxZ = Math.max(maxZ, zone.route.z[i]!);
    }
    const pad = 70;
    const schaal = Math.max(
      (maxX - minX + pad * 2) / w,
      (maxZ - minZ + pad * 2) / h,
    );
    setCam({ schaal, cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2 });
  }, [zone, weergave, maat]);

  useEffect(() => {
    passend();
  }, [passend]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const { w, h } = maat;
    if (w < 40 || h < 40) return;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = KLEUR.achtergrond;
    ctx.fillRect(0, 0, w, h);
    if (!zone) return;

    const naarScherm = (x: number, z: number): [number, number] => [
      w / 2 + (x - cam.cx) / cam.schaal,
      h / 2 + (z - cam.cz) / cam.schaal,
    ];

    tekenRaster(ctx, w, h, cam, naarScherm);

    const veelhoek = (pts: readonly Hoek[], vul: string, lijn?: string): void => {
      ctx.beginPath();
      pts.forEach((p, i) => {
        const [sx, sy] = naarScherm(p.x, p.z);
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      });
      ctx.closePath();
      ctx.fillStyle = vul;
      ctx.fill();
      if (lijn) {
        ctx.strokeStyle = lijn;
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }
    };

    // The three lanes, so you can see nothing is parked on the track.
    if (toonBaan) {
      ctx.fillStyle = KLEUR.baan;
      if (weergave === "recht") {
        const [x0, y0] = naarScherm(0, -4.5);
        const [x1, y1] = naarScherm(zone.lengte, 4.5);
        ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      } else {
        ctx.beginPath();
        for (let i = 0; i < zone.route.n; i++) {
          const fr = frameAt(zone, i * 2);
          const [sx, sy] = naarScherm(fr.x + fr.rx * -4.5, fr.z + fr.rz * -4.5);
          if (i === 0) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
        }
        for (let i = zone.route.n - 1; i >= 0; i--) {
          const fr = frameAt(zone, i * 2);
          const [sx, sy] = naarScherm(fr.x + fr.rx * 4.5, fr.z + fr.rz * 4.5);
          ctx.lineTo(sx, sy);
        }
        ctx.closePath();
        ctx.fill();
      }
    }

    if (toonWater) {
      ctx.fillStyle = KLEUR.water;
      for (let i = 0; i < zone.water.n; i++) {
        const s = zone.water.s[i]!;
        const lo = zone.water.tMin[i]!;
        const hi = zone.water.tMax[i]!;
        const midden = (lo + hi) / 2;
        const breedte = Math.max(0.5, hi - lo);
        const pts =
          weergave === "recht"
            ? striptHoeken(s, midden, 4, breedte, 0)
            : wereldHoeken(zone, s, midden, 4, breedte, 0);
        veelhoek(pts, KLEUR.water);
      }
    }

    if (toonGebouwen) {
      for (let i = 0; i < zone.gebouwen.n; i++) {
        const s = zone.gebouwen.s[i]!;
        const t = zone.gebouwen.t[i]!;
        const br = zone.gebouwen.breedte[i]!;
        const dp = zone.gebouwen.diepte[i]!;
        const ho = zone.gebouwen.hoogte[i]!;
        const rot = zone.gebouwen.rotatie[i]!;
        const pts =
          weergave === "recht"
            ? striptHoeken(s, t, br, dp, rot)
            : wereldHoeken(zone, s, t, br, dp, rot);
        veelhoek(pts, hoogteKleur(ho, t < 0), "#0d1013");
      }
    }

    if (toonBomen) {
      ctx.fillStyle = KLEUR.boom;
      for (let i = 0; i < zone.bomen.n; i++) {
        const s = zone.bomen.s[i]!;
        const t = zone.bomen.t[i]!;
        const p =
          weergave === "recht"
            ? { x: s, z: t }
            : (() => {
                const fr = frameAt(zone, s);
                return { x: fr.x + fr.rx * t, z: fr.z + fr.rz * t };
              })();
        const [sx, sy] = naarScherm(p.x, p.z);
        ctx.beginPath();
        ctx.arc(sx, sy, Math.max(1.5, 2.5 / cam.schaal), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Route centreline, drawn last so it stays readable on top.
    ctx.lineWidth = 3;
    ctx.strokeStyle = KLEUR.route;
    ctx.beginPath();
    for (let i = 0; i < zone.route.n; i++) {
      const p =
        weergave === "recht"
          ? { x: i * 2, z: 0 }
          : { x: zone.route.x[i]!, z: zone.route.z[i]! };
      const [sx, sy] = naarScherm(p.x, p.z);
      if (i === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    }
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.strokeStyle = KLEUR.routeKern;
    ctx.stroke();

    // Bridges as gates across the lane.
    let vorigLabel = -Infinity;
    for (const brug of zone.bruggen) {
      const pts =
        weergave === "recht"
          ? striptHoeken(brug.s, 0, brug.breedte, 70, 0)
          : wereldHoeken(zone, brug.s, 0, brug.breedte, 70, 0);
      veelhoek(pts, "rgba(255,209,102,0.18)", KLEUR.brug);
      const anker =
        weergave === "recht"
          ? { x: brug.s, z: -34 }
          : (() => {
              const fr = frameAt(zone, brug.s);
              return { x: fr.x + fr.rx * -34, z: fr.z + fr.rz * -34 };
            })();
      const [tx, ty] = naarScherm(anker.x, anker.z);
      const spoor = weergave === "recht" ? tx : ty;
      if (Math.abs(spoor - vorigLabel) < 14) continue;
      vorigLabel = spoor;
      ctx.fillStyle = KLEUR.brug;
      ctx.font = "11px ui-monospace, monospace";
      ctx.fillText(brug.naam, tx + 4, ty);
    }

    for (const rail of zone.rails) {
      const pts =
        weergave === "recht"
          ? striptHoeken(rail.s, 0, 3, 90, rail.hoek)
          : wereldHoeken(zone, rail.s, 0, 3, 90, rail.hoek);
      veelhoek(pts, "rgba(199,125,255,0.25)", KLEUR.rail);
    }

    // Street name changes.
    ctx.font = "12px ui-monospace, monospace";
    for (const straat of zone.straten) {
      const p =
        weergave === "recht"
          ? { x: straat.s, z: 0 }
          : (() => {
              const fr = frameAt(zone, straat.s);
              return { x: fr.x, z: fr.z };
            })();
      const [sx, sy] = naarScherm(p.x, p.z);
      ctx.fillStyle = KLEUR.route;
      ctx.beginPath();
      ctx.arc(sx, sy, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = KLEUR.tekst;
      ctx.fillText(`${straat.naam} @ ${straat.s} m`, sx + 9, sy - 8);
    }
  }, [zone, cam, weergave, maat, toonGebouwen, toonWater, toonBomen, toonBaan]);

  const naarWereld = useCallback(
    (px: number, py: number): { x: number; z: number } => ({
      x: cam.cx + (px - maat.w / 2) * cam.schaal,
      z: cam.cz + (py - maat.h / 2) * cam.schaal,
    }),
    [cam, maat],
  );

  const opBeweging = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;

    if (sleep.current) {
      const dx = (px - sleep.current.x) * cam.schaal;
      const dz = (py - sleep.current.y) * cam.schaal;
      sleep.current = { x: px, y: py };
      setCam((c) => ({ ...c, cx: c.cx - dx, cz: c.cz - dz }));
      return;
    }

    if (!zone) return;
    const w = naarWereld(px, py);
    if (weergave === "recht") {
      setCursor({ s: w.x, t: w.z });
      return;
    }
    // Nearest route sample gives the (s, t) under the pointer.
    let best = 0;
    let bestD2 = Infinity;
    for (let i = 0; i < zone.route.n; i += 2) {
      const dx = zone.route.x[i]! - w.x;
      const dz = zone.route.z[i]! - w.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = i;
      }
    }
    const fr = frameAt(zone, best * 2);
    setCursor({
      s: best * 2,
      t: (w.x - fr.x) * fr.rx + (w.z - fr.z) * fr.rz,
    });
  };

  const stats = useMemo(() => {
    if (!zone) return null;
    let links = 0;
    let maxHoogte = 0;
    let maxT = 0;
    for (let i = 0; i < zone.gebouwen.n; i++) {
      if (zone.gebouwen.t[i]! < 0) links++;
      maxHoogte = Math.max(maxHoogte, zone.gebouwen.hoogte[i]!);
      maxT = Math.max(maxT, Math.abs(zone.gebouwen.t[i]!));
    }
    return { links, rechts: zone.gebouwen.n - links, maxHoogte, maxT };
  }, [zone]);

  const entry = zones.find((z) => z.id === zoneId);

  return (
    <div className="dbg">
      <header className="dbg-kop">
        <span className="dbg-merk">Spaak</span>
        <span className="dbg-titel">kaartcontrole</span>

        <select
          className="dbg-kies"
          value={zoneId}
          onChange={(e) => setZoneId(e.target.value)}
        >
          {zones.map((z) => (
            <option key={z.id} value={z.id}>
              {z.naam}
            </option>
          ))}
        </select>

        <div className="dbg-schakel">
          <button
            type="button"
            className={weergave === "wereld" ? "aan" : ""}
            onClick={() => setWeergave("wereld")}
          >
            Wereld
          </button>
          <button
            type="button"
            className={weergave === "recht" ? "aan" : ""}
            onClick={() => setWeergave("recht")}
          >
            Rechtgetrokken
          </button>
        </div>

        <label><input type="checkbox" checked={toonGebouwen} onChange={(e) => setToonGebouwen(e.target.checked)} /> gebouwen</label>
        <label><input type="checkbox" checked={toonWater} onChange={(e) => setToonWater(e.target.checked)} /> water</label>
        <label><input type="checkbox" checked={toonBomen} onChange={(e) => setToonBomen(e.target.checked)} /> bomen</label>
        <label><input type="checkbox" checked={toonBaan} onChange={(e) => setToonBaan(e.target.checked)} /> baan</label>

        <button type="button" className="dbg-knop" onClick={passend}>Passend maken</button>
      </header>

      <canvas
        ref={canvasRef}
        className="dbg-doek"
        onPointerDown={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          sleep.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerUp={(e) => {
          sleep.current = null;
          e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onPointerMove={opBeweging}
        onWheel={(e) => {
          const factor = Math.exp(e.deltaY * 0.0015);
          setCam((c) => ({ ...c, schaal: Math.max(0.02, Math.min(12, c.schaal * factor)) }));
        }}
      />

      {fout ? <div className="dbg-fout">{fout}</div> : null}

      <footer className="dbg-voet">
        {zone && stats ? (
          <>
            <span><b>{zone.naam}</b></span>
            <span>{zone.lengte} m route</span>
            <span>{zone.route.n} routepunten</span>
            <span>{zone.gebouwen.n} gebouwen ({stats.links} links / {stats.rechts} rechts)</span>
            <span>hoogste {stats.maxHoogte.toFixed(1)} m</span>
            <span>verste |t| {stats.maxT.toFixed(1)} m</span>
            <span>{zone.water.n} water</span>
            <span>{zone.bomen.n} bomen</span>
            <span>{zone.bruggen.length} bruggen</span>
            <span>{zone.rails.length} rails</span>
            {entry ? <span>{(entry.bytes / 1024).toFixed(1)} KB gzipped</span> : null}
            {cursor ? (
              <span className="dbg-cursor">
                s {cursor.s.toFixed(0)} m &middot; t {cursor.t.toFixed(1)} m &middot;{" "}
                {straatAt(zone, cursor.s)}
              </span>
            ) : null}
          </>
        ) : (
          <span>laden...</span>
        )}
      </footer>

      <div className="dbg-bron">
        &copy; OpenStreetMap contributors &middot; 3DBAG, TU Delft (CC BY 4.0)
      </div>
    </div>
  );
}

function tekenRaster(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  cam: Camera,
  naarScherm: (x: number, z: number) => [number, number],
): void {
  // Choose a grid step that stays between 40 and 400 pixels apart.
  let stap = 10;
  while (stap / cam.schaal < 40) stap *= 5;
  while (stap / cam.schaal > 400) stap /= 5;

  const links = cam.cx - (w / 2) * cam.schaal;
  const rechts = cam.cx + (w / 2) * cam.schaal;
  const boven = cam.cz - (h / 2) * cam.schaal;
  const onder = cam.cz + (h / 2) * cam.schaal;

  ctx.strokeStyle = KLEUR.raster;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = Math.ceil(links / stap) * stap; x < rechts; x += stap) {
    const [sx] = naarScherm(x, 0);
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx, h);
  }
  for (let z = Math.ceil(boven / stap) * stap; z < onder; z += stap) {
    const [, sy] = naarScherm(0, z);
    ctx.moveTo(0, sy);
    ctx.lineTo(w, sy);
  }
  ctx.stroke();

  ctx.fillStyle = KLEUR.zwak;
  ctx.font = "10px ui-monospace, monospace";
  ctx.fillText(`raster ${stap} m`, 10, h - 10);
}
