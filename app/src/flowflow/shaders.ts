// Flowflow's water, in GLSL. Nothing here is an image: the shape is a sphere bent in the vertex shader, the look is worked
// out per pixel. The "refraction" is a small shift of an internal gradient by the surface normal (a see-through window cannot
// bend the desktop behind it, so this says it is water without claiming more than it does).

export const BODY_VERTEX = /* glsl */ `
uniform float uTime;
uniform vec3 uShape;     // breath, expand, squash
uniform vec4 uMove;      // direction x, direction y, stretch, lean
uniform vec4 uWobble;    // mode 2, mode 3 (already scaled), phase 2, phase 3
uniform vec4 uContact;   // x, y (from the body's centre), strength
uniform vec4 uRipple[4]; // x, y (from the body's centre), age, strength
uniform float uRippleGain;
uniform float uNoise;
varying vec3 vView;
varying vec3 vObjN;
varying vec3 vP;

float hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vnoise(vec3 x){
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}

// A unit sphere becomes a droplet: a slightly flattened base that spreads a little, a top that narrows softly.
vec3 droplet(vec3 p){
  float top = smoothstep(-0.1, 1.0, p.y), base = smoothstep(0.0, -1.0, p.y);
  vec3 q = p; q.y = p.y < 0.0 ? p.y * 0.62 : p.y * 1.04;
  q.xz *= (1.0 + 0.16 * base) * (1.0 - 0.14 * top * top);
  return q;
}

void main(){
  vec3 p = droplet(position);
  vec3 n = normalize(normal);
  p.y *= 1.0 + uShape.x; p *= 1.0 + uShape.y;
  p.y *= 1.0 - uShape.z; p.xz *= 1.0 + 0.5 * uShape.z;
  // Stretch along the way it moves, keeping its volume.
  vec2 d = uMove.xy; float s = uMove.z;
  float along = dot(p.xy, d); vec2 perp = p.xy - along * d;
  along *= 1.0 + s; perp *= inversesqrt(1.0 + s);
  p.xy = along * d + perp; p.z *= inversesqrt(1.0 + s);
  p.x += uMove.w * (p.y + 0.8);
  // Wobble: two ring-down modes around the body.
  float th = atan(p.y, p.x);
  float w = uWobble.x * cos(2.0 * th + uWobble.z) + uWobble.y * cos(3.0 * th + uWobble.w);
  p.xy += normalize(p.xy + vec2(1e-4)) * w;
  // A touch dents the surface where it landed.
  float dist = length(p.xy - uContact.xy);
  float dent = uContact.z * exp(-dist * dist * 9.0);
  p.xy -= normalize(p.xy + vec2(1e-4)) * dent * 0.2; p.z -= dent * 0.12;
  // Slow surface movement.
  p += n * (vnoise(position * 2.2 + vec3(0.0, uTime * 0.35, uTime * 0.2)) - 0.5) * uNoise;
  // Ripples spreading from where it was touched.
  for (int i = 0; i < 4; i++) {
    vec4 r = uRipple[i];
    if (r.w > 0.001) {
      float dd = length(p.xy - r.xy), front = r.z * 1.1;
      p += n * sin((dd - front) * 14.0) * exp(-abs(dd - front) * 4.0) * r.w * 0.05 * uRippleGain;
    }
  }
  vP = p; vObjN = normalize(normalMatrix * n);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vView = mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;

export const BODY_FRAGMENT = /* glsl */ `
uniform float uTime, uCloud, uGlow, uClarity, uRefract, uRough;
uniform vec3 uColA, uColB;
varying vec3 vView;
varying vec3 vObjN;
varying vec3 vP;

