// The fix task's request once Companion's own check has found the problem: the practice projects' Fix it with me, Point at
// the problem's Fix it when it is set to one small checked fix (point.fixWith), and the coding eval that measures them
// (evals/fix-projects). One builder, so what the eval measures is what ships. The page builds the command around it
// (app/src/commands.ts fixFound); secrets in the check's output are hidden before the agent sees them (followup.ts evidence).
import type { Problem } from "../../protocol/index.ts";
import { evidence } from "./followup.ts";
import { PRODUCT } from "./names.ts";

/** What the task is asked to do. "Do not change the tests" is also enforced in code for the practice projects, by the
 *  house rule written into each copy (rule 12); here it is only the request. */
export const FIX_ASK = "Find the cause and fix it with the smallest change. Do not change the tests.";
/** What a practice's fix may spend on the person's key, whatever the budget in Settings (the practice costs cents). */
export const PRACTICE_BUDGET_USD = 0.6;

/** The failed check, what happened, the place when there is one, and the request. */
export function fixFoundPrompt(found: { label?: string; detail?: string; problem?: Problem }): string {
  const e = evidence({ label: found.label ?? "A check", detail: found.detail ?? "" });
  const p = found.problem;
  const where = p?.kind === "line" ? `\nWhere it fails: ${p.file}, line ${p.line}: ${evidence({ label: "", detail: p.lineText }).detail}` : "";
  return `${PRODUCT} checked this project and one of its checks fails.\n\nFailed check: ${e.label}\nWhat happened: ${e.detail}${where}\n\n${FIX_ASK}`;
}
