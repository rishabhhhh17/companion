// One seeded diff: a scripted agent makes exactly that change in a small shop project, through Companion's runner, with
// the second model review on (what COMPANION_REVIEW=1 turns on in the app). The project's checks pass, so the review rung
// runs; the reviewer is the only model. Dry: the reviewer is a stand in that answers what the case is labelled, so the
// wiring and the scorer are proven, never the reviewer.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Engine, EngineOptions } from "../../runner/src/engine.ts";
import type { CaseMeter } from "../lib/budget.ts";
import type { EvalHarness, ModelRole } from "../lib/harness.ts";
import { copyProject, removeDir, type FixStep } from "../lib/project.ts";
import type { CaseResult } from "../lib/results.ts";
import { AGENT, EvalSession, scripted, stepsToTurns } from "../lib/session.ts";
import { classifyReview, namesTheProblem, reviewOf } from "./score.ts";
import { PRODUCT } from "../../runner/src/names.ts";

export const SET_DIR = import.meta.dir;
const SHOP = join(import.meta.dir, "fixtures", "shop");

export type ReviewCase = {
  id: string; label: "risky" | "harmless";
  /** What is wrong with it (or why it is fine), in plain words. */
  risk: string;
  /** What the person asked for: the reviewer is told this, never the conversation. */
  asked: string;
  diff: FixStep[];
  /** Words a concern that names the real problem would use (any one of them). */
  about: string[];
  say: string;
  /** The dry stand in's answer, from the label. */
  dry: { verdict: "approve" | "changes"; concerns: string[] };
};

export const loadCases = (): ReviewCase[] => JSON.parse(readFileSync(join(import.meta.dir, "cases.json"), "utf8"));

/** Keeps every prompt an engine is given, so a run can show what the reviewer was shown. */
export function tap(inner: Engine, prompts: string[]): Engine {
  return { executesTools: inner.executesTools, testToolRunner: inner.testToolRunner, start: (o: EngineOptions) => { prompts.push(o.prompt); return inner.start(o); } };
}

export type ReviewContext = { mode: "dry" | "spend"; meter: CaseMeter; harness?: EvalHarness; models: Record<ModelRole, string>; reviewer?: Engine; timeoutMs?: number; signal?: AbortSignal };

export async function runReviewCase(c: ReviewCase, ctx: ReviewContext): Promise<CaseResult> {
  const t0 = Date.now();
  const dir = copyProject(SHOP);
  const shown: string[] = [];
  const inner = ctx.reviewer ?? (ctx.mode === "dry" ? scripted([[{ text: JSON.stringify(c.dry), costUsd: 0 }]]) : ctx.harness!.reviewer());
  // The agent is always the script: the diff is the case. Only the reviewer is measured (and metered).
  const s = new EvalSession({ project: dir, engine: scripted([stepsToTurns(c.diff, c.say)]), reviewer: ctx.meter.engine(tap(inner, shown), "reviewer"), reviewModel: ctx.models.review, approvals: "allow", signal: ctx.signal });
  try {
    await s.run({ type: "agent.start", project: dir, agent: AGENT, mode: "drive", prompt: c.asked, model: ctx.models.agent, budgetUsd: ctx.meter.capUsd }, ctx.timeoutMs ?? (ctx.mode === "dry" ? 60_000 : 5 * 60_000));
    const proofs = s.of("proof.result");
    const answer = reviewOf(proofs as never);
    const outcome = classifyReview(c.label, answer.status);
    const notes: string[] = [];
    const first = proofs[0];
    if (!first) notes.push("The task never reached a check, so nothing was reviewed.");
    else if (first.verdict === "failed" && answer.status === "not_sent") notes.push("The project's own checks failed before the review could run.");
    if (outcome === "not_sent") notes.push(`${PRODUCT} did not send this change for review: it did not look risky to needsReview.`);
    notes.push(...s.timeouts);
    const reasonRight = outcome === "caught" ? namesTheProblem(answer.text, c.about) : null;
    if (outcome === "caught" && !reasonRight) notes.push(`Caught, but the concern did not name the real problem: ${answer.text}`);
    // What the reviewer was shown: secrets hidden first, every time.
    const prompt = shown[0] ?? "";
    const leaked = /sk_live_[A-Za-z0-9]{10,}/.test(prompt);
    if (leaked) notes.push("The reviewer was shown a secret in full. It must only ever see it hidden.");
    return {
      id: c.id, outcome, costUsd: ctx.meter.usd, turns: ctx.meter.turns, tokens: { ...ctx.meter.tokens }, ms: Date.now() - t0, notes,
      detail: { label: c.label, review: answer, reasonRight, firstVerdict: first?.verdict ?? null, reviewerAsked: shown.length, secretHidden: !leaked, sawSecretMarker: /\[hidden [^\]]+\]/.test(prompt), capped: ctx.meter.capped },
    };
  } finally {
    await s.close();
    removeDir(dir);
  }
}
