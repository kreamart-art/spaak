import * as THREE from "three";
import type { Baan, Segment } from "./baan.ts";
import type { Materialen } from "./materialen.ts";
import { GEVEL_PALET, KAP_PALET } from "./materialen.ts";
import { JAAR_ATTRIBUUT, LAGEN_ATTRIBUUT } from "./gevel.ts";
import { MAX_GEVELS, RECYCLE } from "./constanten.ts";

const WATER_POOL = 56;
const BOOM_POOL = 96;
const BRUG_POOL = 3;

interface Slot {
  actief: boolean;
  /** Global arc length of the object, for recycling. */
  s: number;
}

const HULP = new THREE.Object3D();
const KLEUR = new THREE.Color();

/**
 * Streams decor out of the zone data into fixed pools. Nothing is ever created
 * or destroyed during a run; a cursor walks the sorted arrays and slots are
 * reused as soon as they fall behind the player.
 */
export class Wereld {
  private readonly gevels: THREE.InstancedMesh;
  private readonly gevelLagen: THREE.InstancedBufferAttribute;
  private readonly gevelJaar: THREE.InstancedBufferAttribute;
  private readonly kappen: THREE.InstancedMesh;
  private readonly gevelSlots: Slot[] = [];
  private readonly water: THREE.InstancedMesh;
  private readonly waterSlots: Slot[] = [];
  private readonly stammen: THREE.InstancedMesh;
  private readonly kruinen: THREE.InstancedMesh;
  private readonly boomSlots: Slot[] = [];
  private readonly bruggen: {
    groep: THREE.Group;
    bord: THREE.Mesh;
    doek: HTMLCanvasElement;
    textuur: THREE.CanvasTexture;
    slot: Slot;
  }[] = [];

