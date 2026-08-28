export function Credits({ opTerug }: { opTerug: () => void }): React.ReactElement {
  return (
    <div className="paneel">
      <div className="paneel-kaart">
        <h2 className="paneel-titel">Verantwoording</h2>

        <p className="credit-tekst">
          De straten, grachten, bruggen en gevels in Spaak zijn geen verzinsel.
          Ze komen uit open kaartgegevens van Amsterdam en zijn omgezet naar de
          drie banen waarop je rijdt.
        </p>

        <dl className="credit-lijst">
          <dt>Kaartgegevens</dt>
          <dd>© OpenStreetMap contributors</dd>
          <dt>Gebouwhoogtes</dt>
          <dd>3DBAG, TU Delft (CC BY 4.0)</dd>
        </dl>

        <p className="credit-klein">
          OpenStreetMap-gegevens zijn beschikbaar onder de Open Database License.
          3DBAG is beschikbaar onder Creative Commons Naamsvermelding 4.0.
        </p>

        <button type="button" className="knop-groot" onClick={opTerug}>
          Terug
        </button>
      </div>
    </div>
  );
}
