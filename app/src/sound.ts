// Sounds (M19, sound.on and sound.volume): soft water sounds made on the Mac with Web Audio, no recordings. Off unless the
// person turns them on, and never during a call when Quiet on calls is on (the shell's quiet_now, rule 7). They play from
// the character's own page, which hears every moment that has one: the drop leaving to show where to click and coming
// home after the right click (the shell's flowflow-move), work done, and something waiting for the person.
export type Cue = "drop" | "catch" | "done" | "needsYou";
/** One tone: from frequency `f` (Hz), gliding to `to` if given, starting `at` seconds in, lasting `dur`. */
export type Note = { f: number; to?: number; at: number; dur: number; type: "sine" | "triangle" };
export const CUES: Record<Cue, Note[]> = {
  // a drop falling away: a quick downward bloop
  drop: [{ f: 880, to: 420, at: 0, dur: 0.16, type: "sine" }],
  // back home: a small rising plop and a bright glint
  catch: [{ f: 520, to: 980, at: 0, dur: 0.12, type: "sine" }, { f: 1320, at: 0.1, dur: 0.18, type: "triangle" }],
  // done: two notes going up
  done: [{ f: 660, at: 0, dur: 0.18, type: "sine" }, { f: 990, at: 0.14, dur: 0.32, type: "sine" }],
  // waiting for you: two soft knocks
  needsYou: [{ f: 740, at: 0, dur: 0.12, type: "triangle" }, { f: 740, at: 0.2, dur: 0.12, type: "triangle" }],
};
export const VOLUMES: Record<string, number> = { soft: 0.12, usual: 0.24, loud: 0.4 };
export function gainOf(v: unknown): number { return typeof v === "string" && Object.hasOwn(VOLUMES, v) ? VOLUMES[v] : VOLUMES.soft; }
/** Whether a sound plays: only when turned on, and never while a call app is in front (with Quiet on calls). */
export function wantSound(on: unknown, quiet: boolean): boolean { return on === true && !quiet; }
/** How long a cue lasts (seconds). */
export function lengthOf(cue: Cue): number { return Math.max(...CUES[cue].map((n) => n.at + n.dur)); }

type Ctx = { currentTime: number; destination: unknown; createOscillator: () => any; createGain: () => any };
let shared: Ctx | null = null;
/** Plays a cue at a volume. `make` gives the audio context (one is kept and reused). */
export function play(cue: Cue, volume: unknown, make: () => Ctx = () => new (globalThis as any).AudioContext()): void {
  try {
    const ctx = (shared ??= make());
    const peak = gainOf(volume), t0 = ctx.currentTime + 0.01;
    for (const n of CUES[cue]) {
      const osc = ctx.createOscillator(), g = ctx.createGain();
      osc.type = n.type;
      osc.frequency.setValueAtTime(n.f, t0 + n.at);
      if (n.to) osc.frequency.exponentialRampToValueAtTime(n.to, t0 + n.at + n.dur);
      g.gain.setValueAtTime(0.0001, t0 + n.at);
      g.gain.exponentialRampToValueAtTime(peak, t0 + n.at + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + n.at + n.dur);
      osc.connect(g); g.connect(ctx.destination);
      osc.start(t0 + n.at); osc.stop(t0 + n.at + n.dur + 0.02);
    }
  } catch { /* no audio on this Mac right now: the moment stays silent */ }
}
