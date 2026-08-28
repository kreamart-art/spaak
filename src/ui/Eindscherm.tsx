import { useEffect, useRef, useState } from "react";
import type { Uitslag } from "../game/Spaak.ts";
import { tekenRoutekaart } from "./routekaart.ts";

export function Eindscherm({
  uitslag,
  opNogmaals,
}: {
  uitslag: Uitslag;
  opNogmaals: () => void;
}): React.ReactElement {
  const doekRef = useRef<HTMLCanvasElement | null>(null);
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState<string | null>(null);

  useEffect(() => {
    const doek = doekRef.current;
    if (doek) tekenRoutekaart(doek, uitslag);
  }, [uitslag]);

  const bewaar = async (): Promise<void> => {
    const doek = doekRef.current;
    if (!doek || bezig) return;
    setBezig(true);
    setMelding(null);
    try {
      const blob = await new Promise<Blob | null>((klaar) =>
        doek.toBlob(klaar, "image/png"),
      );
      if (!blob) throw new Error("geen afbeelding");
      const bestand = new File([blob], `spaak-${uitslag.afstand}m.png`, {
        type: "image/png",
      });

      if (navigator.canShare?.({ files: [bestand] })) {
        await navigator.share({ files: [bestand] });
        return;
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = bestand.name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setMelding("Bewaren lukte niet. Houd de afbeelding ingedrukt om hem op te slaan.");
    } finally {
      setBezig(false);
    }
  };

  return (
    <div className="paneel">
      <div className="paneel-kaart eind">
        <h2 className="paneel-titel">Gevallen</h2>

        <canvas ref={doekRef} className="eind-kaart" />

        <div className="eind-knoppen">
          <button type="button" className="knop-groot" onClick={opNogmaals}>
            Nog een keer
          </button>
          <button
            type="button"
            className="knop-rand"
            onClick={() => void bewaar()}
            disabled={bezig}
          >
            Bewaar afbeelding
          </button>
        </div>

        {melding ? <p className="eind-melding">{melding}</p> : null}
      </div>
    </div>
  );
}
