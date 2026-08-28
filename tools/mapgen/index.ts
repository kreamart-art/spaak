import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { ZONES, findZone } from "./zones.ts";
import { fetchZone } from "./overpass.ts";
import { Projector } from "./project.ts";
import { RouteError, buildRoute } from "./route.ts";
import { RouteIndex } from "./index_grid.ts";
import { Bag3D } from "./bag3d.ts";
import { laadBomen } from "./bomen.ts";
import {
  FALLBACK_LEVELS,
  MAX_T,
  MIN_FOOTPRINT,
  placeBridges,
  placeBuildings,
  placeRails,
  placeTrees,
  placeWater,
} from "./place.ts";
import { OUT_DIR, buildZoneData, writeIndex, writeZone } from "./emit.ts";
import type { ZoneConfig, ZoneIndexEntry } from "./types.ts";

/** Target size per zone, gzipped. Above this we tell the operator what to turn. */
const SIZE_TARGET = 200 * 1024;

interface Args {
  readonly zones: readonly ZoneConfig[];
  readonly refresh: boolean;
}

function parseArgs(argv: readonly string[]): Args {
  const refresh = argv.includes("--refresh");
  const zoneFlag = argv.indexOf("--zone");
  if (zoneFlag === -1) return { zones: ZONES, refresh };

  const id = argv[zoneFlag + 1];
  if (!id) {
    console.error("Gebruik: npm run mapgen -- --zone <id> [--refresh]");
    process.exit(1);
  }
  const zone = findZone(id);
  if (!zone) {
    console.error(
      `Onbekende zone "${id}". Beschikbaar: ${ZONES.map((z) => z.id).join(", ")}`,
    );
    process.exit(1);
  }
  return { zones: [zone], refresh };
}

function kb(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

async function runZone(zone: ZoneConfig, refresh: boolean): Promise<ZoneIndexEntry | null> {
  console.log(`\n=== ${zone.naam} (${zone.id}) ===`);

  const overpass = await fetchZone(zone, refresh);
  const proj = Projector.fromBBox(zone.bbox);

  let route;
  try {
    route = buildRoute(zone, overpass.elements, proj);
  } catch (err) {
    if (err instanceof RouteError) {
      console.error(`\n  ROUTE MISLUKT: ${err.message}`);
      console.error("  Wel gevonden straatnamen in deze bbox:");
      for (const naam of err.gevonden) console.error(`    - ${naam}`);
      return null;
    }
    throw err;
  }

  console.log(
    `  route: ${route.lengte.toFixed(0)} m over ${route.punten.length} punten ` +
      `(${route.straten.map((s) => s.naam).join(" -> ")})`,
  );

  const index = new RouteIndex(route.punten);
  const bag = await Bag3D.load(zone.id, zone.bbox, proj, refresh);

  const stadsbomen = await laadBomen(zone.id, zone.bbox, proj, refresh);

  const { gebouwen, stats } = placeBuildings(
    overpass.elements,
    proj,
    index,
    (p) => bag.pandAt(p),
  );
  const water = placeWater(overpass.elements, proj, index);
  const { bomen, bron: bomenBron } = placeTrees(
    stadsbomen,
    overpass.elements,
    proj,
    index,
  );
  const bruggen = placeBridges(overpass.elements, proj, index);
  const rails = placeRails(overpass.elements, proj, index);

  const data = buildZoneData({
    zone,
    origin: [proj.lat0, proj.lon0],
    punten: route.punten,
    gebouwen,
    water,
    bomen,
    bruggen,
    rails,
    straten: route.straten,
  });

  const written = await writeZone(data);

  console.log(`  gebouwen:  ${gebouwen.length}`);
  console.log(
    `  hoogtes:   ${stats.osm} uit OSM, ${stats.bag} uit 3DBAG, ` +
      `${stats.fallback} op de terugval van ${FALLBACK_LEVELS} verdiepingen`,
  );
  const kappen = gebouwen.filter((b) => b.kap > 0).length;
  const jaren = gebouwen.map((b) => b.bouwjaar).filter((j) => j > 0).sort((a, b) => a - b);
  console.log(
    `  daken:     ${kappen} met kap, ${gebouwen.length - kappen} plat` +
      (jaren.length
        ? `; bouwjaar ${jaren[0]} tot ${jaren[jaren.length - 1]}, mediaan ${jaren[jaren.length >> 1]}`
        : ""),
  );
  console.log(`  water:     ${water.length} doorsneden`);
  console.log(`  bomen:     ${bomen.length} (${bomenBron})`);
  console.log(`  bruggen:   ${bruggen.length}`);
  console.log(`  rails:     ${rails.length} kruisingen`);
  console.log(
    `  gefilterd: ${stats.teVer} panden buiten |t| ${MAX_T} m, ` +
      `${stats.teKlein} onder ${MIN_FOOTPRINT} m2, ` +
      `${stats.samengevoegd} samengevoegd, ` +
      `${stats.verdekt} verdekt achter een hogere voorste rij, ` +
      `${stats.verschoven} uit de baan geschoven`,
  );
  console.log(`  bestand:   ${written.path}`);
  console.log(`             ${kb(written.bytes)} ruw, ${kb(written.gzipped)} gzipped`);

  if (written.gzipped > SIZE_TARGET) {
    const over = ((written.gzipped / SIZE_TARGET - 1) * 100).toFixed(0);
    console.warn(
      `  LET OP: ${over}% boven het streefgetal van ${kb(SIZE_TARGET)}. ` +
        `Verhoog MIN_FOOTPRINT (nu ${MIN_FOOTPRINT} m2) of verlaag MAX_T ` +
        `(nu ${MAX_T} m) in tools/mapgen/place.ts.`,
    );
  }

  return {
    id: zone.id,
    naam: zone.naam,
    lengte: data.lengte,
    bytes: written.gzipped,
  };
}

async function main(): Promise<void> {
  const { zones, refresh } = parseArgs(process.argv.slice(2));
  const entries: ZoneIndexEntry[] = [];
  let failed = 0;

  for (const zone of zones) {
    const entry = await runZone(zone, refresh);
    if (entry) entries.push(entry);
    else failed++;
  }

  // Keep zones we did not rebuild in this run listed in the index.
  const indexPath = join(OUT_DIR, "index.json");
  if (existsSync(indexPath)) {
    const prev = JSON.parse(await readFile(indexPath, "utf8")) as {
      zones?: ZoneIndexEntry[];
    };
    for (const old of prev.zones ?? []) {
      if (!entries.some((e) => e.id === old.id) && findZone(old.id)) {
        entries.push(old);
      }
    }
  }

  entries.sort(
    (a, b) =>
      ZONES.findIndex((z) => z.id === a.id) - ZONES.findIndex((z) => z.id === b.id),
  );
  const path = await writeIndex(entries);
  console.log(`\nindex: ${path} (${entries.length} zones)`);

  if (failed > 0) {
    console.error(`\n${failed} zone(s) mislukt.`);
    process.exit(1);
  }
}

await main();