  /** Facade meshes currently on screen, used by the frame budget. */
  zichtbareGevels = 0;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly mat: Materialen,
  ) {
    const doos = new THREE.BoxGeometry(1, 1, 1);
    doos.translate(0, 0.5, 0);

    this.gevels = new THREE.InstancedMesh(doos, mat.gevel, MAX_GEVELS);
    this.gevels.frustumCulled = false;
    this.gevels.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.gevels.castShadow = false;

    // Per-instance storey count and year, so the facade shader can line the
    // window rows up with the real floors of the real building.
    this.gevelLagen = new THREE.InstancedBufferAttribute(
      new Float32Array(MAX_GEVELS),
      1,
    );
    this.gevelJaar = new THREE.InstancedBufferAttribute(
      new Float32Array(MAX_GEVELS),
      1,
    );
    this.gevelLagen.setUsage(THREE.DynamicDrawUsage);
    this.gevelJaar.setUsage(THREE.DynamicDrawUsage);
    doos.setAttribute(LAGEN_ATTRIBUUT, this.gevelLagen);
    doos.setAttribute(JAAR_ATTRIBUUT, this.gevelJaar);
    scene.add(this.gevels);

    // The Amsterdam silhouette: a gable whose ridge runs away from the street.
    this.kappen = new THREE.InstancedMesh(kapGeometrie(), mat.kap, MAX_GEVELS);
    this.kappen.frustumCulled = false;
    this.kappen.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.kappen);

    for (let i = 0; i < MAX_GEVELS; i++) {
      this.gevelSlots.push({ actief: false, s: 0 });
      this.verbergInstantie(this.gevels, i);
      this.verbergInstantie(this.kappen, i);
    }

    const plak = new THREE.BoxGeometry(1, 1, 1);
    this.water = new THREE.InstancedMesh(plak, mat.water, WATER_POOL);
    this.water.frustumCulled = false;
    this.water.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.water);
    for (let i = 0; i < WATER_POOL; i++) {
      this.waterSlots.push({ actief: false, s: 0 });
      this.verbergInstantie(this.water, i);
    }

    const stam = new THREE.CylinderGeometry(0.15, 0.26, 1, 6);
    stam.translate(0, 0.5, 0);
    this.stammen = new THREE.InstancedMesh(stam, mat.stam, BOOM_POOL);
    this.stammen.frustumCulled = false;
    this.stammen.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.stammen);

    // One subdivision is the difference between a crown and a boulder.
    const kruin = new THREE.IcosahedronGeometry(1, 1);
    this.kruinen = new THREE.InstancedMesh(kruin, mat.kruin, BOOM_POOL);
    this.kruinen.frustumCulled = false;
    this.kruinen.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.kruinen);

    for (let i = 0; i < BOOM_POOL; i++) {
      this.boomSlots.push({ actief: false, s: 0 });
      this.verbergInstantie(this.stammen, i);
      this.verbergInstantie(this.kruinen, i);
    }

    for (let i = 0; i < BRUG_POOL; i++) this.bruggen.push(this.maakBrug());
  }

  private verbergInstantie(mesh: THREE.InstancedMesh, i: number): void {
    HULP.position.set(0, -9999, 0);
    HULP.rotation.set(0, 0, 0);
    HULP.scale.set(0.0001, 0.0001, 0.0001);
    HULP.updateMatrix();
    mesh.setMatrixAt(i, HULP.matrix);
  }

  /** A gate you run under, with the real bridge name on a board. */
  private maakBrug(): (typeof this.bruggen)[number] {
    const groep = new THREE.Group();
    groep.visible = false;

    const pijler = new THREE.BoxGeometry(1.6, 5.2, 3.2);
    for (const kant of [-1, 1]) {
      const m = new THREE.Mesh(pijler, this.mat.brug);
      m.position.set(kant * 6.2, 2.6, 0);
      groep.add(m);
    }

    const dek = new THREE.Mesh(new THREE.BoxGeometry(24, 0.9, 3.4), this.mat.brugDek);
    dek.position.set(0, 5.3, 0);
    groep.add(dek);

    const doek = document.createElement("canvas");
    doek.width = 512;
    doek.height = 96;
    const textuur = new THREE.CanvasTexture(doek);
    const bordMat = this.mat.bord.clone();
    bordMat.map = textuur;
    const bord = new THREE.Mesh(new THREE.PlaneGeometry(7.4, 1.4), bordMat);
    bord.position.set(0, 4.1, 1.8);
    groep.add(bord);

    this.scene.add(groep);
    return { groep, bord, doek, textuur, slot: { actief: false, s: 0 } };
  }

  private tekenBord(doek: HTMLCanvasElement, textuur: THREE.CanvasTexture, naam: string): void {
    const g = doek.getContext("2d")!;
    g.clearRect(0, 0, 512, 96);
    g.fillStyle = "#0f2a52";
    g.fillRect(0, 0, 512, 96);
    g.strokeStyle = "#e9edf2";
    g.lineWidth = 4;
    g.strokeRect(7, 7, 498, 82);
    g.fillStyle = "#f3f6f9";
    g.font = "600 44px ui-sans-serif, system-ui, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    let tekst = naam;
    while (g.measureText(tekst).width > 460 && tekst.length > 4) {
      tekst = tekst.slice(0, -1);
    }
    g.fillText(tekst, 256, 52);
    textuur.needsUpdate = true;
  }

  /** Stream everything between the player and the horizon. */
  werkBij(baan: Baan, sSpeler: number, zicht: number): void {
    const tot = sSpeler + zicht;
    const achter = sSpeler - RECYCLE;

    for (const seg of baan.segmentLijst) {
      if (seg.eind < achter || seg.begin > tot) continue;
      this.streamGevels(seg, sSpeler, tot, achter);
      this.streamWater(seg, sSpeler, tot, achter);
      this.streamBomen(seg, sSpeler, tot, achter);
      this.streamBruggen(seg, sSpeler, tot, achter);
    }

    this.gevels.instanceMatrix.needsUpdate = true;
    if (this.gevels.instanceColor) this.gevels.instanceColor.needsUpdate = true;
    this.gevelLagen.needsUpdate = true;
    this.gevelJaar.needsUpdate = true;
    this.kappen.instanceMatrix.needsUpdate = true;
    if (this.kappen.instanceColor) this.kappen.instanceColor.needsUpdate = true;
    this.water.instanceMatrix.needsUpdate = true;
    this.stammen.instanceMatrix.needsUpdate = true;
    this.kruinen.instanceMatrix.needsUpdate = true;
  }

  private vrijSlot(slots: readonly Slot[], achter: number): number {
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i]!;
      if (!slot.actief || slot.s < achter) return i;
    }
    return -1;
  }

  private streamGevels(seg: Segment, sSpeler: number, tot: number, achter: number): void {
    const g = seg.zone.gebouwen;
    // Retire what fell behind first, so the cursor always has room.
    for (let i = 0; i < this.gevelSlots.length; i++) {
      const slot = this.gevelSlots[i]!;
      if (slot.actief && slot.s < achter) {
        slot.actief = false;
        this.verbergInstantie(this.gevels, i);
        this.verbergInstantie(this.kappen, i);
      }
    }

    while (seg.gebouwCursor < g.n) {
      const globaal = seg.begin + g.s[seg.gebouwCursor]!;
      if (globaal >= tot) break;
      if (globaal < achter) {
        seg.gebouwCursor++;
        continue;
      }
      const slot = this.vrijSlot(this.gevelSlots, achter);
      if (slot < 0) break;

      const i = seg.gebouwCursor;
      const t = g.t[i]!;
      const rot = g.rotatie[i]!;
      const breedte = g.breedte[i]!;
      const diepte = g.diepte[i]!;
      const hoogte = g.hoogte[i]!;
      const z = -(globaal - sSpeler);

      HULP.position.set(t, 0, z);
      HULP.rotation.set(0, rot, 0);
      HULP.scale.set(breedte, hoogte, diepte);
      HULP.updateMatrix();
      this.gevels.setMatrixAt(slot, HULP.matrix);
      KLEUR.setHex(GEVEL_PALET[(i * 7 + seg.begin) % GEVEL_PALET.length]!);
      this.gevels.setColorAt(slot, KLEUR);
      this.gevelLagen.setX(slot, g.bouwlagen[i]!);
      this.gevelJaar.setX(slot, g.bouwjaar[i]!);

      const kap = g.kap[i]!;
      if (kap > 0.1) {
        HULP.position.set(t, hoogte, z);
        HULP.rotation.set(0, rot, 0);
        // A slight overhang, the way a real roof sits on its walls.
        HULP.scale.set(breedte * 1.04, kap, diepte * 1.02);
        HULP.updateMatrix();
        this.kappen.setMatrixAt(slot, HULP.matrix);
        KLEUR.setHex(KAP_PALET[(i * 5 + seg.begin) % KAP_PALET.length]!);
        this.kappen.setColorAt(slot, KLEUR);
      } else {
        this.verbergInstantie(this.kappen, slot);
      }

      this.gevelSlots[slot] = { actief: true, s: globaal };
      seg.gebouwCursor++;
    }

    // Active slots ride along with the player every frame.
    for (let i = 0; i < this.gevelSlots.length; i++) {
      const slot = this.gevelSlots[i]!;
      if (!slot.actief) continue;
      for (const mesh of [this.gevels, this.kappen]) {
        mesh.getMatrixAt(i, HULP.matrix);
        HULP.matrix.decompose(HULP.position, HULP.quaternion, HULP.scale);
        if (HULP.scale.y < 0.001) continue;
        HULP.position.z = -(slot.s - sSpeler);
        HULP.updateMatrix();
        mesh.setMatrixAt(i, HULP.matrix);
      }
    }
    this.zichtbareGevels = this.gevelSlots.filter((s) => s.actief).length;
  }

  private streamWater(seg: Segment, sSpeler: number, tot: number, achter: number): void {
    const w = seg.zone.water;
    for (let i = 0; i < this.waterSlots.length; i++) {
      const slot = this.waterSlots[i]!;
      if (slot.actief && slot.s < achter) {
        slot.actief = false;
        this.verbergInstantie(this.water, i);
      }
    }

    while (seg.waterCursor < w.n) {
      const globaal = seg.begin + w.s[seg.waterCursor]!;
      if (globaal >= tot) break;
      if (globaal < achter) {
        seg.waterCursor++;
        continue;
      }
      const slot = this.vrijSlot(this.waterSlots, achter);
      if (slot < 0) break;
      const i = seg.waterCursor;
      const lo = w.tMin[i]!;
      const hi = w.tMax[i]!;
      // Scene x runs across the route and scene z along it, and the surface has
      // to clear the ground plane at y = -0.03 or the canal is buried under it.
      HULP.position.set((lo + hi) / 2, -0.2, -(globaal - sSpeler));
      HULP.rotation.set(0, 0, 0);
      HULP.scale.set(Math.max(0.5, hi - lo), 0.5, 4.4);
      HULP.updateMatrix();
      this.water.setMatrixAt(slot, HULP.matrix);
      this.waterSlots[slot] = { actief: true, s: globaal };
      seg.waterCursor++;
    }

    for (let i = 0; i < this.waterSlots.length; i++) {
      const slot = this.waterSlots[i]!;
      if (!slot.actief) continue;
      this.water.getMatrixAt(i, HULP.matrix);
      HULP.matrix.decompose(HULP.position, HULP.quaternion, HULP.scale);
      HULP.position.z = -(slot.s - sSpeler);
      HULP.updateMatrix();
      this.water.setMatrixAt(i, HULP.matrix);
    }
  }

  private streamBomen(seg: Segment, sSpeler: number, tot: number, achter: number): void {
    const b = seg.zone.bomen;
    for (let i = 0; i < this.boomSlots.length; i++) {
      const slot = this.boomSlots[i]!;
      if (slot.actief && slot.s < achter) {
        slot.actief = false;
        this.verbergInstantie(this.stammen, i);
        this.verbergInstantie(this.kruinen, i);
      }
    }

    while (seg.boomCursor < b.n) {
      const globaal = seg.begin + b.s[seg.boomCursor]!;
      if (globaal >= tot) break;
      if (globaal < achter) {
        seg.boomCursor++;
        continue;
      }
      const slot = this.vrijSlot(this.boomSlots, achter);
      if (slot < 0) break;
      const i = seg.boomCursor;
      const h = b.hoogte[i]!;

      const smal = b.soort[i]! > 0.5;
      HULP.position.set(b.t[i]!, 0, -(globaal - sSpeler));
      HULP.rotation.set(0, 0, 0);
      HULP.scale.set(1, h * 0.5, 1);
      HULP.updateMatrix();
      this.stammen.setMatrixAt(slot, HULP.matrix);

      // A street tree is wider than it is tall above the crown base, unless it
      // is one of the columnar species.
      const straal = h * (smal ? 0.16 : 0.27);
      HULP.position.set(b.t[i]!, h * 0.72, -(globaal - sSpeler));
      HULP.rotation.set(0, (b.s[i]! % 3) * 1.1, 0);
      HULP.scale.set(straal, straal * (smal ? 1.6 : 0.86), straal);
      HULP.updateMatrix();
      this.kruinen.setMatrixAt(slot, HULP.matrix);

      this.boomSlots[slot] = { actief: true, s: globaal };
      seg.boomCursor++;
    }

    for (let i = 0; i < this.boomSlots.length; i++) {
      const slot = this.boomSlots[i]!;
      if (!slot.actief) continue;
      for (const mesh of [this.stammen, this.kruinen]) {
        mesh.getMatrixAt(i, HULP.matrix);
        HULP.matrix.decompose(HULP.position, HULP.quaternion, HULP.scale);
        HULP.position.z = -(slot.s - sSpeler);
        HULP.updateMatrix();
        mesh.setMatrixAt(i, HULP.matrix);
      }
    }
  }

  private streamBruggen(seg: Segment, sSpeler: number, tot: number, achter: number): void {
    for (const brug of this.bruggen) {
      if (brug.slot.actief && brug.slot.s < achter) {
        brug.slot.actief = false;
        brug.groep.visible = false;
      }
    }

    while (seg.brugCursor < seg.zone.bruggen.length) {
      const data = seg.zone.bruggen[seg.brugCursor]!;
      const globaal = seg.begin + data.s;
      if (globaal >= tot) break;
      if (globaal < achter) {
        seg.brugCursor++;
        continue;
      }
      const vrij = this.bruggen.find((b) => !b.slot.actief);
      if (!vrij) break;
      vrij.slot.actief = true;
      vrij.slot.s = globaal;
      vrij.groep.visible = true;
      this.tekenBord(vrij.doek, vrij.textuur, data.naam);
      seg.brugCursor++;
    }

    for (const brug of this.bruggen) {
      if (!brug.slot.actief) continue;
      brug.groep.position.z = -(brug.slot.s - sSpeler);
    }
  }

  /** Reset every pool for a fresh run. */
  leeg(): void {
    for (let i = 0; i < this.gevelSlots.length; i++) {
      this.gevelSlots[i] = { actief: false, s: 0 };
      this.verbergInstantie(this.gevels, i);
      this.verbergInstantie(this.kappen, i);
    }
    for (let i = 0; i < this.waterSlots.length; i++) {
      this.waterSlots[i] = { actief: false, s: 0 };
      this.verbergInstantie(this.water, i);
    }
    for (let i = 0; i < this.boomSlots.length; i++) {
      this.boomSlots[i] = { actief: false, s: 0 };
      this.verbergInstantie(this.stammen, i);
      this.verbergInstantie(this.kruinen, i);
    }
    for (const brug of this.bruggen) {
      brug.slot.actief = false;
      brug.groep.visible = false;
    }
    this.gevels.instanceMatrix.needsUpdate = true;
    this.kappen.instanceMatrix.needsUpdate = true;
    this.water.instanceMatrix.needsUpdate = true;
    this.stammen.instanceMatrix.needsUpdate = true;
    this.kruinen.instanceMatrix.needsUpdate = true;
  }
}

