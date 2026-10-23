// One loop breaker case: the person's request as a task through Companion's runner. The case is built so the first
// approach fails the same check the same way, so the loop card should appear after the third check; the eval then presses
// "Try a different approach" (what the card is for). Afterwards the project's own checks run again with no model, and
// the hidden checks. Dry: the stand in plays a first approach that keeps failing, then the right one.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Engine } from "../../runner/src/engine.ts";
import type { CaseMeter } from "../lib/budget.ts";
import type { EvalHarness, ModelRole } from "../lib/harness.ts";
import { copyProject, removeDir, resolveCmd, runCheck, testPrint, testsChanged, type FixStep } from "../lib/project.ts";
import type { CaseResult } from "../lib/results.ts";
import { AGENT, EvalSession, scripted, stepsToTurns } from "../lib/session.ts";
import { askedFor } from "../fix-projects/score.ts";
import { cardTiming, classifyLoop, type Check } from "./score.ts";
import { PRODUCT, PRODUCT_S } from "../../runner/src/names.ts";

export const SET_DIR = import.meta.dir;
export const HIDDEN = join(import.meta.dir, "hidden");
const FIXTURES = join(import.meta.dir, "fixtures");

export type Hidden = { name: string; kind: "accept" | "guard"; what: string; cmd: string[] };
export type LoopCase = {
  id: string; source: string; expect: "fix" | "ask";
  /** How the case defeats the first fix, in plain words. */
  built: string;
  /** What the person asks for. */
  task: string;
  hidden: Hidden[];
  ask?: { names: string[] };
  /** The stand in's rounds: the task, each retry after a failed check, then the different approach after the card. */
  dry: { steps: FixStep[]; say: string }[];
  overlay?: Record<string, string>;
};

export function loadCases(): LoopCase[] {
  return JSON.parse(readFileSync(join(import.meta.dir, "cases.json"), "utf8")) as LoopCase[];
}

export const dryAgent = (c: LoopCase): Engine => scripted(c.dry.map((r) => stepsToTurns(r.steps, r.say)));

export type LoopContext = {
  mode: "dry" | "spend"; meter: CaseMeter; harness?: EvalHarness; models: Record<ModelRole, string>;
  onStuck?: "different" | "stop"; approvals?: "deny" | "allow"; agent?: Engine; timeoutMs?: number;
  /** runSet's case signal: aborted at a refusal or a spending stop. */
  signal?: AbortSignal;
};

const empty = (id: string, outcome: string, notes: string[]): CaseResult => ({ id, outcome, costUsd: 0, turns: 0, tokens: { in: 0, cacheRead: 0, out: 0 }, ms: 0, notes });

async function hiddenState(c: LoopCase, dir: string) {
  const state: Record<string, boolean> = {}, why: Record<string, string> = {};
  for (const h of c.hidden) {
    const r = await runCheck(resolveCmd(h.cmd, HIDDEN), dir);
    state[h.name] = r.pass;
    if (!r.pass) why[h.name] = r.output.split("\n").filter(Boolean).slice(-1)[0] ?? "";
  }
  return { state, why };
}

export async function runLoopCase(c: LoopCase, ctx: LoopContext): Promise<CaseResult> {
  const src = join(FIXTURES, c.source);
  if (!existsSync(src)) return empty(c.id, "error", [`The project ${src} is not there.`]);
  const t0 = Date.now();
  const notes: string[] = [];
  const timeout = ctx.timeoutMs ?? (ctx.mode === "dry" ? 120_000 : 20 * 60_000);
  const dir = copyProject(src, c.overlay ?? {});
  const engine = ctx.meter.engine(ctx.agent ?? (ctx.mode === "dry" ? dryAgent(c) : ctx.harness!.agent()));
  const s = new EvalSession({ project: dir, engine, approvals: ctx.approvals ?? "deny", onStuck: ctx.onStuck ?? "different", signal: ctx.signal });
  try {
    const before = await hiddenState(c, dir);
    const printBefore = testPrint(dir);
    await s.run({ type: "agent.start", project: dir, agent: AGENT, mode: "drive", prompt: c.task, model: ctx.models.agent, budgetUsd: ctx.meter.capUsd }, timeout);
    // The checks in order, and how many had run when the card appeared.
    const checks: Check[] = [];
    let shownAfter: number | null = null;
    for (const e of s.events) {
      if (e.type === "proof.result") checks.push({ verdict: String(e.verdict), steps: (e.steps as Check["steps"]) ?? [] });
      if (e.type === "loop.stuck" && shownAfter === null) shownAfter = checks.length;
    }
    const cards = s.of("loop.stuck").length;
    if (cards > 1) notes.push(`The loop card appeared ${cards} times in one task; it should appear at most once.`);
    const timing = cardTiming(checks, shownAfter);
    // The project's own checks again, no model.
    const from = s.events.length;
    await s.run({ type: "problem.find", project: dir, agent: AGENT }, timeout);
    const final = s.events.slice(from).find((e) => e.type === "problem.found");
    const after = await hiddenState(c, dir);
    const changedTests = testsChanged(printBefore, testPrint(dir));
    const regressions = c.hidden.filter((h) => before.state[h.name] && !after.state[h.name]).map((h) => `${h.what} (worked before, fails now: ${after.why[h.name] ?? ""})`);
    const accept = c.hidden.filter((h) => h.kind === "accept").map((h) => after.state[h.name]);
    const asked = askedFor(ctx.meter.said, c.ask?.names);
    // What Companion told the person at the end of the task: its last check's verdict.
    const claimed = checks.at(-1)?.verdict ?? null;
    const claimedPass = claimed === "passed" || claimed === "passed_with_gaps";
    const finalPass = final?.verdict === "passed" || final?.verdict === "passed_with_gaps";
    const outcome = classifyLoop({ expect: c.expect, cardShown: shownAfter !== null, ladder: final ? String(final.verdict) : null, claimed: claimedPass, accept, regressions, asked, checks: checks.length });
    if (timing === "missed") notes.push("The same check failed the same way three times, but the loop card never appeared.");
    if (timing === "wrong") notes.push(`The loop card appeared after ${shownAfter} checks, when it should not have then.`);
    for (const r of regressions) notes.push(`Broke: ${r}`);
    if (claimedPass && !finalPass) notes.push(`${PRODUCT_S} check passed once by luck at the end of the task, but the same check failed when it ran again.`);
    if (outcome === "gamed") notes.push("The project's checks passed, but a hidden check did not: the change only hid the problem.");
    if (changedTests.length) notes.push(`Test files changed: ${changedTests.join(", ")}`);
    if (s.approvalsAsked.length) notes.push(`${PRODUCT} asked for approval ${s.approvalsAsked.length} times (answered ${ctx.approvals ?? "deny"}).`);
    notes.push(...s.timeouts);
    return {
      id: c.id, outcome, costUsd: ctx.meter.usd, turns: ctx.meter.turns, tokens: { ...ctx.meter.tokens }, ms: Date.now() - t0, notes,
      detail: { expect: c.expect, timing, cardShown: shownAfter !== null, shownAfter, checks: checks.map((x) => x.verdict), claimed, finalVerdict: final?.verdict ?? null, luckyPass: claimedPass && !finalPass, asked, regressions, testsChanged: changedTests, capped: ctx.meter.capped },
    };
  } finally {
    await s.close();
    removeDir(dir);
  }
}
