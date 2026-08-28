# Gegenereerde modellen

`fatbike.glb` en `stroopwafel.glb` worden automatisch opgepakt zodra ze hier
staan. Ontbreken ze, dan gebruikt het spel de in code gebouwde versies en start
het gewoon.

## Van generator naar spel

1. Genereer in Meshy met **multi-view** en **structuur** (textuur) aan.
   **Splitsen hoef je niet**: dat levert een gesegmenteerd model zonder textuur,
   en de wielen worden hier toch uit de mesh gesneden.
2. Download als GLB en zet neer in `tools/modellen-bron/` (niet in `public/`,
   want Vite kopieert dat integraal naar de build).
3. Draai:

   ```
   npm run model tools/modellen-bron/fatbike-textuur.glb public/modellen/fatbike.glb 0.012 1024
   npm run model tools/modellen-bron/stroopwafel-ruw.glb public/modellen/stroopwafel.glb 0.0006 512
   ```

   Weld, vereenvoudig, texturen verkleinen, naar webp. Van ~2 miljoen driehoeken
   en 2K-maps naar 24k en 1024 voor de fiets, en naar 4k en 512 voor de wafel.
   De laatste twee getallen zijn de behoudratio en de texturemaat.

## Wat de loader zelf uitzoekt

Alles op **vorm**, niets op naam, want de export levert een naamloze mesh.

- **Richting.** De langste as wordt de lengte. Het hoogste punt van het model is
  het stuur, en dat zit vooraan; ligt het achter het midden, dan gaat de fiets
  180 graden om.
- **Wielen.** De contactvlakken op de grond geven de asposities. De straal volgt
  uit de koordbreedte laag bij de grond: voor een cirkel geldt
  `r = (c² + y²) / 2y`, en daar beneden staat alleen band, geen frame.
- **Uitsnijden.** Driehoeken binnen die schijf en binnen de bandbreedte worden
  een eigen mesh, met UV's, dus de textuur blijft. Net binnen de buitenrand
  gesneden, anders scheuren spatbord en vork doormidden.
- **Draaien.** Elk wiel krijgt een pivot-groep op de gemeten as, en draait om de
  as die in zijn eigen ruimte overeenkomt met de wereld-x.
- **Zadel en stuur.** Het hoogste vlakke deel achter het stuur is de bank; de
  fietser gaat op het voorste derde daarvan zitten en zijn armen reiken via IK
  naar de handvatten.
- **Materiaal.** Heeft het model een textuur, dan blijft die. Zo niet, dan
  krijgt elk onderdeel een eigen materiaal en worden de kruisen, het woordmerk,
  de remschijven en het achterlicht erop gezet.

## Licentie

Meshy levert op het gratis plan onder **CC BY 4.0**. Naamsvermelding hoort dan in
het creditsscherm, naast OpenStreetMap en 3DBAG.
