// Explain: after a task (and after every Drive step), two short plain lines of "why" and one check question (or the lines
// only, or nothing: the setting explain.mode; explain.after can keep it to plan steps). Built from the
// real change the task made (teach.ts: secrets hidden, settings and key files never shown), never from the screen or from
// memory. Kept short because it costs a few extra words on the person's own Claude.
import { isEnvFile } from "./diagram.ts";
import { clip, redact } from "./redact.ts";

export type Explanation = { bullets: string[]; question?: { text: string; options: string[]; correct: number } };

const INTRO = [
  "You explain what a coding task just did, to a person who is not an engineer.",
  "You are shown the real change it made (lines starting with - were taken away, + were added; secrets are hidden). Base what you say on that change; the assistant's own words about it can be wrong or incomplete.",
];
const WHY = [
  "\"why\" is two short lines in plain words: line 1 is why the change was needed (the real cause), line 2 is why it works.",
  "Each line is one sentence of at most 150 characters.",
  "Write for someone who has never coded. Say only what the change above shows: no cause, file or behaviour it does not show.",
  "Never quote anything from the code and never write the names of files, functions, settings in code style or CSS classes; say what they do instead (\"the signup button\", \"the page that lists orders\", \"the setting that holds the site name\").",
  "Never use these words: variable, function, parameter, argument, undefined, null, boolean, integer, array, string, async, await, promise, callback, runtime, compile, syntax, regex, refactor, dependency, stack trace, exception, directive, hook, JSON, CSS, class, HTML, import, export, type, API, route, component, prop, state.",
  "Say instead: a name, a value, a piece of text, a list, a step, a part of the page, a connection, a rule, a typo, missing, did not match, was never given.",
  "No symbols, brackets, backticks, quotes around code, arrows or semicolons. Do not put numbers in brackets.",
  "Example of a good pair for a change that stopped the checkout total ignoring the quantity: [\"The total only counted one of each item, so a basket of three shirts was charged as one.\", \"Now each price is multiplied by how many you picked before the total is added up.\"].",
  "Example for a change that fixed a page that went blank because it asked for a part that was never added: [\"The page asked for a part that did not exist yet, so it stopped before showing anything.\", \"Adding that part means the page finds what it asked for and carries on.\"].",
].join(" ");
/** The usual (Explain after a task: reasons and a quick check question). */
export const EXPLAIN_SYSTEM = [
  ...INTRO,
  "Reply with ONLY JSON: {\"why\":[\"...\",\"...\"], \"question\":{\"text\":\"...\",\"options\":[\"...\",\"...\"],\"correct\":0}}.",
  WHY,
  "\"question\" is one multiple choice question with two or three short options that checks they understood one reason; \"correct\" is the position of the right option, starting at 0. Leave it out only if no fair question exists. The question is about the reason in line 1 or 2, never a number, a name or a detail to remember, and uses the same plain words rules. Every wrong option is a believable mistake someone might really make about the same reason, about as long as the right one, so the right one cannot be picked from the wording alone.",
].join(" ");
/** Short reasons only: no question is asked for, so none is paid for. */
export const EXPLAIN_REASONS_SYSTEM = [...INTRO, "Reply with ONLY JSON: {\"why\":[\"...\",\"...\"]}.", WHY].join(" ");

/** What the fast model is asked. Settings and key files are named, so the model knows one changed, but never shown.
 *  question: false asks for the reasons only (Explain after a task set to short reasons). */
export function explainRequest(i: { label: string; changed: { file: string; kind: string }[]; said: string; diff: string }, o: { question?: boolean } = {}): { text: string; system: string } {
  const files = i.changed.slice(0, 12).map((c) => `${c.kind}: ${c.file}${isEnvFile(c.file) ? " (a settings or key file, not shown)" : ""}`).join("\n");
  const said = clip(redact(i.said).replace(/\s+/g, " ").trim(), 600);
  const diff = i.diff.trim() ? i.diff : "(the change could not be shown: only settings, key, binary or very large files changed)";
  return { system: o.question === false ? EXPLAIN_REASONS_SYSTEM : EXPLAIN_SYSTEM, text: `The task was: ${clip(redact(i.label), 200)}\nFiles:\n${files || "none"}\nThe change:\n${diff}\nWhat the assistant said it did: ${said || "(nothing)"}` };
}

const tidy = (s: string, n: number) => clip(redact(s).replace(/\s+/g, " ").trim(), n);

export function parseExplain(raw: string): Explanation | null {
  const a = raw.indexOf("{"), b = raw.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  let j: any;
  try { j = JSON.parse(raw.slice(a, b + 1)); } catch { return null; }
  const bullets = (Array.isArray(j?.why) ? j.why : []).filter((x: unknown): x is string => typeof x === "string").map((x: string) => tidy(x, 240)).filter(Boolean).slice(0, 2);
  if (bullets.length === 0) return null;
  const out: Explanation = { bullets };
  // The question is all or nothing: two or three different options, all words, and the right one marked. Anything else is
  // dropped rather than repaired, so the card never shows a question whose answer could be wrong.
  const q = j?.question;
  if (q && typeof q.text === "string" && Array.isArray(q.options) && q.options.every((o: unknown) => typeof o === "string")) {
    const options = (q.options as string[]).map((o) => tidy(o, 120));
    const text = tidy(q.text, 200);
    const distinct = new Set(options.map((o) => o.toLowerCase())).size === options.length;
    if (text && options.length >= 2 && options.length <= 3 && options.every(Boolean) && distinct && Number.isInteger(q.correct) && q.correct >= 0 && q.correct < options.length) out.question = { text, options, correct: q.correct };
  }
  return out;
}
