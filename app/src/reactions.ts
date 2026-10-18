// Reactions: small one-off moves of the character when something happens (not states, which last). They show
// momentum, never affection: a nod when a check passes, a short wince when one fails, a cheer when work is proven,
// and one bigger celebration for the two moments that matter most, checks passing on a fix and going live.
// All of it can be switched off with one setting.
import { setting } from "./settingsStore.ts";

export type Reaction = "nod" | "wince" | "cheer" | "party";
type Ev = { type?: string; status?: string; verdict?: string; stage?: string; made?: boolean; rung?: string; proof?: string; inPlan?: boolean; changed?: unknown[] };

/** Which reaction an event deserves, if any. */
export function reactionFor(e: Ev): Reaction | null {
  switch (e.type) {
    case "proof.step": return e.status === "passed" ? "nod" : e.status === "failed" ? "wince" : null;
    // The celebration is for finished, proven work: a task whose checks passed, or a whole plan done. Not each step of a
    // plan, not the safety check before shipping, not Rescue reading the project.
    case "receipt": return e.proof === "passed" && !e.inPlan && (e.changed?.length ?? 0) > 0 ? "party" : null;
    case "drive.done": return e.status === "done" ? "party" : null;
    case "ship.status": return e.stage === "live" ? "party" : e.stage === "ready" ? "cheer" : null;
    case "app.showme": return e.stage === "your_turn_done" ? "cheer" : null;
    case "receipt.visual": return e.made ? "cheer" : null;
    default: return null;
  }
}

const RANK: Record<Reaction, number> = { nod: 1, wince: 2, cheer: 3, party: 4 };
export const LENGTH_MS: Record<Reaction, number> = { nod: 600, wince: 700, cheer: 900, party: 1400 };

/** Keeps reactions calm: one at a time, a pause between them, and a bigger one always wins over a smaller one. */
export class Reactor {
  private playing: { r: Reaction; until: number } | null = null;
  private last: Reaction | null = null;
  private lastAt = -Infinity;
  private lastNod = -Infinity;
  constructor(private gapMs = 1200) {}
  push(r: Reaction, now: number): Reaction | null {
    if (this.playing && now < this.playing.until) {
      if (RANK[r] <= RANK[this.playing.r]) return null;   // something as big is already showing
    } else if (now - this.lastAt < this.gapMs && this.last && RANK[r] <= RANK[this.last]) return null;   // too soon after one as big
    if (r === "nod" && now - this.lastNod < 3000) return null;   // a run of passing checks is one nod, not five
    if (r === "nod") this.lastNod = now;
    this.playing = { r, until: now + LENGTH_MS[r] };
    this.lastAt = now; this.last = r;
    return r;
  }
}

// The one setting (fun.reactions in the registry, T16), read by the character, the overlay and Home through settingsStore.ts.
// On unless turned off. Changed only in Settings, through the shell.
export const reactionsOn = (): boolean => setting("fun.reactions") === true;
