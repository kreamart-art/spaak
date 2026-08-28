import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { BBox, OverpassResponse, ZoneConfig } from "./types.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(HERE, ".cache");

const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

function buildQuery(bbox: BBox): string {
  const b = bbox.join(",");
  // natural=water carries the actual canal outline; waterway=canal is only the
  // centreline and cannot tell you where a gracht narrows at a bridge.
  return `[out:json][timeout:180];
(
  way["waterway"="canal"](${b});
  way["natural"="water"](${b});
  relation["natural"="water"](${b});
  way["highway"~"cycleway|residential|living_street|pedestrian"](${b});
  way["railway"="tram"](${b});
  way["bridge"="yes"](${b});
  way["building"](${b});
  node["natural"="tree"](${b});
);
out geom;`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Overpass is a free, volunteer-run service. We cache every response on disk and
 * only ever hit the network when the cache is cold or --refresh is passed.
 */
export async function fetchZone(
  zone: ZoneConfig,
  refresh: boolean,
): Promise<OverpassResponse> {
  await mkdir(CACHE_DIR, { recursive: true });
  const cachePath = join(CACHE_DIR, `${zone.id}.json`);

  if (!refresh && existsSync(cachePath)) {
    const raw = await readFile(cachePath, "utf8");
    const parsed = JSON.parse(raw) as OverpassResponse;
    console.log(
      `  cache hit: ${cachePath} (${parsed.elements.length} elements)`,
    );
    return parsed;
  }

  const query = buildQuery(zone.bbox);
  const maxAttempts = 5;
  let lastError = "";

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const endpoint = ENDPOINTS[attempt % ENDPOINTS.length]!;
    try {
      console.log(`  overpass request (poging ${attempt + 1}) -> ${endpoint}`);
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "spaak-mapgen/0.1 (offline asset pipeline)",
        },
        body: new URLSearchParams({ data: query }).toString(),
      });

      if (res.status === 429 || res.status === 504) {
        // Respect the throttle. Retry-After is in seconds when present.
        const retryAfter = Number(res.headers.get("retry-after"));
        const backoff = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : 2000 * 2 ** attempt;
        console.warn(
          `  ${res.status} van overpass, ${Math.round(backoff / 1000)}s wachten`,
        );
        await sleep(backoff);
        continue;
      }

      if (!res.ok) {
        lastError = `HTTP ${res.status} ${res.statusText}`;
        await sleep(2000 * 2 ** attempt);
        continue;
      }

      const text = await res.text();
      const parsed = JSON.parse(text) as OverpassResponse;
      if (!Array.isArray(parsed.elements)) {
        lastError = "respons zonder elements-array";
        continue;
      }
      await writeFile(cachePath, text, "utf8");
      console.log(
        `  ${parsed.elements.length} elements opgehaald, gecachet in ${cachePath}`,
      );
      return parsed;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      const backoff = 2000 * 2 ** attempt;
      console.warn(`  fout: ${lastError}, ${backoff / 1000}s wachten`);
      await sleep(backoff);
    }
  }

  throw new Error(
    `Overpass gaf na ${maxAttempts} pogingen niets bruikbaars voor zone "${zone.id}". Laatste fout: ${lastError}`,
  );
}
