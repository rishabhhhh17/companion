// The proof ladder. After a task changed files, check the work instead of believing it:
// install, build and checks, tests (and that they were not weakened), start the project, open it in a
// hidden browser. Stops at the first rung that fails and says why in plain words.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { CheckpointStore } from "../checkpoints.ts";
import { browserCheck, type BrowserOptions, type BrowserResult } from "./browser.ts";
import { detectProject, type Detected } from "./detect.ts";
import { buttonProblem, locateProblem, type Problem } from "./locate.ts";
import { runCommand, type RunResult } from "./exec.ts";
import { startServer } from "./server.ts";
import type { Review } from "./review.ts";
import { analyzeScripts, analyzeTests, isTestFile } from "./testguard.ts";

export type Rung = "install" | "checks" | "tests" | "start" | "browser" | "review";
export type StepUpdate = { rung: Rung; label: string; status: "running" | "passed" | "failed" | "skipped"; detail: string; ms: number };
// A failed step may carry the place it failed: a line in the project, a button, or at least the error sentence.
export type Step = StepUpdate & { status: "passed" | "failed" | "skipped"; problem?: Problem };
export type Verdict = "passed" | "passed_with_gaps" | "failed" | "nothing_to_check" | "cancelled";
export type LadderResult = { verdict: Verdict; steps: Step[]; failedAt?: Step; serverUrl?: string; shot?: import("./browser.ts").PageShot };
export type Limits = { installMs: number; checkMs: number; testMs: number; startMs: number; browserMs: number };
export const DEFAULT_LIMITS: Limits = { installMs: 5 * 60_000, checkMs: 5 * 60_000, testMs: 5 * 60_000, startMs: 60_000, browserMs: 30_000 };

export type LadderOptions = {
  project: string; store: CheckpointStore; beforeId: string; afterId: string;
  onStep?: (u: StepUpdate) => void; signal?: AbortSignal; limits?: Partial<Limits>;
  run?: (command: string, o: { cwd: string; timeoutMs: number }) => Promise<RunResult>;
  browser?: (url: string, o: BrowserOptions) => Promise<BrowserResult>;
  // Rung 7: a second model reads the change. Returns null when the review could not be done.
  review?: () => Promise<Review | null>;
  // Point at the problem must not change anything: when packages are missing it says so instead of installing them.
  noInstall?: boolean;
};

const LABELS: Record<Rung, string> = {
  install: "Installing what the project needs", checks: "Building and checking the code", tests: "Running the tests",
  start: "Starting the project", browser: "Opening it in a browser", review: "A second model reviewed the change",
};
const LOCKS = ["bun.lock", "bun.lockb", "pnpm-lock.yaml", "yarn.lock", "package-lock.json"];

function deps(pkgText: string | undefined): string {
  try { const p = JSON.parse(pkgText ?? "{}"); return JSON.stringify([p.dependencies ?? {}, p.devDependencies ?? {}]); } catch { return ""; }
}

// Install only when the ingredients changed, or they are needed and not there yet.
export function needsInstall(before: Record<string, string>, after: Record<string, string>, lockfile: string | null, hasNodeModules: boolean): boolean {
  if (!("package.json" in after)) return false;
  if (lockfile && before[lockfile] !== after[lockfile]) return true;
  if (deps(before["package.json"]) !== deps(after["package.json"])) return true;
  const wantsDeps = deps(after["package.json"]) !== JSON.stringify([{}, {}]);
  return wantsDeps && !hasNodeModules;
}

const gist = (r: RunResult, limitMs: number) =>
  r.timedOut ? `It took too long (over ${Math.round(limitMs / 1000)} seconds) and was stopped.` : (r.stderr + "\n" + r.stdout).trim().split("\n").slice(-14).join("\n").slice(-900) || `It stopped with exit code ${r.code}.`;

function proofHints(dir: string): BrowserOptions {
  try { const j = JSON.parse(readFileSync(join(dir, ".claude", "proof.json"), "utf8")); return { expectText: Array.isArray(j.expectText) ? j.expectText.map(String) : undefined, click: typeof j.click === "string" ? j.click : undefined, expectAfterClick: typeof j.expectAfterClick === "string" ? j.expectAfterClick : undefined }; }
  catch { return {}; }
}

