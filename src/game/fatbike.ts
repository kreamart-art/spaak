import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

/**
 * The Spaak fatbike, built from primitives against the reference sheet.
 *
 * A runner sees the bike from behind at a small size, so the budget goes into
 * the things that read from there: the fat rear tyre, the long bench, the rack,
 * the tail light and the battery panel. Everything is one group with a handful
 * of shared materials.
 */

/** Bottom bracket, and how far the pedal sits from it. The rider's feet and the
 *  leg IK both work from these, so they live next to the bike, not in the rider. */
export const TRAPAS: readonly [number, number, number] = [0, 0.28, 0.16];
export const TRAP_STRAAL = 0.17;

/** Wheel radius including the tyre, metres. A 20 x 4.0 fat tyre. */
export const WIEL_STRAAL = 0.33;
const BAND_DIKTE = 0.062;
const WIELBASIS = 1.28;

export interface Fatbike {
  readonly groep: THREE.Group;
  readonly wielVoor: THREE.Group;
  readonly wielAchter: THREE.Group;
  /** Where the rider's hips sit. */
  readonly zadelHoogte: number;
  readonly stuurHoogte: number;
}

function kruisTextuur(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "#111316";
  g.fillRect(0, 0, 256, 128);

  // Three saltires, the way Amsterdam writes its name.
  g.strokeStyle = "#f4f6f8";
  g.lineWidth = 13;
  g.lineCap = "square";
  for (let i = 0; i < 3; i++) {
    const cx = 58 + i * 70;
    const cy = 64;
    const r = 24;
    g.beginPath();
    g.moveTo(cx - r, cy - r);
    g.lineTo(cx + r, cy + r);
    g.moveTo(cx + r, cy - r);
    g.lineTo(cx - r, cy + r);
    g.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}

function merkTextuur(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 64;
  const g = c.getContext("2d")!;
  g.fillStyle = "#16181b";
  g.fillRect(0, 0, 256, 64);
  g.fillStyle = "#f4f6f8";
  g.font = "700 40px ui-sans-serif, system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.letterSpacing = "5px";
  g.fillText("SPAAK", 128, 34);
  return new THREE.CanvasTexture(c);
}

export function maakFatbike(): Fatbike {
  const groep = new THREE.Group();

  // Standard, not Lambert: matte diffuse with no highlight is exactly what
  // makes black paint read as grey plastic. Roughness and metalness are what
  // separate rubber from anodised aluminium from a satin frame.
  const zwart = new THREE.MeshStandardMaterial({
    color: 0x1c1e22,
    roughness: 0.42,
    metalness: 0.55,
  });
  const rubber = new THREE.MeshStandardMaterial({
    color: 0x121316,
    roughness: 0.95,
    metalness: 0.0,
  });
  const velg = new THREE.MeshStandardMaterial({
    color: 0x33383e,
    roughness: 0.35,
    metalness: 0.85,
  });
  const staal = new THREE.MeshStandardMaterial({
    color: 0xa8afb6,
    roughness: 0.28,
    metalness: 0.95,
  });
  // A ring has no back face of its own, so the disc needs both sides.
  const schijfMat = new THREE.MeshStandardMaterial({
    color: 0xa8afb6,
    roughness: 0.25,
    metalness: 0.95,
    side: THREE.DoubleSide,
  });
  const zadelMat = new THREE.MeshStandardMaterial({
    color: 0x1f2126,
    roughness: 0.72,
    metalness: 0.05,
  });
  const kruisMat = new THREE.MeshStandardMaterial({
    map: kruisTextuur(),
    roughness: 0.5,
    metalness: 0.2,
  });
  const merkMat = new THREE.MeshStandardMaterial({
    map: merkTextuur(),
    roughness: 0.5,
    metalness: 0.2,
  });
  const lampMat = new THREE.MeshStandardMaterial({
    color: 0xfff2cf,
    emissive: 0x8a7038,
    roughness: 0.15,
    metalness: 0.1,
  });
  const roodMat = new THREE.MeshStandardMaterial({
    color: 0xd8232a,
    emissive: 0x5a1014,
    roughness: 0.3,
    metalness: 0.1,
  });

  // ---------------------------------------------------------------- wielen --
  // A torus lies in the XY plane with its hole along Z. A bike wheel turns
  // around X, so both rings have to be laid over before anything else is hung
  // on them, or they stand across their own wheel.
  const bandGeo = new THREE.TorusGeometry(WIEL_STRAAL - BAND_DIKTE, BAND_DIKTE, 10, 26);
  bandGeo.rotateY(Math.PI / 2);
  const velgGeo = new THREE.TorusGeometry(WIEL_STRAAL - BAND_DIKTE * 2.1, 0.022, 6, 24);
  velgGeo.rotateY(Math.PI / 2);

  // A brake disc is a slotted ring on a hub, not a solid coin.
  const schijfGeo = new THREE.RingGeometry(0.045, 0.1, 20);
  schijfGeo.rotateY(Math.PI / 2);
  const schijfNaafGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.016, 12);
  schijfNaafGeo.rotateZ(Math.PI / 2);
  const naafGeo = new THREE.CylinderGeometry(0.038, 0.038, 0.11, 10);
  const spaakGeo = new THREE.BoxGeometry(0.012, (WIEL_STRAAL - BAND_DIKTE * 2) * 2, 0.012);

  const maakWiel = (): THREE.Group => {
    const wiel = new THREE.Group();

    const band = new THREE.Mesh(bandGeo, rubber);
    wiel.add(band);
    // The knobs: a ring of short blocks around the tread.
    // Rounded tread blocks: a real knob is moulded rubber, not a chisel cut.
      const knobGeo = new RoundedBoxGeometry(0.085, 0.032, 0.052, 2, 0.012);
    for (let i = 0; i < 22; i++) {
      const hoek = (i / 22) * Math.PI * 2;
      const knob = new THREE.Mesh(knobGeo, rubber);
      knob.position.set(0, Math.sin(hoek) * WIEL_STRAAL, Math.cos(hoek) * WIEL_STRAAL);
      knob.rotation.x = -hoek;
      wiel.add(knob);
    }

    wiel.add(new THREE.Mesh(velgGeo, velg));

    const naaf = new THREE.Mesh(naafGeo, velg);
    naaf.rotation.z = Math.PI / 2;
    wiel.add(naaf);

    for (let i = 0; i < 5; i++) {
      const spaak = new THREE.Mesh(spaakGeo, staal);
      spaak.rotation.x = (i * Math.PI) / 5;
      wiel.add(spaak);
    }

    const schijf = new THREE.Mesh(schijfGeo, schijfMat);
    schijf.position.x = -0.075;
    wiel.add(schijf);
    const schijfNaaf = new THREE.Mesh(schijfNaafGeo, velg);
    schijfNaaf.position.x = -0.075;
    wiel.add(schijfNaaf);

    return wiel;
  };

  const wielVoor = maakWiel();
  wielVoor.position.set(0, WIEL_STRAAL, -WIELBASIS / 2);
  const wielAchter = maakWiel();
  wielAchter.position.set(0, WIEL_STRAAL, WIELBASIS / 2);
  groep.add(wielVoor, wielAchter);

  // ----------------------------------------------------------------- frame --
  /** A tube between two points, so the frame can be described by its joints. */
  const buis = (
    a: [number, number, number],
    b: [number, number, number],
    dikte: number,
    mat: THREE.Material = zwart,
  ): THREE.Mesh => {
    const van = new THREE.Vector3(...a);
    const naar = new THREE.Vector3(...b);
    const richting = new THREE.Vector3().subVectors(naar, van);
    const lengte = richting.length();
    const m = new THREE.Mesh(new THREE.CylinderGeometry(dikte, dikte, lengte, 8), mat);
    m.position.copy(van).addScaledVector(richting, 0.5);
    m.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      richting.normalize(),
    );
    return m;
  };

  const balhoofdBoven: [number, number, number] = [0, 0.92, -0.56];
  const balhoofdOnder: [number, number, number] = [0, 0.66, -0.49];
  const trapas: [number, number, number] = [TRAPAS[0], TRAPAS[1], TRAPAS[2]];
  const zadelBuisTop: [number, number, number] = [0, 0.74, 0.42];
  const achteras: [number, number, number] = [0, WIEL_STRAAL, WIELBASIS / 2];

  groep.add(buis(balhoofdBoven, balhoofdOnder, 0.035));
  // Long straight top tube: the line that makes it look like a moped.
  groep.add(buis(balhoofdBoven, [0, 0.78, 0.3], 0.032));
  groep.add(buis([0, 0.78, 0.3], zadelBuisTop, 0.03));
  groep.add(buis(balhoofdOnder, trapas, 0.032));
  groep.add(buis(zadelBuisTop, trapas, 0.028));
  for (const kant of [-1, 1]) {
    groep.add(buis(trapas, [kant * 0.07, achteras[1], achteras[2]], 0.022));
    groep.add(buis(zadelBuisTop, [kant * 0.07, achteras[1], achteras[2]], 0.02));
  }

  // ------------------------------------------------------------------ vork --
  for (const kant of [-1, 1]) {
    groep.add(
      buis(
        [kant * 0.055, 0.7, -0.52],
        [kant * 0.08, WIEL_STRAAL, -WIELBASIS / 2],
        0.026,
      ),
    );
  }

  // ------------------------------------------------------------------ accu --
  // The battery fills the main triangle, with the crosses on its flanks.
  const accu = new THREE.Mesh(new RoundedBoxGeometry(0.13, 0.34, 0.46, 3, 0.028), zwart);
  accu.position.set(0, 0.53, 0.06);
  accu.rotation.x = -0.16;
  groep.add(accu);
  for (const kant of [-1, 1]) {
    const paneel = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.2), kruisMat);
    paneel.position.set(kant * 0.066, 0.53, 0.06);
    paneel.rotation.set(-0.16, (kant * Math.PI) / 2, 0);
    groep.add(paneel);
  }

  // Brand mark on the top tube.
  for (const kant of [-1, 1]) {
    const merk = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.075), merkMat);
    merk.position.set(kant * 0.034, 0.8, -0.14);
    merk.rotation.set(0, (kant * Math.PI) / 2, -0.07);
    groep.add(merk);
  }

  // ----------------------------------------------------------------- zadel --
  const bank = new THREE.Mesh(new RoundedBoxGeometry(0.26, 0.13, 0.78, 4, 0.055), zadelMat);
  bank.position.set(0, 0.83, 0.16);
  groep.add(bank);
  // Stitch lines, the detail that tells you it is a bench and not a plank.
  for (let i = 0; i < 5; i++) {
    const naad = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.012, 0.012), zwart);
    naad.position.set(0, 0.888, -0.1 + i * 0.14);
    groep.add(naad);
  }

  // ------------------------------------------------------------- bagagerek --
  groep.add(buis([-0.1, 0.8, 0.5], [0.1, 0.8, 0.5], 0.016));
  for (const kant of [-1, 1]) {
    groep.add(buis([kant * 0.1, 0.8, 0.5], [kant * 0.1, 0.8, 0.72], 0.016));
    groep.add(buis([kant * 0.1, 0.8, 0.72], [kant * 0.08, 0.52, 0.7], 0.014));
  }
  const rekPlaat = new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.03, 0.24, 2, 0.012), zwart);
  rekPlaat.position.set(0, 0.8, 0.62);
  groep.add(rekPlaat);

  // -------------------------------------------------------------- spatborden --
  const spatbord = (z: number, draai: number): THREE.Mesh => {
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(
        WIEL_STRAAL + 0.05,
        WIEL_STRAAL + 0.05,
        0.15,
        16,
        1,
        true,
        draai,
        Math.PI * 0.62,
      ),
      zwart,
    );
    m.rotation.z = Math.PI / 2;
    m.position.set(0, WIEL_STRAAL, z);
    return m;
  };
  groep.add(spatbord(-WIELBASIS / 2, Math.PI * 0.25));
  groep.add(spatbord(WIELBASIS / 2, Math.PI * 1.15));

  // ------------------------------------------------------------------ stuur --
  const stuurPen = buis([0, 0.92, -0.56], [0, 1.02, -0.5], 0.028);
  groep.add(stuurPen);
  groep.add(buis([-0.3, 1.03, -0.44], [0.3, 1.03, -0.44], 0.017));
  for (const kant of [-1, 1]) {
    groep.add(buis([kant * 0.3, 1.03, -0.44], [kant * 0.32, 1.02, -0.38], 0.017));
    const greep = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.12, 8), rubber);
    greep.position.set(kant * 0.26, 1.03, -0.435);
    greep.rotation.z = Math.PI / 2;
    groep.add(greep);
  }

  // ------------------------------------------------------------ verlichting --
  const koplampHuis = new THREE.Mesh(
    new THREE.CylinderGeometry(0.075, 0.075, 0.07, 14),
    zwart,
  );
  koplampHuis.rotation.x = Math.PI / 2;
  koplampHuis.position.set(0, 0.86, -0.62);
  groep.add(koplampHuis);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.06, 14), lampMat);
  lens.position.set(0, 0.86, -0.657);
  lens.rotation.y = Math.PI;
  groep.add(lens);

  const achterlicht = new THREE.Mesh(new RoundedBoxGeometry(0.13, 0.045, 0.035, 2, 0.014), roodMat);
  achterlicht.position.set(0, 0.79, 0.735);
  groep.add(achterlicht);

  // Number plate with the crosses, front and rear.
  const plaatGeo = new RoundedBoxGeometry(0.2, 0.085, 0.02, 2, 0.009);
  const plaatVoor = new THREE.Mesh(plaatGeo, kruisMat);
  plaatVoor.position.set(0, 0.7, -0.63);
  groep.add(plaatVoor);
  const plaatAchter = new THREE.Mesh(plaatGeo, kruisMat);
  plaatAchter.position.set(0, 0.66, 0.72);
  groep.add(plaatAchter);

  // ---------------------------------------------------------------- aandrijving --
  const blad = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.012, 14), velg);
  blad.rotation.z = Math.PI / 2;
  blad.position.set(0.045, 0.28, 0.16);
  groep.add(blad);

  const ketting = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.02, 0.5), staal);
  ketting.position.set(0.05, 0.315, 0.41);
  groep.add(ketting);

  return {
    groep,
    wielVoor,
    wielAchter,
    zadelHoogte: 0.89,
    stuurHoogte: 1.03,
  };
}

