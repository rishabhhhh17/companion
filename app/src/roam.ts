// The companion comes to what it is about (F18 item 2). The shell moves the character (roam.rs) and tells this page the
// named state it is in, so the founder's art can follow it later (the water idea: it surfaces from its edge, travels,
// settles beside the window, and returns). The placeholder dot only hints at each one, and not at all with reduced motion.
export const ROAM_PHASES = ["home", "surface", "travel", "settle", "visiting", "return"] as const;
export type RoamPhase = (typeof ROAM_PHASES)[number];
export type Toward = "left" | "right" | "up" | "down";
export type Roam = { phase: RoamPhase; toward: Toward | null };
const TOWARD: readonly Toward[] = ["left", "right", "up", "down"];

/** What the shell sent, read safely: an unknown state is home, an unknown direction is none. */
export function roamFrom(v: unknown): Roam {
  const o = (typeof v === "object" && v !== null ? v : {}) as Record<string, unknown>;
  const phase = (ROAM_PHASES as readonly unknown[]).includes(o.phase) ? (o.phase as RoamPhase) : "home";
  const toward = (TOWARD as readonly unknown[]).includes(o.toward) ? (o.toward as Toward) : null;
  return { phase, toward };
}
