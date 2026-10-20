// Anywhere mode: Companion improvises the next step from the screen, the person clicks, and then it asks "did that
// work?" before going on (with showme.askWorked "whenUnsure", only when unsure: see asksWorked, and the next look says
// whether the step before worked: see judged). A step that did not work is written down as such and never suggested
// again. At most 15 steps.
export const MAX_ANYWHERE_STEPS = 15;
export type Walk = { goal: string; steps: string[] };

const FAILED = " (did not work)";
export const failed = (s: string) => s.endsWith(FAILED);
// A step moved on from without asking (showme.askWorked "whenUnsure"): clicked on a solid ring, but nobody checked that it
// worked. Written down as a guess, never as worked, until an answer replaces it.
const UNCHECKED = " (clicked, not checked yet)";
export const unchecked = (s: string) => s.endsWith(UNCHECKED);
const bare = (s: string) => (unchecked(s) ? s.slice(0, -UNCHECKED.length) : s);

/** The walk after the person answered "did that work?" about the last step. */
export function answered(w: Walk, worked: boolean): Walk {
  if (w.steps.length === 0) return w;
  const steps = w.steps.slice();
  const last = bare(steps[steps.length - 1]);
  steps[steps.length - 1] = !worked && !failed(last) ? last + FAILED : last;
  return { goal: w.goal, steps };
}
/** The walk after a clean click on a solid ring moved it on without asking: the last step is clicked, not checked. */
export function clicked(w: Walk): Walk {
  if (w.steps.length === 0) return w;
  const steps = w.steps.slice(), last = steps[steps.length - 1];
  if (!failed(last) && !unchecked(last)) steps[steps.length - 1] = last + UNCHECKED;
  return { goal: w.goal, steps };
}

// The next look's own verdict on a step that was not checked (assist.point lastStepWorked): a guess from the screen, so
// it is written down as one, never as worked.
const LOOKED = " (looked like it worked)";
/** The walk after the next look said whether the last step worked (yes, no or unsure), only for a step moved on from
 *  without asking: no is written down as did not work (never suggested again), yes as a guess from the screen, and
 *  unsure or no verdict leaves it clicked, not checked. The person's own answer is never changed. */
export function judged(w: Walk, verdict: unknown): Walk {
  const last = w.steps[w.steps.length - 1];
  if (!last || !unchecked(last)) return w;
  if (verdict === "no") return answered(w, false);
  if (verdict !== "yes") return w;
  const steps = w.steps.slice();
  steps[steps.length - 1] = bare(last) + LOOKED;
  return { goal: w.goal, steps };
}

/** Is "Did that work?" asked after this step? Always with the usual setting (every step). With "only when unsure", not
 *  after a clean click on a solid ring: still after a soft ring (a guess), a click off the target before the hit, and a
 *  press Companion made for the person (Do it for me). */
export function asksWorked(o: { setting: unknown; how: "your_turn_done" | "done_for_you"; soft: boolean; missed: boolean }): boolean {
  if (o.setting !== "whenUnsure") return true;
  return o.how !== "your_turn_done" || o.soft || o.missed;
}
/** Does the next look wait for the page to stop changing first (bounded, Stop ends it)? With "Wait for the page before
 *  the next step" on (showme.waitForPage), and always when the next look starts by itself after a click. */
export const waitsForPage = (waitSetting: unknown, askSetting: unknown) => waitSetting === true || askSetting === "whenUnsure";

/** Whether the look after a step waits for the page: a look again at the everyday problem ("recheck") always does, as Check
 *  it is fixed does, so it never reads the old screen with the error still on it; any other look follows the settings. */
export const settlesBeforeLook = (mode: string | undefined, waitSetting: unknown, askSetting: unknown) => mode === "recheck" || waitsForPage(waitSetting, askSetting);

/** True when the walk has reached its limit and should hand back to the person in words. */
export const atLimit = (w: Walk) => w.steps.length >= MAX_ANYWHERE_STEPS;

/** What is asked for the next step. Steps that did not work are named so they are not suggested again. */
export function nextQuestion(w: Walk): string {
  const done = w.steps.filter((s) => !failed(s)), bad = w.steps.filter(failed).map((s) => s.slice(0, -FAILED.length));
  const last = w.steps[w.steps.length - 1];
  const check = last && unchecked(last) ? `I clicked "${bare(last)}", but it is not checked yet: first look whether it worked, and if it did not, point at another way to do it.` : "";
  return [`${w.goal}.`, done.length ? `So far I did: ${done.join("; ")}.` : "", bad.length ? `These did NOT work, so do not suggest them again: ${bad.join("; ")}.` : "", check, "What is the next step?"].filter(Boolean).join(" ");
}
