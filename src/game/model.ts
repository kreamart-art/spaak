import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { splitsWielen } from "./splits.ts";

/**
 * Loader for the generated fatbike.
 *
 * An image-to-3D export arrives in an arbitrary scale and orientation, split
 * into anonymous parts carrying flat segmentation colours, with no normals and
 * no UVs. So nothing here trusts names: every part is identified by its own
 * shape and where it sits, and then given a real material.
 *
 * If any of it fails, the caller gets null and keeps the procedural bike. A
 * decor asset may never be the reason a run does not start.
 */

const PAD = `${import.meta.env.BASE_URL}modellen/fatbike.glb`;

/** Nose to tail, in metres. Everything is scaled to match. */
const DOELLENGTE = 1.94;

type Rol = "wiel" | "frame" | "zadel" | "stuur" | "spatbord" | "lamp" | "trapper" | "klein";

interface Deel {
  readonly mesh: THREE.Mesh;
  readonly doos: THREE.Box3;
  readonly maat: THREE.Vector3;
  readonly midden: THREE.Vector3;
  rol: Rol;
}

export interface GeladenFiets {
  readonly groep: THREE.Group;
  readonly wielVoor: THREE.Object3D | null;
  readonly wielAchter: THREE.Object3D | null;
  readonly draaibaar: boolean;
  /** Badges, tail lamp and brake discs, in the player's own space. */
  readonly accenten: THREE.Group;
  /**
   * Roll both wheels forward by an angle.
   *
   * Not something the caller can do with rotateX: the model is turned to face
   * the right way, so a wheel's own x axis is no longer the world's. Rotating
   * about it makes the wheel spin flat like a coin instead of rolling.
   */
  draaiWielen(hoek: number): void;
  /**
   * Where the rider goes: the top of the bench, measured on this model. A
   * generated bike has its own proportions, so the rider is fitted to it rather
   * than to the one it replaced.
   */
  readonly zadelTop: THREE.Vector3;
  /** The grips, so the rider can actually hold on. */
  readonly stuurPunt: THREE.Vector3;
  /**
   * The bottom bracket, measured from the model's own pedal when it has one.
   * The generated pedals cannot turn, so they are hidden and replaced by the
   * built-in cranks, which do.
   */
  readonly trapas: THREE.Vector3;
}

/**
 * A wheel is round, much thinner than it is wide, and it touches the ground.
 * That last one carries the test: a fraction-of-total-height threshold breaks
 * as soon as the handlebars make the bike taller, and on this bike the wheel is
 * only just over half the total height.
 */
function isWiel(deel: Deel, hoogte: number, onderkant: number): boolean {
  const { maat, doos } = deel;
  const dims = [maat.x, maat.y, maat.z].sort((a, b) => b - a);
  const rond = Math.abs(dims[0]! - dims[1]!) / Math.max(1e-6, dims[0]!);
  const plat = dims[2]! / Math.max(1e-6, dims[0]!);
  const opDeGrond = (doos.min.y - onderkant) / Math.max(1e-6, hoogte) < 0.06;
  return rond < 0.25 && plat < 0.5 && opDeGrond && dims[0]! > hoogte * 0.35;
}

function bepaalRollen(delen: Deel[]): void {
  const alles = new THREE.Box3();
  for (const d of delen) alles.union(d.doos);
  const maat = new THREE.Vector3();
  alles.getSize(maat);

  const diagonaal = maat.length();

  for (const d of delen) {
    if (isWiel(d, maat.y, alles.min.y)) {
      d.rol = "wiel";
      continue;
    }
    const hoog = (d.midden.y - alles.min.y) / maat.y;
    const lang = d.maat.z / maat.z;
    const breed = d.maat.x / maat.x;
    const klein = d.maat.length() < diagonaal * 0.16;
    const dims = [d.maat.x, d.maat.y, d.maat.z].sort((a, b) => b - a);
    const gedrongen = dims[0]! / Math.max(1e-6, dims[2]!) < 3.5;
    // A pedal is small, sits low and hangs out to one side of the centreline.
    const opzij = Math.abs(d.midden.x - alles.getCenter(new THREE.Vector3()).x) >
      maat.x * 0.12;

    if (klein && hoog < 0.35 && opzij) d.rol = "trapper";
    else if (breed > 0.75 && hoog > 0.35) d.rol = "stuur";
    else if (lang > 0.35 && hoog > 0.6 && d.maat.y < maat.y * 0.3) d.rol = "zadel";
    else if (lang > 0.5) d.rol = "frame";
    // A lamp is compact in all three directions; a brake lever is a sliver, and
    // giving that an emissive material makes the bike glow in the wrong place.
    else if (klein && gedrongen && hoog > 0.4) d.rol = "lamp";
    else if (hoog < 0.45) d.rol = "spatbord";
    else d.rol = "klein";
  }
}

