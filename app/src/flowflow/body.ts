// The procedural body: a sphere with a droplet profile, drawn by the vertex shader. The same deformation is repeated here in
// plain numbers (for the part of it the eyes need), so the eyes can sit on the surface wherever the body has been bent.
import { SphereGeometry } from "three";
import type { BodyPose } from "./physics.ts";

export function bodyGeometry(): SphereGeometry { return new SphereGeometry(1, 56, 40); }

/** A point of the unit sphere to where it ends up on the bent body (breath, size, squash, stretch and lean; not the ripples). */
export function surfacePoint(x: number, y: number, z: number, pose: BodyPose, breath: number, expand: number, out: [number, number, number] = [0, 0, 0]): [number, number, number] {
  const top = smoothstep(-0.1, 1, y), base = smoothstep(0, -1, y);
  let px = x, py = y < 0 ? y * 0.62 : y * 1.04, pz = z;
  const widen = (1 + 0.16 * base) * (1 - 0.14 * top * top);
  px *= widen; pz *= widen;
  py *= 1 + breath; px *= 1 + expand; py *= 1 + expand; pz *= 1 + expand;
  py *= 1 - pose.squash; px *= 1 + 0.5 * pose.squash; pz *= 1 + 0.5 * pose.squash;
  const s = pose.stretch, dx = pose.dirX, dy = pose.dirY;
  let along = px * dx + py * dy, perpX = px - along * dx, perpY = py - along * dy;
  const k = 1 / Math.sqrt(1 + s);
  along *= 1 + s; perpX *= k; perpY *= k;
  px = along * dx + perpX; py = along * dy + perpY; pz *= k;
  px += pose.lean * (py + 0.8);
  out[0] = px; out[1] = py; out[2] = pz;
  return out;
}

function smoothstep(a: number, b: number, v: number): number {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
