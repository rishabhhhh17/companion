// Drive: a plan first, then one step at a time. This file holds the plain, testable parts.
import { MODELS, priceRatio } from "./models.ts";
import { PRODUCT } from "./names.ts";
import { carriesPastedError, STALE_ERROR_RULE } from "./staleerror.ts";

// The usual most steps in a plan. The person may change it ("Most steps in a plan", drive.maxSteps, 3 to 20), read when a
// plan is made; Rescue's own plans keep this one, and their own 1 to 7 steps (rescue.ts).
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

// The plain rule for plans and for steps: do not make the person say what the request never mentioned. A vague request
// should ask once (the one thing the work cannot go on without), never twice (M14 real run: the bakery's name, then an email).
export const NO_UNASKED_DETAILS_PLAN = `- Do not write a step that needs, and do not ask the person for, a detail the request did not mention (an email address, a phone number, a price, a logo). Use an obvious placeholder in the work, and say in the step's words that it is a placeholder they can change, such as "Add the contact section with a placeholder email you can change". Ask only when the work truly cannot go on without a fact only the person has: the one name the page is about is such a case, a way to contact them is not.`;
export const NO_UNASKED_DETAILS_STEP = `Do not ask the person for a detail the request did not mention (an email address, a phone number, a price, a logo). Use an obvious placeholder instead and say in your last words that it is a placeholder they can change. Ask only when the work truly cannot go on without a fact only the person has.`;

// A goal that carries a pasted error is checked first, while planning (read only). An error that no longer applies becomes a
// plan of one step that says so, so the person sees "already fixed" before anything is spent on a change.
export const STALE_ERROR_PLAN = `${STALE_ERROR_RULE} If it no longer applies, the plan is one step: "Confirm the error is already fixed and change nothing".`;
export const planPrompt = (goal: string, max = MAX_STEPS) =>
  `Plan this goal for a person who is not an engineer. Look around the project first (read only, change nothing).

Reply with ONLY a JSON list of short steps in plain words, for example ["Add the prices section", "Add the contact line"].
- Use as few steps as the goal needs. A small goal is 1 to 3 steps. Never more than ${max}.
- Each step is one real change that produces something a person could see or check, such as "Add the prices section" or "Make the form send an email".
- Do not include steps about opening editors, saving files, opening a browser or looking at the result. ${PRODUCT} saves, checks and opens things itself.
${NO_UNASKED_DETAILS_PLAN}${carriesPastedError(goal) ? `\n${STALE_ERROR_PLAN}` : ""}

Goal: ${goal}`;
export const shortenPrompt = (n: number, max = MAX_STEPS) =>
  `That plan has ${n} steps. Please reply again with ONLY a JSON list of at most ${max} steps, combining small ones.`;
// What the model is told about doing a step. It is never part of the step's label (labels.ts).
export const STEP_INSTRUCTION = "Do only this step, keep the change small, and stop when it is done.";
export const stepPrompt = (i: number, n: number, title: string) =>
  `Step ${i} of ${n}: ${title}\n\n${STEP_INSTRUCTION}\n\n${NO_UNASKED_DETAILS_STEP}`;
// Off the record, no conversation is saved, so a step or a second try cannot continue the planning conversation. It
// starts afresh and is told what the whole plan is for.
export const freshStepPrompt = (goal: string, prompt: string) =>
  `${goal ? `This is one step of a bigger goal: ${goal}\n` : ""}Earlier steps may already be done in the project's files, so look before you change anything.${carriesPastedError(goal) ? `\n${STALE_ERROR_RULE}` : ""}\n\n${prompt}`;
export const freshShortenPrompt = (goal: string, n: number, max = MAX_STEPS) =>
  `${planPrompt(goal, max)}\n\nA first try gave ${n} steps, which is too many. Reply with ONLY a JSON list of at most ${max} steps, combining small ones.`;
// A rough, honest estimate to show before the person presses Start. It is what real steps cost, not what a step may cost at
// most (the budget caps do that, and are not touched here): the first Mac session showed "about 25 cents" for a task that
// cost 3 cents. A step on Sonnet 5.5, the usual model for a Drive plan, has a measured median of about 4 cents (a fixed
// project $0.04 in the first real run, 4.6 cents in the loop breaker set, 3.2 cents on the founder's Mac; the Rescue path
// ran $0.09 to $0.12 a case with its diagnosis on Opus). The figure is that median times a safety factor of 1.5, never below
// one cent for a plan that has a step, and scaled by the chosen model's list price against Sonnet 5.5 (so Opus shows twice
// as much, as its words say).
export const MEASURED_STEP_USD = 0.04;
export const STEP_SAFETY = 1.5;
const MEASURED_ON = MODELS.agent;   // Sonnet 5.5 today: the usual model for a Drive plan, which the figure above was measured on
export const estimateUsd = (steps: number, model?: string) =>
  steps <= 0 ? 0 : Math.max(0.01, Math.round(steps * MEASURED_STEP_USD * STEP_SAFETY * (model ? priceRatio(model, MEASURED_ON) : 1) * 100) / 100);

// Tools that only look. Everything else is refused while planning, in code.
export const READ_ONLY_TOOLS = new Set(["Read", "Glob", "Grep", "LS", "NotebookRead", "TodoWrite"]);

// Two failures are "the same" when the same check failed with the same words once numbers
// (ports, times, line numbers) are ignored. Three in a row means the loop is not getting anywhere.
export function failureSignature(f: { rung: string; detail: string }): string {
  return `${f.rung}:${f.detail.toLowerCase().replace(/\d+/g, "N").replace(/\s+/g, " ").trim().slice(0, 240)}`;
}
// How the tries ran out, said truly to Claude: how many checks failed in a row, and whether they all failed the same way.
// The usual three identical failures say exactly what they always said.
export type LoopEnd = { tries: number; same: boolean };
const TIMES = ["", "once", "two times", "three times", "four times", "five times"];
export function triedLine(end: LoopEnd = { tries: 3, same: true }): string {
  const times = TIMES[end.tries] ?? `${end.tries} times`;
  if (end.tries <= 1) return "The check failed, so the current approach is not working.";
  return end.same ? `The same check has failed ${times} in a row with the same problem, so the current approach is not working.` : `The checks have failed ${times} in a row, so the current approach is not working.`;
}
export const differentPrompt = (title: string, f: { label: string; detail: string; forModel?: string }, end?: LoopEnd) =>
  `Step: ${title}\n\n${triedLine(end)}\nFailed check: ${f.label}\nWhat happened: ${f.forModel ?? f.detail}\n\nTake a clearly different approach to this step. Keep the change small.`;
export const STUCK_OPTIONS = [{ id: "different", label: "Try a different approach" }, { id: "stop", label: "Stop here" }];
export const pausedPrompt = (title: string) =>
  `You were paused because the person looked at or changed the project themselves. Re-read whatever you need, keep their changes, and carry on with this step: ${title}`;
