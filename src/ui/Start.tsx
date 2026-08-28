export function Start({
  opStart,
  opCredits,
}: {
  opStart: () => void;
  opCredits: () => void;
}): React.ReactElement {
  return (
    <div className="paneel">
      <div className="paneel-kaart">
        <h1 className="merk">SPAAK</h1>
        <p className="onderkop">Door Amsterdam, zonder te remmen</p>

        <button type="button" className="knop-groot" onClick={opStart}>
          Rijden
        </button>

        <ul className="uitleg">
          <li>
            <span className="toets">Veeg</span> of{" "}
            <span className="toets">pijltjes</span> om van baan te wisselen
          </li>
          <li>
            <span className="toets">Omhoog</span> om te springen,{" "}
            <span className="toets">omlaag</span> om te bukken
          </li>
          <li>Pak stroopwafels voor extra punten</li>
        </ul>

        <button type="button" className="knop-tekst" onClick={opCredits}>
          Verantwoording
        </button>
      </div>
    </div>
  );
}
