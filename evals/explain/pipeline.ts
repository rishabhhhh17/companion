// One Explain case: a fix case's known good change made by a scripted agent through Companion's runner, so Explain runs
// exactly as it does after a real task (the same request, built from the real diff, through the explainer the runner is
// given). The fast model is the only thing measured. Then the rules are checked in code and a grader model judges the rest.
// The proof ladder is a stand in that passes: Explain does not depend on it, and the fix eval already runs it for real.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CaseMeter } from "../lib/budget.ts";
import type { EvalHarness, ModelRole, TextAsk } from "../lib/harness.ts";
import { copyProject, removeDir } from "../lib/project.ts";
import type { CaseResult } from "../lib/results.ts";
import { AGENT, EvalSession, scripted, stepsToTurns } from "../lib/session.ts";
import { FIX_ASK, loadCases as loadFixCases, type LoadedCase } from "../fix-projects/pipeline.ts";
import { gradeRequest, judge, parseGrade, ruleChecks, type Rules } from "./score.ts";

export const SET_DIR = import.meta.dir;
export const RUBRIC = readFileSync(join(import.meta.dir, "RUBRIC.md"), "utf8");

export type ExplainCase = {
  /** The fix case whose known good change is explained. */
  fix: string;
  /** Key ideas a correct explanation names (one word of each group); the dry stand in grader uses them. */
  mention: string[][];
  /** A reference explanation in the fast model's reply format: what the dry stand in sends back. */
  good: { why: string[]; question: { text: string; options: string[]; correct: number } };
};
export type LoadedExplainCase = ExplainCase & { id: string; change: LoadedCase };

export function loadCases(): LoadedExplainCase[] {
  const fixes = new Map(loadFixCases().map((c) => [c.id, c]));
  return (JSON.parse(readFileSync(join(import.meta.dir, "cases.json"), "utf8")) as ExplainCase[]).map((c) => {
    const change = fixes.get(c.fix);
    if (!change) throw new Error(`Explain case ${c.fix}: there is no fix case with that id.`);
    if (!change.fix.length) throw new Error(`Explain case ${c.fix}: that fix case has no change to explain.`);
    return { ...c, id: c.fix, change };
  });
}

export const mentionsAll = (groups: string[][], text: string) => groups.every((g) => g.some((w) => text.toLowerCase().includes(w.toLowerCase())));

/** The dry stand in grader: correct when the case's key ideas are named, the rest from the rules. Not a judgement. */
export const dryGrader = (c: ExplainCase, r: Rules): TextAsk => async () => ({
  text: JSON.stringify({ correct: mentionsAll(c.mention, r.lines.join(" ")), questionRight: r.question, plain: r.plain, why: "stand in grade, from the case's key words" }),
  costUsd: 0,
});

export type ExplainContext = { mode: "dry" | "spend"; meter: CaseMeter; harness?: EvalHarness; models: Record<ModelRole, string>; explainer?: TextAsk; grader?: TextAsk; timeoutMs?: number; signal?: AbortSignal };

export async function runExplainCase(c: LoadedExplainCase, ctx: ExplainContext): Promise<CaseResult> {
  const t0 = Date.now();
  const dir = copyProject(c.change.src, c.change.files);
  const asked: { text: string; system: string }[] = [], said: string[] = [];
  const inner: TextAsk = ctx.explainer ?? (ctx.mode === "dry" ? async () => ({ text: JSON.stringify(c.good), costUsd: 0 }) : ctx.harness!.ask(ctx.models.fast));
  const explainer = ctx.meter.ask(async (req, signal) => { asked.push(req); const r = await inner(req, signal); said.push(r.text); return r; });
  const s = new EvalSession({ project: dir, engine: scripted([stepsToTurns(c.change.fix, c.change.say)]), explainer, proof: async () => ({ verdict: "passed", steps: [] }), signal: ctx.signal });
  try {
    await s.run({ type: "agent.start", project: dir, agent: AGENT, mode: "drive", prompt: `The checks in this project fail. ${FIX_ASK}`, model: ctx.models.agent, budgetUsd: ctx.meter.capUsd }, 60_000);
    // Explain runs in the background after the receipt. Wait for the card, or until the reply is in and the card has had a
    // moment to follow (an unreadable reply never shows one).
    let answeredAt = 0;
    await s.until(() => {
      if (s.of("explain.ready").length) return true;
      if (ctx.signal?.aborted) return true;   // a refusal or a spending stop: no reply is coming
      if (said.length && !answeredAt) answeredAt = Date.now();
      return answeredAt > 0 && Date.now() - answeredAt > 1_000;
    }, ctx.timeoutMs ?? (ctx.mode === "dry" ? 10_000 : 90_000));
    const ready = s.last("explain.ready") ?? null;
    const raw = said[0] ?? "";
    const rules = ruleChecks(raw);
    let grade = null;
    if (rules.parsed) {
      const g = ctx.grader ?? (ctx.mode === "dry" ? dryGrader(c, rules) : ctx.harness!.ask(ctx.models.grader));
      const exp = { why: rules.lines, ...(rules.explanation?.question ? { question: rules.explanation.question } : {}) };
      // A failed grade is "not graded"; when the failure was a refusal or a spending stop, runSet fails the case with it.
      try { grade = parseGrade((await ctx.meter.ask(g)(gradeRequest(RUBRIC, asked[0]?.text ?? "", exp), ctx.signal ?? new AbortController().signal)).text); } catch { grade = null; }
    }
    const { outcome, reasons } = judge(rules, grade);
    const notes = [...reasons];
    notes.push(...s.timeouts);
    if (!asked.length) notes.unshift("Explain was never asked: the task did not finish as done, or it changed nothing that can be shown.");
    else if (rules.parsed && !ready) notes.unshift("The app never showed the explanation, although the reply could be read.");
    return {
      id: c.id, outcome, costUsd: ctx.meter.usd, turns: ctx.meter.turns, tokens: { ...ctx.meter.tokens }, ms: Date.now() - t0, notes,
      detail: {
        lines: rules.lines, checkQuestion: rules.explanation?.question ?? null, shown: !!ready,
        // The four parts of the rubric, each true only when both the rules and the grader say so.
        twoLines: rules.twoLines, plain: rules.plain && (grade?.plain ?? false), question: rules.question && (grade?.questionRight ?? false),
        correct: grade?.correct ?? false, grade, capped: ctx.meter.capped,
      },
    };
  } finally {
    await s.close();
    removeDir(dir);
  }
}
