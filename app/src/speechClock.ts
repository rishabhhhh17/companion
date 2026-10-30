// Drawing in step with speech (M38; the recommendation after M28: "syncing the drawing with what Squibby says, the moment
// that makes HeyClicky feel magic"). The Mac's voice reports each word as it is about to say it (speak.rs, as how far
// through the line it is). A mark being drawn while a line is said keeps pace with it: the pen starts with the words and
// the mark is finished by the time the line reaches its key part, about the first two thirds. With no voice (speaking off,
// the Mac muted, Reduce motion) nothing reports, and the mark keeps its own pen speed as before.

/** How far through the line the mark should be finished. */
export const FINISH_AT = 0.65;
/** A word must come within this long of the pen's first touch for the voice to lead the pen (milliseconds). */
export const LEAD_WAIT_MS = 600;
/** Between words, the pen goes on at the voice's pace, but never more than this far past the last word heard. */
export const RUN_AHEAD = 0.12;

export class SpeechClock {
  private start: number;
  private heard: { t: number; part: number }[] = [];
  private ended = false;
  constructor(now: number) { this.start = now; }

  /** One word: how far through the line it ends (0 to 1), or null when the line ended or was cut. */
  word(now: number, part: number | null): void {
    if (part === null) { this.ended = true; return; }
    if (!Number.isFinite(part)) return;
    const p = Math.max(0, Math.min(1, part));
    const last = this.heard[this.heard.length - 1];
    if (last && p < last.part) return;   // a word never goes backwards
    this.heard.push({ t: now, part: p });
  }

  /** Whether the voice leads the pen: a word came soon enough after the pen started. */
  leads(): boolean { return this.heard.length > 0 && this.heard[0].t - this.start <= LEAD_WAIT_MS; }

  /** How far through the line the voice is now, between words too (at its own recent pace). */
  part(now: number): number {
    if (this.ended || !this.heard.length) return this.ended ? 1 : 0;
    const first = this.heard[0], last = this.heard[this.heard.length - 1];
    const dt = last.t - first.t;
    const pace = dt > 0 ? (last.part - first.part) / dt : 1 / 3000;   // about three seconds a line before there is a pace
    return Math.min(1, last.part + Math.min(RUN_AHEAD, Math.max(0, now - last.t) * pace));
  }

  /** How far the pen should be through the whole mark (0 to 1): from the first word heard to FINISH_AT of the line. */
  pen(now: number): number {
    if (this.ended) return 1;
    if (!this.heard.length) return 0;
    const from = Math.min(this.heard[0].part, FINISH_AT - 0.05);
    return Math.max(0, Math.min(1, (this.part(now) - from) / (FINISH_AT - from)));
  }
}
