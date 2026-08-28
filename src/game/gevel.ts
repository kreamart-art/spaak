import * as THREE from "three";

/**
 * The facade look, injected into a stock MeshLambertMaterial.
 *
 * Everything is derived in metres from the instance's own scale, so a 5 m canal
 * house and a 40 m warehouse get windows of the same real size instead of the
 * same number of windows. The storey count comes straight from 3DBAG, so the
 * window rows line up with the actual floors of the actual building.
 */
export const LAGEN_ATTRIBUUT = "aLagen";
export const JAAR_ATTRIBUUT = "aJaar";

const VERTEX_HEAD = /* glsl */ `
attribute float aLagen;
attribute float aJaar;
varying vec3 vMeters;
varying vec3 vRuw;
varying vec3 vNrm;
varying float vLagen;
varying float vJaar;
`;

const VERTEX_BODY = /* glsl */ `
  // Recover the instance size from the columns of its matrix.
  vec3 maat = vec3(1.0);
  #ifdef USE_INSTANCING
    maat = vec3(
      length(instanceMatrix[0].xyz),
      length(instanceMatrix[1].xyz),
      length(instanceMatrix[2].xyz)
    );
  #endif
  vMeters = position * maat;
  vRuw = position;
  // Object space, not view space: the building is rotated, and we need to know
  // which of its own faces this is.
  vNrm = normal;
  vLagen = aLagen;
  vJaar = aJaar;
`;

const FRAGMENT_HEAD = /* glsl */ `
varying vec3 vMeters;
varying vec3 vRuw;
varying vec3 vNrm;
varying float vLagen;
varying float vJaar;

float blok(float x, float a, float b) {
  return step(a, x) * step(x, b);
}

float ruisje(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}
`;

/**
 * Windows, a shopfront on the ground floor, a cornice under the roof and a
 * brick grain over the whole thing. Roof and ground faces are left alone.
 */
const FRAGMENT_BODY = /* glsl */ `
  // vRuw.y runs 0..1 over the height, so the top and bottom caps are easy to
  // spot and must not get windows.
  float zijkant = 1.0 - step(0.7, abs(vNrm.y));

  if (zijkant > 0.5) {
    float hoogte = max(vMeters.y, 0.001);
    float totaal = hoogte / max(vRuw.y, 0.001);
    float lagen = max(1.0, floor(vLagen + 0.5));
    float laagH = totaal / lagen;

    // Which way is this face pointing? Use the horizontal axis that runs along
    // the wall, not through it.
    float hz = abs(vNrm.x) > 0.5 ? vMeters.z : vMeters.x;

    float laag = floor(vMeters.y / laagH);
    float fy = fract(vMeters.y / laagH);
    float raamPitch = 2.15;
    float fx = fract(hz / raamPitch + 0.5);

    // Ground floor: taller opening, wider, reads as a shopfront or a stoep.
    bool begane = laag < 0.5;
    float loY = begane ? 0.16 : 0.30;
    float hiY = begane ? 0.80 : 0.82;
    float loX = begane ? 0.14 : 0.24;
    float hiX = begane ? 0.86 : 0.76;

    float raam = blok(fx, loX, hiX) * blok(fy, loY, hiY);
    // Nothing above the top floor line.
    raam *= step(vMeters.y, totaal - laagH * 0.12);

    // Glass: dark, with a cool sky reflection towards the top of the pane.
    vec3 glas = mix(vec3(0.055, 0.065, 0.085), vec3(0.34, 0.42, 0.52), fy);
    // A pale frame just outside the pane.
    float kozijn = blok(fx, loX - 0.05, hiX + 0.05) * blok(fy, loY - 0.05, hiY + 0.05) - raam;
    kozijn = clamp(kozijn, 0.0, 1.0) * step(vMeters.y, totaal - laagH * 0.12);

    // Cornice: a light band right under the eaves, and a plinth at the bottom.
    float kroon = blok(vMeters.y, totaal - 0.55, totaal);
    float plint = blok(vMeters.y, 0.0, 0.55);

    // Brick grain, in courses.
    vec2 steen = vec2(floor(hz / 0.21 + mod(floor(vMeters.y / 0.075), 2.0) * 0.5), floor(vMeters.y / 0.075));
    float korrel = ruisje(steen) * 0.16 - 0.08;

    // Older buildings are darker, sootier brick; post-war ones lighter.
    float leeftijd = clamp((1900.0 - vJaar) / 300.0, -0.35, 0.35);

    vec3 muur = diffuseColor.rgb * (1.0 + korrel - leeftijd * 0.35);
    muur = mix(muur, muur * 1.28 + 0.06, kroon);
    muur = mix(muur, muur * 0.72, plint);
    muur = mix(muur, muur * 1.15 + 0.03, kozijn);
    diffuseColor.rgb = mix(muur, glas, raam);
  }
`;

/** Attach the facade to a material and keep its lighting and fog intact. */
export function hechtGevel(materiaal: THREE.Material): void {
  const vorige = materiaal.onBeforeCompile;
  materiaal.onBeforeCompile = (shader, renderer) => {
    vorige?.call(materiaal, shader, renderer);

    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${VERTEX_HEAD}`)
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>\n${VERTEX_BODY}`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${FRAGMENT_HEAD}`)
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>\n${FRAGMENT_BODY}`,
      );
  };
  materiaal.needsUpdate = true;
}
