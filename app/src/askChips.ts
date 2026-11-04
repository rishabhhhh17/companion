// M69, the system: the example chips in the ask box (the YC benchmark spec 3.1: "three example chips drawn from the user's
// own project", Replit's first box). Each chip comes from one fact Squibby already holds for this project (a key warning, an
// open review, an explained error, a check that found something, a failing watch, changes since the last check, a project
// that needs setting up), in that order, at most three. When nothing is known there are no chips: never invented text about
// the project. The words are fixed sentences in strings.ts, so nothing from a file or a model reaches them. Plain code,
// tested in askChips.test.ts; card.tsx gathers the facts from the model and draws the chips.
import { S } from "./strings.ts";

export const ASK_CHIPS_MAX = 3;

export type WatchKind = keyof typeof S.askChips.watch;
/** What Home knows right now about the open project, as plain yes or no facts (card.tsx reads them from the model). */
export type ChipFacts = {
  project: string;
  /** A key was written into the code (review.ts keyWarned). */
  keyWarned?: boolean;
  /** Changes wait on the review card for this project. */
  reviewOpen?: boolean;
  /** An error was explained for this project (error.explained, ready). */
  errorExplained?: boolean;
  /** Check my project found a problem (point, found). */
  checkFound?: boolean;
  /** This project's watches that are failing, by kind. */
  watchFailing?: readonly WatchKind[];
  /** Files changed since the last check (tasks.list sinceCheck). */
  changedSinceCheck?: boolean;
  /** The project needs an install before it can run (project.report needsInstall). */
  needsInstall?: boolean;
};
export type AskChip = { id: string; words: string };

export function askChips(f: ChipFacts): AskChip[] {
  if (!f.project) return [];
  const out: AskChip[] = [];
  if (f.keyWarned) out.push({ id: "key", words: S.askChips.key });
  // One chip per card: a key warning is the review card's own question.
  else if (f.reviewOpen) out.push({ id: "review", words: S.askChips.review });
  if (f.checkFound) out.push({ id: "found", words: S.askChips.found });
  if (f.errorExplained) out.push({ id: "error", words: S.askChips.error });
  for (const k of f.watchFailing ?? []) if (S.askChips.watch[k]) out.push({ id: `watch:${k}`, words: S.askChips.watch[k] });
  if (f.changedSinceCheck) out.push({ id: "since", words: S.askChips.since });
  if (f.needsInstall) out.push({ id: "install", words: S.askChips.install });
  const seen = new Set<string>();
  return out.filter((c) => (seen.has(c.words) ? false : (seen.add(c.words), true))).slice(0, ASK_CHIPS_MAX);
}