/**
 * A triangular prism with the ridge running along local z, so the gable end
 * faces the street. That front gable is the whole silhouette of a canal house.
 */
function kapGeometrie(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const p = [
    // gable end at z = -0.5
    -0.5, 0, -0.5, 0.5, 0, -0.5, 0, 1, -0.5,
    // gable end at z = +0.5
    -0.5, 0, 0.5, 0.5, 0, 0.5, 0, 1, 0.5,
  ];
  const posities: number[] = [];
  const normalen: number[] = [];

  const driehoek = (a: number, b: number, c: number): void => {
    const punten = [a, b, c].map((i) => [p[i * 3]!, p[i * 3 + 1]!, p[i * 3 + 2]!]);
    const [q, r, s2] = punten as [number[], number[], number[]];
    const u = [r[0]! - q[0]!, r[1]! - q[1]!, r[2]! - q[2]!];
    const v = [s2[0]! - q[0]!, s2[1]! - q[1]!, s2[2]! - q[2]!];
    const n = [
      u[1]! * v[2]! - u[2]! * v[1]!,
      u[2]! * v[0]! - u[0]! * v[2]!,
      u[0]! * v[1]! - u[1]! * v[0]!,
    ];
    const len = Math.hypot(n[0]!, n[1]!, n[2]!) || 1;
    for (const punt of punten) {
      posities.push(punt[0]!, punt[1]!, punt[2]!);
      normalen.push(n[0]! / len, n[1]! / len, n[2]! / len);
    }
  };

  driehoek(0, 2, 1);
  driehoek(3, 4, 5);
  driehoek(0, 3, 5);
  driehoek(0, 5, 2);
  driehoek(1, 2, 5);
  driehoek(1, 5, 4);

  g.setAttribute("position", new THREE.Float32BufferAttribute(posities, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(normalen, 3));
  return g;
}
