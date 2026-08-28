import { cachedZone, loadIndex, loadZone, straatAt } from "../map/loadZone.ts";
import { ROUTE_STEP, type Zone, type ZoneIndexEntry } from "../map/types.ts";
import { maakProcedureleZone } from "./procedureel.ts";
import { ZICHT } from "./constanten.ts";

export interface Segment {
  readonly zone: Zone;
  /** Global arc length where this segment starts. */
  readonly begin: number;
  readonly eind: number;
  /** Streaming cursors into the zone's parallel arrays. */
  gebouwCursor: number;
  waterCursor: number;
  boomCursor: number;
  brugCursor: number;
  /** Whether the follow-up zone has been requested yet. */
  voorgeladen: boolean;
  /** Rotation that lines this zone up behind the previous one, radians. */
  readonly draai: number;
  /** World offset of this zone's first route point in trace space. */
  readonly tx: number;
  readonly tz: number;
}

export interface SpoorPunt {
  readonly x: number;
  readonly z: number;
}

/** One trace sample per this many metres. */
const SPOOR_STAP = 10;

/**
 * The endless track. Real zones are chained end to end with a running offset;
 * once every zone has been used the list loops from the start. A zone that will
 * not load is silently replaced by a procedural one, so the run continues.
 */
export class Baan {
  private readonly segmenten: Segment[] = [];
  private volgorde: readonly ZoneIndexEntry[] = [];
  private teller = 0;
  private procedureelTeller = 0;
  private laadt = false;
  /**
   * The ridden line, accumulated as the player advances. Segments are dropped
   * from memory once they are behind, so the end screen cannot reconstruct the
   * route from them; this keeps it cheaply and exactly.
   */
  private readonly spoorPunten: SpoorPunt[] = [];
  private laatsteSpoorS = -Infinity;

  /** How many zones came from real map data, for the credits line. */
  echteZones = 0;
  procedureleZones = 0;

  async start(): Promise<void> {
    const index = await loadIndex();
    this.volgorde = index?.zones ?? [];
    await this.voegToe();
  }

  /**
   * Start over. The whole chain has to go, not just the trace: arc length runs
   * from zero again, so segments still carrying the previous run's offsets would
   * put the player nowhere. Downloaded zones stay cached, so this is cheap.
   */
  herstel(): void {
    this.spoorPunten.length = 0;
    this.laatsteSpoorS = -Infinity;
    this.segmenten.length = 0;
    this.teller = 0;
    this.procedureelTeller = 0;
    this.echteZones = 0;
    this.procedureleZones = 0;
    // Restarting must not leave the world empty for a frame, and after the
    // first run every zone is already in memory, so take the direct path.
    if (!this.voegDirectToe()) void this.voegToe();
  }

  /** Map a segment-local route point into the continuous trace space. */
  private naarSpoor(seg: Segment, i: number): SpoorPunt {
    const route = seg.zone.route;
    const c = Math.cos(seg.draai);
    const sn = Math.sin(seg.draai);
    const dx = route.x[i]! - route.x[0]!;
    const dz = route.z[i]! - route.z[0]!;
    return {
      x: seg.tx + dx * c - dz * sn,
      z: seg.tz + dx * sn + dz * c,
    };
  }

  get segmentLijst(): readonly Segment[] {
    return this.segmenten;
  }

  get einde(): number {
    const laatste = this.segmenten[this.segmenten.length - 1];
    return laatste ? laatste.eind : 0;
  }

  /** Segment covering a global arc length, or the last one past the end. */
  segmentBij(s: number): Segment | null {
    for (const seg of this.segmenten) {
      if (s >= seg.begin && s < seg.eind) return seg;
    }
    return this.segmenten[this.segmenten.length - 1] ?? null;
  }

  straatBij(s: number): string {
    const seg = this.segmentBij(s);
    if (!seg) return "";
    return straatAt(seg.zone, Math.max(0, s - seg.begin));
  }

  zoneNaamBij(s: number): string {
    return this.segmentBij(s)?.zone.naam ?? "";
  }

  /** Smoothed curvature in rad/m at a global arc length. */
  krommingBij(s: number): number {
    const seg = this.segmentBij(s);
    if (!seg) return 0;
    const lokaal = s - seg.begin;
    const f = lokaal / ROUTE_STEP;
    const i = Math.floor(f);
    const route = seg.zone.route;
    if (i < 0) return route.kromming[0] ?? 0;
    if (i >= route.n - 1) return route.kromming[route.n - 1] ?? 0;
    const a = route.kromming[i]!;
    const b = route.kromming[i + 1]!;
    return a + (b - a) * (f - i);
  }

