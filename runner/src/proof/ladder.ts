// The proof ladder. After a task changed files, check the work instead of believing it:
// install, build and checks, tests (and that they were not weakened), start the project, open it in a
// hidden browser. Stops at the first rung that fails and says why in plain words.
import { redact } from "../redact.ts";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { CheckpointStore } from "../checkpoints.ts";
import { browserCheck, type BrowserOptions, type BrowserResult } from "./browser.ts";
import { detectProject, type Detected } from "./detect.ts";
import { buttonProblem, locateProblem, type Problem } from "./locate.ts";
import { runCommand, type RunResult } from "./exec.ts";
import { startServer } from "./server.ts";
import { databaseFiles, missingModule, missingWords, removeNewEmptyDatabases } from "./python.ts";
import type { Review } from "./review.ts";
import { analyzeScripts, analyzeTests, isTestFile } from "./testguard.ts";

export type Rung = "install" | "checks" | "tests" | "start" | "browser" | "review";
// needs: "browser" when the browser rung was skipped only because the hidden browser is not installed (the page offers it).
export type StepUpdate = { rung: Rung; label: string; status: "running" | "passed" | "failed" | "skipped"; detail: string; ms: number; needs?: "browser" };
// A failed step may carry the place it failed: a line in the project, a button, or at least the error sentence.
export type Step = StepUpdate & { status: "passed" | "failed" | "skipped"; problem?: Problem };
export type Verdict = "passed" | "passed_with_gaps" | "failed" | "nothing_to_check" | "cancelled";
// gaps: for a Python project, the plain words for each check that could not run because something is not installed (the
// project's own packages first, then a lone tool), each with the command the person can run.
// unclear: the steps that are there but could not say anything this time: a check that could not run because something is
// not installed, pytest finding no tests, a page that was never opened. Which task broke it never reads one as a pass. A
// step that is not there at all (no tests yet) is not in it.
export type LadderResult = { verdict: Verdict; steps: Step[]; failedAt?: Step; serverUrl?: string; shot?: import("./browser.ts").PageShot; gaps?: string[]; unclear?: Rung[] };
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
  // How the project is read (tests give a fixed one); detectProject by default.
  detect?: (dir: string) => Detected;
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

/** Only a check of the work counts as proof. Packages installing without a problem proves nothing about the project. */
export const EVIDENCE_RUNGS = new Set<Rung>(["checks", "tests", "start", "browser", "review"]);
export const hasEvidence = (steps: { rung: Rung; status: string }[]) => steps.some((s) => s.status === "passed" && EVIDENCE_RUNGS.has(s.rung));

