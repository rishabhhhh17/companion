// One fix case, the way a person meets the hero: Point at the problem (problem.find, no model), then a fix task through
// Companion's runner (its safety rules, snapshots, proof ladder and loop card), then the project's own checks again with
// no model, then the hidden checks. Dry: the agent is a stand in that makes the case's known good fix.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Engine, Step } from "../../runner/src/engine.ts";
import { shq } from "../../runner/src/proof/exec.ts";
import type { Problem } from "../../protocol/index.ts";
import type { CaseMeter } from "../lib/budget.ts";
import type { EvalHarness, ModelRole } from "../lib/harness.ts";
import { changeSize, copyProject, fileTexts, needMet, perTest, removeDir, resolveCmd, runCheck, testPrint, testRegressions, testsChanged, type FixStep } from "../lib/project.ts";
import type { CaseResult } from "../lib/results.ts";
import { AGENT, EvalSession, scripted, stepsToTurns } from "../lib/session.ts";
import { askedFor, classify } from "./score.ts";

export const SET_DIR = import.meta.dir;
export const HIDDEN = join(import.meta.dir, "hidden");
const RESCUE = join(import.meta.dir, "..", "rescue-projects", "cases");
const FIXTURES = join(import.meta.dir, "fixtures");

export type Hidden = { name: string; kind: "accept" | "guard"; what: string; cmd: string[] };
export type FixCase = {
  id: string; source: string; expect: "fix" | "ask"; split: "train" | "test"; hard: boolean;
  /** What the stand in says it did (one plain sentence); the Explain set uses it too. */
  say: string;
  /** The known good fix, as edits through Companion's own tools. Empty for a case that must be asked about. */
  fix: FixStep[];
  hidden: Hidden[];
  needs?: string[];
  /** Files written into the copy first (a .env, which is never committed; the rescue projects' package.json). */
  overlay?: Record<string, string>;
  ask?: { names: string[] };
  /** Where Point at the problem should find it. For the rescue projects it comes from their expected.json. */
  where?: { file: string; line: number };
};
export type LoadedCase = FixCase & { src: string; files: Record<string, string> };

/** The 25 cases: the 15 rescue projects (each given a package.json whose check is the rescue eval's own) and 10 fixtures. */
export function loadCases(): LoadedCase[] {
  const list = JSON.parse(readFileSync(join(import.meta.dir, "cases.json"), "utf8")) as FixCase[];
  return list.map((c) => {
    const [kind, name] = c.source.split(":");
    if (kind === "rescue") {
      const src = join(RESCUE, name);
      const exp = JSON.parse(readFileSync(join(src, "expected.json"), "utf8")) as { cmd: string[]; file: string; line: number };
      const script = exp.cmd[0] === "$TSC" ? "typecheck" : "test";
      const pkg = { name: c.id, private: true, scripts: { [script]: resolveCmd(exp.cmd, HIDDEN).map((w) => (/^[\w@%+=:,./-]+$/.test(w) ? w : shq(w))).join(" ") } };
      return { ...c, src, where: c.where ?? { file: exp.file, line: exp.line }, files: { "package.json": JSON.stringify(pkg, null, 2) + "\n", ...(c.overlay ?? {}) } };
    }
    if (kind !== "fixture") throw new Error(`${c.id}: unknown source ${c.source}`);
    return { ...c, src: join(FIXTURES, name), files: { ...(c.overlay ?? {}) } };
  });
}

/** What the fix task is told: what Point at the problem found, in the same words the card shows, and the request. It is the
 *  shipped builder (runner/src/fixfound.ts, used by the practice projects and Point at the problem's small fix), so the eval
 *  measures the product's own request. The M11 prompt work changes it there. */
import { FIX_ASK, fixFoundPrompt as fixPrompt } from "../../runner/src/fixfound.ts";
import { PRODUCT } from "../../runner/src/names.ts";
export { FIX_ASK, fixPrompt };

export type Flow = "task" | "rescue";
/** The stand in: the known good fix (or, for an ask case, the question), as the agent's turns. Rescue gets a diagnosis first. */
export function dryAgent(c: FixCase, flow: Flow): Engine {
  const fix: Step[] = c.expect === "ask" ? [{ text: c.say, costUsd: 0 }] : stepsToTurns(c.fix, c.say);
  if (flow === "task") return scripted([fix]);
  const diagnosis = { summary: "A small project with one problem.", works: [], broken: c.say, steps: [c.expect === "ask" ? "Ask for the missing setting" : "Fix the failing check"] };
  return scripted([[{ text: JSON.stringify(diagnosis), costUsd: 0 }], fix]);
}

