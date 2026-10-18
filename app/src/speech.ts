// Spoken replies, page side: the switch (off unless turned on) and which line, if any, goes with what the card shows.
// The Mac side says it with the built in voice and refuses anything unsafe; nothing here makes a sound.
import { LEAD_MS } from "./sequence.ts";
import { receiptProofWords, type Model } from "./model.ts";
import { S } from "./strings.ts";
import { keysIn, keysNow, type Keys } from "./keys.ts";
import { setting } from "./settingsStore.ts";

// Speak to me: talk.speak in the registry (T16), off unless turned on, read through settingsStore.ts.
export const speechOn = (): boolean => setting("talk.speak") === true;

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

// ---- answers said out loud for a question asked by voice (M11 wave 4, item 2; off by default, T13) ----
// Answer out loud: talk.speakReplies in the registry, read the same way.
export const repliesOn = (): boolean => setting("talk.speakReplies") === true;

/** How long after a question asked by voice was sent its answer still counts as the answer to it. */
export const VOICE_ASK_MS = 10 * 60 * 1000;
/** What a question sent from the box asks for: a task (its answer is the result), a research answer, a Show me, a plan. */
export type AskKind = "task" | "research" | "showme" | "plan";
/** The last question sent while the box held words from hold to talk, and when. null: the last one was typed or pressed.
 *  req: for a Show me, its own request, once its "Finding it" has named it (followVoiceShowMe). */
export type VoiceQuestion = { kind: AskKind; at: number; req?: string } | null;
/** Whether an answer of this kind is the answer to the question asked by voice: the same kind, within ten minutes. */
export const askedByVoice = (q: VoiceQuestion, kind: AskKind, nowMs: number): boolean =>
  q !== null && q.kind === kind && nowMs >= q.at && nowMs - q.at < VOICE_ASK_MS;
/** Which question a spoken line (lineFor) answers: a Show me line answers the Show me request its key names (empty when it
 *  names none: Point at the problem, a hint, a window that changed); a lesson's line answers none. */
export function lineAnswers(key: string): { kind: AskKind; req: string } | null {
  return key.startsWith("show:") ? { kind: "showme", req: key.split(":")[1] ?? "" } : null;
}
/** Whether a Show me request is the one the person asked for by voice: its own request, within ten minutes. Only that
 *  answer's lines are its answer; any other line that shows meanwhile is not. */
export const voiceShowMe = (q: VoiceQuestion, req: string, nowMs: number): boolean =>
  askedByVoice(q, "showme", nowMs) && !!q?.req && q.req === req;
/** Whether a spoken line (by its lineFor key) is the answer to the question asked by voice. */
export function lineByVoice(q: VoiceQuestion, key: string, nowMs: number): boolean {
  const a = lineAnswers(key);
  return a !== null && a.kind === "showme" && voiceShowMe(q, a.req, nowMs);
}
/** How a Show me asked by voice is ended. Not "done": the last step said in words takes the pointer away first and its
 *  words come after, and they are still its answer. */
const SHOWME_ENDS = ["your_turn_done", "done_for_you", "error", "needs_permission", "window_changed"];
/** A Show me asked by voice, as Show me's own events arrive (app.showme, and assist.error for a request): it takes the
 *  request the first "Finding it" after it names, and it ends when that answer ends (the click, Do it for me, an error, a
 *  missing permission, a window that changed) or another question takes the pointer (another request's "Finding it").
 *  A question of another kind is left alone. */
export function followVoiceShowMe(q: VoiceQuestion, ev: unknown): VoiceQuestion {
  if (!q || q.kind !== "showme" || typeof ev !== "object" || ev === null) return q;
  const e = ev as { type?: unknown; stage?: unknown; req?: unknown };
  const req = typeof e.req === "string" ? e.req : "";
  if (e.type === "assist.error") return req && req === q.req ? null : q;
  if (e.type !== "app.showme" || typeof e.stage !== "string") return q;
  if (e.stage === "thinking" && req.startsWith("sm_")) return q.req === undefined ? { ...q, req } : q.req === req ? q : null;
  return SHOWME_ENDS.includes(e.stage) ? null : q;
}

/** Whether to say something, and whether as a whole answer: "Speak to me" says short lines; "Answer out loud" says the
 *  whole short answer, and only to a question the person asked by voice. */
export function speakWhen(o: { speech: boolean; replies: boolean; byVoice: boolean }): { say: boolean; whole: boolean } {
  const whole = o.replies && o.byVoice;
  return { say: o.speech || whole, whole };
}

export type Reply = { key: string; text: string; kind: AskKind };
/** The answers on the card now: a finished task's result and a research answer, one key each, so each is said once.
 *  Show me's answers are lineFor's. A rescue is started by its button, never by voice, so it is not here. `project`: the
 *  card's project, part of each key, since checkpoints and research notes are numbered and named per project (each
 *  project's first task ends with cp_0001). */
export function repliesIn(m: Model, project: string): Reply[] {
  const out: Reply[] = [];
  if (m.receipt?.checkpoint) out.push({ key: `receipt:${project}:${m.receipt.checkpoint}`, text: receiptProofWords(m), kind: "task" });
  if (m.research?.answer) out.push({ key: `research:${project}:${m.research.file}`, text: m.research.answer, kind: "research" });
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
