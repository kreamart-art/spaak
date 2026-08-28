import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { Baan } from "./baan.ts";
import { Kromming } from "./kromming.ts";
import { Obstakels } from "./obstakels.ts";
import { Speler, type Beweging } from "./speler.ts";
import { Wereld } from "./wereld.ts";
import { maakMaterialen, maakWegTextuur } from "./materialen.ts";
import {
  BAAN_TOTAAL,
  CAMERA_FOV_H,
  CAMERA_FOV_V_MAX,
  CAMERA_FOV_V_MIN,
  CAMERA_KIJK_Y,
  CAMERA_KIJK_Z,
  CAMERA_Y,
  CAMERA_Z,
  KROMMING_LERP,
  KROMMING_WINST,
  MAX_GEVELS,
  MAX_SNELHEID,
  METER_PUNTEN,
  MIN_ZICHT,
  MIST_BASIS,
  MIST_BOCHT,
  START_SNELHEID,
  STROOPWAFEL_PUNTEN,
  VERSNELLING,
  ZICHT,
} from "./constanten.ts";

export type Toestand = "klaar" | "loopt" | "voorbij";

export interface Status {
  readonly toestand: Toestand;
  readonly afstand: number;
  readonly punten: number;
  readonly wafels: number;
  readonly snelheid: number;
  readonly straat: string;
  readonly zone: string;
}

export interface Uitslag {
  readonly afstand: number;
  readonly punten: number;
  readonly wafels: number;
  readonly straat: string;
  readonly zone: string;
  readonly spoor: readonly { x: number; z: number }[];
}

/** Overcast Amsterdam daylight. The fog and the sky share this exactly, so the
 *  horizon dissolves instead of showing the edge of the ground plane. */
const HORIZON = 0xa9bccc;

export class Spaak {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly mist: THREE.FogExp2;
  private readonly kromming = new Kromming();
  private readonly baan = new Baan();
  private readonly wereld: Wereld;
  private readonly speler = new Speler();
  private readonly obstakels: Obstakels;
  private readonly wegTextuur: THREE.Texture;

  private toestand: Toestand = "klaar";
  private sSpeler = 0;
  private snelheid = START_SNELHEID;
  private punten = 0;
  private wafels = 0;
  private zicht = ZICHT;
  private vorigeTijd = 0;
  private lus = 0;
  private schokTijd = 0;

  opStatus: ((status: Status) => void) | null = null;
  opEinde: ((uitslag: Uitslag) => void) | null = null;