export type FixContext = {
  mode: "dry" | "spend";
  meter: CaseMeter;
  harness?: EvalHarness;
  models: Record<ModelRole, string>;
  flow?: Flow;
  onStuck?: "different" | "stop";
  approvals?: "deny" | "allow" | "settings";
  /** Turn on the second model review (COMPANION_REVIEW) for the fix task. */
  review?: boolean;
  /** Tests only: a stand in other than the known good fix (a wrong fix, one that breaks something else). */
  agent?: Engine;
  timeoutMs?: number;
  /** runSet's case signal: aborted at a refusal or a spending stop. */
  signal?: AbortSignal;
};

type CheckState = Record<string, boolean>;
async function runHidden(c: LoadedCase, dir: string): Promise<{ state: CheckState; why: Record<string, string> }> {
  const state: CheckState = {}, why: Record<string, string> = {};
  for (const h of c.hidden) {
    const r = await runCheck(resolveCmd(h.cmd, HIDDEN), dir);
    state[h.name] = r.pass;
    if (!r.pass) why[h.name] = r.output.split("\n").filter(Boolean).slice(-1)[0] ?? "";
  }
  return { state, why };
}

const empty = (id: string, outcome: string, notes: string[]): CaseResult => ({ id, outcome, costUsd: 0, turns: 0, tokens: { in: 0, cacheRead: 0, out: 0 }, ms: 0, notes });

