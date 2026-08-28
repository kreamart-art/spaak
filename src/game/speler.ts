import * as THREE from "three";
import {
  TRAPAS,
  TRAP_STRAAL,
  WIEL_STRAAL,
  maakFatbike,
  maakTrappers,
  type Fatbike,
} from "./fatbike.ts";
import {
  FIGUUR_ZIT_Y,
  FIGUUR_ZIT_Z,
  maakFiguur,
  type Figuur,
} from "./figuur.ts";
import { laadFiets, type GeladenFiets } from "./model.ts";
import {
  BAANWISSEL_DUUR,
  BAAN_X,
  BUK_DUUR,
  SPELER_BREEDTE,
  SPELER_GEBUKT,
  SPELER_HOOGTE,
  SPRONG_DUUR,
  SPRONG_HOOGTE,
} from "./constanten.ts";

export type Beweging = "links" | "rechts" | "spring" | "buk";

export interface Doos {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly halfB: number;
  readonly halfH: number;
  readonly halfD: number;
}

/**
 * The rider. Stays at z = 0 for the whole run; only x, y and pose change.
 * The bend shader is deliberately not attached here: the player is the one
 * thing that must stay exactly where collision says it is.
 */
export class Speler {
  readonly groep = new THREE.Group();
  private readonly figuur: Figuur;
  private readonly fiets: Fatbike;
  /** A generated mesh, once one has been dropped into public/modellen. */
  private geladen: GeladenFiets | null = null;
  private readonly trapAs: THREE.Group;
  private trapHoek = 0;
  private readonly trapper = new THREE.Vector3();
  private readonly trapasPositie = new THREE.Vector3(TRAPAS[0], TRAPAS[1], TRAPAS[2]);
  private greepLinks: THREE.Vector3 | null = null;
  private greepRechts: THREE.Vector3 | null = null;

  baan = 1;
  private vorigeBaan = 1;
  private wisselTijd = BAANWISSEL_DUUR;
  private sprongTijd = SPRONG_DUUR;
  private bukTijd = BUK_DUUR;

  constructor() {
    this.fiets = maakFatbike();
    this.groep.add(this.fiets.groep);

    const trappers = maakTrappers();
    this.trapAs = trappers.as;
    this.groep.add(this.trapAs);

    this.figuur = maakFiguur();
    this.groep.add(this.figuur.groep);

    this.groep.position.set(BAAN_X[1]!, 0, 0);

    // If a generated bike is present it takes over; if not, nothing happens and
    // the built-in one stays. Either way the run starts on time.
    void this.wisselNaarModel();
  }

  private async wisselNaarModel(): Promise<void> {
    const model = await laadFiets();
    if (!model) return;
    this.geladen = model;
    this.fiets.groep.visible = false;
    this.groep.add(model.groep);
    this.groep.add(model.accenten);

    // The cranks stay: the generated ones are static geometry, so without these
    // the rider's feet would circle over nothing.
    this.trapAs.position.copy(model.trapas);

    // Sit the rider ON this bike's bench, not in it and not on the one it
    // replaced. The hip joint sits a little above the cushion, and a rider on a
    // bench seat sits just behind its front edge.
    this.figuur.groep.position.set(
      0,
      model.zadelTop.y + 0.07 - FIGUUR_ZIT_Y,
      model.zadelTop.z + 0.06 - FIGUUR_ZIT_Z,
    );
    this.trapasPositie.copy(model.trapas);

    // The grips, in the figure's own space, so the arm solver can reach them.
    const naarFiguur = (p: THREE.Vector3): THREE.Vector3 =>
      p.clone().sub(this.figuur.groep.position);
    const halveStuur = 0.26;
    this.greepLinks = naarFiguur(
      new THREE.Vector3(-halveStuur, model.stuurPunt.y, model.stuurPunt.z),
    );
    this.greepRechts = naarFiguur(
      new THREE.Vector3(halveStuur, model.stuurPunt.y, model.stuurPunt.z),
    );
    console.info(
      `[spaak] fatbike.glb geladen${model.draaibaar ? ", wielen draaien" : ", wielen staan vast"}.`,
    );
  }

  get springt(): boolean {
    return this.sprongTijd < SPRONG_DUUR;
  }

