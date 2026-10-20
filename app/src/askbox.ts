// The ask box: several lines when needed (Shift and Return for a new line, Return sends, as it always did), and a draft
// that is kept on this Mac only, in the page's own storage, until it is sent. Delete everything removes it with the rest
// of the page's storage. Plain code, tested in askbox.test.ts; card.tsx draws the box.
import { redact } from "../../runner/src/redact.ts";

export const MAX_DRAFT = 4000;
export const DRAFT_KEY = "companion.askDraft";

/** What a key press in the box does. send: Return alone. newline: Shift (or Option) and Return, left to the box itself.
 *  null: anything else, Return with Command or Control, and every key while an input method is composing. */
export function askKey(e: { key: string; shift: boolean; alt?: boolean; meta?: boolean; ctrl?: boolean; composing: boolean }): "send" | "newline" | null {
  if (e.composing || e.key !== "Enter" || e.meta || e.ctrl) return null;
  return e.shift || e.alt ? "newline" : "send";
}

/** The draft to keep, or null to keep none: nothing for an empty box, nothing off the record, and nothing that looks like
 *  it holds a key or a password (the same redaction the engine uses), so a pasted secret never lands in storage. */
export function draftToKeep(text: string, offRecord: boolean): string | null {
  if (offRecord || typeof text !== "string" || !text.trim()) return null;
  if (redact(text) !== text) return null;
  const chars = Array.from(text);
  return chars.length <= MAX_DRAFT ? text : chars.slice(0, MAX_DRAFT).join("");
}

/** A request sent with Start, kept in memory only (never on disk) until the engine says the task began, so a refusal can
 *  put it back. off: it was sent off the record. */
export type Sent<A> = { prompt: string; attached: A[]; off: boolean };

/** What an event from the engine means for a request sent with Start to `agent`: "started" once the task has begun (its
 *  before snapshot is taken), "refused" when the engine said no for that agent, was stopped before the task began (Stop
 *  while it looked at the pictures), or itself stopped; null for anything else. */
export function sentOutcome(e: unknown, agent: string): "started" | "refused" | null {
  const o = e as { type?: unknown; agent?: unknown; state?: unknown } | null;
  if (!o || typeof o !== "object") return null;
  if (o.type === "app.runner_down") return "refused";
  if (o.agent !== agent) return null;
  if (o.type === "checkpoint.created") return "started";
  if (o.type === "protocol.error") return "refused";
  if (o.type === "agent.state" && o.state === "idle") return "refused";
  return null;
}

/** What to put back after a refusal: the words only into an empty box, the files only when none were added since, so
 *  nothing typed or added since is ever replaced. The words come back with their off the record setting. */
export function putBack<A>(sent: Sent<A>, now: { text: string; attached: A[] }): { text?: string; attached?: A[]; off?: boolean } {
  const out: { text?: string; attached?: A[]; off?: boolean } = {};
  if (sent.prompt.trim() && !now.text.trim()) { out.text = sent.prompt; out.off = sent.off; }
  if (sent.attached.length && !now.attached.length) out.attached = sent.attached;
  return out;
}

// ---- words from hold to talk ----

/** What a spoken request is, for sending it by itself (talk.autoSend). work: a clear request for work, three words or
 *  more. short: fewer words. holdOff: it is, starts with or ends with a word that means wait or stop ("Wait, hold on a
 *  sec", "never mind", "not yet"), so it is never sent by itself. screenQuestion: a plain question about the screen ("Where
 *  is the settings button?"), which waits in the box with Show me offered. otherLanguage: English only at first, so with
 *  another speech language picked in Settings the words wait for Start. Matching is on whole words only, so "waiting
 *  list" or "stopwatch" are still work. */
