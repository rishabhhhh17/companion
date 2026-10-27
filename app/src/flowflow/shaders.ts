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
  vec3 N = normalize(mix(normalize(vObjN), nFlat, 0.1));
  vec3 V = vec3(0.0, 0.0, 1.0);
  if (dot(N, V) < 0.0) N = -N;
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float fres = pow(1.0 - ndv, 2.6);
  // Inside the water: a gradient looked up through a window shifted by the surface (the refraction), a glow low in the body, moving caustic bands.
  vec2 uv = vP.xy * 0.62 + N.xy * uRefract * 0.3;
  float h = clamp(uv.y * 0.5 + 0.55, 0.0, 1.0);
  vec3 body = mix(uColB, uColA, pow(h, 0.8));
  float glowC = smoothstep(0.95, 0.0, length(uv - vec2(0.12, -0.28)));
  float caustic = pow(abs(sin(uv.x * 7.0 + sin(uv.y * 5.0 + uTime * 0.6) * 1.6 + uTime * 0.3)), 6.0) * 0.16;
  body += glowC * 0.3 * vec3(0.55, 0.95, 1.0) + caustic * vec3(0.7, 1.0, 1.0);
  // Highlights: a bright window-light top left, a soft rim bottom right.
  vec3 L = normalize(vec3(-0.45, 0.65, 0.62));
  float spec = pow(max(dot(N, normalize(L + V)), 0.0), mix(120.0, 28.0, uRough));
  float rim = pow(max(dot(N, normalize(vec3(0.5, -0.5, 0.7) + V)), 0.0), 40.0) * 0.28;
  // An error clouds and darkens the water; a success lifts it.
  body = mix(body, vec3(0.27, 0.36, 0.42) * (0.55 + 0.45 * h), uCloud * 0.78);
  body += uGlow * vec3(0.16, 0.34, 0.3);
  // Clarity: 1 is clear glass, 0 is dense.
  float a = mix(0.96, 0.58, uClarity);
  a = clamp(a + fres * 0.45 + glowC * 0.06 + uCloud * 0.3 + spec * 0.5, 0.0, 1.0);
  vec3 col = body + fres * vec3(0.75, 0.95, 1.0) * 0.85 + spec * vec3(1.0) + rim * vec3(0.6, 0.9, 1.0);
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
