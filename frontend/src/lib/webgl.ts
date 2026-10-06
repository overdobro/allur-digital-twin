/** Есть ли WebGL — без него 3D-цех заменяется 2D-конвейером. */
export function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}