export type HeardKind = "work" | "short" | "holdOff" | "screenQuestion" | "otherLanguage";
const HOLD_OFF = ["wait", "hold on", "hang on", "one second", "one sec", "a second", "a sec", "just a second", "just a sec", "one moment", "just a moment", "a moment",
  "a minute", "give me a second", "give me a sec", "give me a minute", "give me a moment", "not yet", "never mind", "nevermind", "cancel", "cancel that", "stop", "stop that", "forget it", "no wait",
  // Taking it back: said first, or as a short clause of its own anywhere in the words.
  "hold up", "hold it", "pause", "don't", "do not", "no don't", "i changed my mind", "changed my mind", "scratch that", "ignore that", "forget that",
  "not now", "let me think", "let's not", "lets not", "let us not"];
/** Sounds and little words that start a clause without changing it ("Hmm, wait", "Oh wait", "No, don't"). */
const FILLERS = new Set(["oh", "hmm", "hm", "um", "uh", "er", "ah", "so", "okay", "ok", "well", "actually", "no", "yeah", "sorry"]);
const SCREEN_QUESTION = /^(where (is|are|do|does|can|should)|how (do|can|would) i|what (is|are|does) (this|that|these|those|the)\b|what's (this|that)|which (button|menu|tab|link|one)|show me|can you show me|could you show me)\b/;
const words = (t: string) => t.toLowerCase().replace(/[\u2019\u2018]/g, "'").replace(/[^\p{L}\p{N}' ]+/gu, " ").split(/\s+/).filter(Boolean);
const startsWith = (w: string[], p: string[]) => p.length <= w.length && p.every((x, i) => w[i] === x);
const endsWith = (w: string[], p: string[]) => p.length <= w.length && p.every((x, i) => w[w.length - p.length + i] === x);
/** Each sentence or clause on its own, so "Make the button blue. No wait." ends with a hold off. */
const clauses = (t: string) => t.split(/[.,;:!?]+/).map(words).map((c) => { let i = 0; while (i < c.length - 0 && FILLERS.has(c[i])) i++; return c.slice(i); }).filter((c) => c.length > 0);
export function heardKind(text: string, language = "auto"): HeardKind {
  const all = words(String(text ?? ""));
  if (language !== "auto" && language !== "en") return all.length ? "otherLanguage" : "short";
  if (all.length === 0) return "short";
  const parts = clauses(String(text));
  const offs = HOLD_OFF.map((p) => p.split(" "));
  const first = parts[0] ?? all, last = parts[parts.length - 1] ?? all;
  // The first words, the last words, or any short clause of its own ("Make it blue, wait, no, make it green").
  if (offs.some((p) => startsWith(first, p) || endsWith(last, p) || parts.some((c) => c.length <= 3 && startsWith(c, p)))) return "holdOff";
  if (SCREEN_QUESTION.test(all.join(" "))) return "screenQuestion";
  return all.length >= 3 ? "work" : "short";
}
/** May words from hold to talk send themselves (with talk.autoSend on)? Only a clear request for work. */
export const sendsItself = (text: string, language = "auto") => heardKind(text, language) === "work";

/** What decides whether spoken words go into a finished task's follow up box, taken as the keys go down (when listening
 *  begins), never when the words come back: the box shows, Home shows, the pointer is over that task's receipt (a hover
 *  inside Home's own window; nothing else is read), and Follow up by pointing is on (talk.followUpByPointing). */
export type FollowAim = { followUpShown: boolean; overReceipt: boolean; byPointing: boolean; homeShown: boolean };
/** Where words from hold to talk go. showme: the Show me key was pressed first, so they are a question about the screen.
 *  followUp: everything in `atKeysDown` was true as the keys went down, and the follow up box still shows now. box: the
 *  ask box, as always (also with no start known). */
export function heardGoesTo(o: { showme: boolean; atKeysDown: FollowAim | null; followUpShownNow: boolean }): "showme" | "followUp" | "box" {
  if (o.showme) return "showme";
  const d = o.atKeysDown;
  return d && d.byPointing && d.homeShown && d.followUpShown && d.overReceipt && o.followUpShownNow ? "followUp" : "box";
}