  get bukt(): boolean {
    return this.bukTijd < BUK_DUUR;
  }

  beweeg(wat: Beweging): void {
    if (wat === "links" && this.baan > 0) {
      this.vorigeBaan = this.baan;
      this.baan--;
      this.wisselTijd = 0;
    } else if (wat === "rechts" && this.baan < BAAN_X.length - 1) {
      this.vorigeBaan = this.baan;
      this.baan++;
      this.wisselTijd = 0;
    } else if (wat === "spring" && !this.springt && !this.bukt) {
      this.sprongTijd = 0;
    } else if (wat === "buk" && !this.springt && !this.bukt) {
      this.bukTijd = 0;
    }
  }

  werkBij(dt: number, snelheid: number): void {
    this.wisselTijd = Math.min(BAANWISSEL_DUUR, this.wisselTijd + dt);
    this.sprongTijd = Math.min(SPRONG_DUUR, this.sprongTijd + dt);
    this.bukTijd = Math.min(BUK_DUUR, this.bukTijd + dt);

    const f = this.wisselTijd / BAANWISSEL_DUUR;
    const soepel = f * f * (3 - 2 * f);
    const van = BAAN_X[this.vorigeBaan]!;
    const naar = BAAN_X[this.baan]!;
    this.groep.position.x = van + (naar - van) * soepel;
    this.groep.rotation.z = (van - naar) * 0.16 * Math.sin(soepel * Math.PI);

    // A single arc, so the jump reads the same every time.
    const j = this.sprongTijd / SPRONG_DUUR;
    this.groep.position.y = this.springt ? Math.sin(j * Math.PI) * SPRONG_HOOGTE : 0;
    this.groep.rotation.x = this.springt ? -Math.sin(j * Math.PI) * 0.22 : 0;

    const b = this.bukTijd / BUK_DUUR;
    const duik = this.bukt ? Math.sin(b * Math.PI) : 0;
    this.figuur.bovenlijf.rotation.x = duik * 1.1;
    this.figuur.bovenlijf.position.y = -duik * 0.2;

    const rol = (snelheid * dt) / WIEL_STRAAL;
    if (this.geladen) {
      this.geladen.draaiWielen(-rol);
    } else {
      this.fiets.wielVoor.rotation.x -= rol;
      this.fiets.wielAchter.rotation.x -= rol;
    }

    // Cranks turn slower than the wheels; the feet follow the actual pedals and
    // the knees are solved from there.
    this.trapHoek += rol * 0.38;
    this.trapAs.rotation.x = this.trapHoek;
    for (const kant of [0, 1] as const) {
      const faze = this.trapHoek + kant * Math.PI;
      this.trapper.set(
        (kant === 0 ? -1 : 1) * 0.12,
        this.trapasPositie.y - Math.cos(faze) * TRAP_STRAAL,
        this.trapasPositie.z + Math.sin(faze) * TRAP_STRAAL,
      );
      this.figuur.zetBeen(kant, this.trapper);
    }

    // Hands follow the handlebars of whatever bike is under the rider.
    if (this.greepLinks && this.greepRechts) {
      this.figuur.zetArm(0, this.greepLinks);
      this.figuur.zetArm(1, this.greepRechts);
    }
  }

  /** Collision box in straight local space. The world bend never touches this. */
  doos(): Doos {
    const hoogte = this.bukt ? SPELER_GEBUKT : SPELER_HOOGTE;
    return {
      x: this.groep.position.x,
      y: this.groep.position.y,
      z: 0,
      halfB: SPELER_BREEDTE / 2,
      halfH: hoogte / 2,
      halfD: 0.55,
    };
  }

  herstel(): void {
    this.baan = 1;
    this.vorigeBaan = 1;
    this.wisselTijd = BAANWISSEL_DUUR;
    this.sprongTijd = SPRONG_DUUR;
    this.bukTijd = BUK_DUUR;
    this.groep.position.set(BAAN_X[1]!, 0, 0);
    this.groep.rotation.set(0, 0, 0);
    this.figuur.bovenlijf.rotation.set(0, 0, 0);
    this.figuur.bovenlijf.position.y = 0;
  }
}
