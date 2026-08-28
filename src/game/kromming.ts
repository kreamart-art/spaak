import * as THREE from "three";
import { KROMMING_CLAMP } from "./constanten.ts";

/**
 * The player runs down a straight tunnel; the world bends around it. This is a
 * vertex shader trick injected into stock materials, so everything stays
 * MeshLambertMaterial and keeps its lighting and fog.
 *
 * It is purely visual. Collision, lane positions and the streaming cursor all
 * work on the straight local x and z, untouched.
 */
export class Kromming {
  readonly uniforms = {
    uCurve: { value: 0 },
    uPitch: { value: 0 },
  };

  private doel = 0;

  /** Attach the bend to a material. Safe to call once per material. */
  hecht<T extends THREE.Material>(materiaal: T): T {
    const uniforms = this.uniforms;
    materiaal.onBeforeCompile = (shader) => {
      shader.uniforms.uCurve = uniforms.uCurve;
      shader.uniforms.uPitch = uniforms.uPitch;
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          "#include <common>\nuniform float uCurve;\nuniform float uPitch;",
        )
        .replace(
          "#include <project_vertex>",
          `vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
  mvPosition = instanceMatrix * mvPosition;
#endif
mvPosition = modelViewMatrix * mvPosition;
float d = -mvPosition.z;
mvPosition.x += uCurve * d * d * 0.0009;
mvPosition.y -= abs(uCurve) * d * d * 0.0002 + uPitch * d * d * 0.0004;
gl_Position = projectionMatrix * mvPosition;`,
        );
    };
    // Force a recompile if the material was already used.
    materiaal.needsUpdate = true;
    return materiaal;
  }

  /** Target bend for this frame, before smoothing. */
  richt(curve: number, pitch: number): void {
    this.doel = Math.max(-KROMMING_CLAMP, Math.min(KROMMING_CLAMP, curve));
    this.uniforms.uPitch.value = pitch;
  }

  /** Ease toward the target so a sharp OSM bend does not snap the horizon. */
  werkBij(dt: number, snelheid: number): void {
    const f = 1 - Math.exp(-snelheid * dt);
    this.uniforms.uCurve.value += (this.doel - this.uniforms.uCurve.value) * f;
  }

  get huidig(): number {
    return this.uniforms.uCurve.value;
  }
}