export async function runFixCase(c: LoadedCase, ctx: FixContext): Promise<CaseResult> {
  const missing = (c.needs ?? []).filter((n) => !needMet(n));
  if (missing.length) return empty(c.id, "cannot_run", [`This Mac does not have ${missing.join(", ")}, which this case needs.`]);
  if (!existsSync(c.src)) return empty(c.id, "error", [`The project ${c.src} is not there.`]);
  const t0 = Date.now();
  const notes: string[] = [];
  const flow = ctx.flow ?? "task";
  const timeout = ctx.timeoutMs ?? (ctx.mode === "dry" ? 120_000 : 15 * 60_000);
  const dir = copyProject(c.src, c.files);
  // The runner tells the engine which model each turn is for (Rescue's diagnosis has its own); the stand in plays every part.
  const inner = ctx.agent ?? (ctx.mode === "dry" ? dryAgent(c, flow) : ctx.harness!.agent());
  const engine = ctx.meter.engine(inner);
  const reviewer = ctx.review ? ctx.meter.engine(ctx.mode === "dry" ? scripted([[{ text: '{"verdict":"approve","concerns":[]}', costUsd: 0 }]]) : ctx.harness!.reviewer(), "reviewer") : undefined;
  const s = new EvalSession({ project: dir, engine, reviewer, reviewModel: ctx.models.review, approvals: ctx.approvals ?? "settings", onStuck: ctx.onStuck ?? "different", signal: ctx.signal });
  try {
    const before = await runHidden(c, dir);
    const printBefore = testPrint(dir);
    const textsBefore = fileTexts(dir);
    // Each test by name, so a fix that breaks another test of the same failing check is seen (the check failed before too).
    const testsBefore = await perTest(dir);
    // 1. Point at the problem: the project exactly as it is, no model, nothing changed.
    await s.run({ type: "problem.find", project: dir, agent: AGENT }, timeout);
    const found = s.last("problem.found");
    const rungsBefore = new Set(s.of("proof.step").filter((x) => x.status === "passed").map((x) => String(x.rung)));
    const place = found?.problem?.kind === "line" ? { file: found.problem.file, line: found.problem.line } : null;
    const locatedRight = c.where ? !!place && place.file === c.where.file && place.line === c.where.line : null;
    if (!found || found.verdict !== "failed") {
      return { ...empty(c.id, "error", [`The project was not broken the way the case says: Point at the problem said ${found?.verdict ?? "nothing"}.`]), ms: Date.now() - t0 };
    }
    // 2. The fix.
    const fixFrom = s.events.length;
    if (flow === "task") {
      await s.run({ type: "agent.start", project: dir, agent: AGENT, mode: "drive", prompt: fixPrompt(found as { label?: string; detail?: string; problem?: Problem }), model: ctx.models.agent, budgetUsd: ctx.meter.capUsd }, timeout);
    } else {
      await s.run({ type: "rescue.diagnose", project: dir, agent: AGENT, model: ctx.models.diagnose, budgetUsd: ctx.meter.capUsd }, timeout);
      const plan = s.events.slice(fixFrom).find((e) => e.type === "plan.ready");
      if (plan) await s.run({ type: "drive.approve", agent: AGENT, steps: (plan.steps as { title: string }[]).map((x) => x.title) }, timeout);
      else notes.push("Rescue gave no plan, so nothing was fixed.");
    }
    const during = s.events.slice(fixFrom);
    const receipts = during.filter((e) => e.type === "receipt");
    const errors = during.filter((e) => e.type === "protocol.error").map((e) => String(e.reason));
    if (errors.length) notes.push(...errors.slice(0, 3).map((r) => `${PRODUCT} said: ${r}`));
    notes.push(...s.timeouts);
    // 3. The project's own checks again, no model.
    const finalFrom = s.events.length;
    await s.run({ type: "problem.find", project: dir, agent: AGENT }, timeout);
    const final = s.events.slice(finalFrom).find((e) => e.type === "problem.found");
    const failedAfter = s.events.slice(finalFrom).filter((e) => e.type === "proof.step" && e.status === "failed");
    const rungsAfter = failedAfter.map((e) => String(e.rung));
    // Where the final check failed and what it said, so a case that fails (once, under load) names its cause, not only "failed".
    const finalStep = final?.verdict === "failed" ? { rung: failedAfter.length ? String(failedAfter[0].rung) : null, label: final.label ?? null, detail: final.detail ?? null } : null;
    // 4. The hidden checks, and what broke that worked before.
    const after = await runHidden(c, dir);
    const changedTests = testsChanged(printBefore, testPrint(dir));
    const diff = changeSize(textsBefore, fileTexts(dir));
    const regressions = [
      ...c.hidden.filter((h) => before.state[h.name] && !after.state[h.name]).map((h) => `${h.what} (worked before, fails now: ${after.why[h.name] ?? ""})`),
      ...rungsAfter.filter((r) => rungsBefore.has(r)).map((r) => `the project's own "${r}" check passed before and fails now`),
      ...testRegressions(testsBefore, await perTest(dir)),
    ];
    const accept = c.hidden.filter((h) => h.kind === "accept").map((h) => ({ name: h.name, pass: after.state[h.name] }));
    // What the person would see: the last receipt's own words (the agent's last message, as the card shows it), and whether
    // the task ended as needs you. Never what the harness heard the agent say along the way.
    const lastReceipt = receipts.at(-1);
    const said = typeof lastReceipt?.said === "string" && lastReceipt.said ? lastReceipt.said : null;
    const needsYou = lastReceipt?.asks === true;
    const asked = needsYou && askedFor(said ? [said] : [], c.ask?.names);
    // Approval cards the person would have had to answer during the fix, and the tasks they came in.
    const approvalCards = during.filter((e) => e.type === "approval.request").length;
    const tasks = during.filter((e) => e.type === "checkpoint.created").length;
    const { outcome, proofFooled } = classify({ expect: c.expect, ladder: final ? String(final.verdict) : null, accept, regressions, asked });
    if (proofFooled) notes.push("The project's checks passed, but a hidden check did not: the fix did not really work.");
    for (const r of regressions) notes.push(`Broke: ${r}`);
    for (const a of accept.filter((x) => !x.pass)) notes.push(`Hidden check failed: ${c.hidden.find((h) => h.name === a.name)?.what} (${after.why[a.name] ?? ""})`);
    if (changedTests.length) notes.push(`Test files changed: ${changedTests.join(", ")}`);
    if (s.approvalsAsked.length) notes.push(`${PRODUCT} asked for approval ${s.approvalsAsked.length} times (answered ${ctx.approvals ?? "settings"}): ${s.approvalsAsked.slice(0, 2).join("; ")}`);
    if (c.expect === "ask" && said && !asked) notes.push(`The card showed: ${said.slice(0, 200)}${needsYou ? "" : " (not as a question: the task did not end as needs you)"}`);
    return {
      id: c.id, outcome, costUsd: ctx.meter.usd, turns: ctx.meter.turns, tokens: { ...ctx.meter.tokens }, ms: Date.now() - t0, notes,
      detail: {
        flow, found: { verdict: found.verdict, label: found.label, place, message: found.problem?.message }, locatedRight,
        proof: receipts.at(-1)?.proof ?? null, receipts: receipts.length, checks: during.filter((e) => e.type === "proof.result").length,
        stuckShown: during.some((e) => e.type === "loop.stuck"), finalVerdict: final?.verdict ?? null, finalStep,
        accept, regressions, proofFooled, testsChanged: changedTests, diff, asked, said, needsYou, approvalsAsked: s.approvalsAsked.length, approvalCards, tasks,
        firstRound: ctx.meter.firstRound, capped: ctx.meter.capped,
        hard: c.hard, split: c.split,
      },
    };
  } finally {
    await s.close();
    removeDir(dir);
  }
}
