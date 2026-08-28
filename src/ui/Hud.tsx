import { useEffect, useRef, useState } from "react";
import type { Status } from "../game/Spaak.ts";

/** The street name cross-fades whenever the route moves onto a new street. */
function Straatnaam({ naam }: { naam: string }): React.ReactElement {
  const [getoond, setGetoond] = useState(naam);
  const [wisselt, setWisselt] = useState(false);
  const wachtend = useRef(naam);

  useEffect(() => {
    if (naam === wachtend.current) return;
    wachtend.current = naam;
    setWisselt(true);
    const t = window.setTimeout(() => {
      setGetoond(naam);
      setWisselt(false);
    }, 220);
    return () => window.clearTimeout(t);
  }, [naam]);

  return (
    <div className={`hud-straat ${wisselt ? "wisselt" : ""}`}>
      <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
        <path
          d="M12 2 4 6v6c0 5 3.4 8.5 8 10 4.6-1.5 8-5 8-10V6z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
      <span>{getoond}</span>
    </div>
  );
}

export function Hud({ status }: { status: Status }): React.ReactElement {
  return (
    <div className="hud">
      <div className="hud-boven">
        <div className="hud-blok">
          <span className="hud-label">Punten</span>
          <strong className="hud-groot">{status.punten}</strong>
        </div>
        <Straatnaam naam={status.straat} />
        <div className="hud-blok hud-rechts">
          <span className="hud-label">Stroopwafels</span>
          <strong className="hud-groot">{status.wafels}</strong>
        </div>
      </div>

      <div className="hud-onder">
        <span>{status.afstand} m</span>
        <span className="hud-scheiding" />
        <span>{Math.round(status.snelheid * 3.6)} km/u</span>
      </div>
    </div>
  );
}
