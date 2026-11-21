// M101: Put these files back, on a review that ran (Home's review card, or the review's row in History). Plain code, tested
// in reviewUndo.test.ts; reviewUndoPart.tsx only draws what this decides. One flow at a time: the press asks the engine to
// look (review.undoPlan), the confirm step names the files, the files changed again since (left alone unless the person
// says Put those back too), the settings and key files that are never put back, and a commit made in git since; then the
// person's yes (review.undo) and the result. Nothing here writes anything or runs any git: the engine puts the files back
// from its own shadow copy, and a git command is only ever shown, for the person to run.
import { REVIEW_UNDO_WHY, type Command } from "../../protocol/index.ts";
import { reviewUndo, reviewUndoPlan } from "./commands.ts";
import type { ReviewCard } from "./review.ts";
import { S } from "./strings.ts";

export type UndoWhy = (typeof REVIEW_UNDO_WHY)[number];
/** What the engine said would come back (review.undoPlan, checked again here). */
export type UndoPlan = { files: string[]; count: number; later: string[]; env: string[]; cannot: string[]; committed: boolean };
/** What it did (review.undone). */
export type UndoDone = { reverted: string[]; kept: string[]; saved: string[]; env: string[]; cannot: string[]; committed: boolean };
/** where: the card on Home, or the row in History. stage: looking (asked, no answer yet), confirm, working (the yes was
 *  sent), done, or refused (why). overwrite: Put those back too is on. */
export type ReviewUndo = {
  project: string; batch: string; where: "card" | "history";
  stage: "looking" | "confirm" | "working" | "done" | "refused";
  plan?: UndoPlan; done?: UndoDone; why?: UndoWhy; overwrite: boolean;
};

const BATCH = /^rv_[0-9a-f]{10}$/;
const MAX = 50;
type Ev = Record<string, unknown> & { type?: string };
const norm = (p: string) => p.replace(/\/+$/, "");
/** File names from the folder down, at most 50; anything else and the list is left out. */
function names(v: unknown, max = MAX): string[] | null {
  if (v === undefined) return [];
  if (!Array.isArray(v) || !v.every((f) => typeof f === "string" && f.length > 0 && f.length <= 1000 && !f.startsWith("/") && !f.split("/").includes(".."))) return null;
  return (v as string[]).slice(0, max);
}
const whyOf = (v: unknown): UndoWhy => ((REVIEW_UNDO_WHY as readonly unknown[]).includes(v) ? (v as UndoWhy) : "failed");
const ours = (u: ReviewUndo | null, e: Ev): u is ReviewUndo => !!u && typeof e.project === "string" && norm(e.project) === norm(u.project) && e.batch === u.batch;

/** Offered on the card only once its batch is closed (the review ran): before that the batch may still grow. Never in the
 *  key practice's copy (its own Fix it is the practice's move). */
export function undoOffered(r: ReviewCard | null | undefined, practice = false): boolean {
  // M106: never on a background job's card: its folder is Claude Code's to keep or throw away.
  return !!r && r.stage === "reviewed" && !!r.result && r.fix !== "sent" && !practice && !r.job;
}