/**
 * Real materials, because the export only carries part-id colours.
 *
 * The bike is black, so what has to do the work is the difference between the
 * blacks: dead-matte rubber, satin paint, and metal that actually catches the
 * sky. Give them all one colour and one roughness and it reads as a silhouette.
 */
function materiaalVoor(rol: Rol): THREE.MeshStandardMaterial {
  switch (rol) {
    case "wiel":
      return new THREE.MeshStandardMaterial({
        color: 0x17181c,
        roughness: 0.97,
        metalness: 0.0,
      });
    case "zadel":
      return new THREE.MeshStandardMaterial({
        color: 0x2a2b30,
        roughness: 0.62,
        metalness: 0.08,
      });
    case "stuur":
      return new THREE.MeshStandardMaterial({
        color: 0x53585f,
        roughness: 0.22,
        metalness: 0.95,
      });
    case "spatbord":
      return new THREE.MeshStandardMaterial({
        color: 0x24262b,
        roughness: 0.3,
        metalness: 0.7,
      });
    case "lamp":
      // Barely emissive: the whole housing glows, not just the lens, so a bright
      // value smears yellow through the frame when seen from behind.
      return new THREE.MeshStandardMaterial({
        color: 0xd8cdb4,
        emissive: 0x2a2314,
        roughness: 0.25,
        metalness: 0.35,
      });
    default:
      // The frame: satin black paint, the colour the whole bike is built around.
      return new THREE.MeshStandardMaterial({
        color: 0x2b2e34,
        roughness: 0.3,
        metalness: 0.7,
      });
  }
}

/**
 * The Amsterdam crosses. On the number plates they sit on a plate; on the
 * battery they are printed straight onto the black, so that version keeps a
 * transparent ground.
 */
function kruisTextuur(metPlaat: boolean): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 128;
  const g = c.getContext("2d")!;
  if (metPlaat) {
    g.fillStyle = "#0f1114";
    g.fillRect(0, 0, 256, 128);
  }
  g.strokeStyle = "#f4f6f8";
  g.lineWidth = 14;
  g.lineCap = "square";
  for (let i = 0; i < 3; i++) {
    const cx = 58 + i * 70;
    const r = 25;
    g.beginPath();
    g.moveTo(cx - r, 64 - r);
    g.lineTo(cx + r, 64 + r);
    g.moveTo(cx + r, 64 - r);
    g.lineTo(cx - r, 64 + r);
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
  g.fillStyle = "#f4f6f8";
  g.font = "700 38px ui-sans-serif, system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.letterSpacing = "6px";
  g.fillText("SPAAK", 128, 34);
  return new THREE.CanvasTexture(c);
}

/**
 * The markings the generator could not give us: brake discs that catch light,
 * a red tail lamp, the crosses on the badges and the wordmark on the frame.
 * All placed from the model's own measurements, so they follow a new model.
 */
