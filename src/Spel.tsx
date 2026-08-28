import { useCallback, useEffect, useRef, useState } from "react";
import { Spaak, type Status, type Uitslag } from "./game/Spaak.ts";
import type { Beweging } from "./game/speler.ts";
import { Hud } from "./ui/Hud.tsx";
import { Start } from "./ui/Start.tsx";
import { Credits } from "./ui/Credits.tsx";
import { Eindscherm } from "./ui/Eindscherm.tsx";
import "./ui/spel.css";

const LEEG: Status = {
  toestand: "klaar",
  afstand: 0,
  punten: 0,
  wafels: 0,
  snelheid: 0,
  straat: "",
  zone: "",
};

type Scherm = "start" | "spel" | "credits" | "eind";

export function Spel(): React.ReactElement {
  const doekRef = useRef<HTMLCanvasElement | null>(null);
  const spelRef = useRef<Spaak | null>(null);
  const [scherm, setScherm] = useState<Scherm>("start");
  const [status, setStatus] = useState<Status>(LEEG);
  const [uitslag, setUitslag] = useState<Uitslag | null>(null);

  useEffect(() => {
    const doek = doekRef.current;
    if (!doek) return;

    const spel = new Spaak(doek);
    spelRef.current = spel;
    spel.opStatus = setStatus;
    spel.opEinde = (u) => {
      setUitslag(u);
      // Let the crash read for a beat before the panel covers it.
      window.setTimeout(() => setScherm("eind"), 700);
    };
    spel.start();
    if (import.meta.env.DEV) {
      (window as unknown as { spaak?: Spaak }).spaak = spel;
    }

    const ro = new ResizeObserver(() => spel.meet());
    ro.observe(doek);

    return () => {
      ro.disconnect();
      spel.ruim();
      spelRef.current = null;
    };
  }, []);

  const beweeg = useCallback((wat: Beweging) => {
    spelRef.current?.beweeg(wat);
  }, []);

  useEffect(() => {
    const opToets = (e: KeyboardEvent): void => {
      const kaart: Record<string, Beweging> = {
        ArrowLeft: "links",
        ArrowRight: "rechts",
        ArrowUp: "spring",
        ArrowDown: "buk",
        a: "links",
        d: "rechts",
        w: "spring",
        s: "buk",
        " ": "spring",
      };
      const wat = kaart[e.key];
      if (!wat) return;
      e.preventDefault();
      beweeg(wat);
    };
    window.addEventListener("keydown", opToets);
    return () => window.removeEventListener("keydown", opToets);
  }, [beweeg]);

  // Swipes. A short flick is enough; the threshold is in CSS pixels.
  const raak = useRef<{ x: number; y: number; t: number } | null>(null);
  const opDown = (e: React.PointerEvent): void => {
    raak.current = { x: e.clientX, y: e.clientY, t: performance.now() };
  };
  const opUp = (e: React.PointerEvent): void => {
    const begin = raak.current;
    raak.current = null;
    if (!begin) return;
    const dx = e.clientX - begin.x;
    const dy = e.clientY - begin.y;
    const duur = performance.now() - begin.t;
    if (duur > 600) return;
    const drempel = 26;
    if (Math.abs(dx) < drempel && Math.abs(dy) < drempel) return;
    if (Math.abs(dx) > Math.abs(dy)) beweeg(dx > 0 ? "rechts" : "links");
    else beweeg(dy > 0 ? "buk" : "spring");
  };

  const begin = (): void => {
    setUitslag(null);
    setScherm("spel");
    spelRef.current?.begin();
  };

  return (
    <div
      className="spel"
      onPointerDown={opDown}
      onPointerUp={opUp}
      onPointerCancel={() => (raak.current = null)}
    >
      <canvas ref={doekRef} className="spel-doek" />

      {scherm === "spel" ? <Hud status={status} /> : null}
      {scherm === "start" ? (
        <Start opStart={begin} opCredits={() => setScherm("credits")} />
      ) : null}
      {scherm === "credits" ? <Credits opTerug={() => setScherm("start")} /> : null}
      {scherm === "eind" && uitslag ? (
        <Eindscherm uitslag={uitslag} opNogmaals={begin} />
      ) : null}

      <a className="kaartlink" href="#/kaart">
        kaartcontrole
      </a>
    </div>
  );
}
