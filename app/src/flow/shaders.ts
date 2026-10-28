// The two small programs that draw Flowflow: a vertex program that bends a grid of points over the pose picture (breathing,
// jelly lag, squash, ripple), and a fragment program that dissolves one pose into the next and puts a little light on the
// water. The numbers they use come from physics.ts through uniforms; nothing here decides anything.

/** The picture sits in the middle of the canvas with this much empty room on every side, so a squash or a swing has room
 *  to move without being cut off. The same number places the touch point (renderer.ts). */
export const INSET = 0.14;

export const VERTEX = `
attribute vec2 a;
uniform float t, sq, wobble, bob, bobHz, lagGain;
uniform vec2 lag;
uniform vec4 rip;
varying vec2 uv;
void main() {
  vec2 p = a;
  float top = 1.0 - p.y;
  vec2 d = vec2(
    sin(t * 1.5 + p.y * 5.0) * 0.006 * top + sin(t * 2.3 + p.x * 6.0) * 0.004,
    sin(t * 1.9 + p.x * 4.0) * 0.005 * top) * wobble;
  d.y += sin(t * bobHz * 6.2831853) * bob * (0.4 + top);
  d -= lag * lagGain * pow(top, 1.5);
  float base = 0.93;
  vec2 q = vec2(p.x - 0.5, p.y - base);
  q.y *= (1.0 + sq);
  q.x *= (1.0 - sq * 0.55);
  p = vec2(0.5 + q.x, base + q.y) + d;
  if (rip.z >= 0.0) {
    vec2 dv = a - rip.xy;
    float r = length(dv);
    float w = sin(r * 20.0 - rip.z * 15.0) * exp(-r * 3.2) * rip.w * 0.016;
    p += normalize(dv + 1e-4) * w;
  }
  uv = a;
  vec2 c = ${INSET.toFixed(2)} + p * ${(1 - 2 * INSET).toFixed(2)};
  gl_Position = vec4(c * 2.0 - 1.0, 0.0, 1.0) * vec4(1.0, -1.0, 1.0, 1.0);
}`;

export const FRAGMENT = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D A, B;
uniform float mixv, t, calm, shimmer;
varying vec2 uv;
float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1.0, 0.0)), f.x), mix(h(i + vec2(0.0, 1.0)), h(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  vec4 c;
  if (calm > 0.5) {
    c = mix(texture2D(A, uv), texture2D(B, uv), mixv);
  } else {
    vec2 s = vec2(n(uv * 7.0 + t * 0.7), n(uv * 7.0 + 9.0 - t * 0.6)) - 0.5;
    vec2 u = uv + s * 0.006;
    vec4 a = texture2D(A, u);
    vec4 b = texture2D(B, u);
    float k = clamp(mixv * 1.5 - n(uv * 3.5 + t * 0.25) * 0.5, 0.0, 1.0);
    c = mix(a, b, smoothstep(0.42, 0.58, k));
    float sp = pow(max(0.0, n(u * 11.0 - vec2(t * 0.6, 0.0)) - 0.58), 2.0) * 1.4;
    c.rgb += sp * 0.22 * c.a * shimmer;
  }
  gl_FragColor = c;
}`;

/** The mesh: columns by rows of squares over the picture. 26 by 18 is smooth enough for a small body and costs next to nothing. */
export const MESH = { cols: 26, rows: 18 } as const;