export function reviewUndoReduce(u: ReviewUndo | null, e: Ev): ReviewUndo | null {
  switch (e.type) {
    case "ui.reviewUndoAsked": {
      if (typeof e.project !== "string" || !e.project || typeof e.batch !== "string" || !BATCH.test(e.batch)) return u;
      // A put back already running is never left for another: its result still has to arrive.
      if (u?.stage === "working") return u;
      return { project: e.project, batch: e.batch, where: e.where === "history" ? "history" : "card", stage: "looking", overwrite: false };
    }
    case "review.undoPlan": {
      if (!ours(u, e) || u.stage !== "looking") return u;
      if (e.ok !== true) return { ...u, stage: "refused", why: whyOf(e.why) };
      const files = names(e.files), later = names(e.later), env = names(e.env, 20), cannot = names(e.cannot);
      const count = typeof e.count === "number" && Number.isInteger(e.count) && e.count >= 0 ? e.count : null;
      if (!files || !later || !env || !cannot || count === null) return { ...u, stage: "refused", why: "failed" };
      if (!files.length && !later.length) return { ...u, stage: "refused", why: "nothing" };
      return { ...u, stage: "confirm", plan: { files, count: Math.max(count, files.length), later, env, cannot, committed: e.committed === true } };
    }
    case "ui.reviewUndoOverwrite": return u?.stage === "confirm" && u.plan?.later.length ? { ...u, overwrite: e.on === true } : u;
    case "ui.reviewUndoSent": return u?.stage === "confirm" ? { ...u, stage: "working" } : u;
    case "review.undone": {
      if (!ours(u, e) || (u.stage !== "working" && u.stage !== "confirm")) return u;
      if (e.ok !== true) return { ...u, stage: "refused", why: whyOf(e.why) };
      const reverted = names(e.reverted, 1000), kept = names(e.kept, 1000), saved = names(e.saved, 1000), env = names(e.env), cannot = names(e.cannot, 1000);
      if (!reverted || !kept || !saved || !env || !cannot) return { ...u, stage: "refused", why: "failed" };
      return { ...u, stage: "done", done: { reverted, kept, saved, env, cannot, committed: e.committed === true } };
    }
    // The shell did not take a press (the group was off, the engine stopped).
    case "ui.reviewUndoRefused": return u && u.stage !== "done" ? { ...u, stage: "refused", why: "failed" } : u;
    case "ui.reviewUndoClosed": return null;
    // Stop everything closes a question that is open. A put back already sent finishes in the engine and says so.
    case "app.stop_everything": return u && (u.stage === "looking" || u.stage === "confirm") ? null : u;
    case "ui.projectChanged": return !u || (typeof e.project === "string" && norm(e.project) === norm(u.project)) ? u : null;
    case "runner.hello": case "app.runner_down": return u && u.stage === "working" ? { ...u, stage: "refused", why: "failed" } : null;
    default: return u;
  }
}

/** The command for the person's yes: the files changed again since only when they said Put those back too. */
export function undoCommand(u: ReviewUndo): Command | null {
  if (u.stage !== "confirm" || !u.plan || !confirmLines(u.plan, u.overwrite).canYes) return null;
  return reviewUndo(u.project, u.batch, u.overwrite ? u.plan.later : undefined);
}
export const lookCommand = (project: string, batch: string): Command => reviewUndoPlan(project, batch);

/** "a.ts, b.ts and 3 more": at most five names. */
export function nameList(files: string[]): string {
  if (files.length <= 5) return files.join(", ");
  return `${files.slice(0, 5).join(", ")} ${S.history.reviewMore(files.length - 5)}`;
}
/** The confirm step's lines, in order: what goes back, what was changed again since, what is never put back, the commit.
 *  canYes: something would go back. When every file was changed again since, nothing does until Put those back too. */
export function confirmLines(p: UndoPlan, overwrite: boolean): { sure: string; canYes: boolean; later: string | null; laterOn: string | null; env: string | null; cannot: string | null; commit: string | null } {
  const n = p.count + (overwrite ? p.later.length : 0);
  return {
    sure: n > 0 ? S.reviewUndo.sure(n) : S.reviewUndo.onlyLater,
    canYes: n > 0,
    later: p.later.length ? S.reviewUndo.later(p.later.length) : null,
    laterOn: p.later.length && overwrite ? S.reviewUndo.laterOn : null,
    env: p.env.length ? S.reviewUndo.env(nameList(p.env)) : null,
    cannot: p.cannot.length ? S.reviewUndo.cannot(nameList(p.cannot)) : null,
    commit: p.committed ? S.reviewUndo.commitBefore : null,
  };
}
/** The result's lines. The commit's command is shown separately, with its own Copy. */
export function doneLines(d: UndoDone): string[] {
  return [
    S.reviewUndo.done(d.reverted.length),
    ...(d.kept.length ? [S.reviewUndo.doneKept(nameList(d.kept))] : []),
    ...(d.saved.length ? [S.reviewUndo.doneSaved] : []),
    ...(d.env.length ? [S.reviewUndo.env(nameList(d.env))] : []),
  ];
}
/** Why it cannot be done now, in words. */
export const whyLine = (why: UndoWhy | undefined): string => S.reviewUndo.why[why ?? "failed"] ?? S.reviewUndo.why.failed;
