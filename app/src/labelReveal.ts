// M86, Label it: the order labels appear in, their meaning colours, and which questions ask for labels. Pure.
// Labels are revealed one after another, about 90 ms apart, each with a short fade and slide; with Reduce Motion (the Mac's
// or Squibby's own Less motion) they all appear at once with no motion. The shell sends the same gap (labels.rs).
import type { Colour } from "./meaning.ts";
import { S } from "./strings.ts";
import type { LABEL_TONES } from "../../protocol/index.ts";

export const LABEL_GAP_MS = 90;
export type LabelTone = (typeof LABEL_TONES)[number];

export function revealPlan(n: number, reduce: boolean, gap = LABEL_GAP_MS): { index: number; delayMs: number; motion: boolean }[] {
  return Array.from({ length: Math.max(0, n) }, (_, index) => ({ index, delayMs: reduce ? 0 : index * gap, motion: !reduce }));
}

/** Each tone in its meaning colour (meaning.ts, the tokens' data-c colours): what it is, worth a look, a risk. */
export function toneColour(t: LabelTone): Colour { return t === "risk" ? "red" : t === "look" ? "orange" : "blue"; }

/** A Show me question that asks for labels rather than a place to click: "label this", "what are these settings?",
 *  "which of these do I need for webhooks?". A question about where to click, press or tap (or "which one") is Show me's
 *  own pointing, even with "which of these" in it: labels never point, so it would get no ring. */
export function labelAsk(q: string): boolean {
  if (/\b(?:click|clicks|press|tap|where|which one|select|choose)\b/i.test(q)) return /^\s*label\b/i.test(q);
  return /\blabels?\b|\bwhat (?:are|do) (?:all )?(?:these|those)\b|\bwhich of (?:these|those)\b/i.test(q);
}

/** Home's line while the labels are up: it says Esc clears them only when Esc does (home.escStops). */
export function labelledLine(n: number, escStops: boolean): string { return escStops ? S.m86.labelled(n) : S.m86.labelledNoEsc(n); }
