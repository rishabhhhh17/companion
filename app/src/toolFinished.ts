// M105, which tool finished, and did it work (docs/milestones/M105-which-tool-finished.md). Plain decisions, tested in
// m105.test.ts; home.ts (the notch's line), notchMinimal.ts (the hover's line and its one pill) and notchPeek.ts (Home's side
// list) only use them.
//
// An AI tool's done signal names the tool now (runner donesignal.ts), so the review of what changed carries `by`. While that
// review's card is open and the result is fresh, the notch can say "Codex finished in shop: works" or "... 2 problems", and
// its pill opens the card, where Undo is (M101). It says who finished, never who wrote each file (M57's honest words).
// Codex can also say it waits (its PermissionRequest hook): the same amber mark as Claude Code, in Codex's name, with no words
// of its question.
import type { DoneSignalTool } from "../../protocol/index.ts";
import type { Model } from "./model.ts";
import type { ReviewCard } from "./review.ts";
import { MEANING_COLOUR, type Colour } from "./meaning.ts";
import { S } from "./strings.ts";

/** How long after its result a tool's finish is still news for the notch's line and pill. After that the card stays on Home
 *  as before, and the notch goes back to its usual line. */
export const FINISHED_MS = 15 * 60_000;

export type FinishKind = "works" | "fine" | "problems" | "look";
export type Finish = { kind: FinishKind; n: number };

/** What the review said, in the four ways the notch says it: works (nothing found and the project's own checks passed), looks
 *  fine (nothing found, the checks did not run), problems (Fix this first, with how many) or things to look at (Worth a look).
 *  Null while there is no result. Never "works" without passing checks (rule 14). */
export function finishOf(card: Pick<ReviewCard, "result"> | null | undefined): Finish | null {
  const r = card?.result;
  if (!r) return null;
  if (r.rating === "safe") return { kind: r.checks === "passed" ? "works" : "fine", n: 0 };
  return { kind: r.rating === "stop" ? "problems" : "look", n: Math.max(1, r.reasons.length) };
}

const projectOf = (m: Model): string => m.task?.project ?? m.folder ?? "";
const nameOf = (project: string): string => project.split("/").filter(Boolean).at(-1) ?? "";
const samePlace = (a: string, b: string): boolean => a.replace(/\/+$/, "") === b.replace(/\/+$/, "");

export type Finished = { tool: DoneSignalTool; name: string; finish: Finish; line: string; pill: string; side: string; colour: Colour; problems: boolean };

/** The tool that finished, while the card of its review is the one open, its result is in and less than FINISHED_MS old,
 *  for the project open now (or any, when none is known). Null otherwise. */
export function finishedNow(m: Model, now: number): Finished | null {
  const f = m.toolFinished, rv = m.review;
  if (!f || !rv || rv.batch !== f.batch || rv.stage !== "reviewed" || !rv.result) return null;
  if (now - f.at >= FINISHED_MS || now < f.at - 60_000) return null;
  const open = projectOf(m);
  if (open && !samePlace(open, f.project)) return null;
  const finish = finishOf(rv)!;
  const name = S.doneSignal.tool[f.tool];
  const result = finish.kind === "works" ? S.m105.result.works : finish.kind === "fine" ? S.m105.result.fine : S.m105.result[finish.kind](finish.n);
  const pill = finish.kind === "works" || finish.kind === "fine" ? S.m105.pill[finish.kind] : S.m105.pill[finish.kind](finish.n);
  const side = finish.kind === "works" || finish.kind === "fine" ? S.m105.side[finish.kind] : S.m105.side[finish.kind](finish.n);
  const problems = finish.kind === "problems" || finish.kind === "look";
  const colour = finish.kind === "works" ? MEANING_COLOUR.proven : finish.kind === "problems" ? MEANING_COLOUR.problem : finish.kind === "look" ? MEANING_COLOUR.review : MEANING_COLOUR.notChecked;
  return { tool: f.tool, name, finish, line: S.m105.finished(name, nameOf(f.project), result), pill, side, colour, problems };
}

/** M105: which tool waits for the person: Codex when its waiting signal said so, else Claude Code (its own waiting hook). */
export const waitingTool = (m: Pick<Model, "claudeWaiting">): DoneSignalTool => m.claudeWaiting?.tool ?? "claude";

/** The words for "waiting for you", in the waiting tool's name: Claude Code keeps its own words (S.guard.waitingWhy). */
export function waitingWhy(m: Pick<Model, "claudeWaiting">, project: string): string {
  const t = waitingTool(m);
  return t === "claude" ? S.guard.waitingWhy(project) : S.m105.waiting(S.doneSignal.tool[t], project);
}
