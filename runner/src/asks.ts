// "Do what it can, then ask one short question" (HeyClicky v1.0.53 parity, M11). Claude is told to end its final message
// with one short question when something only the person has is missing (sdkEngine.ts), and Claude's own question box is
// refused (safety.ts NOT_GIVEN). These read that final message: does it stop to ask the person something, and the words
// the card shows under the receipt. Plain, testable text; nothing here is a safety rule.
import { clip, redact } from "./redact.ts";

/** The most of the agent's last words a receipt carries. */
export const MAX_SAID_CHARS = 600;

// Code is not a question: `a ? b : c`, `user?.name`.
const withoutCode = (text: string) => text.replace(/```[\s\S]*?(```|$)/g, "\n").replace(/`[^`\n]*`/g, " ");
// A sentence's own end, past closing quotes, brackets and markdown emphasis.
const QUESTION_END = /\?["'”’)\]*_]*$/;

/** Does the agent's final message stop to ask the person something? One of its last three sentences is a question (the
 *  question, then a line or two on where to find the answer). A question it asked itself early in a longer message and
 *  then answered is not counted, and neither is a question mark in code. */
export function asksPerson(text: string): boolean {
  const sentences = withoutCode(String(text ?? "")).split(/(?<=[.!?]["'”’)\]*_]*)\s+|\n+/).map((s) => s.trim()).filter(Boolean);
  return sentences.slice(-3).some((s) => QUESTION_END.test(s));
}

/** The agent's last words as the receipt carries them: secrets hidden, spaces folded, clipped by whole characters. */
export function saidLine(text: string): string {
  const flat = redact(String(text ?? "")).replace(/\s+/g, " ").trim();
  return Array.from(flat).length <= MAX_SAID_CHARS ? flat : `${clip(flat, MAX_SAID_CHARS - 1).trimEnd()}…`;
}
