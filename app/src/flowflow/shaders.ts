// Flowflow's water, in GLSL. Nothing here is an image: the shape and the look are worked out per pixel. The "refraction" bends a
// small built in studio, never the desktop behind (a see-through window cannot), so it says water without claiming more.

// M60 (2 Nov 2026; the founder's friends said the old drop "looks like poop", and he asked for the best of six concepts): Flowflow
// is a perfectly round bubble of water that floats. Deep in the middle, brighter toward the edge, a thin light ring inside
// the rim, a soft crescent of light along the inside of the lower rim, one oval glint up and to the left. Its face is two
// soft closed arcs, no mouth. Two small bubbles follow it, drawn in the same picture (the same ray march), so they cost almost
// nothing. Everything that worked stays: it squashes and stretches, pours a tail when dragged, clings to and flattens
// against the screen's edge or Home's water, and sways a little; but its outline stays round in every state: no point on
// top, no flat bottom.

/** A quad over the whole canvas; each pixel knows where it is in the world. */
export const BODY_VERTEX = /* glsl */ `
uniform vec2 uHalf;
varying vec2 vWorld;
void main(){ vWorld = position.xy * uHalf; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

export const BODY_FRAGMENT = /* glsl */ `
uniform vec2 uCenter;      // the orb's centre in the world
uniform vec2 uHalf;        // half the canvas, in world units (the halo fades out before its edges)
uniform float uHaloK;      // M60: 1 its soft halo on a dark page, 0 none (Home draws its own glow behind it)
uniform float uScale;      // world units per body unit
uniform float uPx;         // body units per pixel, for smooth edges
uniform float uOrb;        // the orb's radius, in body units
uniform vec4 uPose;        // breath, squash, lean, expand
uniform vec3 uMove;        // direction x, direction y, stretch
uniform vec4 uEyes;        // left x, left y, right x, right y (where each looks, -1 to 1)
uniform float uOpen;       // 0 shut, 1 open
uniform vec2 uFace;        // M60: the eyes' arc (1 a soft closed arc, 0 flat, below 0 turned down) and how open (1 soft round eyes)
uniform vec4 uFace2;       // M83: eye size, catch light, brows, mouth (behavior.ts Look)
uniform vec4 uFace3;       // M83: heavy lids, how far the eyes turn, rising bubbles (z's), slow blink
uniform float uSweat;      // M83: worried's sweat drop, how far it has slid (0 to 1), below 0 none
uniform float uCloud, uGlow, uTime, uPour;   // uPour: 0 still, 1 moving at its fastest (the tail it pours)
uniform float uSway;       // M46: how much of the resting sway shows (0 Still at rest: the clean orb; 0.4 Gentle; 1 Lively)
uniform float uSwayTime;   // the sway's own clock (slower in Gentle); uTime stays for news motion
uniform float uAmber;      // M46: needs you's amber core, 0 to 1
uniform vec4 uSurf;        // M37c: the surface it clings to, in body units: normal x, y (zero: none), how far, cling at rest
uniform float uPress;      // how hard it is pushed into it (a spring: a little past 1, or below 0, as it wobbles back)
uniform vec4 uBub;         // M60: the two follower bubbles' centres from the orb's centre, in body units: a.x, a.y, b.x, b.y
uniform vec4 uBubZR;       // their depth (toward the viewer) and radius (0: popped), in body units: a.z, b.z, a.r, b.r
uniform vec3 uColA, uColB;
uniform vec3 uEnvBase;     // the page's own sky behind the orb (--pond), as written: its rim reflects that, not a dark studio
varying vec2 vWorld;

float smin(float a, float b, float k){ float h = clamp(0.5 + 0.5*(b-a)/k, 0.0, 1.0); return mix(b, a, h) - k*h*(1.0-h); }
float taper(vec3 p, vec3 a, vec3 b, float ra, float rb){ vec3 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-5), 0.0, 1.0); return length(pa - ba * h) - mix(ra, rb, h); }