  /** Called every frame; appends and preloads as the player advances. */
  onderhoud(sSpeler: number): void {
    const huidig = this.segmentBij(sSpeler);

    if (huidig && sSpeler - this.laatsteSpoorS >= SPOOR_STAP) {
      this.laatsteSpoorS = sSpeler;
      const i = Math.max(
        0,
        Math.min(huidig.zone.route.n - 1, Math.round((sSpeler - huidig.begin) / ROUTE_STEP)),
      );
      this.spoorPunten.push(this.naarSpoor(huidig, i));
    }

    if (huidig && !huidig.voorgeladen) {
      const door = (sSpeler - huidig.begin) / (huidig.eind - huidig.begin);
      if (door > 0.7) {
        huidig.voorgeladen = true;
        void this.voegToe();
      }
    }
    // Safety net: never let the horizon outrun the data.
    if (this.einde < sSpeler + ZICHT * 1.5) void this.voegToe();

    // Last resort. If the horizon is genuinely about to run dry, a download is
    // too slow or has failed; drop in a procedural zone now rather than let the
    // world freeze on the tail of the last one.
    if (this.einde < sSpeler + ZICHT * 0.5 && !this.voegDirectToe()) {
      this.hangAan(maakProcedureleZone(this.procedureelTeller++), false);
    }

    // Drop segments the player has fully left behind.
    while (this.segmenten.length > 2 && this.segmenten[0]!.eind < sSpeler - 200) {
      this.segmenten.shift();
    }
  }

  /** Id of the zone that comes next in the rotation, without consuming it. */
  private volgendeId(): string | null {
    if (this.volgorde.length === 0) return null;
    return this.volgorde[this.teller % this.volgorde.length]!.id;
  }

  /** Append without waiting, when the zone is already decoded. */
  private voegDirectToe(): boolean {
    const id = this.volgendeId();
    if (!id) return false;
    const zone = cachedZone(id);
    if (!zone) return false;
    this.teller++;
    this.hangAan(zone, true);
    return true;
  }

  private async voegToe(): Promise<void> {
    if (this.laadt) return;
    if (this.voegDirectToe()) return;

    this.laadt = true;
    try {
      let zone: Zone | null = null;
      const id = this.volgendeId();
      if (id) {
        this.teller++;
        zone = await loadZone(id);
      }
      this.hangAan(zone ?? maakProcedureleZone(this.procedureelTeller++), zone !== null);
    } finally {
      this.laadt = false;
    }
  }

  /**
   * Line a zone up behind the previous one: start where that one ended and carry
   * on in the direction it was heading.
   */
  private hangAan(zone: Zone, echt: boolean): void {
    if (echt) this.echteZones++;
    else this.procedureleZones++;

    const vorige = this.segmenten[this.segmenten.length - 1];
    let draai = 0;
    let tx = 0;
    let tz = 0;
    if (vorige) {
      const route = vorige.zone.route;
      const laatst = route.n - 1;
      const staart = this.naarSpoor(vorige, laatst);
      // The trace heading at the old tail must equal the trace heading at the
      // new head: draai + heading is the same on both sides of the seam.
      draai = vorige.draai + route.heading[laatst]! - zone.route.heading[0]!;
      tx = staart.x;
      tz = staart.z;
    }

    const begin = this.einde;
    this.segmenten.push({
      zone,
      begin,
      eind: begin + zone.lengte,
      gebouwCursor: 0,
      waterCursor: 0,
      boomCursor: 0,
      brugCursor: 0,
      voorgeladen: false,
      draai,
      tx,
      tz,
    });
  }

  /** Rail crossings within a global window, for biasing obstacle placement. */
  railsIn(vanS: number, totS: number): number[] {
    const uit: number[] = [];
    for (const seg of this.segmenten) {
      if (seg.eind < vanS || seg.begin > totS) continue;
      for (const rail of seg.zone.rails) {
        const globaal = seg.begin + rail.s;
        if (globaal >= vanS && globaal <= totS) uit.push(globaal);
      }
    }
    return uit;
  }

  /** The line actually ridden, for the end screen. */
  spoor(totS: number): readonly SpoorPunt[] {
    const huidig = this.segmentBij(totS);
    if (!huidig) return this.spoorPunten;
    // Finish on the exact spot where the run ended, not on the last sample.
    const i = Math.max(
      0,
      Math.min(huidig.zone.route.n - 1, Math.round((totS - huidig.begin) / ROUTE_STEP)),
    );
    return [...this.spoorPunten, this.naarSpoor(huidig, i)];
  }
}
