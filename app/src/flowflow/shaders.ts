// Flowflow's water, in GLSL. Nothing here is an image: the shape and the look are worked out per pixel. The "refraction" bends a
// small built in studio, never the desktop behind (a see-through window cannot), so it says water without claiming more.

// M37 (the founder, 30 Oct 2026, picking "clear glass water" from three live looks): Flowflow is drawn as one clean drop,
// worked out per pixel (a distance field, ray marched), not a bent sphere. The silhouette is fixed and calm: a round base
// that narrows smoothly to a soft point, a flat underside. The physics only leans, breathes and settles it a little; it
// never wobbles into lumps. The eyes are part of the same picture, so they always sit on the face and never float off.

/** A quad over the whole canvas; each pixel knows where it is in the world. */
export const BODY_VERTEX = /* glsl */ `
uniform vec2 uHalf;
varying vec2 vWorld;
void main(){ vWorld = position.xy * uHalf; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

export const BODY_FRAGMENT = /* glsl */ `
uniform vec2 uCenter;      // the body's centre in the world
uniform float uScale;      // world units per body unit
uniform float uPx;         // body units per pixel, for smooth edges
uniform vec4 uPose;        // breath, squash, lean, expand
uniform vec3 uMove;        // direction x, direction y, stretch
uniform vec4 uEyes;        // left x, left y, right x, right y (where each looks, -1 to 1)
uniform float uOpen;       // 0 shut, 1 open
uniform float uCloud, uGlow, uTime, uPour;
uniform vec4 uSurf;        // M37c: the surface it clings to, in body units: normal x, y (zero: none), how far, cling at rest
uniform float uPress;      // how hard it is pushed into it (a spring: a little past 1, or below 0, as it wobbles back)   // uPour: 0 still, 1 moving at its fastest (the tail it pours)
uniform vec3 uColA, uColB;
varying vec2 vWorld;

float smin(float a, float b, float k){ float h = clamp(0.5 + 0.5*(b-a)/k, 0.0, 1.0); return mix(b, a, h) - k*h*(1.0-h); }
float taper(vec3 p, vec3 a, vec3 b, float ra, float rb){ vec3 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-5), 0.0, 1.0); return length(pa - ba * h) - mix(ra, rb, h); }
float sdEll(vec3 p, vec3 r){ float k0 = length(p/r), k1 = length(p/(r*r)); return k0*(k0-1.0)/k1; }
float sdRoundCone(vec3 p, float r1, float r2, float h){ float b = (r1-r2)/h, a = sqrt(1.0-b*b); vec2 q = vec2(length(p.xz), p.y); float k = dot(q, vec2(-b, a)); if (k < 0.0) return length(q) - r1; if (k > a*h) return length(q - vec2(0.0, h)) - r2; return dot(q, vec2(a, b)) - r1; }

