import * as THREE from "three";

/**
 * The rider. Round shapes, a big head and hard colour separation: what makes a
 * runner character readable is the silhouette, not the polygon count.
 *
 * The legs are driven by two-bone inverse kinematics onto the pedal, so the
 * knee bends where a knee bends instead of the whole leg swinging as one block.
 */

const OMHOOG = new THREE.Vector3(0, 1, 0);

/** Where the figure's hips sit in its own space, so it can be fitted to a seat. */
export const FIGUUR_ZIT_Y = 0.96;
export const FIGUUR_ZIT_Z = 0.24;

export interface Figuur {
  readonly groep: THREE.Group;
  /** Folds forward when ducking. */
  readonly bovenlijf: THREE.Group;
  /** Sets the leg pose from a pedal position, in the group's own space. */
  zetBeen(kant: 0 | 1, trapper: THREE.Vector3): void;
  /** Reaches an arm to a grip, in the group's own space. */
  zetArm(kant: 0 | 1, greep: THREE.Vector3): void;
}

interface Arm {
  readonly schouder: THREE.Vector3;
  readonly bovenarm: THREE.Mesh;
  readonly onderarm: THREE.Mesh;
  readonly hand: THREE.Mesh;
  readonly lengteBoven: number;
  readonly lengteOnder: number;
}

interface Been {
  readonly heup: THREE.Vector3;
  readonly bovenbeen: THREE.Mesh;
  readonly onderbeen: THREE.Mesh;
  readonly voet: THREE.Group;
  readonly lengteBoven: number;
  readonly lengteOnder: number;
}

/** Place a capsule so it spans from a to b. */
function spanCapsule(mesh: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3): void {
  const richting = new THREE.Vector3().subVectors(b, a);
  mesh.position.copy(a).addScaledVector(richting, 0.5);
  mesh.quaternion.setFromUnitVectors(OMHOOG, richting.normalize());
}

function capsule(
  straal: number,
  lengte: number,
  mat: THREE.Material,
): THREE.Mesh {
  return new THREE.Mesh(new THREE.CapsuleGeometry(straal, lengte, 6, 12), mat);
}

