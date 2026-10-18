// Spoken replies, page side: the switch (off unless turned on) and which line, if any, goes with what the card shows.
// The Mac side says it with the built in voice and refuses anything unsafe; nothing here makes a sound.
import { LEAD_MS } from "./sequence.ts";
import { S } from "./strings.ts";
import { keysIn, keysNow, type Keys } from "./keys.ts";
export const SPEECH_KEY = "companion.speak";

export function speechOn(): boolean { try { return localStorage.getItem(SPEECH_KEY) === "1"; } catch { return false; } }
export function setSpeech(on: boolean) { try { localStorage.setItem(SPEECH_KEY, on ? "1" : "0"); } catch { /* storage may be unavailable */ } }

type Walk = { id: string; index: number; variant: string; stage: string; say: string; note?: string } | null;
type ShowMe = { stage: string; message: string; req?: string; step?: number; of?: number } | null;

/** The one line to say for what is on the card right now, with a key so the same thing is said once. delayMs: wait this
 *  long before saying it (a step of a multi step answer is said when its pointer lands). A lesson's words name the usual
 *  keys; they are said with the keys in use (`k`, the keys now unless given), as the card shows them. */
export function lineFor(m: { walk: Walk; showme: ShowMe }, k: Keys = keysNow()): { key: string; text: string; delayMs?: number } | null {
  const w = m.walk;
  if (w) {
    // While a lesson is on, only the lesson speaks (its ring's caption says nearly the same thing).
    if (w.stage === "step" || w.stage === "asking") return w.say ? { key: `walk:${w.id}:${w.index}:${w.variant}`, text: keysIn(w.say, k) } : null;
    // After a pause: the step, then the question. Its own key, so "No, show me" says the step again as a step to do.
    if (w.stage === "already") return w.say ? { key: `walk:${w.id}:${w.index}:already`, text: `${keysIn(w.say, k)} ${S.lessonAlready}` } : null;
    if (w.stage === "help" && w.note) return { key: `walk:${w.id}:${w.index}:help`, text: keysIn(w.note, k) };
    if (w.stage === "done") return { key: `walk:${w.id}:done`, text: "All done. Every step is finished." };
    return null;
  }
  const s = m.showme;
  if (!s || !s.message) return null;
  const seq = typeof s.of === "number" && s.of > 1 && typeof s.step === "number";
  const key = `show:${s.req ?? ""}:${s.stage}${seq ? `:${s.step}` : ""}`;
  const lead = seq ? { delayMs: LEAD_MS } : {};
  if (s.stage === "pointing") return { key, text: s.message, ...lead };
  if (s.stage === "pointing_roughly") return { key, text: `I think it is here. ${s.message}`, ...lead };
  if (["not_sure", "needs_permission", "error", "window_changed"].includes(s.stage)) return { key, text: s.message };
  return null;
}
