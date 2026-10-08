// Drive: a plan first, then one step at a time. This file holds the plain, testable parts.
export const MAX_STEPS = 12;

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

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
  `Plan this goal for a person who is not an engineer. Look around the project (read only, change nothing), then reply with ONLY a JSON list of short steps in plain words, for example ["Make the page", "Add a form"]. At most ${MAX_STEPS} steps. Each step must be small and checkable on its own.\n\nGoal: ${goal}`;
export const shortenPrompt = (n: number) =>
  `That plan has ${n} steps. Please reply again with ONLY a JSON list of at most ${MAX_STEPS} steps, combining small ones.`;
export const stepPrompt = (i: number, n: number, title: string) =>
  `Step ${i} of ${n}: ${title}\n\nDo only this step, keep the change small, and stop when it is done.`;
// A rough, honest estimate to show before the person presses Start.
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