export async function runLadder(o: LadderOptions): Promise<LadderResult> {
  const r = await runRungs(o);
  if (!o.review || (r.verdict !== "passed" && r.verdict !== "passed_with_gaps")) return r;
  if (o.signal?.aborted) return { ...r, verdict: "cancelled" };
  // --- 7. a second model reads the change
  const t0 = Date.now();
  o.onStep?.({ rung: "review", label: LABELS.review, status: "running", detail: "", ms: 0 });
  let review: Review | null = null;
  try { review = await o.review(); } catch { review = null; }
  const done = (status: Step["status"], detail: string): Step => { const s: Step = { rung: "review", label: LABELS.review, status, detail, ms: Date.now() - t0 }; o.onStep?.(s); return s; };
  if (!review) return { ...r, verdict: "passed_with_gaps", steps: [...r.steps, done("skipped", "The second review could not be completed, so this change was not double checked.")] };
  if (review.verdict === "approve") return { ...r, steps: [...r.steps, done("passed", "The second model found no problems.")] };
  const failed = done("failed", `The second model raised: ${review.concerns.slice(0, 3).join(" ")}`);
  return { verdict: "failed", steps: [...r.steps, failed], failedAt: failed, ...(r.serverUrl ? { serverUrl: r.serverUrl } : {}) };
}

