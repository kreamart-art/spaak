import { Suspense, lazy, useEffect, useState } from "react";
import { Spel } from "./Spel.tsx";

// The map check is a tool, not part of the game. Keeping it out of the main
// bundle means a phone never downloads it.
const MapDebug = lazy(() =>
  import("./debug/MapDebug.tsx").then((m) => ({ default: m.MapDebug })),
);

function huidigeRoute(): string {
  return window.location.hash.replace(/^#\/?/, "");
}

export function App(): React.ReactElement {
  const [route, setRoute] = useState(huidigeRoute);

  useEffect(() => {
    const opWissel = (): void => setRoute(huidigeRoute());
    window.addEventListener("hashchange", opWissel);
    return () => window.removeEventListener("hashchange", opWissel);
  }, []);

  if (route === "kaart") {
    return (
      <Suspense fallback={<div style={{ padding: 24 }}>kaart laden...</div>}>
        <MapDebug />
      </Suspense>
    );
  }
  return <Spel />;
}
