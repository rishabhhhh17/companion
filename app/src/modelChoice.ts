// "Claude for tasks, plans and research", "Claude for Rescue" and "Claude for quick answers" (model.work, model.rescue,
// model.quick) on the pages' side. A setting holds an option id; the model for it, and which options may be offered, come
// from runner/src/models.ts (MODEL_CHOICES): an option other than the usual one is offered only once its own real smoke
// test case has passed (SMOKE_PASSED). Until then a saved choice of it still gets today's model, and the row is not shown,
// because it would offer only one option.
import { REGISTRY, type Def } from "../../protocol/settings.ts";
import { modelForChoice, offeredChoices, SMOKE_PASSED, type ChoiceJob } from "../../runner/src/models.ts";

const JOB: Record<string, ChoiceJob> = { "model.work": "work", "model.rescue": "rescue", "model.quick": "quick" };

/** The options a model row may offer now, in the registry's order; null for a setting that is not a model choice. */
export function offeredOptions(key: string, passed: readonly string[] = SMOKE_PASSED): string[] | null {
  const job = Object.hasOwn(JOB, key) ? JOB[key] : undefined;
  return job ? offeredChoices(job, passed) : null;
}
/** The settings the Settings page shows and searches: every one, except a model row that could offer only one option. */
export function shownSettings(settings: readonly Def[] = REGISTRY.settings, passed: readonly string[] = SMOKE_PASSED): Def[] {
  return settings.filter((d) => { const o = offeredOptions(d.key, passed); return o === null || o.length > 1; });
}
/** The model a page sends for a saved option (the usual one's for anything not offered yet, or not an option at all). */
export const modelFor = (key: "model.work" | "model.rescue", value: unknown, passed: readonly string[] = SMOKE_PASSED): string => modelForChoice(JOB[key], value, passed);