export function maakFiguur(): Figuur {
  const groep = new THREE.Group();

  // Cloth, skin, knit and rubber all take light differently. Flat Lambert makes
  // them one material in different colours, which is the plastic-toy look.
  const stof = (kleur: number, ruw = 0.85): THREE.MeshStandardMaterial =>
    new THREE.MeshStandardMaterial({ color: kleur, roughness: ruw, metalness: 0 });

  const jas = stof(0xf5a623, 0.72);
  const jasDonker = stof(0xd2871a, 0.7);
  const broek = stof(0x44577a, 0.92);
  const huid = new THREE.MeshStandardMaterial({
    color: 0xd8a077,
    roughness: 0.62,
    metalness: 0,
  });
  const muts = stof(0x222c3a, 0.98);
  const schoen = new THREE.MeshStandardMaterial({
    color: 0x24272d,
    roughness: 0.55,
    metalness: 0.08,
  });
  const oogwit = new THREE.MeshStandardMaterial({
    color: 0xf8f6f2,
    roughness: 0.25,
    metalness: 0,
  });
  const pupil = new THREE.MeshStandardMaterial({
    color: 0x15171b,
    roughness: 0.18,
    metalness: 0,
  });
  const wenkbrauw = stof(0x3a2a1c, 0.9);

  // The whole upper body hangs off one group so ducking folds it as a unit.
  const bovenlijf = new THREE.Group();
  groep.add(bovenlijf);

  // ------------------------------------------------------------------ romp --
  const bekken = capsule(0.12, 0.09, broek);
  bekken.rotation.z = Math.PI / 2;
  bekken.position.set(0, 0.96, 0.24);
  bovenlijf.add(bekken);

  const romp = capsule(0.16, 0.2, jas);
  romp.position.set(0, 1.26, 0.16);
  romp.rotation.x = -0.2;
  bovenlijf.add(romp);

  // A collar, so the jacket reads as clothing and not as a painted body.
  const kraag = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.032, 6, 14), jasDonker);
  kraag.position.set(0, 1.44, 0.1);
  kraag.rotation.x = Math.PI / 2 - 0.2;
  bovenlijf.add(kraag);

  const nek = capsule(0.052, 0.05, huid);
  nek.position.set(0, 1.48, 0.09);
  bovenlijf.add(nek);

  // ----------------------------------------------------------------- hoofd --
  const hoofdGroep = new THREE.Group();
  hoofdGroep.position.set(0, 1.62, 0.06);
  bovenlijf.add(hoofdGroep);

  const schedel = new THREE.Mesh(new THREE.SphereGeometry(0.155, 18, 14), huid);
  schedel.scale.set(0.96, 1.06, 1.0);
  hoofdGroep.add(schedel);

  // Forward is -z, so the face looks that way. Eyes sit low enough to stay
  // clear of the beanie: a face you cannot see reads as a mannequin.
  for (const kant of [-1, 1]) {
    const wit = new THREE.Mesh(new THREE.SphereGeometry(0.038, 12, 10), oogwit);
    wit.position.set(kant * 0.062, -0.012, -0.122);
    wit.scale.set(0.9, 1.05, 0.55);
    hoofdGroep.add(wit);

    const p = new THREE.Mesh(new THREE.SphereGeometry(0.019, 10, 8), pupil);
    p.position.set(kant * 0.064, -0.014, -0.142);
    p.scale.set(1, 1.1, 0.7);
    hoofdGroep.add(p);

    const brauw = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.014, 0.02), wenkbrauw);
    brauw.position.set(kant * 0.062, 0.035, -0.135);
    brauw.rotation.z = kant * -0.12;
    hoofdGroep.add(brauw);

    const oor = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), huid);
    oor.position.set(kant * 0.15, -0.015, 0.01);
    oor.scale.set(0.5, 1, 0.8);
    hoofdGroep.add(oor);
  }

  const mond = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.012, 0.02), wenkbrauw);
  mond.position.set(0, -0.088, -0.128);
  hoofdGroep.add(mond);

  const neus = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), huid);
  neus.position.set(0, -0.048, -0.146);
  neus.scale.set(0.8, 0.8, 1.1);
  hoofdGroep.add(neus);

  // A beanie: cap plus a rolled brim.
  const kap = new THREE.Mesh(
    new THREE.SphereGeometry(0.163, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
    muts,
  );
  kap.position.set(0, 0.05, 0);
  kap.scale.set(0.99, 1.1, 1.02);
  hoofdGroep.add(kap);

  const rand = new THREE.Mesh(new THREE.TorusGeometry(0.152, 0.032, 8, 18), muts);
  rand.position.set(0, 0.072, 0);
  rand.rotation.x = Math.PI / 2;
  hoofdGroep.add(rand);

  // ------------------------------------------------------------------ armen --
  // Arms reach for a grip the same way the legs reach for a pedal, because a
  // generated bike puts its handlebars wherever it likes.
  const armen: Arm[] = [];
  for (const kant of [-1, 1]) {
    const schouder = new THREE.Vector3(kant * 0.16, 1.36, 0.12);
    const bal = new THREE.Mesh(new THREE.SphereGeometry(0.068, 10, 8), jas);
    bal.position.copy(schouder);
    bovenlijf.add(bal);

    const lengteBoven = 0.3;
    const lengteOnder = 0.32;
    const bovenarm = capsule(0.05, lengteBoven - 0.1, jas);
    const onderarm = capsule(0.043, lengteOnder - 0.086, jas);
    bovenlijf.add(bovenarm, onderarm);

    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), huid);
    hand.scale.set(0.85, 1, 1.15);
    bovenlijf.add(hand);

    armen.push({ schouder, bovenarm, onderarm, hand, lengteBoven, lengteOnder });
  }

  const armHulp = new THREE.Vector3();
  const armRicht = new THREE.Vector3();
  const armLood = new THREE.Vector3();

  const zetArm = (kant: 0 | 1, greep: THREE.Vector3): void => {
    const arm = armen[kant]!;
    const schouder = arm.schouder;
    armRicht.subVectors(greep, schouder);
    const d = Math.min(
      arm.lengteBoven + arm.lengteOnder - 0.02,
      Math.max(Math.abs(arm.lengteBoven - arm.lengteOnder) + 0.02, armRicht.length()),
    );
    armRicht.normalize();
    const cos =
      (arm.lengteBoven * arm.lengteBoven + d * d - arm.lengteOnder * arm.lengteOnder) /
      (2 * arm.lengteBoven * d);
    const hoek = Math.acos(Math.min(1, Math.max(-1, cos)));
    // The elbow swings out and down, away from the body.
    armLood.set(0, -armRicht.z, armRicht.y).normalize();
    armHulp
      .copy(schouder)
      .addScaledVector(armRicht, Math.cos(hoek) * arm.lengteBoven)
      .addScaledVector(armLood, Math.sin(hoek) * arm.lengteBoven);

    spanCapsule(arm.bovenarm, schouder, armHulp);
    spanCapsule(arm.onderarm, armHulp, greep);
    arm.hand.position.copy(greep);
  };

  // ------------------------------------------------------------------ benen --
  const benen: Been[] = [];
  for (const kant of [-1, 1]) {
    const heup = new THREE.Vector3(kant * 0.12, 0.9, 0.22);
    const lengteBoven = 0.4;
    const lengteOnder = 0.42;

    const bovenbeen = capsule(0.062, lengteBoven - 0.124, broek);
    const onderbeen = capsule(0.05, lengteOnder - 0.1, broek);
    groep.add(bovenbeen, onderbeen);

    const knie = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), broek);
    bovenbeen.add(knie);
    knie.position.set(0, -(lengteBoven - 0.124) / 2, 0);

    // The foot is a group so it can be rotated onto the pedal.
    const voet = new THREE.Group();
    const schoenVorm = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), schoen);
    schoenVorm.scale.set(0.8, 0.62, 1.5);
    schoenVorm.position.z = -0.03;
    voet.add(schoenVorm);
    groep.add(voet);

    benen.push({ heup, bovenbeen, onderbeen, voet, lengteBoven, lengteOnder });
  }

  const knieHulp = new THREE.Vector3();
  const naarDoel = new THREE.Vector3();
  const loodrecht = new THREE.Vector3();

  const zetBeen = (kant: 0 | 1, trapper: THREE.Vector3): void => {
    const been = benen[kant]!;
    const heup = been.heup;

    naarDoel.subVectors(trapper, heup);
    const d = Math.min(
      been.lengteBoven + been.lengteOnder - 0.02,
      Math.max(Math.abs(been.lengteBoven - been.lengteOnder) + 0.02, naarDoel.length()),
    );
    naarDoel.normalize();

    // Law of cosines for the hip angle, then swing the knee forward.
    const cos =
      (been.lengteBoven * been.lengteBoven + d * d - been.lengteOnder * been.lengteOnder) /
      (2 * been.lengteBoven * d);
    const hoek = Math.acos(Math.min(1, Math.max(-1, cos)));

    // Rotate within the sagittal plane; the knee always leads forward, in -z.
    loodrecht.set(0, naarDoel.z, -naarDoel.y).normalize();
    knieHulp
      .copy(heup)
      .addScaledVector(naarDoel, Math.cos(hoek) * been.lengteBoven)
      .addScaledVector(loodrecht, Math.sin(hoek) * been.lengteBoven);

    spanCapsule(been.bovenbeen, heup, knieHulp);
    spanCapsule(been.onderbeen, knieHulp, trapper);

    been.voet.position.copy(trapper);
    been.voet.position.y += 0.045;
  };

  // A sane pose before the first frame.
  zetBeen(0, new THREE.Vector3(-0.12, 0.28, 0.0));
  zetBeen(1, new THREE.Vector3(0.12, 0.28, 0.3));
  zetArm(0, new THREE.Vector3(-0.26, 1.03, -0.43));
  zetArm(1, new THREE.Vector3(0.26, 1.03, -0.43));

  return { groep, bovenlijf, zetBeen, zetArm };
}