// Undo the pose on a point, so the drop itself can stay one fixed, clean shape.
vec3 unpose(vec3 p){
  p.x -= uPose.z * (p.y + 0.86);
  vec2 d = uMove.xy; float s = uMove.z;
  float along = dot(p.xy, d); vec2 perp = p.xy - along * d;
  along /= 1.0 + s; perp *= sqrt(1.0 + s);
  p.xy = along * d + perp;
  p.y /= (1.0 + uPose.x) * (1.0 - uPose.y); p.xz /= 1.0 + 0.5 * uPose.y;
  return p / (1.0 + uPose.w);
}
// M37b (the founder: "it does not look flowy… melts and reshapes"): it is liquid. At rest the point sways and slow
// waves run up its sides; moving, it stretches and pours a soft tail behind it that melts back in as it slows. Every
// change is low and smooth, so it never turns lumpy.
float body(vec3 p){
  vec3 q = unpose(p) - vec3(0.0, -0.18, 0.0); q.z *= 1.06;
  float up = smoothstep(-0.3, 1.1, q.y), calmed = 1.0 - 0.85 * clamp(uPress, 0.0, 1.0);   // pressed flat, it holds still
  q.x -= calmed * (0.06 * sin(uTime * 0.9) + 0.025 * sin(uTime * 1.7 + 1.3)) * up * up;          // the point sways like poured liquid
  float d = sdRoundCone(q, 0.80, 0.16, 1.02);
  d = smin(d, sdEll(q, vec3(0.86, 0.74, 0.82)), 0.18);
  float a = atan(q.z, q.x);
  d += calmed * 0.024 * sin(q.y * 4.2 - uTime * 1.8 + a) * smoothstep(1.0, 0.1, abs(q.y - 0.05)); // slow waves running up its sides
  d -= 0.03 * (0.5 + 0.5 * sin(uTime * 1.1)) * smoothstep(-0.2, -0.75, q.y);              // the base spreads and gathers, like settling water
  d = max(d, -(q.y + 0.68));   // the calm flat underside where it sits
  // Moving: the water pours out behind it in one smooth, tapering tail that melts back in as it slows.
  float pour = clamp(uPour, 0.0, 1.0);
  if (pour > 0.01) {
    vec3 from = vec3(0.0, -0.05, 0.0), to = from + vec3(-uMove.xy, 0.0) * (0.8 * pour);
    d = smin(d, taper(q, from, to, 0.5, 0.1 + 0.08 * (1.0 - pour)), 0.32);
  }
  return d * 0.8;
}
// M37c (the founder: "when it gets close to the water it sticks to the sides… the more I push it towards it, the flatter it
// gets"): near a surface (the screen's edge it is docked on, or Home's water) the water reaches for it and joins it in a soft
// fillet, and pushed into it the drop slides up to it and flattens against it, spreading along it, harder the harder it is
// pushed. Nothing is drawn past the surface: the screen ends there, or Home's own water takes over.
// Where a point of the picture is on the undeformed drop, once it has slid up to its surface and flattened against it.
float squeeze(){ return 1.0 - 0.45 * clamp(uPress, -0.2, 1.0); }   // flatter the harder it is pushed, never thinner than about half
vec3 toBody(vec3 p){
  vec2 sn = uSurf.xy;
  if (dot(sn, sn) < 0.25) return p;
  float pr = clamp(uPress, -0.2, 1.15);
  float slide = max(0.0, uSurf.z - 0.84) * clamp(pr * 1.5, 0.0, 1.0);   // pressed, it slides up to the surface
  vec3 b = p; b.xy -= sn * slide;
  float face = uSurf.z - slide;                                           // the surface, seen from the drop
  float s = dot(b.xy, sn); vec2 perp = b.xy - s * sn;
  s = face - (face - s) / squeeze();                                      // squashed against the surface
  perp /= 1.0 + 0.4 * max(pr, 0.0);                                       // and spread along it, as water does
  b.xy = s * sn + perp; b.z /= 1.0 + 0.25 * max(pr, 0.0);
  return b;
}
float drop(vec3 p){
  vec2 sn = uSurf.xy;
  if (dot(sn, sn) < 0.25) return body(p);
  float pl = uSurf.z, pr = clamp(uPress, -0.2, 1.15), m = clamp(max(pr, uSurf.w), 0.0, 1.0);
  float d = body(toBody(p)) * min(1.0, squeeze());
  // It joins the surface in a soft fillet, and a thin film of it spreads along the surface.
  d = smin(d, pl - dot(p.xy, sn), 0.02 + 0.42 * m);
  if (pr > 0.01) {   // the film spreads only while it is pushed in; at rest it only joins the surface
    vec2 t = vec2(-sn.y, sn.x), c = sn * pl;
    float len = 0.15 + 0.4 * pr;
    d = smin(d, taper(p, vec3(c - t * len, 0.0), vec3(c + t * len, 0.0), 0.03 + 0.12 * pr, 0.03 + 0.12 * pr), 0.12 + 0.25 * pr);
  }
  return max(d, dot(p.xy, sn) - pl);
}
vec3 nrm(vec3 p){ vec2 e = vec2(0.002, 0.0); return normalize(vec3(drop(p+e.xyy)-drop(p-e.xyy), drop(p+e.yxy)-drop(p-e.yxy), drop(p+e.yyx)-drop(p-e.yyx))); }

// A dark photo studio: a big soft box up left, a thin strip right, a dim back light.
float box(vec3 d, vec3 c, vec2 sz, float soft){ vec3 z = normalize(c); vec3 x = normalize(cross(vec3(0.0,1.0,0.0), z)); vec3 y = cross(z, x);
  float t = dot(d, z); if (t <= 0.0) return 0.0; vec2 q = vec2(dot(d, x), dot(d, y)) / t; vec2 a = abs(q) - sz; return 1.0 - smoothstep(-soft, soft, max(a.x, a.y)); }