// Undo the pose on a point, so the orb itself can stay one clean, round shape.
vec3 unpose(vec3 p){
  p.x -= uPose.z * (p.y + uOrb);
  vec2 d = uMove.xy; float s = uMove.z;
  float along = dot(p.xy, d); vec2 perp = p.xy - along * d;
  along /= 1.0 + s; perp *= sqrt(1.0 + s);
  p.xy = along * d + perp;
  p.y /= (1.0 + uPose.x) * (1.0 - uPose.y); p.xz /= 1.0 + 0.5 * uPose.y;
  return p / (1.0 + uPose.w);
}
// The orb: a ball of water. At rest it only sways and breathes a little, low and smooth, so it stays round; moving, it
// stretches and pours a soft tail behind it that melts back in as it slows.
float body(vec3 p){
  vec3 q = unpose(p);
  float calmed = 1.0 - 0.85 * clamp(uPress, 0.0, 1.0);   // pressed flat, it holds still
  q.x -= calmed * uSway * (0.03 * sin(uSwayTime * 0.9) + 0.012 * sin(uSwayTime * 1.7 + 1.3)) * (0.5 + 0.5 * q.y / uOrb);   // the round body sways
  float a = atan(q.y, q.x + 1e-4);   // never atan(0, 0) at the middle of its face
  float d = length(q) - uOrb;
  d += calmed * uSway * 0.01 * sin(3.0 * a - uSwayTime * 1.8);                    // slow waves run round its rim
  d += calmed * uSway * 0.014 * sin(uSwayTime * 1.1) * cos(2.0 * a);              // it widens and narrows, as a held drop of water does
  // Moving: the water pours out behind it in one smooth, tapering tail that melts back in as it slows.
  float pour = clamp(uPour, 0.0, 1.0);
  if (pour > 0.01) {
    vec3 to = vec3(-uMove.xy, 0.0) * (0.95 * pour);
    d = smin(d, taper(q, vec3(0.0), to, 0.46, 0.1 + 0.08 * (1.0 - pour)), 0.3);
  }
  return d * 0.85;
}
// M37c (the founder: "when it gets close to the water it sticks to the sides… the more I push it towards it, the flatter it
// gets"): near a surface (the screen's edge it is docked on, or Home's water) the water reaches for it and joins it in a soft
// fillet, and pushed into it the orb slides up to it and flattens against it, spreading along it, harder the harder it is
// pushed. Nothing is drawn past the surface: the screen ends there, or Home's own water takes over.
// Where a point of the picture is on the undeformed orb, once it has slid up to its surface and flattened against it.
float squeeze(){ return 1.0 - 0.45 * clamp(uPress, -0.2, 1.0); }   // flatter the harder it is pushed, never thinner than about half
vec3 toBody(vec3 p){
  vec2 sn = uSurf.xy;
  if (dot(sn, sn) < 0.25) return p;
  float pr = clamp(uPress, -0.2, 1.15);
  float slide = max(0.0, uSurf.z - (uOrb - 0.02)) * clamp(pr * 1.5, 0.0, 1.0);   // pressed, it slides up to the surface
  vec3 b = p; b.xy -= sn * slide;
  float face = uSurf.z - slide;                                           // the surface, seen from the orb
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
  // It joins the surface in a soft fillet (smaller than the old drop's, so at rest it stays round), and a thin film of it
  // spreads along the surface while it is pushed in.
  d = smin(d, pl - dot(p.xy, sn), 0.02 + 0.26 * m);
  if (pr > 0.01) {   // the film spreads only while it is pushed in; at rest it only joins the surface
    vec2 t = vec2(-sn.y, sn.x), c = sn * pl;
    float len = 0.15 + 0.4 * pr;
    d = smin(d, taper(p, vec3(c - t * len, 0.0), vec3(c + t * len, 0.0), 0.03 + 0.12 * pr, 0.03 + 0.12 * pr), 0.12 + 0.25 * pr);
  }
  return max(d, dot(p.xy, sn) - pl);
}
// M60: the two small bubbles that follow it: plain spheres, kept apart from the orb (never melted into it).
float bubbles(vec3 p){
  float d = 1e5;
  if (uBubZR.z > 0.002) d = length(p - vec3(uBub.xy, uBubZR.x)) - uBubZR.z;
  if (uBubZR.w > 0.002) d = min(d, length(p - vec3(uBub.zw, uBubZR.y)) - uBubZR.w);
  vec2 sn = uSurf.xy;
  return dot(sn, sn) < 0.25 ? d : max(d, dot(p.xy, sn) - uSurf.z);
}
float scene(vec3 p){ return min(drop(p), bubbles(p)); }
vec3 nrm(vec3 p){ vec2 e = vec2(0.002, 0.0); return normalize(vec3(drop(p+e.xyy)-drop(p-e.xyy), drop(p+e.yxy)-drop(p-e.yxy), drop(p+e.yyx)-drop(p-e.yyx))); }

