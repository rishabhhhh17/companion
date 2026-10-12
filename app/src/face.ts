// The character's face for each state: plain data, so every state can be tested and the drawing stays simple.
// Momentum, never affection (rule 16): the face says what is happening, it does not ask for attention.
import type { CharacterState } from "./model.ts";

export type Eyes = "open" | "wide" | "up" | "focus" | "scan" | "raised" | "happy" | "flat" | "closed";
export type Extra = "none" | "rings" | "dots";
export type Face = { eyes: Eyes; extra: Extra; ring: "none" | "amber" | "ok" | "accent"; grey: boolean; blink: boolean };

export function faceFor(s: CharacterState): Face {
  switch (s) {
    case "idle": return { eyes: "open", extra: "none", ring: "none", grey: false, blink: true };
    case "listening": return { eyes: "wide", extra: "rings", ring: "accent", grey: false, blink: false };
    case "thinking": return { eyes: "up", extra: "dots", ring: "none", grey: false, blink: false };
    case "working": return { eyes: "focus", extra: "none", ring: "none", grey: false, blink: true };
    case "checking": return { eyes: "scan", extra: "none", ring: "none", grey: false, blink: false };
    case "needsYou": return { eyes: "raised", extra: "none", ring: "amber", grey: false, blink: true };
    case "done": return { eyes: "happy", extra: "none", ring: "ok", grey: false, blink: false };
    case "error": return { eyes: "flat", extra: "none", ring: "none", grey: true, blink: false };
    case "off": return { eyes: "closed", extra: "none", ring: "none", grey: true, blink: false };
  }
}

// Light on battery: nothing moves while nothing is happening. Ready and Done settle after a short while, so an idle
// Mac never spends power on the character; anything that is in progress keeps moving.
export const SETTLE_MS = 20_000;
export function settled(s: CharacterState, msInState: number): boolean {
  return (s === "idle" || s === "done" || s === "off" || s === "error") && msInState >= SETTLE_MS;
}