// A line of a stack that points inside the runtime itself (node:internal/..., Bun's native code, older Node's internal/...).
// It never names the person's code, and how many such lines a stack has depends on how busy the Mac was: when timers run
// late, Node runs their callbacks from runNextTicks and processTimers, two more lines. Left in, they pushed the last lines
// of a failing test a few lines further down, so the same failure read differently and the fix loop breaker missed it.
const RUNTIME_FRAME = /^\s*(?:at\s+)?(?:async\s+)?(?:[^\s()]+(?:\s\[as [^\]]+\])?\s+)?\(?(?:node:|native:|internal\/)[^()\s]*\)?\s*$/;
export const withoutRuntimeFrames = (text: string) => text.split("\n").filter((l) => !RUNTIME_FRAME.test(l)).join("\n");
const gist = (r: RunResult, limitMs: number) =>
  r.timedOut ? `It took too long (over ${Math.round(limitMs / 1000)} seconds) and was stopped.` : withoutRuntimeFrames(r.stderr + "\n" + r.stdout).trim().split("\n").slice(-14).join("\n").slice(-900) || `It stopped with exit code ${r.code}.`;

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
  const done = (status: Step["status"], detail: string): Step => { const s: Step = { rung: "review", label: LABELS.review, status, detail: redact(detail), ms: Date.now() - t0 }; o.onStep?.(s); return s; };
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
  const det: Detected = (o.detect ?? detectProject)(o.project);
  const cancelled = () => o.signal?.aborted === true;
  // Python: commands never write bytecode or caches into the project. A gap is a check that exists but could not run
  // because a package is not installed: never a failure blamed on the code, never a pass either.
  const py = det.python;
  const pyEnv: Record<string, string> = py ? { PYTHONDONTWRITEBYTECODE: "1", PY_COLORS: "0", PYTHONUNBUFFERED: "1" } : {};
  const gaps: string[] = [];
  let packageGaps = 0;
  const gap = (output: string, tool: string | undefined, what: string): string | null => {
    const miss = py ? missingModule(output, tool, py.declared) : null;
    if (!miss || !py) return null;
    const words = missingWords(miss, py, what);
    if (!gaps.includes(words)) { if (miss.tool) gaps.push(words); else gaps.splice(packageGaps++, 0, words); }
    return words;
  };

  const emit = (rung: Rung, status: StepUpdate["status"], detail = "", ms = 0, needs?: "browser") => o.onStep?.({ rung, label: LABELS[rung], status, detail: redact(detail), ms, ...(needs ? { needs } : {}) });
  const finish = (rung: Rung, status: Step["status"], detail: string, t0: number, problem?: Problem | null, needs?: "browser"): Step => {
    const s: Step = { rung, label: LABELS[rung], status, detail: redact(detail), ms: Date.now() - t0, ...(problem ? { problem } : {}), ...(needs ? { needs } : {}) };
    steps.push(s); emit(rung, status, detail, s.ms, needs);
    return s;
  };
  const unclear: Rung[] = [];
  const cannotTell = (...rungs: Rung[]) => { for (const r of rungs) if (!unclear.includes(r)) unclear.push(r); };
  const result = (verdict: Verdict, failedAt?: Step, serverUrl?: string): LadderResult => ({ verdict: verdict === "passed" && gaps.length ? "passed_with_gaps" : verdict, steps, ...(failedAt ? { failedAt } : {}), ...(serverUrl ? { serverUrl } : {}), ...(gaps.length ? { gaps: [...gaps] } : {}), ...(unclear.length ? { unclear: [...unclear] } : {}) });
  // Point at the problem changes nothing, so it cannot install what is missing. When that is why nothing could be
  // checked, that is what it found (as for a Node project whose packages are missing), said with the command to run. No
  // place goes with it: these are Companion's own words, not something on the screen to circle.
  const unchecked = (): LadderResult => {
    if (!o.noInstall || !py || !gaps.length) return result("nothing_to_check");
    const s: Step = { rung: "install", label: LABELS.install, status: "failed", detail: redact(gaps[0]), ms: 0 };
    const at = steps.findIndex((x) => x.rung === "install");
    if (at >= 0) steps[at] = s; else steps.push(s);
    emit("install", "failed", gaps[0]);
    return result("failed", s);
  };

  // --- 1. install
  if (cancelled()) return result("cancelled");
  let t0 = Date.now(); emit("install", "running");
  const isPackageFile = (p: string) => p === "package.json" || LOCKS.includes(p);
  const [bf, af] = [await o.store.readFiles(o.beforeId, isPackageFile), await o.store.readFiles(o.afterId, isPackageFile)];
  // Python packages are never installed by Companion; the note says what it uses. With no Python to use (none on this
  // Mac, or a virtual environment whose Python is gone), nothing can be checked, and Point at the problem says so.
  if (py && !py.command && o.noInstall) return result("failed", finish("install", "failed", py.note, t0));
  if (py) finish("install", "skipped", py.note, t0);
  else if (det.packageManager && needsInstall(bf, af, det.lockfile, existsSync(join(o.project, "node_modules")))) {
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
    const ran: string[] = [], missed: string[] = [];
    for (const c of det.checks) {
      const r = await run(c.command, { cwd: o.project, timeoutMs: limits.checkMs, signal: o.signal, ...(py ? { env: pyEnv } : {}) });
      if (r.code !== 0 || r.timedOut) {
        const why = r.timedOut ? null : gap(r.stdout + "\n" + r.stderr, c.tool, c.name === "typecheck" ? "the type check" : `the ${c.name} check`);
        if (why) { missed.push(why); continue; }
        return result("failed", finish("checks", "failed", `${c.name} failed. ${gist(r, limits.checkMs)}`, t0, locateProblem(r.stdout + "\n" + r.stderr, o.project, "checks")));
      }
      ran.push(c.name);
    }
    if (missed.length) cannotTell("checks");
    if (ran.length) finish("checks", "passed", `${ran.join(", ")} passed.${missed.length ? ` ${missed.join(" ")}` : ""}`, t0);
    else finish("checks", "skipped", missed.join(" "), t0);
  } else finish("checks", "skipped", "This project has no build or lint steps to run.", t0);

  // --- 3. tests, and were they weakened?
  if (cancelled()) return result("cancelled");
  t0 = Date.now(); emit("tests", "running");
  const [bt, at] = [await o.store.readFiles(o.beforeId, isTestFile), await o.store.readFiles(o.afterId, isTestFile)];
  const guard = analyzeTests(bt, at);
  if (!guard.ok) return result("failed", finish("tests", "failed", guard.problems.join(". ") + ".", t0));
  if (det.tests) {
    const r = await run(det.tests.command, { cwd: o.project, timeoutMs: limits.testMs, signal: o.signal, env: { CI: "1", ...pyEnv } });
    const why = r.code !== 0 && !r.timedOut ? gap(r.stdout + "\n" + r.stderr, det.tests.tool, "the tests") : null;
    // pytest's exit code 5 means it collected no tests: nothing was checked, and nothing failed.
    if (det.tests.tool === "pytest" && r.code === 5 && !r.timedOut) { cannotTell("tests"); finish("tests", "skipped", "pytest found no tests to run.", t0); }
    else if (why) { cannotTell("tests"); finish("tests", "skipped", why, t0); }
    else if (r.code !== 0 || r.timedOut) return result("failed", finish("tests", "failed", `The tests did not pass. ${gist(r, limits.testMs)}`, t0, locateProblem(r.stdout + "\n" + r.stderr, o.project, "tests")));
    else finish("tests", "passed", `The tests passed${guard.after ? ` (${guard.after} found)` : ""}.`, t0);
  } else finish("tests", "skipped", "This project has no tests to run.", t0);

  // --- 4 and 5. start it, open it
  if (cancelled()) return result("cancelled");
  if (!det.start) {
    finish("start", "skipped", "There is nothing to open in a browser.", Date.now());
    finish("browser", "skipped", "There is nothing to open in a browser.", Date.now());
    return hasEvidence(steps) ? result("passed") : unchecked();
  }
  t0 = Date.now(); emit("start", "running");
  let scriptText = "";
  try { const m = /(?:npm|pnpm|yarn|bun) run (\S+)/.exec(det.start.kind === "server" ? det.start.command : ""); if (m) scriptText = JSON.parse(readFileSync(join(o.project, "package.json"), "utf8")).scripts?.[m[1]] ?? ""; } catch { /* no script text */ }
  // A Python dev server may make an empty SQLite file on its way up (Django's runserver does): it is taken away again
  // once the server has stopped, however the rung ends.
  const dbBefore = py ? databaseFiles(o.project) : null;
  const srv = await startServer(det.start, { cwd: o.project, timeoutMs: limits.startMs, scriptText, signal: o.signal });
  try {
    if (!srv.ok && srv.aborted) return result("cancelled");
    if (!srv.ok && srv.notAServer) {
      finish("start", "skipped", "This project's start command is a tool, not a website, so there is no page to open.", t0);
      finish("browser", "skipped", "There is no page to open.", Date.now());
      return hasEvidence(steps) ? result("passed") : unchecked();
    }
    const startGap = !srv.ok && det.start.kind === "server" && det.start.python ? gap(srv.output ?? srv.reason, det.start.python === "uvicorn" ? "uvicorn" : det.start.python, "the server") : null;
    if (startGap) {
      cannotTell("start", "browser");
      finish("start", "skipped", startGap, t0);
      finish("browser", "skipped", "There is no page to open.", Date.now());
      return hasEvidence(steps) ? result("passed") : unchecked();
    }
    if (!srv.ok) return result("failed", finish("start", "failed", srv.reason, t0, srv.output ? locateProblem(srv.output, o.project, "start") : null));
    finish("start", "passed", "It started.", t0);
    if (cancelled()) return result("cancelled", undefined, srv.url);
    t0 = Date.now(); emit("browser", "running");
    const b = await browser(srv.url, { ...proofHints(o.project), timeoutMs: limits.browserMs, shot: true });
    if (b.skipped) { cannotTell("browser"); finish("browser", "skipped", b.skipped, t0, null, b.notInstalled ? "browser" : undefined); return result("passed_with_gaps", undefined, srv.url); }
    if (!b.ok) return result("failed", finish("browser", "failed", b.problems.slice(0, 3).join(". ") + ".", t0, buttonProblem(b.problems) ?? locateProblem(b.problems.join("\n"), o.project, "browser")), srv.url);
    finish("browser", "passed", "The page opened with no errors.", t0);
    return { ...result("passed", undefined, srv.url), ...(b.shot ? { shot: b.shot } : {}) };
  } finally {
    if (srv.ok) await srv.stop();
    if (dbBefore) removeNewEmptyDatabases(o.project, dbBefore);
  }
}
