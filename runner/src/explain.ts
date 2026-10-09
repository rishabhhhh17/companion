// Explain: after a task, two or three plain "why" bullets and one optional check question. Built from what the task did,
// never from the screen or from memory. Kept short because it costs a few extra words.
import { clip, redact } from "./redact.ts";

export type Explanation = { bullets: string[]; question?: { text: string; options: string[]; correct: number } };

export const EXPLAIN_SYSTEM = [
  "You explain what a coding task just did, to a person who is not an engineer.",
  "Reply with ONLY JSON: {\"why\":[...], \"question\":{\"text\":\"...\",\"options\":[...],\"correct\":0}}.",
  "\"why\" is two or three short bullets in plain words saying WHY something was done, not what files changed. No jargon, no code.",
  "\"question\" is optional: one multiple choice question (two to four options, \"correct\" is the position of the right one, starting at 0) that checks they understood one reason. Leave it out if no good question exists.",
].join(" ");

export function explainRequest(i: { label: string; changed: { file: string; kind: string }[]; said: string }): { text: string; system: string } {
  const files = i.changed.slice(0, 12).map((c) => `${c.kind}: ${c.file}`).join("\n");
  const said = clip(redact(i.said).replace(/\s+/g, " ").trim(), 800);
  return { system: EXPLAIN_SYSTEM, text: `The task was: ${clip(redact(i.label), 200)}\nFiles:\n${files || "none"}\nWhat the assistant said it did: ${said || "(nothing)"}` };
}

const tidy = (s: string, n: number) => clip(redact(s).replace(/\s+/g, " ").trim(), n);

export function parseExplain(raw: string): Explanation | null {
  const a = raw.indexOf("{"), b = raw.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  let j: any;
  try { j = JSON.parse(raw.slice(a, b + 1)); } catch { return null; }
  const bullets = (Array.isArray(j?.why) ? j.why : []).filter((x: unknown): x is string => typeof x === "string").map((x: string) => tidy(x, 240)).filter(Boolean).slice(0, 3);
  if (bullets.length === 0) return null;
  const out: Explanation = { bullets };
  const q = j?.question;
  if (q && typeof q.text === "string" && Array.isArray(q.options)) {
    const options = q.options.filter((o: unknown): o is string => typeof o === "string").map((o: string) => tidy(o, 120)).filter(Boolean).slice(0, 4);
    const text = tidy(q.text, 200);
    if (text && options.length >= 2 && Number.isInteger(q.correct) && q.correct >= 0 && q.correct < options.length) out.question = { text, options, correct: q.correct };
  }
  return out;
}