function maakAccenten(
  groep: THREE.Group,
  delen: Deel[],
  wielen: Deel[],
): THREE.Group {
  // Their own group, deliberately unscaled. The model group carries a scale of
  // about sixteen to bring the export up to size, so world coordinates dropped
  // into it as local positions would be multiplied by that again.
  const accenten = new THREE.Group();
  const alles = new THREE.Box3().setFromObject(groep);
  const maat = new THREE.Vector3();
  alles.getSize(maat);

  const staal = new THREE.MeshStandardMaterial({
    color: 0xb8bfc6,
    roughness: 0.18,
    metalness: 1.0,
    side: THREE.DoubleSide,
  });
  const rood = new THREE.MeshStandardMaterial({
    color: 0xe11f28,
    emissive: 0x6d0f13,
    roughness: 0.25,
    metalness: 0.1,
  });
  const plaatMat = new THREE.MeshStandardMaterial({
    map: kruisTextuur(true),
    roughness: 0.45,
    metalness: 0.25,
  });
  const gedruktMat = new THREE.MeshStandardMaterial({
    map: kruisTextuur(false),
    transparent: true,
    roughness: 0.5,
    metalness: 0.1,
  });
  const merk = new THREE.MeshStandardMaterial({
    map: merkTextuur(),
    transparent: true,
    roughness: 0.5,
    metalness: 0.1,
  });

  // Brake discs and hubs: the one bit of bright metal on a black bike.
  for (const w of wielen) {
    const doos = new THREE.Box3().setFromObject(w.mesh);
    const c = doos.getCenter(new THREE.Vector3());
    const straal = Math.max(doos.max.y - doos.min.y, doos.max.z - doos.min.z) / 2;
    const kant = c.x >= 0 ? 1 : -1;

    const schijf = new THREE.Mesh(
      new THREE.RingGeometry(straal * 0.13, straal * 0.3, 20),
      staal,
    );
    schijf.rotation.y = Math.PI / 2;
    schijf.position.set(c.x - kant * (maat.x * 0.06 + 0.01), c.y, c.z);
    accenten.add(schijf);

    const naaf = new THREE.Mesh(
      new THREE.CylinderGeometry(straal * 0.12, straal * 0.12, maat.x * 0.16, 12),
      staal,
    );
    naaf.rotation.z = Math.PI / 2;
    naaf.position.set(c.x, c.y, c.z);
    accenten.add(naaf);
  }

  const zadel = delen.find((d) => d.rol === "zadel");
  const zadelDoos = zadel ? new THREE.Box3().setFromObject(zadel.mesh) : alles;

  // Anchor the markings on the frame, not on the whole model: the widest thing
  // on a bike is the handlebars, so a badge placed off the total width floats
  // out beside the frame instead of sitting on it.
  const frame = delen.find((d) => d.rol === "frame");
  const frameDoos = frame ? new THREE.Box3().setFromObject(frame.mesh) : alles;
  const frameMaat = frameDoos.getSize(new THREE.Vector3());
  const frameMidden = frameDoos.getCenter(new THREE.Vector3());

  // Tail lamp on the back of the rack.
  const licht = new THREE.Mesh(
    new THREE.BoxGeometry(frameMaat.x * 0.85, 0.05, 0.035),
    rood,
  );
  licht.position.set(0, zadelDoos.max.y - 0.06, alles.max.z - 0.02);
  accenten.add(licht);

  // Badges: one at each end, facing out.
  // Real sizes, not fractions of the frame: a badge is a badge whatever the
  // generator hands back, and the model is already normalised to 1,94 m.
  const plaatGeo = new THREE.PlaneGeometry(0.2, 0.09);
  const achterplaat = new THREE.Mesh(plaatGeo, plaatMat);
  achterplaat.position.set(0, alles.min.y + maat.y * 0.42, alles.max.z - 0.005);
  accenten.add(achterplaat);

  const voorplaat = new THREE.Mesh(plaatGeo, plaatMat);
  voorplaat.position.set(0, alles.min.y + maat.y * 0.45, alles.min.z + 0.005);
  voorplaat.rotation.y = Math.PI;
  accenten.add(voorplaat);

  // The battery flanks carry the crosses, and the down tube the wordmark.
  const flankGeo = new THREE.PlaneGeometry(0.3, 0.15);
  const naamGeo = new THREE.PlaneGeometry(0.26, 0.06);
  for (const kant of [-1, 1]) {
    const flank = new THREE.Mesh(flankGeo, gedruktMat);
    flank.position.set(
      kant * (frameMaat.x / 2 + 0.004),
      frameMidden.y - frameMaat.y * 0.06,
      frameMidden.z + frameMaat.z * 0.02,
    );
    flank.rotation.y = (kant * Math.PI) / 2;
    accenten.add(flank);

    const naam = new THREE.Mesh(naamGeo, merk);
    naam.position.set(
      kant * (frameMaat.x / 2 + 0.004),
      frameMidden.y + frameMaat.y * 0.22,
      frameMidden.z - frameMaat.z * 0.26,
    );
    naam.rotation.y = (kant * Math.PI) / 2;
    accenten.add(naam);
  }

  return accenten;
}

/**
 * Hang a wheel under a group sitting on its axle, so turning that group spins
 * the wheel in place.
 *
 * Deliberately not done by translating the geometry: these positions are
 * quantised and carry the offset in the node's own scale, so a shift computed
 * in the wrong space comes out orders of magnitude too large.
 */