async function runRungs(o: LadderOptions): Promise<LadderResult> {
  const limits = { ...DEFAULT_LIMITS, ...(o.limits ?? {}) };
  const run = o.run ?? runCommand;
  const browser = o.browser ?? browserCheck;
  const steps: Step[] = [];
  const det: Detected = detectProject(o.project);
  const cancelled = () => o.signal?.aborted === true;

  const emit = (rung: Rung, status: StepUpdate["status"], detail = "", ms = 0) => o.onStep?.({ rung, label: LABELS[rung], status, detail, ms });
  const finish = (rung: Rung, status: Step["status"], detail: string, t0: number, problem?: Problem | null): Step => {
    const s: Step = { rung, label: LABELS[rung], status, detail, ms: Date.now() - t0, ...(problem ? { problem } : {}) };
    steps.push(s); emit(rung, status, detail, s.ms);
    return s;
  };
  const result = (verdict: Verdict, failedAt?: Step, serverUrl?: string): LadderResult => ({ verdict, steps, ...(failedAt ? { failedAt } : {}), ...(serverUrl ? { serverUrl } : {}) });

  // --- 1. install
  if (cancelled()) return result("cancelled");
  let t0 = Date.now(); emit("install", "running");
  const isPackageFile = (p: string) => p === "package.json" || LOCKS.includes(p);
  const [bf, af] = [await o.store.readFiles(o.beforeId, isPackageFile), await o.store.readFiles(o.afterId, isPackageFile)];
  if (det.packageManager && needsInstall(bf, af, det.lockfile, existsSync(join(o.project, "node_modules")))) {
    if (o.noInstall) {
      const why = `This project's packages are not installed, so it cannot be checked yet. Run ${det.packageManager} install in the project folder, or press Fix it with me.`;
      return result("failed", finish("install", "failed", why, t0, { kind: "message", message: why, from: "install" }));
    }
    const r = await run(`${det.packageManager} install`, { cwd: o.project, timeoutMs: limits.installMs, signal: o.signal, env: { CI: "1" } });
    if (r.code !== 0 || r.timedOut) return result("failed", finish("install", "failed", gist(r, limits.installMs), t0, locateProblem(r.stdout + "\n" + r.stderr, o.project, "install")));
    finish("install", "passed", "Installed.", t0);
  } else finish("install", "skipped", "Nothing new to install.", t0);

  // --- 2. build and checks
  if (cancelled()) return result("cancelled");
  t0 = Date.now(); emit("checks", "running");
  // A task that "fixes" a failing check by making it check nothing has not fixed anything.
  const weakened = analyzeScripts(bf["package.json"], af["package.json"]);
  if (!weakened.ok) return result("failed", finish("checks", "failed", weakened.problems.join(". ") + ". Please fix the real problem instead of weakening the check.", t0));
  if (det.checks.length) {
    for (const c of det.checks) {
      const r = await run(c.command, { cwd: o.project, timeoutMs: limits.checkMs, signal: o.signal });
      if (r.code !== 0 || r.timedOut) return result("failed", finish("checks", "failed", `${c.name} failed. ${gist(r, limits.checkMs)}`, t0, locateProblem(r.stdout + "\n" + r.stderr, o.project, "checks")));
    }
    finish("checks", "passed", `${det.checks.map((c) => c.name).join(", ")} passed.`, t0);
  } else finish("checks", "skipped", "This project has no build or lint steps to run.", t0);

  // --- 3. tests, and were they weakened?
  if (cancelled()) return result("cancelled");
  t0 = Date.now(); emit("tests", "running");
  const [bt, at] = [await o.store.readFiles(o.beforeId, isTestFile), await o.store.readFiles(o.afterId, isTestFile)];
  const guard = analyzeTests(bt, at);
  if (!guard.ok) return result("failed", finish("tests", "failed", guard.problems.join(". ") + ".", t0));
  if (det.tests) {
    const r = await run(det.tests.command, { cwd: o.project, timeoutMs: limits.testMs, signal: o.signal, env: { CI: "1" } });
    if (r.code !== 0 || r.timedOut) return result("failed", finish("tests", "failed", `The tests did not pass. ${gist(r, limits.testMs)}`, t0, locateProblem(r.stdout + "\n" + r.stderr, o.project, "tests")));
    finish("tests", "passed", `The tests passed${guard.after ? ` (${guard.after} found)` : ""}.`, t0);
  } else finish("tests", "skipped", "This project has no tests to run.", t0);

  // --- 4 and 5. start it, open it
  if (cancelled()) return result("cancelled");
  if (!det.start) {
    finish("start", "skipped", "There is nothing to open in a browser.", Date.now());
    finish("browser", "skipped", "There is nothing to open in a browser.", Date.now());
    const checked = steps.some((s) => s.status === "passed");
    return result(checked ? "passed" : "nothing_to_check");
  }
  t0 = Date.now(); emit("start", "running");
  let scriptText = "";
  try { const m = /(?:npm|pnpm|yarn|bun) run (\S+)/.exec(det.start.kind === "server" ? det.start.command : ""); if (m) scriptText = JSON.parse(readFileSync(join(o.project, "package.json"), "utf8")).scripts?.[m[1]] ?? ""; } catch { /* no script text */ }
  const srv = await startServer(det.start, { cwd: o.project, timeoutMs: limits.startMs, scriptText, signal: o.signal });
  if (!srv.ok && srv.aborted) return result("cancelled");
  if (!srv.ok && srv.notAServer) {
    finish("start", "skipped", "This project's start command is a tool, not a website, so there is no page to open.", t0);
    finish("browser", "skipped", "There is no page to open.", Date.now());
    return result(steps.some((s) => s.status === "passed") ? "passed" : "nothing_to_check");
  }
  if (!srv.ok) return result("failed", finish("start", "failed", srv.reason, t0, srv.output ? locateProblem(srv.output, o.project, "start") : null));
  finish("start", "passed", "It started.", t0);
  try {
    if (cancelled()) return result("cancelled", undefined, srv.url);
    t0 = Date.now(); emit("browser", "running");
    const b = await browser(srv.url, { ...proofHints(o.project), timeoutMs: limits.browserMs, shot: true });
    if (b.skipped) { finish("browser", "skipped", b.skipped, t0); return result("passed_with_gaps", undefined, srv.url); }
    if (!b.ok) return result("failed", finish("browser", "failed", b.problems.slice(0, 3).join(". ") + ".", t0, buttonProblem(b.problems) ?? locateProblem(b.problems.join("\n"), o.project, "browser")), srv.url);
    finish("browser", "passed", "The page opened with no errors.", t0);
    return { ...result("passed", undefined, srv.url), ...(b.shot ? { shot: b.shot } : {}) };
  } finally { await srv.stop(); }
}
