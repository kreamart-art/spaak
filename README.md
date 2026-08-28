# Spaak

Endless runner door Amsterdam. Drie banen, de wereld komt naar je toe, de speler
staat stil op de z-as. React + Vite + TypeScript + Three.js.

De omgeving is geen procedureel decor meer maar echte geometrie uit OpenStreetMap
en 3DBAG, offline omgezet naar compacte route-JSON.

## Bronvermelding

Dit project gebruikt open data. De vermelding hieronder is verplicht en staat ook
in het creditsscherm van de game.

- Kaartgegevens: **© OpenStreetMap contributors**, beschikbaar onder de
  [Open Database License](https://www.openstreetmap.org/copyright).
- Gebouwhoogtes: **3DBAG, TU Delft (CC BY 4.0)**, zie
  [3dbag.nl](https://3dbag.nl).

## De pipeline

De pipeline draait offline en commit zijn uitvoer. De browser praat nooit met
Overpass, niet in ontwikkeling en niet in productie.

```bash
npm run mapgen -- --zone jordaan
```

- zonder `--zone` draait hij alle zones
- `--refresh` negeert de schijfcache en haalt opnieuw op

Ruwe responsen komen in `tools/mapgen/.cache/` en worden hergebruikt, zodat een
herbouw geen verkeer kost. De uitvoer gaat naar `public/mapdata/<zone>.json`
plus een `index.json`.

Zones staan in [`tools/mapgen/zones.ts`](tools/mapgen/zones.ts): een bbox en de
straatnamen waaruit de route wordt gestikt.

### Wat de pipeline doet

1. Overpass ophalen, met exponentiële backoff en respect voor een 429.
2. Alles omrekenen naar een lokaal metrisch vlak, één unit is één meter. Die
   conversie staat op precies één plek, in `project.ts`.
3. De route stikken uit de genoemde straten, resamplen naar een punt per 2 m,
   smoothen met Chaikin, en per punt `s`, heading en kromming bewaren.
4. Elk object projecteren op de route als `s` (afstand langs de route) en `t`
   (loodrechte afstand met teken, negatief is links).
5. Filteren, samenvoegen en kwantiseren naar decimeters.

### Waar de data vandaan komt

| Onderdeel | Bron | Wat het oplevert |
|---|---|---|
| Route, straatnamen, bruggen, tramkruisingen | OpenStreetMap | De baan zelf |
| Pandvormen | OpenStreetMap footprints | Breedte, diepte, rotatie |
| Grachten | OpenStreetMap `natural=water` **vlakken** | Echte grachtvormen, inclusief de versmalling bij elke brug |
| Hoogte, daktype, nokhoogte, bouwlagen, bouwjaar | 3DBAG (TU Delft) | Puntgevels, raamrijen per verdieping, gevelkleur per tijdvak |
| Bomen | Gemeente Amsterdam, dataset `bomen` | De bomenrij langs de gracht, met echte hoogteklasse en soort |

De gevel wordt niet getextureerd maar in de fragment shader afgeleid uit de
werkelijke maat van het pand: raamafstand in meters, één rij per bouwlaag uit
3DBAG, een winkelpui op de begane grond, een kroonlijst onder de goot en een
baksteenkorrel die met het bouwjaar donkerder wordt. Zo houdt een pand van 5 m
en een blok van 40 m ramen van dezelfde echte maat, en past het hele stadsbeeld
in één draw call.

Draait 3DBAG of de bomendienst niet, dan valt die zone terug op wat OSM weet en
zegt de pipeline dat er in de samenvatting bij. Zo'n storing wordt niet gecachet,
dus een nieuwe run vult het alsnog aan. Wachten tot de dienst terug is en de zone
dan vanzelf opnieuw bouwen:

```bash
npm run wacht -- vondelpark
```

### Afwijkingen van de oorspronkelijke opzet

Twee constanten zijn tijdens de controle in de debug-viewer bijgesteld, met de
reden erbij in de code:

- `MAX_T` staat op **65 m** in plaats van 45 m. Een gracht is ongeveer 25 m breed
  met een kade aan weerszijden, dus de overkant staat op 45 tot 60 m. Op 45 m
  viel die hele gevelwand buiten de data en werd de gracht eenzijdig. Er is ruimte
  zat: de Jordaan zit op 16 KB gzipped van de 200 KB.
- Samenvoegen kijkt nu ook naar `t`, niet alleen naar de kant. Met een ruimere
  `MAX_T` zijn er meerdere gevelrijen per kant, en zonder die eis werden een
  voorste en achterste rij tot één spookblok gefuseerd. Dat scheelde 246 panden.

Daarnaast schuift de pipeline decor dat in de baan reikt naar buiten
(`LANE_CLEARANCE`), in plaats van het weg te gooien. Diepe blokken en
onregelmatige footprints waarvan de minimum-area box overschiet reikten tot
12,7 m over de hartlijn.

## De kaartcontrole

```bash
npm run dev
```

Daarna [`#/kaart`](http://localhost:5440/#/kaart). Twee weergaven:

- **Wereld** rekent elk object vanuit `(s, t, rotatie)` terug naar wereldcoördinaten.
  Als de projectie en de verankering kloppen vallen de blokken samen met de echte
  Amsterdamse footprints.
- **Rechtgetrokken** zet `s` horizontaal en `t` verticaal uit. Dat is letterlijk
  wat de game rendert, inclusief de baanband, dus je ziet meteen of er iets op de
  baan staat.

## De runner

```bash
npm run dev
```

Drie banen, de wereld komt naar je toe, de speler blijft op z = 0. Vegen of
pijltjes om van baan te wisselen, omhoog springen, omlaag bukken.

### Streamen, niet spawnen

`src/game/baan.ts` rijgt zones aan elkaar met een doorlopende `s`. Zodra je op
70 procent van een zone zit wordt de volgende opgehaald. `src/game/wereld.ts`
houdt vaste pools bij: er wordt tijdens een run niets aangemaakt of weggegooid,
een cursor loopt door de gesorteerde arrays en een plek wordt hergebruikt zodra
hij achter je ligt. Gevels, water en bomen zitten in een `InstancedMesh`, dus de
hele stad kost een handvol draw calls.

Loopt de horizon toch leeg, bijvoorbeeld door een trage of mislukte download,
dan schuift er meteen een procedurele zone in. Het spel valt daar nooit op om.

### De bocht

De speler rijdt door een kaarsrechte tunnel; de wereld buigt eromheen. Dat
gebeurt in de vertex shader, via `onBeforeCompile`, zodat elk materiaal een
gewone `MeshLambertMaterial` blijft met zijn eigen belichting en mist.

Het is puur visueel. Botsingen, baanposities en de streaming-cursor werken
allemaal op de rechte lokale x en z. De speler zelf krijgt de shader niet, want
die moet precies staan waar de botsingsdetectie zegt dat hij staat.

De mist verdicht mee met de bocht, zodat de horizon in een bocht eerder wegvalt.
Gemeten op de hoek van de Brouwersgracht naar de Prinsengracht: `uCurve` loopt
vloeiend op van 0 naar 1,18 en de mistdichtheid van 0,0041 naar 0,0084.

### De fiets

De speler rijdt de Spaak-fatbike, opgebouwd uit primitieven in
[`src/game/fatbike.ts`](src/game/fatbike.ts) naar de modelsheet: dikke banden met
losse profielblokken, de accu met de Amsterdamse kruisen op de flanken, de lange
bank, het bagagerek met achterlicht en kentekenplaatje, schijfremmen en spaken.

Dat is bewust code en geen glTF. Je ziet de fiets in een runner altijd van
achteren op klein formaat, en zo kost hij geen download, geen asset-pipeline en
geen licentievraag. De cranks draaien als eigen groep, de bovenbenen volgen hun
fase, en de wielen rollen op de echte snelheid gedeeld door de wielstraal.

### Framebudget

Boven de 60 zichtbare gevels zakt de zichtafstand, in plaats van dat de pool
groeit. Hij klimt weer als er ruimte is, met een brede hysterese, anders blijft
hij op de ondergrens hangen.

## Mappen

```
tools/mapgen/     offline pipeline, draait op Node zonder buildstap
public/mapdata/   de uitvoer, wordt gecommit
src/map/          runtime loader en types
src/debug/        de kaartcontrole, apart gebundeld
src/game/         de runner zelf
src/ui/           HUD, schermen en de deelbare routekaart
```