// A dark photo studio: a big soft box up left, a thin strip right, a dim back light. Only a little of it shows in the rim.
float box(vec3 d, vec3 c, vec2 sz, float soft){ vec3 z = normalize(c); vec3 x = normalize(cross(vec3(0.0,1.0,0.0), z)); vec3 y = cross(z, x);
  float t = dot(d, z); if (t <= 0.0) return 0.0; vec2 q = vec2(dot(d, x), dot(d, y)) / t; vec2 a = abs(q) - sz; return 1.0 - smoothstep(-soft, soft, max(a.x, a.y)); }
vec3 env(vec3 d){
  vec3 c = vec3(0.012, 0.013, 0.016) + vec3(0.03) * smoothstep(-0.2, 0.9, d.y);
  c += vec3(1.0, 0.99, 0.97) * 3.2 * box(d, vec3(-0.55, 0.75, 0.55), vec2(0.42, 0.30), 0.05);
  c += vec3(0.92, 0.96, 1.0) * 2.2 * box(d, vec3(0.95, 0.15, 0.25), vec2(0.04, 0.55), 0.015);
  c += vec3(0.8, 0.85, 0.9) * 0.6 * box(d, vec3(0.0, 0.2, -1.0), vec2(0.8, 0.25), 0.2);
  return c;
}
// One eye: a soft round ended arc of a circle, w either side of its middle, rising h (below 0 turned down; near 0 a line).
float arcEye(vec2 e, float w, float h, float th){
  if (abs(h) < 0.004) return length(vec2(max(abs(e.x) - w, 0.0), e.y)) - th;
  if (h < 0.0) { e.y = -e.y; h = -h; }
  float ra = (w * w + h * h) / (2.0 * h);
  vec2 p = vec2(abs(e.x), e.y - (h - ra)), sc = vec2(w, ra - h) / ra;
  return (sc.y * p.x > sc.x * p.y ? length(p - sc * ra) : abs(length(p) - ra)) - th;
}
float dot1(vec2 u, vec2 c, float r, float aa){ return 1.0 - smoothstep(r - aa, r + aa, length(u - c)); }
float seg(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
// M83: the marks around it, outside the glass, in the orb's own units (v: from its centre, its radius 1, y up). Worried's
// one sweat drop slides down beside it; sleepy's small bubbles drift up from its top, like z's. Premultiplied.
vec4 marks(vec2 v, float aa){
  vec4 o = vec4(0.0);
  vec3 hi = mix(uColA, vec3(1.0), 0.35);
  if (uSweat >= 0.0) {
    float p = clamp(uSweat, 0.0, 1.0);
    vec2 c = vec2(1.0, 0.62 - 0.55 * p), q = v - c;
    q.y = q.y > 0.0 ? q.y * 0.55 : q.y;                   // a drop: round below, drawn up to a point above
    float d = length(q) - 0.11;
    float a = (1.0 - smoothstep(-aa, aa, d)) * (1.0 - smoothstep(0.8, 1.0, p));
    vec3 c3 = mix(hi, vec3(1.0), 0.7 * dot1(v, c + vec2(-0.03, 0.03), 0.03, aa));
    o = vec4(c3 * a, a);
  }
  float z = clamp(uFace3.z, 0.0, 1.0);
  if (z > 0.01) {
    for (int k = 0; k < 3; k++) {
      float fk = float(k), ph = fract(uTime * 0.22 + fk / 3.0);
      vec2 c = vec2(0.5 + 0.32 * ph + 0.05 * sin(uTime * 1.3 + fk * 2.0), 0.98 + 0.42 * ph);
      float r = 0.06 + 0.05 * ph;
      float ring = 1.0 - smoothstep(-aa, aa, abs(length(v - c) - r) - 0.022);
      float a = ring * z * sin(3.14159 * ph) * (1.0 - o.a);
      o += vec4(hi * a, a);
    }
  }
  return o;
}

// The glass of a bubble of water, for the orb and each follower alike. n: the surface's normal; u: where on the round ball
// (-1 to 1 across, y up), so the light rides with the body as it squashes; aa: one pixel in those units.
vec3 glass(vec3 n, vec2 u, float aa, out float edge){
  vec3 deep = uColB * 0.78, mid = mix(uColB, uColA, 0.42), hi = mix(uColA, vec3(1.0), 0.6);
  float ndv = clamp(n.z, 0.0, 1.0), s = sqrt(max(0.0, 1.0 - ndv * ndv));   // s: how far out toward the rim (1 at the edge)
  edge = s;
  // Deep in the middle (a touch above centre), brighter toward the edge, light at the very rim.
  vec3 c = mix(deep, mid, smoothstep(0.0, 0.7, length(u - vec2(0.0, 0.1))));
  c = mix(c, hi, smoothstep(0.88, 1.0, s) * 0.7);
  // Light gathers at the base, and a soft crescent of it lies along the inside of the lower rim.
  c = mix(c, hi, 0.55 * pow(1.0 - smoothstep(0.0, 0.8, length(u - vec2(0.1, -0.74))), 1.6));
  float cres = smoothstep(0.66, 0.84, s) * (1.0 - smoothstep(0.9, 0.97, s)) * smoothstep(-0.3, -0.8, u.y);
  c = mix(c, hi, 0.6 * cres);
  // A soft wash of light up and to the left.
  c = mix(c, vec3(1.0), 0.24 * (1.0 - smoothstep(0.0, 0.78, length(u - vec2(-0.37, 0.5)))));
  return c;
}
// The thin light ring inside the rim (brightest up left and down right) and the oval glint up and to the left.
vec3 sheen(vec3 c, vec2 u, float s, float aa, float big){
  float w = max(aa, 0.012);
  float ring = smoothstep(0.935 - w, 0.935, s) * (1.0 - smoothstep(0.978, 0.978 + w, s));
  float t = clamp(dot(u - vec2(-0.83, 0.83), vec2(1.5, -1.66)) / 5.0, 0.0, 1.0);
  c = mix(c, vec3(1.0), ring * (0.3 + 0.62 * pow(abs(2.0 * t - 1.0), 1.2)));
  c = mix(c, uColB * 0.7, 0.35 * smoothstep(0.985, 1.0, s));   // a fine deep line at the very edge, so it holds on white
  vec2 g = u - vec2(-0.45, 0.55), ax = vec2(0.788, 0.616);
  float e = length(vec2(dot(g, ax) / 0.19, dot(g, vec2(-ax.y, ax.x)) / 0.105));
  c = mix(c, vec3(1.0), 0.92 * (1.0 - smoothstep(1.0 - aa * 9.0, 1.0 + aa * 9.0, e)));
  c = mix(c, vec3(1.0), 0.85 * big * dot1(u, vec2(-0.2, 0.733), 0.04, aa));
  return c;
}

void main(){
  vec2 lp = (vWorld - uCenter) / uScale;
  vec4 mk = marks(lp / uOrb, uPx / uOrb);
  // Far from the orb and both bubbles: nothing to march.
  if (dot(lp, lp) > 2.6 && length(lp - uBub.xy) > uBubZR.z + 0.45 && length(lp - uBub.zw) > uBubZR.w + 0.45) { gl_FragColor = mk; return; }
  vec3 ro = vec3(lp, 3.0), rd = vec3(0.0, 0.0, -1.0);
  float t = 0.0, mind = 1e9, tBest = 0.0;
  for (int i = 0; i < 80; i++){ float d = scene(ro + rd*t); if (d < mind) { mind = d; tBest = t; } if (d < 0.0002) break; t += d; if (t > 6.0) break; }
  float cover = 1.0 - smoothstep(0.0, uPx * 1.5, mind);   // inside is solid; only the last pixel of the edge is soft
  // Where it meets its surface it melts into it: a soft fade just before the surface, never a hard cut line (M40).
  float fade = 1.0;
  if (dot(uSurf.xy, uSurf.xy) > 0.25) fade = smoothstep(0.0, 0.1, uSurf.z - dot(lp, uSurf.xy));
  cover *= fade;
  // A soft halo of its own light round it on a dark page; none on a light one, where it would only be a smudge.
  float sky = dot(uEnvBase, vec3(0.299, 0.587, 0.114));
  float halo = pow(1.0 - smoothstep(0.0, 0.42, max(mind, 0.0)), 2.0) * 0.3 * (1.0 - smoothstep(0.1, 0.45, sky)) * fade;
  vec2 room = uHalf - abs(vWorld);
  halo *= smoothstep(0.0, 0.3, min(room.x, room.y));   // and it fades out before any edge of the canvas, never a hard box
  halo *= uHaloK;
  vec3 haloCol = mix(uColB, uColA, 0.5) * (1.0 + uGlow * 0.6);
  haloCol = mix(haloCol, vec3(1.0, 0.69, 0.125), uAmber * 0.55);
  if (cover <= 0.0) { gl_FragColor = mk + vec4(haloCol * halo, halo) * (1.0 - mk.a); return; }
  vec3 p = ro + rd*tBest;
  // Which was hit: the orb, or one of its bubbles.
  float dA = uBubZR.z > 0.002 ? length(p - vec3(uBub.xy, uBubZR.x)) - uBubZR.z : 1e5;
  float dB = uBubZR.w > 0.002 ? length(p - vec3(uBub.zw, uBubZR.y)) - uBubZR.w : 1e5;
  float dO = drop(p);
  bool isBub = min(dA, dB) < dO;
  vec3 n, q; vec2 u; float aa;
  if (isBub) {
    vec3 c = dA < dB ? vec3(uBub.xy, uBubZR.x) : vec3(uBub.zw, uBubZR.y); float r = dA < dB ? uBubZR.z : uBubZR.w;
    n = normalize(p - c); q = p; u = (p.xy - c.xy) / r; aa = uPx / r;
  } else {
    n = nrm(p); q = unpose(toBody(p));   // the face and the light ride with the body as it slides and flattens
    u = q.xy / uOrb; aa = uPx / uOrb;
  }
  vec3 v = -rd, r = reflect(rd, n);
  float ndv = clamp(dot(n, v), 0.0, 1.0), fres = pow(1.0 - ndv, 4.0), s;
  vec3 inside = glass(n, u, aa, s);
  // An error clouds and dulls the water; a success lifts it.
  inside = mix(inside, vec3(0.34, 0.42, 0.5) * (0.7 + 0.3 * s), uCloud * 0.6);
  inside += uGlow * uColA * 0.3;
  // Needs you (the audit, item 29): only a little amber in the core, so the water stays water and never turns olive, and an
  // amber light in the rim, so it reads as lit, asking.
  inside = mix(inside, vec3(1.0, 0.69, 0.125) * (0.55 + 0.45 * s), uAmber * 0.18);
  // The rim reflects the page's own sky (the audit, item 30): on a light page a dark studio read as a pencil outline.
  vec3 col = mix(inside, env(r) + uEnvBase * 0.9, 0.2 * fres);
  col = sheen(col, u, s, aa, isBub ? 0.0 : 1.0);
  col += vec3(1.0, 0.69, 0.125) * uAmber * fres * 0.9;
  if (!isBub) {
    // Two tiny sparkles inside the lower right.
    col = mix(col, vec3(1.0), 0.8 * dot1(u, vec2(0.5, -0.667), 0.04, aa) + 0.6 * dot1(u, vec2(0.667, -0.517), 0.024, aa));
    // The face: two soft closed arcs, each looking its own way; a blink flattens them for a moment. Listening and needs you
    // open them into soft round eyes, with a glint.
    float face = smoothstep(0.15, 0.55, n.z);
    vec3 ink = vec3(0.016, 0.06, 0.14);
    float dotE = clamp(uFace.y, 0.0, 1.0), open = clamp(uOpen, 0.0, 1.2);
    // M83: each reaction's own marks (behavior.ts Look): the eyes' size, a clear catch light, the brows, a small smile, heavy
    // lids and how far the eyes turn.
    float size = max(0.5, uFace2.x), glintK = clamp(uFace2.y, 0.0, 1.0), lid = clamp(uFace3.x, 0.0, 1.0), reach = max(1.0, uFace3.y);
    for (int k = 0; k < 2; k++) {
      float side = k == 0 ? -1.0 : 1.0;
      vec2 look = k == 0 ? uEyes.xy : uEyes.zw;
      vec2 e = u - vec2(side * 0.283 + look.x * 0.075 * reach, 0.02 + look.y * 0.055 * reach);
      e /= size;
      float w = mix(0.108, 0.006, dotE), th = mix(0.038, 0.058, dotE);
      float h = 0.067 * uFace.x * min(open, 1.0) * (1.0 - dotE);
      e.y /= mix(1.0, max(0.1, min(open, 1.1)) * 1.6, dotE);   // round eyes are a little tall, and a blink shuts them
      e.y += h * 0.4;                                          // the arc sits on the eye's line, its rise above it
      float d = arcEye(e, w, h, th);
      d = max(d, e.y - mix(0.2, 0.004, lid));                  // heavy lids: the top of the eye flat
      float eye = (1.0 - smoothstep(-aa, aa, d)) * face;
      col = mix(col, ink, eye);
      // The glint: a white point in an open round eye (on a closed arc it would read as a pupil); a clear catch light when
      // the reaction asks for one.
      float glint = dotE * dot1(e, vec2(-0.02, 0.035) * (1.0 + 0.4 * glintK) * (1.0 - lid), 0.02 + 0.016 * glintK, aa);
      col = mix(col, vec3(1.0), glint * eye * step(0.3, uOpen));
      // The brows: a short stroke above each eye, its inner end raised (worried).
      if (uFace2.z > 0.01) {
        vec2 a0 = vec2(side * 0.16, 0.25), a1 = vec2(side * 0.37, 0.19);
        float b = 1.0 - smoothstep(-aa, aa, seg(u - vec2(look.x * 0.03, 0.0), a0, a1) - 0.024);
        col = mix(col, ink, b * face * clamp(uFace2.z, 0.0, 1.0));
      }
    }
    // A small happy mouth curve (hello).
    if (uFace2.w > 0.01) {
      float m = 1.0 - smoothstep(-aa, aa, arcEye(u - vec2(0.0, -0.13), 0.075, -0.045, 0.02));
      col = mix(col, ink, m * face * clamp(uFace2.w, 0.0, 1.0));
    }
  }
  col = col / (1.0 + col * 0.12);
  float a = cover * clamp(0.96 + 0.04 * fres + uCloud * 0.04, 0.0, 1.0);
  vec4 body = vec4(col * a + haloCol * halo * (1.0 - a), a + halo * (1.0 - a));
  gl_FragColor = mk + body * (1.0 - mk.a);
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
