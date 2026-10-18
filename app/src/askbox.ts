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
