// Anywhere mode: Companion improvises the next step from the screen, the person clicks, and then it asks "did that
// work?" before going on. A step that did not work is written down as such and never suggested again. At most 15 steps.
export const MAX_ANYWHERE_STEPS = 15;
export type Walk = { goal: string; steps: string[] };

const FAILED = " (did not work)";
export const failed = (s: string) => s.endsWith(FAILED);

/** The walk after the person answered "did that work?" about the last step. */
export function answered(w: Walk, worked: boolean): Walk {
  if (w.steps.length === 0) return w;
  const steps = w.steps.slice();
  if (!worked && !failed(steps[steps.length - 1])) steps[steps.length - 1] += FAILED;
  return { goal: w.goal, steps };
}

/** True when the walk has reached its limit and should hand back to the person in words. */
export const atLimit = (w: Walk) => w.steps.length >= MAX_ANYWHERE_STEPS;

/** What is asked for the next step. Steps that did not work are named so they are not suggested again. */
export function nextQuestion(w: Walk): string {
  const done = w.steps.filter((s) => !failed(s)), bad = w.steps.filter(failed).map((s) => s.slice(0, -FAILED.length));
  return [`${w.goal}.`, done.length ? `So far I did: ${done.join("; ")}.` : "", bad.length ? `These did NOT work, so do not suggest them again: ${bad.join("; ")}.` : "", "What is the next step?"].filter(Boolean).join(" ");
}