function herpivoteer(mesh: THREE.Mesh, asWereld?: THREE.Vector3): THREE.Group | null {
  const ouder = mesh.parent;
  if (!ouder) return null;

  ouder.updateMatrixWorld(true);
  // Prefer the measured axle. A carved wheel is not symmetric, because the fork
  // and the mudguard are deliberately left out of it, so its bounding box centre
  // sits off the real axle and spinning around that swings the wheel into the
  // road.
  const middenWereld =
    asWereld?.clone() ??
    new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3());
  const middenOuder = ouder.worldToLocal(middenWereld.clone());

  const as = new THREE.Group();
  as.position.copy(middenOuder);
  ouder.add(as);

  // add() keeps the local transform, so shift the mesh back by the same amount
  // and it stays exactly where it was.
  mesh.position.sub(middenOuder);
  as.add(mesh);
  as.updateMatrixWorld(true);

  return as;
}

export async function laadFiets(): Promise<GeladenFiets | null> {
  try {
    const res = await fetch(PAD, { method: "HEAD" });
    if (!res.ok) return null;
  } catch {
    return null;
  }

  try {
    const gltf = await new GLTFLoader().loadAsync(PAD);
    const groep = new THREE.Group();
    groep.add(gltf.scene);

    let meshes: THREE.Mesh[] = [];
    gltf.scene.traverse((kind) => {
      if (kind instanceof THREE.Mesh) meshes.push(kind);
    });
    if (meshes.length === 0) return null;

    for (const m of meshes) {
      m.frustumCulled = false;
      if (!m.geometry.attributes.normal) m.geometry.computeVertexNormals();
    }

    // A textured export carries its own look; only a bare one gets ours.
    const getextureerd = meshes.some((m) => {
      const mat = m.material;
      const lijst = Array.isArray(mat) ? mat : [mat];
      return lijst.some((x) => "map" in x && (x as THREE.MeshStandardMaterial).map);
    });

    // --- orient: longest axis becomes the length, and it runs along z --------
    groep.updateMatrixWorld(true);
    let alles = new THREE.Box3().setFromObject(groep);
    const maat = new THREE.Vector3();
    alles.getSize(maat);
    if (maat.x > maat.z) groep.rotation.y = Math.PI / 2;
    else if (maat.y > maat.z && maat.y > maat.x) groep.rotation.x = Math.PI / 2;
    groep.updateMatrixWorld(true);

    // --- scale, centre, set down --------------------------------------------
    alles = new THREE.Box3().setFromObject(groep, true);
    alles.getSize(maat);
    const schaal = maat.z > 1e-4 ? DOELLENGTE / maat.z : 1;
    groep.scale.multiplyScalar(schaal);
    groep.updateMatrixWorld(true);

    alles = new THREE.Box3().setFromObject(groep, true);
    const midden = new THREE.Vector3();
    alles.getCenter(midden);
    groep.position.x -= midden.x;
    groep.position.z -= midden.z;
    groep.position.y -= alles.min.y;
    groep.updateMatrixWorld(true);

    // --- carve the wheels out of a fused mesh -------------------------------
    let wielMeshes: THREE.Mesh[] = [];
    let asVoor: THREE.Vector3 | null = null;
    let asAchter: THREE.Vector3 | null = null;
    if (meshes.length === 1) {
      const heel = meshes[0]!;
      heel.updateMatrixWorld(true);
      const stukken = splitsWielen(heel.geometry, heel.matrixWorld);
      if (stukken) {
        asVoor = new THREE.Vector3(0, stukken.schatting.straal, stukken.schatting.zVoor);
        asAchter = new THREE.Vector3(0, stukken.schatting.straal, stukken.schatting.zAchter);
        const ouder = heel.parent ?? gltf.scene;
        const maakDeel = (geo: THREE.BufferGeometry): THREE.Mesh => {
          const m = new THREE.Mesh(geo, heel.material);
          m.position.copy(heel.position);
          m.quaternion.copy(heel.quaternion);
          m.scale.copy(heel.scale);
          m.frustumCulled = false;
          ouder.add(m);
          return m;
        };
        const voorMesh = maakDeel(stukken.wielVoor.geometrie);
        const achterMesh = maakDeel(stukken.wielAchter.geometrie);
        const restMesh = maakDeel(stukken.rest.geometrie);
        ouder.remove(heel);
        wielMeshes = [voorMesh, achterMesh];
        meshes = [restMesh, voorMesh, achterMesh];
        console.info(
          `[spaak] wielen uit de mesh gesneden: straal ${stukken.schatting.straal.toFixed(2)} m, ` +
            `assen op z ${stukken.schatting.zVoor.toFixed(2)} en ${stukken.schatting.zAchter.toFixed(2)}, ` +
            `${stukken.wielVoor.driehoeken} + ${stukken.wielAchter.driehoeken} driehoeken.`,
        );
      } else {
        console.warn("[spaak] wielen niet uit de mesh te snijden; ze blijven stilstaan.");
      }
    }

    // --- measure the parts and work out what they are ------------------------
    const delen: Deel[] = meshes.map((mesh) => {
      const doos = new THREE.Box3().setFromObject(mesh);
      const m = new THREE.Vector3();
      const c = new THREE.Vector3();
      doos.getSize(m);
      doos.getCenter(c);
      return { mesh, doos, maat: m, midden: c, rol: "klein" as Rol };
    });

    if (wielMeshes.length === 2) {
      for (const d of delen) {
        d.rol = wielMeshes.includes(d.mesh) ? "wiel" : "frame";
      }
    } else {
      bepaalRollen(delen);
    }
    const wielen = delen.filter((d) => d.rol === "wiel");

    // --- face the right way -------------------------------------------------
    // The handlebars are the highest point on a bike and they sit at the front.
    // Find the actual highest vertex, not the centre of the part it belongs to:
    // on a single fused frame that centre sits near the middle and the answer
    // becomes a coin toss.
    const hoogstePunt = new THREE.Vector3(0, -Infinity, 0);
    const punt = new THREE.Vector3();
    for (const d of delen) {
      if (d.rol === "wiel") continue;
      d.mesh.updateMatrixWorld(true);
      const pos = d.mesh.geometry.getAttribute("position");
      for (let i = 0; i < pos.count; i++) {
        punt.fromBufferAttribute(pos, i).applyMatrix4(d.mesh.matrixWorld);
        if (punt.y > hoogstePunt.y) hoogstePunt.copy(punt);
      }
    }
    const stuur = delen.find((x) => x.rol === "stuur");
    const kijktVerkeerd = stuur ? stuur.midden.z > 0 : hoogstePunt.z > 0;
    const stuurPunt = new THREE.Vector3(
      0,
      hoogstePunt.y - 0.06,
      kijktVerkeerd ? -hoogstePunt.z : hoogstePunt.z,
    );
    console.info(
      `[spaak] hoogste punt op z ${hoogstePunt.z.toFixed(2)}, y ${hoogstePunt.y.toFixed(2)}` +
        `${kijktVerkeerd ? " -> omgedraaid" : ""}`,
    );
    if (kijktVerkeerd) {
      groep.rotation.y += Math.PI;
      groep.updateMatrixWorld(true);
      // The measured axles were taken before the turn, so turn them too.
      for (const as of [asVoor, asAchter]) {
        if (!as) continue;
        as.x = -as.x;
        as.z = -as.z;
      }
      for (const d of delen) {
        d.doos.setFromObject(d.mesh);
        d.doos.getSize(d.maat);
        d.doos.getCenter(d.midden);
      }
    }

    // --- materials ----------------------------------------------------------
    if (!getextureerd) {
      for (const d of delen) d.mesh.material = materiaalVoor(d.rol);
    }
    const accenten = getextureerd
      ? new THREE.Group()
      : maakAccenten(groep, delen, wielen);

    // --- anchors for the rider ----------------------------------------------
    /**
     * Find the bench on a fused model.
     *
     * The handlebars are higher than the seat, so they have to be excluded
     * first; after that the highest surface is the seat. Everything level with
     * it, within a few centimetres, is the bench, and its middle is where the
     * rider's hips go.
     */
    const schatZadel = (): THREE.Vector3 | null => {
      const punten: THREE.Vector3[] = [];
      const v = new THREE.Vector3();
      for (const d of delen) {
        if (d.rol === "wiel") continue;
        d.mesh.updateMatrixWorld(true);
        const pos = d.mesh.geometry.getAttribute("position");
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i).applyMatrix4(d.mesh.matrixWorld);
          punten.push(v.clone());
        }
      }
      if (punten.length === 0) return null;

      // The bars sit forward of the seat; drop the front quarter of the bike.
      const zGrens = -DOELLENGTE * 0.12;
      const achterste = punten.filter((q) => q.z > zGrens);
      if (achterste.length < 20) return null;

      let top = -Infinity;
      for (const q of achterste) if (q.y > top) top = q.y;

      const vlak = achterste.filter((q) => q.y > top - 0.05);
      if (vlak.length < 10) return null;
      // The plateau runs from the front of the bench to the back of the rack,
      // so its middle sits over the rear wheel. A rider sits on the front third.
      let zVoorste = Infinity;
      let zAchterste = -Infinity;
      for (const q of vlak) {
        if (q.z < zVoorste) zVoorste = q.z;
        if (q.z > zAchterste) zAchterste = q.z;
      }
      return new THREE.Vector3(0, top, zVoorste + (zAchterste - zVoorste) * 0.32);
    };
    const zadelDeel = delen.find((d) => d.rol === "zadel");
    const zadelDoos = zadelDeel
      ? new THREE.Box3().setFromObject(zadelDeel.mesh)
      : new THREE.Box3().setFromObject(groep);
    const heleDoos = new THREE.Box3().setFromObject(groep);
    const heleMaat = heleDoos.getSize(new THREE.Vector3());
    // Without a separate bench, put the rider at the seat height a bike of this
    // length would have, just behind the middle.
    const zadelTop = zadelDeel
      ? new THREE.Vector3(0, zadelDoos.max.y, (zadelDoos.min.z + zadelDoos.max.z) / 2)
      : (schatZadel() ??
        new THREE.Vector3(0, heleDoos.min.y + heleMaat.y * 0.72, heleMaat.z * 0.1));

    const trapperDelen = delen.filter((d) => d.rol === "trapper");
    let trapas: THREE.Vector3;
    if (trapperDelen.length > 0) {
      const doos = new THREE.Box3();
      for (const d of trapperDelen) doos.union(new THREE.Box3().setFromObject(d.mesh));
      const c = doos.getCenter(new THREE.Vector3());
      trapas = new THREE.Vector3(0, c.y + 0.17, c.z);
      for (const d of trapperDelen) d.mesh.visible = false;
    } else {
      trapas = new THREE.Vector3(0, zadelTop.y - 0.56, zadelTop.z - 0.34);
    }

    // --- wheels turn on their own axles -------------------------------------
    let voor: THREE.Object3D | null = null;
    let achter: THREE.Object3D | null = null;
    if (wielen.length === 2) {
      const gemeten = [asVoor, asAchter].filter((v): v is THREE.Vector3 => !!v);
      const assen: { as: THREE.Group; z: number }[] = [];
      for (const w of wielen) {
        const z = new THREE.Box3()
          .setFromObject(w.mesh)
          .getCenter(new THREE.Vector3()).z;
        // Match this piece to the nearer of the two measured axles.
        const anker = gemeten
          .slice()
          .sort((a, b) => Math.abs(a.z - z) - Math.abs(b.z - z))[0];
        const as = herpivoteer(w.mesh, anker);
        if (as) assen.push({ as, z });
      }
      if (assen.length === 2) {
        assen.sort((a, b) => a.z - b.z);
        voor = assen[0]!.as;
        achter = assen[1]!.as;
      }
    }

    // Put it on the road as the very last thing, and do it precisely.
    //
    // Box3.setFromObject walks the children's bounding boxes by default, which
    // for a rotated group gives the box of a box and not the shape itself. The
    // precise pass walks the vertices, which is what "the bottom of the tyre"
    // actually means.
    groep.updateMatrixWorld(true);
    const opDeGrond = new THREE.Box3().setFromObject(groep, true);
    groep.position.y -= opDeGrond.min.y;
    groep.updateMatrixWorld(true);

    const wereldX = new THREE.Vector3(1, 0, 0);
    const assenLokaal = new Map<THREE.Object3D, THREE.Vector3>();
    for (const w of [voor, achter]) {
      if (!w || !w.parent) continue;
      const q = new THREE.Quaternion();
      w.parent.getWorldQuaternion(q);
      assenLokaal.set(w, wereldX.clone().applyQuaternion(q.invert()).normalize());
    }
    const draaiWielen = (hoek: number): void => {
      for (const [wiel, as] of assenLokaal) wiel.rotateOnAxis(as, hoek);
    };

    console.info(
      `[spaak] fatbike.glb: ${delen.map((d) => d.rol).join(", ")} ` +
        `(${delen.length} delen, ${getextureerd ? "eigen textuur" : "eigen materialen"})`,
    );

    return {
      groep,
      wielVoor: voor,
      wielAchter: achter,
      draaibaar: !!voor && !!achter,
      accenten,
      draaiWielen,
      zadelTop,
      stuurPunt,
      trapas,
    };
  } catch (err) {
    console.warn("[spaak] fatbike.glb kon niet geladen worden.", err);
    return null;
  }
}
