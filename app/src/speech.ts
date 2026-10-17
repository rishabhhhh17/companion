// Spoken replies, page side: the switch (off unless turned on) and which line, if any, goes with what the card shows.
// The Mac side says it with the built in voice and refuses anything unsafe; nothing here makes a sound.
import { LEAD_MS } from "./sequence.ts";
import { receiptProofWords, type Model } from "./model.ts";
import { S } from "./strings.ts";
export const SPEECH_KEY = "companion.speak";

export function speechOn(): boolean { try { return localStorage.getItem(SPEECH_KEY) === "1"; } catch { return false; } }
export function setSpeech(on: boolean) { try { localStorage.setItem(SPEECH_KEY, on ? "1" : "0"); } catch { /* storage may be unavailable */ } }

type Walk = { id: string; index: number; variant: string; stage: string; say: string; note?: string } | null;
type ShowMe = { stage: string; message: string; req?: string; step?: number; of?: number } | null;

/** The one line to say for what is on the card right now, with a key so the same thing is said once. delayMs: wait this
 *  long before saying it (a step of a multi step answer is said when its pointer lands). */
export function lineFor(m: { walk: Walk; showme: ShowMe }): { key: string; text: string; delayMs?: number } | null {
  const w = m.walk;
  if (w) {
    // While a lesson is on, only the lesson speaks (its ring's caption says nearly the same thing).
    if (w.stage === "step" || w.stage === "asking") return w.say ? { key: `walk:${w.id}:${w.index}:${w.variant}`, text: w.say } : null;
    // After a pause: the step, then the question. Its own key, so "No, show me" says the step again as a step to do.
    if (w.stage === "already") return w.say ? { key: `walk:${w.id}:${w.index}:already`, text: `${w.say} ${S.lessonAlready}` } : null;
    if (w.stage === "help" && w.note) return { key: `walk:${w.id}:${w.index}:help`, text: w.note };
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

// ---- answers said out loud for a question asked by voice (M11 wave 4, item 2; off by default, T13) ----
export const REPLIES_KEY = "companion.speakReplies";
export function repliesOn(): boolean { try { return localStorage.getItem(REPLIES_KEY) === "1"; } catch { return false; } }
export function setReplies(on: boolean) { try { localStorage.setItem(REPLIES_KEY, on ? "1" : "0"); } catch { /* storage may be unavailable */ } }

/** How long after a question asked by voice was sent its answer still counts as the answer to it. */
export const VOICE_ASK_MS = 10 * 60 * 1000;
/** What a question sent from the box asks for: a task (its answer is the result), a research answer, a Show me, a plan. */
export type AskKind = "task" | "research" | "showme" | "plan";
/** The last question sent while the box held words from hold to talk, and when. null: the last one was typed or pressed. */
export type VoiceQuestion = { kind: AskKind; at: number } | null;
/** Whether an answer of this kind is the answer to the question asked by voice: the same kind, within ten minutes. */
export const askedByVoice = (q: VoiceQuestion, kind: AskKind, nowMs: number): boolean =>
  q !== null && q.kind === kind && nowMs >= q.at && nowMs - q.at < VOICE_ASK_MS;
/** Which kind of question a spoken line (lineFor) answers: a Show me line answers a Show me; a lesson's line answers none. */
export const lineAnswers = (key: string): AskKind | null => (key.startsWith("show:") ? "showme" : null);

/** Whether to say something, and whether as a whole answer: "Speak to me" says short lines; "Answer out loud" says the
 *  whole short answer, and only to a question the person asked by voice. */
export function speakWhen(o: { speech: boolean; replies: boolean; byVoice: boolean }): { say: boolean; whole: boolean } {
  const whole = o.replies && o.byVoice;
  return { say: o.speech || whole, whole };
}

export type Reply = { key: string; text: string; kind: AskKind };
/** The answers on the card now: a finished task's result and a research answer, one key each, so each is said once.
 *  Show me's answers are lineFor's. A rescue is started by its button, never by voice, so it is not here. */
export function repliesIn(m: Model): Reply[] {
  const out: Reply[] = [];
  if (m.receipt?.checkpoint) out.push({ key: `receipt:${m.receipt.checkpoint}`, text: receiptProofWords(m), kind: "task" });
  if (m.research?.answer) out.push({ key: `research:${m.research.file}`, text: m.research.answer, kind: "research" });
  return out;
}
/** The answer that was not on the card before (an older one may still be shown beside it), or null. */
export function newReply(all: Reply[], seen: ReadonlySet<string>): Reply | null {
  return all.find((r) => !seen.has(r.key)) ?? null;
}

/** What the app answered to "speak": when the Mac's sound is off nothing was said, and the first time the card says so. */
export function spokenNote(r: unknown): string | null {
  const o = (typeof r === "object" && r !== null ? r : {}) as Record<string, unknown>;
  return o.said === false && o.why === "sound" && o.tell === true ? S.soundOffSaid : null;
}
