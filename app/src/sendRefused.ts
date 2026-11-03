// Must fix 13 (review of 4 Nov): a command the shell would not pass on (the engine restarting, its queue full, a group
// switched off) is never a silent failure (bar rule 11). The card says it in one plain line, and whatever was waiting for
// the engine's answer (an Undo on "working", a follow up on "sending") is put back, as when the engine refuses it itself.
import { WRITTEN_FOR_A_PERSON } from "./checkParts.ts";
import { refusalNotice } from "./groups.ts";
import { S } from "./strings.ts";

/** The line for a refused send: a group switched off, or the shell's own plain sentence, as they are; anything else (a
 *  machine message) as one plain line. */
export function refusedLine(e: unknown): string {
  const off = refusalNotice(e);
  if (off) return off;
  const text = (e instanceof Error ? e.message : typeof e === "string" ? e : "").trim();
  return text && WRITTEN_FOR_A_PERSON(text) ? text : S.sendRefused;
}

export type RefusedEvent = { type: "protocol.error"; reason: string; failed?: string; agent?: string };
/** The refusal as the engine's own refusal of that command would reach the model (model.ts protocol.error), so every card
 *  that waits for an answer stops waiting in the same place. */
export function refusedEvent(e: unknown, cmd: unknown): RefusedEvent {
  const c = cmd && typeof cmd === "object" ? (cmd as Record<string, unknown>) : {};
  return { type: "protocol.error", reason: refusedLine(e), ...(typeof c.type === "string" ? { failed: c.type } : {}), ...(typeof c.agent === "string" ? { agent: c.agent } : {}) };
}