void main(){
  vec3 nFlat = normalize(cross(dFdx(vView), dFdy(vView)));
  vec3 N = normalize(mix(normalize(vObjN), nFlat, 0.08));
  vec3 V = vec3(0.0, 0.0, 1.0);
  if (dot(N, V) < 0.0) N = -N;
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float fres = pow(1.0 - ndv, 3.0);
  // M32 (the founder: "fix the water… it needs to look premium"): lit like a glass product shot. Inside: deep at the base,
  // lighter at the top, light gathering low in the body; the old caustic stripes are only a faint shimmer now.
  vec2 uv = vP.xy * 0.62 + N.xy * uRefract * 0.3;
  float h = clamp(uv.y * 0.5 + 0.55, 0.0, 1.0);
  vec3 body = mix(uColB * 0.72, uColA, smoothstep(0.0, 1.0, h));
  float core = smoothstep(0.9, 0.0, length(uv - vec2(0.05, -0.32)));
  body += core * 0.22 * mix(uColA, vec3(1.0), 0.35);
  float caustic = pow(abs(sin(uv.x * 6.0 + sin(uv.y * 4.0 + uTime * 0.5) * 1.4 + uTime * 0.25)), 10.0) * 0.05;
  body += caustic * vec3(0.8, 1.0, 1.0);
  // Studio reflections read off the surface's direction: a big soft window top left, a thin strip of light on the right,
  // a faint horizon, a crisp key highlight, a small second one, and a glassy rim.
  vec2 r = N.xy;
  float win = smoothstep(0.24, 0.02, length((r - vec2(-0.5, 0.62)) * vec2(1.0, 1.5)));
  float strip = smoothstep(0.03, 0.0, abs(r.x - 0.46) - 0.03) * smoothstep(0.1, 0.0, abs(r.y - 0.35) - 0.2);
  float horizon = smoothstep(0.05, 0.0, abs(r.y + 0.05)) * 0.12;
  vec3 L = normalize(vec3(-0.45, 0.65, 0.62));
  float spec = pow(max(dot(N, normalize(L + V)), 0.0), mix(220.0, 40.0, uRough));
  float spec2 = pow(max(dot(N, normalize(normalize(vec3(0.6, 0.4, 0.7)) + V)), 0.0), 90.0) * 0.35;
  float rim = pow(max(dot(N, normalize(vec3(0.5, -0.5, 0.7) + V)), 0.0), 30.0) * 0.35;
  // An error clouds and darkens the water; a success lifts it.
  body = mix(body, vec3(0.27, 0.36, 0.42) * (0.55 + 0.45 * h), uCloud * 0.78);
  body += uGlow * vec3(0.16, 0.34, 0.3);
  // Clarity: 1 is clear glass, 0 is dense.
  float a = mix(0.97, 0.62, uClarity);
  a = clamp(a + fres * 0.5 + uCloud * 0.3 + (spec + win * 0.6) * 0.5, 0.0, 1.0);
  vec3 col = body * (0.85 + 0.15 * ndv)
    + fres * mix(vec3(0.7, 0.9, 1.0), vec3(1.0), 0.4) * 0.9
    + (win * 0.6 + strip * 0.4 + horizon) * vec3(1.0)
    + spec * vec3(1.0) + spec2 * vec3(1.0) + rim * mix(uColA, vec3(1.0), 0.5);
  gl_FragColor = vec4(col * a, a);
}`;

export const DROP_VERTEX = /* glsl */ `
attribute float aSize;
uniform float uPixels; // pixels per world unit
varying float vSize;
void main(){
  vSize = aSize;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = max(0.0, aSize * 2.0 * uPixels);
  gl_Position = projectionMatrix * mv;
}`;

export const DROP_FRAGMENT = /* glsl */ `
varying float vSize;
uniform vec3 uColA;
void main(){
  if (vSize <= 0.0) discard;
  vec2 c = gl_PointCoord * 2.0 - 1.0; float r = length(c);
  if (r > 1.0) discard;
  float edge = smoothstep(1.0, 0.8, r);
  float hl = smoothstep(0.55, 0.0, length(c - vec2(-0.35, 0.4)));
  vec3 col = uColA * (0.75 + 0.25 * (1.0 - r)) + hl * 0.7;
  float a = edge * 0.9;
  gl_FragColor = vec4(col * a, a);
}`;
