# Gegenereerde modellen

## Wat jij doet

1. Download het model uit de generator als **GLB**.
2. Zet het hier neer als **`fatbike-ruw.glb`**.
3. Draai in de projectmap:

   ```
   npm run model
   ```

Dat schrijft een uitgedunde `fatbike.glb`. Staat dat bestand er, dan vervangt het
automatisch de in code gebouwde fiets. Staat het er niet, dan gebeurt er niets en
blijft de procedurele versie staan; het spel start hoe dan ook.

Je kunt de download ook direct `fatbike.glb` noemen en het uitdunnen overslaan.
Dat werkt, maar een model uit een image-to-3D dienst komt met een paar miljoen
driehoeken binnen. Dat is een factor honderd te veel voor iets dat op een
telefoon zestig pixels hoog in beeld staat.

## Wat het uitdunnen doet

`npm run model` gebruikt gltf-transform: vereenvoudigt de mesh met behoud van het
silhouet, verkleint de texturen naar 1024 en comprimeert met Draco en WebP. Wil
je meer of minder detail, geef dan een foutmarge mee; hoger is grover:

```
npm run model public/modellen/fatbike-ruw.glb public/modellen/fatbike.glb 0.02
```

## Wat de loader zelf regelt

- **Schaal.** Het model wordt naar 1,94 m lengte geschaald, wat de generator ook
  teruggeeft.
- **Richting.** De langste as wordt de lengterichting en komt langs de z-as te
  liggen.
- **Nulpunt.** Het model wordt gecentreerd en op de grond gezet.
- **Normalen.** Ontbreken ze, dan worden ze berekend.

## Draaiende wielen

De wielen moeten **losse onderdelen** zijn, anders draaien ze niet mee. Bij Meshy
heet die optie Splitsen, en die zit achter de betaalmuur. Zonder dat laadt het
model prima maar staan de wielen stil; de console zegt het er dan bij.

De loader zoekt de wielen eerst op naam (`wiel`, `wheel`, `tyre`, `tire`, `band`,
`rim`, `velg`) en anders op vorm: een rond, plat onderdeel voor- en achteraan.

## Licentie

Meshy levert op het gratis plan onder **CC BY 4.0**. Naamsvermelding is dan
verplicht en hoort in het creditsscherm, naast OpenStreetMap en 3DBAG.
