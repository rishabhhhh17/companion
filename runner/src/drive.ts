// Drive: a plan first, then one step at a time. This file holds the plain, testable parts.
export const MAX_STEPS = 12;

const MAX_STEP_CHARS = 160;
const clean = (s: string) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length <= MAX_STEP_CHARS ? t : t.slice(0, MAX_STEP_CHARS).replace(/\s+\S*$/, "") + "…";
};

// Reads the plan out of Claude's answer: a JSON list (in a code block or in the middle of other words),
// or failing that a numbered or bulleted list. Returns [] when there is nothing usable.
export function parsePlan(text: string): string[] {
  const a = text.indexOf("["), b = text.lastIndexOf("]");
  if (a >= 0 && b > a) {
    try {
      const j = JSON.parse(text.slice(a, b + 1));
      if (Array.isArray(j)) { const out = j.filter((x) => typeof x === "string").map(clean).filter(Boolean); if (out.length) return out; }
    } catch { /* fall through to lines */ }
  }
  const lines = text.split("\n").map((l) => /^\s*(?:\d+[.)]|[-*])\s+(.*\S)\s*$/.exec(l)?.[1]).filter((x): x is string => !!x).map(clean);
  return lines;
}

export const planPrompt = (goal: string) =>
  `Plan this goal for a person who is not an engineer. Look around the project first (read only, change nothing).

Reply with ONLY a JSON list of short steps in plain words, for example ["Add the prices section", "Add the contact line"].
- Use as few steps as the goal needs. A small goal is 1 to 3 steps. Never more than ${MAX_STEPS}.
- Each step is one real change that produces something a person could see or check, such as "Add the prices section" or "Make the form send an email".
- Do not include steps about opening editors, saving files, opening a browser or looking at the result. Companion saves, checks and opens things itself.

Goal: ${goal}`;
export const shortenPrompt = (n: number) =>
  `That plan has ${n} steps. Please reply again with ONLY a JSON list of at most ${MAX_STEPS} steps, combining small ones.`;
export const stepPrompt = (i: number, n: number, title: string) =>
  `Step ${i} of ${n}: ${title}\n\nDo only this step, keep the change small, and stop when it is done.`;
// Off the record, no conversation is saved, so a step or a second try cannot continue the planning conversation. It
// starts afresh and is told what the whole plan is for.
export const freshStepPrompt = (goal: string, prompt: string) =>
  `${goal ? `This is one step of a bigger goal: ${goal}\n` : ""}Earlier steps may already be done in the project's files, so look before you change anything.\n\n${prompt}`;
export const freshShortenPrompt = (goal: string, n: number) =>
  `${planPrompt(goal)}\n\nA first try gave ${n} steps, which is too many. Reply with ONLY a JSON list of at most ${MAX_STEPS} steps, combining small ones.`;
// A rough, honest estimate to show before the person presses Start.
// It is an upper limit ("up to"), because most steps cost far less.
export const estimateUsd = (steps: number) => Math.round(steps * 0.25 * 100) / 100;

// Tools that only look. Everything else is refused while planning, in code.
export const READ_ONLY_TOOLS = new Set(["Read", "Glob", "Grep", "LS", "NotebookRead", "TodoWrite"]);

// Two failures are "the same" when the same check failed with the same words once numbers
// (ports, times, line numbers) are ignored. Three in a row means the loop is not getting anywhere.
export function failureSignature(f: { rung: string; detail: string }): string {
  return `${f.rung}:${f.detail.toLowerCase().replace(/\d+/g, "N").replace(/\s+/g, " ").trim().slice(0, 240)}`;
}
export const differentPrompt = (title: string, f: { label: string; detail: string }) =>
  `Step: ${title}\n\nThe same check has failed three times in a row with the same problem, so the current approach is not working.\nFailed check: ${f.label}\nWhat happened: ${f.detail}\n\nTake a clearly different approach to this step. Keep the change small.`;
export const STUCK_OPTIONS = [{ id: "different", label: "Try a different approach" }, { id: "stop", label: "Stop here" }];
export const pausedPrompt = (title: string) =>
  `You were paused because the person looked at or changed the project themselves. Re-read whatever you need, keep their changes, and carry on with this step: ${title}`;