/** Cranks and pedals, returned separately so the legs can drive them. */
export function maakTrappers(): { as: THREE.Group; pedalen: THREE.Mesh[] } {
  const as = new THREE.Group();
  as.position.set(TRAPAS[0], TRAPAS[1], TRAPAS[2]);

  const zwart = new THREE.MeshStandardMaterial({
    color: 0x1c1e22,
    roughness: 0.45,
    metalness: 0.5,
  });
  const oranje = new THREE.MeshStandardMaterial({
    color: 0xd97a1e,
    roughness: 0.4,
    metalness: 0.1,
  });
  const pedalen: THREE.Mesh[] = [];

  for (const kant of [-1, 1]) {
    const arm = new THREE.Group();
    const crank = new THREE.Mesh(new THREE.BoxGeometry(0.025, TRAP_STRAAL, 0.03), zwart);
    crank.position.set(kant * 0.075, -TRAP_STRAAL / 2, 0);
    arm.add(crank);

    const pedaal = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.022, 0.11), zwart);
    pedaal.position.set(kant * 0.12, -TRAP_STRAAL, 0);
    arm.add(pedaal);

    const reflector = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.008, 0.022), oranje);
    reflector.position.set(kant * 0.12, -TRAP_STRAAL - 0.012, 0);
    arm.add(reflector);

    // Half a turn apart, the way cranks actually sit.
    arm.rotation.x = kant > 0 ? 0 : Math.PI;
    as.add(arm);
    pedalen.push(pedaal);
  }

  return { as, pedalen };
}