  constructor(private readonly doek: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas: doek,
      antialias: window.devicePixelRatio < 2,
      powerPreference: "high-performance",
      // Only in development, so a frame can be read back for a visual check.
      preserveDrawingBuffer: import.meta.env.DEV,
    });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));

    this.scene.background = new THREE.Color(HORIZON);
    this.mist = new THREE.FogExp2(HORIZON, MIST_BASIS);
    this.scene.fog = this.mist;

    this.camera = new THREE.PerspectiveCamera(CAMERA_FOV_V_MIN, 1, 0.5, 420);
    this.camera.position.set(0, CAMERA_Y, CAMERA_Z);
    this.camera.lookAt(0, CAMERA_KIJK_Y, CAMERA_KIJK_Z);

    // The player's materials are physically shaded, and PBR without something
    // to reflect is just flat colour again. A generated room is enough to give
    // black paint and brushed metal something to catch.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.55;
    pmrem.dispose();

    const lucht = new THREE.HemisphereLight(0xe8f2fb, 0x6d6355, 2.1);
    this.scene.add(lucht);
    const zon = new THREE.DirectionalLight(0xfff3e0, 1.9);
    zon.position.set(-0.6, 1, 0.35);
    this.scene.add(zon);
    // A second, dimmer light from the other side so the shaded facade wall does
    // not go flat black when the sun is behind it.
    const tegenlicht = new THREE.DirectionalLight(0xcfe0f0, 0.5);
    tegenlicht.position.set(0.8, 0.5, -0.4);
    this.scene.add(tegenlicht);

    this.wegTextuur = maakWegTextuur();
    const mat = maakMaterialen(this.kromming, this.wegTextuur);
    this.bouwGrond(mat);

    this.wereld = new Wereld(this.scene, mat);
    this.obstakels = new Obstakels(this.scene, this.kromming);
    this.scene.add(this.speler.groep);

    void this.baan.start();
    this.meet();
  }

  /**
   * Everything long needs segments along z: the bend is a per-vertex offset, so
   * a two-vertex strip would bend as a straight line between its ends.
   */
  private bouwGrond(mat: ReturnType<typeof maakMaterialen>): void {
    const grond = new THREE.Mesh(new THREE.PlaneGeometry(760, 460, 1, 96), mat.grond);
    grond.rotation.x = -Math.PI / 2;
    grond.position.set(0, -0.03, -170);
    this.scene.add(grond);

    const weg = new THREE.Mesh(
      new THREE.PlaneGeometry(BAAN_TOTAAL, 460, 1, 96),
      mat.weg,
    );
    weg.rotation.x = -Math.PI / 2;
    weg.position.set(0, 0.015, -170);
    this.scene.add(weg);
    this.wegTextuur.repeat.set(1, 460 / 6);

    for (const kant of [-1, 1]) {
      const rand = new THREE.Mesh(
        new THREE.PlaneGeometry(0.34, 460, 1, 96),
        mat.kade,
      );
      rand.rotation.x = -Math.PI / 2;
      rand.position.set((kant * BAAN_TOTAAL) / 2, 0.03, -170);
      this.scene.add(rand);
    }
  }

  meet(): void {
    const b = this.doek.getBoundingClientRect();
    const w = Math.round(b.width);
    const h = Math.round(b.height);
    // An element that is hidden or not laid out yet reports 0. Sizing the
    // drawing buffer to that collapses it to a single pixel and no later event
    // brings it back, so wait for a real size instead.
    if (w < 2 || h < 2) return;
    this.renderer.setSize(w, h, false);
    const aspect = w / h;
    this.camera.aspect = aspect;

    // Derive the vertical fov from the horizontal one we actually want.
    const halveH = (CAMERA_FOV_H * Math.PI) / 360;
    const halveV = Math.atan(Math.tan(halveH) / aspect);
    const graden = (halveV * 360) / Math.PI;
    this.camera.fov = Math.min(
      CAMERA_FOV_V_MAX,
      Math.max(CAMERA_FOV_V_MIN, graden),
    );
    this.camera.updateProjectionMatrix();
  }

  begin(): void {
    this.toestand = "loopt";
    this.sSpeler = 0;
    this.snelheid = START_SNELHEID;
    this.punten = 0;
    this.wafels = 0;
    this.zicht = ZICHT;
    this.schokTijd = 0;
    this.speler.herstel();
    this.baan.herstel();
    this.wereld.leeg();
    this.obstakels.herstel(Math.floor(Math.random() * 100000));
    this.vorigeTijd = performance.now();
    this.meld();
  }

  beweeg(wat: Beweging): void {
    if (this.toestand !== "loopt") return;
    this.speler.beweeg(wat);
  }

  start(): void {
    if (this.lus) return;
    this.vorigeTijd = performance.now();
    const stap = (nu: number): void => {
      this.lus = requestAnimationFrame(stap);
      const dt = Math.min(0.05, (nu - this.vorigeTijd) / 1000);
      this.vorigeTijd = nu;
      this.stap(dt);
    };
    this.lus = requestAnimationFrame(stap);
  }

  stop(): void {
    if (this.lus) cancelAnimationFrame(this.lus);
    this.lus = 0;
  }

  /**
   * One simulation frame plus one render. Kept separate from the animation
   * frame driver so the engine can be stepped by anything, including a test.
   */
  stap(dt: number): void {
    if (this.toestand === "loopt") {
      this.snelheid = Math.min(MAX_SNELHEID, this.snelheid + VERSNELLING * dt);
      this.sSpeler += this.snelheid * dt;
      this.punten += this.snelheid * dt * METER_PUNTEN;
    }

    this.baan.onderhoud(this.sSpeler);

    // Frame budget: shrink the horizon rather than grow the pool.
    // Wide hysteresis on purpose: a narrow band lets the horizon settle exactly
    // on the threshold and stay there, stuck at the minimum for no reason.
    if (this.wereld.zichtbareGevels >= MAX_GEVELS - 1 && this.zicht > MIN_ZICHT) {
      this.zicht = Math.max(MIN_ZICHT, this.zicht - 12 * dt * 60);
    } else if (this.wereld.zichtbareGevels < MAX_GEVELS * 0.8 && this.zicht < ZICHT) {
      this.zicht = Math.min(ZICHT, this.zicht + 4 * dt * 60);
    }

    this.wereld.werkBij(this.baan, this.sSpeler, this.zicht);
    this.obstakels.werkBij(this.baan, this.sSpeler, this.zicht, this.snelheid, dt);
    this.speler.werkBij(dt, this.snelheid);

    // Visual bend from the map, plus fog that closes in through a corner so the
    // horizon falls away instead of clipping.
    const ruw = this.baan.krommingBij(this.sSpeler + 45);
    this.kromming.richt(ruw * KROMMING_WINST, 0);
    this.kromming.werkBij(dt, KROMMING_LERP);
    this.mist.density =
      MIST_BASIS + Math.abs(this.kromming.huidig) * MIST_BOCHT;

    this.wegTextuur.offset.y = (this.sSpeler / 6) % 1;

    if (this.toestand === "loopt") {
      const doos = this.speler.doos();
      const geraakt = this.obstakels.raakt(doos, this.sSpeler);
      const geoogst = this.obstakels.oogst(doos, this.sSpeler);
      if (geoogst > 0) {
        this.wafels += geoogst;
        this.punten += geoogst * STROOPWAFEL_PUNTEN;
      }
      if (geraakt) this.eindig();
      this.meld();
    }

    if (this.schokTijd > 0) {
      this.schokTijd = Math.max(0, this.schokTijd - dt);
      const k = this.schokTijd * 0.9;
      this.camera.position.x = (Math.random() - 0.5) * k;
      this.camera.position.y = CAMERA_Y + (Math.random() - 0.5) * k;
    } else {
      // The camera drifts a little with the bend, which sells the corner.
      this.camera.position.x += (this.kromming.huidig * -0.55 - this.camera.position.x) * Math.min(1, dt * 3);
      this.camera.position.y = CAMERA_Y;
    }
    // Set every frame rather than once at construction: nothing else may decide
    // how far back the camera sits.
    this.camera.position.z = CAMERA_Z;
    this.camera.lookAt(this.camera.position.x * 0.4, CAMERA_KIJK_Y, CAMERA_KIJK_Z);

    this.renderer.render(this.scene, this.camera);
  }

  private eindig(): void {
    this.toestand = "voorbij";
    this.schokTijd = 0.5;
    this.meld();
    this.opEinde?.({
      afstand: Math.round(this.sSpeler),
      punten: Math.round(this.punten),
      wafels: this.wafels,
      straat: this.baan.straatBij(this.sSpeler),
      zone: this.baan.zoneNaamBij(this.sSpeler),
      spoor: this.baan.spoor(this.sSpeler),
    });
  }

  private meld(): void {
    this.opStatus?.({
      toestand: this.toestand,
      afstand: Math.round(this.sSpeler),
      punten: Math.round(this.punten),
      wafels: this.wafels,
      snelheid: this.snelheid,
      straat: this.baan.straatBij(this.sSpeler),
      zone: this.baan.zoneNaamBij(this.sSpeler),
    });
  }

  /** Development handle for the debug console; not used by the game itself. */
  get diagnose(): Record<string, unknown> {
    return {
      toestand: this.toestand,
      sSpeler: Math.round(this.sSpeler),
      zicht: this.zicht,
      zichtbareGevels: this.wereld.zichtbareGevels,
      kromming: Number(this.kromming.huidig.toFixed(3)),
      ruweKromming: Number(this.baan.krommingBij(this.sSpeler + 45).toFixed(5)),
      mist: Number(this.mist.density.toFixed(5)),
      straat: this.baan.straatBij(this.sSpeler),
      obstakels: this.obstakels.vooruit(this.sSpeler, 70),
      segmenten: this.baan.segmentLijst.map((seg) => ({
        zone: seg.zone.id,
        begin: seg.begin,
        eind: seg.eind,
        gebouwen: `${seg.gebouwCursor}/${seg.zone.gebouwen.n}`,
        water: `${seg.waterCursor}/${seg.zone.water.n}`,
        bomen: `${seg.boomCursor}/${seg.zone.bomen.n}`,
        bruggen: `${seg.brugCursor}/${seg.zone.bruggen.length}`,
      })),
    };
  }

  get bronnen(): { echt: number; procedureel: number } {
    return { echt: this.baan.echteZones, procedureel: this.baan.procedureleZones };
  }

  ruim(): void {
    this.stop();
    this.renderer.dispose();
  }
}