vec3 env(vec3 d){
  vec3 c = vec3(0.012, 0.013, 0.016) + vec3(0.03) * smoothstep(-0.2, 0.9, d.y);
  c += vec3(1.0, 0.99, 0.97) * 3.2 * box(d, vec3(-0.55, 0.75, 0.55), vec2(0.42, 0.30), 0.05);
  c += vec3(0.92, 0.96, 1.0) * 2.2 * box(d, vec3(0.95, 0.15, 0.25), vec2(0.04, 0.55), 0.015);
  c += vec3(0.8, 0.85, 0.9) * 0.6 * box(d, vec3(0.0, 0.2, -1.0), vec2(0.8, 0.25), 0.2);
  return c;
}

void main(){
  vec2 lp = (vWorld - uCenter) / uScale;
  if (dot(lp, lp) > 2.6) { gl_FragColor = vec4(0.0); return; }   // far from the drop: nothing to march
  vec3 ro = vec3(lp, 3.0), rd = vec3(0.0, 0.0, -1.0);
  float t = 0.0, mind = 1e9, tBest = 0.0;
  for (int i = 0; i < 80; i++){ float d = drop(ro + rd*t); if (d < mind) { mind = d; tBest = t; } if (d < 0.0002) break; t += d; if (t > 6.0) break; }
  float cover = 1.0 - smoothstep(0.0, uPx * 1.5, mind);   // inside is solid; only the last pixel of the edge is soft
  // Where it meets its surface it melts into it: a soft fade just before the surface, never a hard cut line (M40).
  if (dot(uSurf.xy, uSurf.xy) > 0.25) cover *= smoothstep(0.0, 0.1, uSurf.z - dot(lp, uSurf.xy));
  if (cover <= 0.0) { gl_FragColor = vec4(0.0); return; }
  vec3 p = ro + rd*tBest, n = nrm(p), v = -rd, r = reflect(rd, n);
  float ndv = clamp(dot(n, v), 0.0, 1.0), fres = pow(1.0 - ndv, 4.0);
  vec3 q = unpose(toBody(p));   // the face rides with the body as it slides and flattens
  // Clear water: deeper where it is thick, glowing where light passes through the rim and gathers at the base.
  vec3 rf = refract(rd, n, 0.75);
  float g = smoothstep(-0.9, 1.45, q.y + rf.y * 0.5);
  vec3 inside = mix(uColB * 0.8, uColA, g) + env(rf) * 0.16;
  inside += uColA * 0.7 * pow(1.0 - ndv, 2.2);
  inside += uColA * 0.8 * smoothstep(-0.3, -0.9, q.y) * smoothstep(0.2, 0.9, ndv);
  inside = max(mix(vec3(dot(inside, vec3(0.299, 0.587, 0.114))), inside, 1.35), 0.0);   // clear water reads rich, not milky
  // An error clouds and darkens the water; a success lifts it.
  inside = mix(inside, vec3(0.30, 0.38, 0.44) * (0.5 + 0.5 * g), uCloud * 0.75);
  inside += uGlow * uColA * 0.35;
  vec3 col = mix(inside, env(r), 0.04 + 0.85 * fres);
  col += vec3(1.0) * pow(max(dot(r, normalize(vec3(-0.55, 0.75, 0.55))), 0.0), 140.0) * 3.0;
  col += vec3(0.9, 0.97, 1.0) * pow(max(dot(r, normalize(vec3(0.95, 0.15, 0.25))), 0.0), 400.0) * 2.0;
  // The face: two calm capsule eyes, each looking its own way, a quick blink, a glint.
  float face = smoothstep(0.15, 0.55, n.z);
  float eh = 0.13 * max(0.07, uOpen), ew = 0.062;
  for (int s = 0; s < 2; s++) {
    float side = s == 0 ? -1.0 : 1.0;
    vec2 look = s == 0 ? uEyes.xy : uEyes.zw;
    vec2 e = q.xy - vec2(side * 0.25 + look.x * 0.06, 0.06 + look.y * 0.045);
    float d = length(vec2(e.x, max(abs(e.y) - eh * 0.5, 0.0))) - ew;
    float eye = (1.0 - smoothstep(-uPx, uPx, d)) * face;
    col = mix(col, vec3(0.015, 0.02, 0.035), eye);
    float glint = 1.0 - smoothstep(0.0, 0.02, length(e - vec2(-0.02, eh * 0.35)));
    col = mix(col, vec3(1.0), glint * eye * step(0.3, uOpen));
  }
  col = col / (1.0 + col * 0.18);
  float a = cover * clamp(0.94 + 0.06 * fres + uCloud * 0.06, 0.0, 1.0);
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
