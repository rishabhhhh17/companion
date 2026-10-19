// Apps Prompt help and the error explainer may read (ph.appAnswers in Settings, the registry T16): the answers the person
// gave in each app, as the shell shows them (prompt_help.json), and the changes the editor sends back through settings_set.
// The rules live in the shell (prompthelp.rs Consent::change): the built in never list cannot change at all, and an app
// the person said never to read is a protection, loosened only after an inline confirm. Plain code, tested in
// pointtalk.test.ts; settingsPage.tsx only draws it.

export type Answer = "always" | "ask" | "never";
export type AppRow = { id: string; name: string; answer: Answer };
const ANSWERS: readonly Answer[] = ["always", "ask", "never"];
const ORDER: Record<Answer, number> = { always: 0, ask: 1, never: 2 };

/** The rows to show: each app with a known answer, by answer (allowed, asking, never) and then by name. `names`: what the
 *  shell found for each id; an app it could not name keeps its id. */
export function appAnswersFrom(v: unknown, names: Record<string, string>): AppRow[] {
  const apps = typeof v === "object" && v !== null ? (v as { apps?: unknown }).apps : undefined;
  if (typeof apps !== "object" || apps === null || Array.isArray(apps)) return [];
  const rows: AppRow[] = [];
  for (const [id, a] of Object.entries(apps as Record<string, unknown>)) {
    if (typeof a === "string" && (ANSWERS as readonly string[]).includes(a)) rows.push({ id, name: names[id] || id, answer: a as Answer });
  }
  return rows.sort((x, y) => ORDER[x.answer] - ORDER[y.answer] || x.name.localeCompare(y.name));
}

/** Whether this change takes away a protection the person added (a never), so the editor asks first. */
export const needsConfirm = (now: Answer, next: Answer | "forget"): boolean => now === "never" && next !== "never";

/** What the editor sends to the shell for one app. */
export function answerOp(app: string, next: Answer | "forget", confirmed: boolean): Record<string, unknown> {
  return next === "forget" ? { op: "forget", app, confirmed } : { op: "answer", app, answer: next, confirmed };
}

/** Add the app in front to never read, for the app the page showed the person (front_app). The shell changes it only while
 *  that app is still the one in front. */
export const neverFrontOp = (app: string): Record<string, unknown> => ({ op: "neverFront", app });

/** How many answers Forget all forgets: every one except the apps never to read. */
export const forgetAllCount = (rows: AppRow[]): number => rows.filter((r) => r.answer !== "never").length;
