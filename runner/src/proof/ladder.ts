// The proof ladder. After a task changed files, check the work instead of believing it:
// install, build and checks, tests (and that they were not weakened), start the project, open it in a
// hidden browser. Stops at the first rung that fails and says why in plain words.
import { redact } from "../redact.ts";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { CheckpointStore } from "../checkpoints.ts";
import { browserCheck, type BrowserOptions, type BrowserResult } from "./browser.ts";
import { changesData, detectProject, withStartScript, type Detected } from "./detect.ts";
import { installMode, SKIPPABLE, VIEWPORTS, type CheckSettings, type SkipName } from "./options.ts";
import { loadRules } from "../rules.ts";
import { buttonProblem, locateProblem, type Problem } from "./locate.ts";
import { runCommand, type RunOptions, type RunResult } from "./exec.ts";
import { boxRefusal, boxWorks, type Net } from "./box.ts";
import { startServer } from "./server.ts";
import { databaseFiles, missingModule, missingWords, removeNewEmptyDatabases } from "./python.ts";
import { DOWNLOAD_ASK, needsDownload, nativeGap, ranNoTests, serverEnv, serverHeldBack, serverOffline, swiftInBox, withoutNoise, WRAPPER_NOT_CACHED, type NetWhy } from "./native.ts";
import type { Review } from "./review.ts";
import { analyzeScripts, analyzeTests, isTestFile } from "./testguard.ts";
import { readRunFiles, runPrint, withInstallConfig, type RunApprovals } from "./approvedruns.ts";
import { liveInstallConfig } from "./livefiles.ts";
import { PRODUCT } from "../names.ts";

export type Rung = "install" | "checks" | "tests" | "start" | "browser" | "review";
// needs: "browser" when the browser rung was skipped only because the hidden browser is not installed (the page offers it).
// summary: for a failed step, one plain sentence for the person; the detail (the check's own output) goes behind Details.
// forModel: when the model must be told something else than the person (a weakened check), what it is told instead of the
// detail. Neither is ever shown raw.
export type StepUpdate = { rung: Rung; label: string; status: "running" | "passed" | "failed" | "skipped"; detail: string; ms: number; needs?: "browser"; summary?: string; problem?: Problem };
// A failed step may carry the place it failed: a line in the project, a button, or at least the error sentence.
export type Step = StepUpdate & { status: "passed" | "failed" | "skipped"; problem?: Problem; forModel?: string };

/** What the person reads when a change made a check check less (the model is told why, in its own words). */
export const WEAKENED_SUMMARY = "The change weakened a check, so it was not accepted.";
const CHECK_WORDS: Record<string, string> = { typecheck: "The type check", lint: "The lint check", build: "The build", test: "The tests" };
/** The plain summary of a failed build, lint or type check. */
export const checkFailedSummary = (name: string): string => `${CHECK_WORDS[name] ?? `The ${name} check`} did not pass.`;
export const TESTS_FAILED_SUMMARY = "The tests did not pass.";
export const INSTALL_FAILED_SUMMARY = "Installing the project's packages did not work.";
export const START_FAILED_SUMMARY = "Your app did not start, so it could not be opened and checked.";
export type Verdict = "passed" | "passed_with_gaps" | "failed" | "nothing_to_check" | "cancelled";
// gaps: for a Python project, the plain words for each check that could not run because something is not installed (the
// project's own packages first, then a lone tool), each with the command the person can run.
// unclear: the steps that are there but could not say anything this time (pytest finding no tests, a page that was never
// opened), each with missing: true when the reason is a package that is not installed. Which task broke it never reads one
// as a pass. A step that is not there at all (no tests yet) is not in it.
// checks: each check of the checks step that was tried this time (a lint, a type check, a build: Check.name), in order, and
// how it ended; "missing" is one that could not run because a package it needs is not installed, "not_started" one this
// Mac had no room to start (noRoom). The step is several checks, so which task broke it reads the one that fails now on
// its own. A check after the one that failed is not tried.
// noRoom: the step that failed is one this Mac could not start, again and again, because too many programs were running
// (NO_ROOM). It says nothing about the project.
export type Unclear = { rung: Rung; missing: boolean };
export type CheckOutcome = { name: string; status: "passed" | "failed" | "missing" | "not_started" };
export type LadderResult = { verdict: Verdict; steps: Step[]; failedAt?: Step; serverUrl?: string; shot?: import("./browser.ts").PageShot; gaps?: string[]; unclear?: Unclear[]; checks?: CheckOutcome[]; noRoom?: true };
export type Limits = { installMs: number; checkMs: number; testMs: number; startMs: number; browserMs: number };
export const DEFAULT_LIMITS: Limits = { installMs: 5 * 60_000, checkMs: 5 * 60_000, testMs: 5 * 60_000, startMs: 60_000, browserMs: 30_000 };
/** Time allowed for checks (check.time): today's limits times a factor (1, 2 or 4), for every rung. */
export const scaleLimits = (factor: number): Limits => ({ installMs: DEFAULT_LIMITS.installMs * factor, checkMs: DEFAULT_LIMITS.checkMs * factor, testMs: DEFAULT_LIMITS.testMs * factor, startMs: DEFAULT_LIMITS.startMs * factor, browserMs: DEFAULT_LIMITS.browserMs * factor });

export type LadderOptions = {
  project: string; store: Pick<CheckpointStore, "readFiles">; beforeId: string; afterId: string;
  onStep?: (u: StepUpdate) => void; signal?: AbortSignal; limits?: Partial<Limits>;
  run?: (command: string, o: RunOptions) => Promise<RunResult>;
  browser?: (url: string, o: BrowserOptions) => Promise<BrowserResult>;
  // How the project is started for the browser check (tests give a stand in); startServer by default.
  server?: typeof startServer;
  // Rung 7: a second model reads the change. Returns null when the review could not be done.
  review?: () => Promise<Review | null>;
  // Point at the problem must not change anything: when packages are missing it says so instead of installing them.
  noInstall?: boolean;
  // A watch (F21) runs the build and the tests only. It never starts the project's server or opens a browser: nobody is
  // there to watch it, and a server left behind by a crash would keep running.
  noServer?: boolean;
  // How the project is read (tests give a fixed one); detectProject by default.
  detect?: (dir: string) => Detected;
  // How long to wait before each new try of a command this Mac had no room to start (NO_ROOM_WAITS_MS by default).
  noRoomWaitsMs?: number[];
  // What the person chose in Settings for checking this project (options.ts). Missing ones are their usual values, which
  // are exactly how the ladder ran before.
  check?: Partial<CheckSettings>;
  // The install question (check.install "ask", or the house rule): true only for a yes. No answer, a Stop or no way to
  // ask is a no, and the check then runs on the project as it is, with a gap.
  askInstall?: (command: string) => Promise<boolean>;
  // The question for a check whose scripts, packages, lock file, .replit or .claude/launch.json differ from what the person
  // last said yes to running (approvals), or, without a record, that the task changed: they are run only on a yes. byTask:
  // this task made the change (else it came since the last yes, by a task that got a no or by hand). unboxed: the safety
  // box for checks cannot be used on this Mac, so this check asks whatever changed, and a yes runs it outside the box.
  // True only for a yes.
  askScripts?: (byTask: boolean, unboxed?: boolean) => Promise<boolean>;
  // What the person said yes to running in this project (approvedruns.ts), kept across checks. Every flow gives it, so a
  // no holds for the next ship check and Point at the problem too: with no way to ask, nothing that differs from it runs.
  // An empty record starts with the project as it was before this check (a task fills it as it starts, from the project
  // before the agent wrote anything, so this is only a project no agent has written to). Without it, only a change made
  // by the task asks.
  approvals?: RunApprovals;
  // Whether the project's commands run in the safety box for checks (box.ts): by default, whether it works on this Mac for
  // this project. Where it does not, nothing runs without a yes in this check, and with no way to ask nothing runs.
  box?: boolean;
};

const LABELS: Record<Rung, string> = {
  install: "Installing what the project needs", checks: "Building and checking the code", tests: "Running the tests",
  start: "Starting the project", browser: "Opening it in a browser", review: "A second model reviewed the change",
};

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
// A very busy Mac can run out of room for more programs (every process slot in use). A command then fails before the
// project's code ever runs: npm says "spawn sh EAGAIN", the shell "fork: Resource temporarily unavailable", Node and Bun
// "spawn ... EAGAIN". That says nothing about the project, so the command is run again after a moment, twice; one that
// still cannot start is said in Companion's words, never as the project's check failing. A test that fails with EAGAIN in
// its own output (a socket read, say) names no spawn or fork, so it stays the project's own failure. Seen in the fix eval
// with the process limit set just above what was running: a right fix of the open notes table ended "lint failed. npm
// error code EAGAIN", the "failed" its row level security case once gave under heavy load.
const NO_PROCESS = /\b(?:posix_spawn|spawn|fork)\b[^\n]*\bEAGAIN\b|\bfork: (?:retry: )?Resource temporarily unavailable\b/;
export const couldNotStart = (r: RunResult) => r.code !== 0 && !r.timedOut && NO_PROCESS.test(`${r.stderr}\n${r.stdout}`);
export const NO_ROOM_WAITS_MS = [1000, 3000];
export const NO_ROOM = "This Mac could not start the check because too many programs are running. Close some programs, then try again.";
const pause = (ms: number, signal?: AbortSignal) => new Promise<void>((done) => {
  if (ms <= 0 || signal?.aborted) return done();
  const t = setTimeout(done, ms);
  signal?.addEventListener("abort", () => { clearTimeout(t); done(); }, { once: true });
});

// tidy: a Go, Rust, Java, Kotlin, Swift or Xcode tool's own noise (progress counters, the command line it prints after an
// error, Gradle's advice) is left out of the words.
const gist = (r: RunResult, limitMs: number, tidy: (s: string) => string = (s) => s) =>
  r.timedOut ? `It took too long (over ${Math.round(limitMs / 1000)} seconds) and was stopped.` : tidy(withoutRuntimeFrames(r.stderr + "\n" + r.stdout)).trim().split("\n").slice(-14).join("\n").slice(-900) || `It stopped with error code ${r.code} and printed nothing.`;

const SKIP_WORDS: Record<SkipName, string> = { typecheck: "The type check", lint: "The lint check", build: "The build", test: "The tests" };
const leftOut = (n: SkipName) => `${SKIP_WORDS[n]} ${n === "test" ? "were" : "was"} left out (turned off in Settings), so ${n === "test" ? "they were" : "it was"} not run.`;
const NOT_INSTALLED_NO = "The project's packages were not installed (you said no, or did not answer), so it was checked as it is.";
const NOT_INSTALLED_NEVER = "The project's packages are not installed, and Settings says never to install them for a check, so it was checked as it is.";
// A script the check would run that changes a database or puts something online (detect.ts changesData): never run.
const CHANGES_DATA_WORDS = { install: "The project's install steps", typecheck: "The type check script", lint: "The lint script", build: "The build script", test: "The test script", start: "The start script" } as const;
const changesDataGap = (what: keyof typeof CHANGES_DATA_WORDS) => `${CHANGES_DATA_WORDS[what]} also changes a database or puts something online, so ${PRODUCT} did not run it${what === "start" ? ", and the page was not checked" : what === "install" ? " and checked the project as it is" : ""}.`;
// The task changed what the project runs, and no yes came to running it.
const RUN_CHANGED_NO = "This task changed the project's scripts or packages, which run on this Mac, and you did not say yes to running them, so the install, build, tests and server were not run.";
const RUN_CHANGED_SHORT = "Not run: this task changed the project's scripts or packages, and running them needs your yes.";
// The scripts or packages changed since the person last said yes to running them, by a task that got a no or by hand.
const RUN_SINCE_NO = "The project's scripts or packages changed since you last said yes to running them. They run on this Mac, and you did not say yes this time, so the install, build, tests and server were not run.";
const RUN_SINCE_SHORT = "Not run: the project's scripts or packages changed since you last said yes to running them.";
// The same, in a check that has no way to ask (Point at the problem, Your turn, which task broke it).
const RUN_UNASKED = "The project's scripts or packages changed since you last said yes to running them, and they run on this Mac, so the install, build, tests and server were not run here. You are asked about them in the next task's check or in Put it online.";
// The safety box for checks cannot be used on this Mac: nothing of the project's runs without a yes in this check.
const RUN_UNBOXED_NO = "The safety box for checks is not working on this Mac, and you did not say yes to running the project's install, build, tests and server without it, so they were not run.";
const RUN_UNBOXED_SHORT = "Not run: the safety box for checks is not working on this Mac, and running them without it needs your yes.";
const RUN_UNBOXED_UNASKED = "The safety box for checks is not working on this Mac, so the project's install, build, tests and server were not run here. You are asked about them in the next task's check or in Put it online.";
// A step that could not run because the project's packages were not installed for this check.
// A step the safety box for checks itself stopped (box.ts boxRefusal): it could not run here, which says nothing about the
// code, so it is a gap and never sends the agent to fix anything.
const BOX_STOPPED = {
  write: (what: string) => `The safety box for checks stopped ${what} from writing to a temporary folder outside the project (/tmp), so ${what === "the tests" ? "they" : "it"} could not run here. That says nothing about your code.`,
  browser: (what: string) => `${what[0].toUpperCase()}${what.slice(1)} start${what === "the tests" ? "" : "s"} a browser with its own sandbox, which cannot run inside the safety box for checks, so ${what === "the tests" ? "they" : "it"} could not run here. That says nothing about your code.`,
  net: (what: string) => `${what[0].toUpperCase()}${what.slice(1)} need${what === "the tests" ? "" : "s"} the internet, which the safety box for checks does not give ${what === "the tests" ? "them" : "it"}, so ${what === "the tests" ? "they" : "it"} could not run here. That says nothing about your code.`,
} as const;
const WITHOUT_PACKAGES = {
  typecheck: "The type check could not run because the project's packages are not installed.",
  lint: "The lint check could not run because the project's packages are not installed.",
  build: "The build could not run because the project's packages are not installed.",
  test: "The tests could not run because the project's packages are not installed.",
  start: "The project could not start because its packages are not installed, so the page was not checked.",
} as const;

/** Output that says a command could not run because a tool or package it needs is not installed ("sh: vite: command not
 *  found", "Cannot find module 'react'", "Failed to resolve import "zod""). A missing file of the project's own (a path
 *  that starts with . or /, or an alias such as @/ or ~/) is the code's problem, so it is not one of these. */
export function needsPackages(output: string): boolean {
  if (/\bcommand not found\b|^(?:sh|bash|zsh|env)(?:: \d+)?: [^\n:]+: not found$|\bnot recognized as an internal or external command\b/m.test(output)) return true;
  const specs = [...output.matchAll(/Cannot find (?:module|package|type definition file for) ['"]([^'"\n]+)['"]|(?:Failed to resolve import|Could not resolve|Can't resolve) ['"]([^'"\n]+)['"]/g)].map((m) => m[1] ?? m[2]);
  return specs.some((x) => /[\\/]node_modules[\\/]/.test(x) || /^(?:@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*(?:\/[^\s]*)?$/i.test(x) && !/^(?:node|bun):/.test(x));
}

/** What the browser check looks for: the project's own .claude/proof.json when there is one (exactly as before), else the
 *  words and the button chosen in Settings. A button is pressed by its label, never by a selector, and the words after
 *  pressing need a button to press. */
function hintsFor(dir: string, c: Partial<CheckSettings> | undefined): BrowserOptions {
  if (existsSync(join(dir, ".claude", "proof.json"))) return proofHints(dir);
  const out: BrowserOptions = {};
  if (c?.mustSee?.length) out.expectText = [...c.mustSee];
  if (c?.press) { out.press = c.press; if (c.afterPress) out.expectAfterPress = c.afterPress; }
  return out;
}

function proofHints(dir: string): BrowserOptions {
  try { const j = JSON.parse(readFileSync(join(dir, ".claude", "proof.json"), "utf8")); return { expectText: Array.isArray(j.expectText) ? j.expectText.map(String) : undefined, click: typeof j.click === "string" ? j.click : undefined, expectAfterClick: typeof j.expectAfterClick === "string" ? j.expectAfterClick : undefined }; }
  catch { return {}; }
}

// A start command that finishes on its own is a tool, not a website, unless the project looks like one: it is started from
// .claude/launch.json, a dev script or a Python server, it has a page of its own (index.html), or it lists a web framework
// or server. Then it finishing means the page was not checked.
const FINISHED_SITE = "The start command finished without opening a page, so the page was not checked.";
const WEB_PACKAGE = /^(?:next|vite|react-scripts|react-dom|vue|nuxt|svelte|@sveltejs\/kit|astro|gatsby|@remix-run\/.+|@angular\/core|preact|solid-js|express|koa|fastify|hono|@hono\/.+|@nestjs\/core|elysia|polka|restify|@hapi\/hapi|webpack-dev-server|parcel|serve|http-server|live-server)$/;
function looksLikeSite(start: NonNullable<Detected["start"]>, dir: string): boolean {
  if (start.kind !== "server") return false;
  if (start.python || start.from === "launch" || start.from === "dev") return true;
  if (["index.html", "public/index.html", "src/index.html"].some((f) => existsSync(join(dir, f)))) return true;
  try { const p = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")); return Object.keys({ ...(p.dependencies ?? {}), ...(p.devDependencies ?? {}) }).some((d) => WEB_PACKAGE.test(d)); } catch { return false; }
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
  // Stop during the review: a stop, never a pass with a gap.
  if (o.signal?.aborted) return { ...r, verdict: "cancelled" };
  const done = (status: Step["status"], detail: string): Step => { const s: Step = { rung: "review", label: LABELS.review, status, detail: redact(detail), ms: Date.now() - t0 }; o.onStep?.(s); return s; };
  if (!review) return { ...r, verdict: "passed_with_gaps", steps: [...r.steps, done("skipped", "The second review could not be completed, so this change was not double checked.")] };
  if (review.verdict === "approve") return { ...r, steps: [...r.steps, done("passed", "The second model found no problems.")] };
  const failed = done("failed", `The second model raised: ${review.concerns.slice(0, 3).join(" ")}`);
  return { verdict: "failed", steps: [...r.steps, failed], failedAt: failed, ...(r.serverUrl ? { serverUrl: r.serverUrl } : {}) };
}

async function runRungs(o: LadderOptions): Promise<LadderResult> {
  const limits = { ...DEFAULT_LIMITS, ...(o.limits ?? {}) };
  const runOnce = o.run ?? runCommand;
  const run: typeof runOnce = async (command, ro) => {
    if (ro.box && nat?.ecosystem === "swift") command = swiftInBox(command);
    let r = await runOnce(command, ro);
    for (const ms of o.noRoomWaitsMs ?? NO_ROOM_WAITS_MS) {
      if (!couldNotStart(r) || o.signal?.aborted) break;
      await pause(ms, o.signal);
      if (o.signal?.aborted) break;
      r = await runOnce(command, ro);
    }
    return r;
  };
  const browser = o.browser ?? browserCheck;
  const steps: Step[] = [];
  // Gaps from Settings: a check left out, packages not installed, a button not pressed, a start script that is gone. After
  // the Python ones, so Point at the problem still says first what to install.
  const left: string[] = [];
  const skip = new Set((o.check?.skip ?? []).filter((x) => (SKIPPABLE as readonly string[]).includes(x)));
  const found = (o.detect ?? detectProject)(o.project);
  const started = withStartScript(found, o.project, o.check?.start);
  const det: Detected = started.det;
  if (started.gap) left.push(started.gap);
  const cancelled = () => o.signal?.aborted === true;
  // Python: commands never write bytecode or caches into the project. A gap is a check that exists but could not run
  // because a package is not installed: never a failure blamed on the code, never a pass either.
  const py = det.python;
  // Go, Rust, Java, Kotlin, Swift and Xcode: every command runs without any download first; the way that may download runs
  // only when the install setting allows it (mayDownload below). A missing tool or package is a gap, never the code's failure.
  const nat = det.native;
  if (nat) for (const g of nat.gaps) if (!left.includes(g)) left.push(g);
  const pyEnv: Record<string, string> = py ? { PYTHONDONTWRITEBYTECODE: "1", PY_COLORS: "0", PYTHONUNBUFFERED: "1" } : {};
  const gaps: string[] = [];
  let packageGaps = 0;
  // The project's packages were not installed for this check (Settings said never, or the install question got no yes): a
  // step that fails only because a tool or package it needs is not there could not run at all. That is a gap, never a
  // failure blamed on the code, so a task's fix loop is never started over it.
  let heldBack = false;
  const held = (output: string, step: keyof typeof WITHOUT_PACKAGES): string | null => {
    if (!heldBack || py || nat || !needsPackages(output)) return null;
    const words = WITHOUT_PACKAGES[step];
    if (!left.includes(words)) left.push(words);
    return words;
  };
  let boxed = false;                        // the project's commands run in the safety box for checks (decided below)
  let online = false;                       // the way that may download has been used
  let download: boolean | null = null;      // whether a build may download: decided once, the first time one needs to
  let netWhy: NetWhy = "no";
  const gap = (output: string, tool: string | undefined, what: string): string | null => {
    if (nat) {
      const words = nativeGap(output, { setup: nat, allowed: online, why: netWhy, what });
      if (!words) return null;
      if (!gaps.includes(words)) gaps.push(words);
      return words;
    }
    const miss = py ? missingModule(output, tool, py.declared) : null;
    if (!miss || !py) return null;
    const words = missingWords(miss, py, what);
    if (!gaps.includes(words)) { if (miss.tool) gaps.push(words); else gaps.splice(packageGaps++, 0, words); }
    return words;
  };

  // The box stopped this command (only ever when it ran in the box): the plain words, kept as a gap.
  const boxGap = (output: string, what: string, net: Net = "local"): string | null => {
    if (!boxed) return null;
    const kind = boxRefusal(output, net);
    if (!kind) return null;
    const words = BOX_STOPPED[kind](what);
    if (!left.includes(words)) left.push(words);
    return words;
  };
  const emit = (rung: Rung, status: StepUpdate["status"], detail = "", ms = 0, needs?: "browser") => o.onStep?.({ rung, label: LABELS[rung], status, detail: redact(detail), ms, ...(needs ? { needs } : {}) });
  const finish = (rung: Rung, status: Step["status"], detail: string, t0: number, problem?: Problem | null, needs?: "browser", more: { summary?: string; forModel?: string } = {}): Step => {
    const s: Step = { rung, label: LABELS[rung], status, detail: redact(detail), ms: Date.now() - t0, ...(problem ? { problem } : {}), ...(needs ? { needs } : {}), ...(more.summary ? { summary: more.summary } : {}), ...(more.forModel ? { forModel: redact(more.forModel) } : {}) };
    steps.push(s); o.onStep?.({ rung, label: LABELS[rung], status, detail: s.detail, ms: s.ms, ...(needs ? { needs } : {}), ...(more.summary ? { summary: more.summary } : {}), ...(problem ? { problem } : {}) });
    return s;
  };
  const unclear: Unclear[] = [], tried: CheckOutcome[] = [];
  let outOfRoom = false;
  const cannotTell = (missing: boolean, ...rungs: Rung[]) => { for (const rung of rungs) if (!unclear.some((u) => u.rung === rung)) unclear.push({ rung, missing }); };
  const result = (verdict: Verdict, failedAt?: Step, serverUrl?: string): LadderResult => ({ verdict: verdict === "passed" && (gaps.length || left.length) ? "passed_with_gaps" : verdict, steps, ...(failedAt ? { failedAt } : {}), ...(serverUrl ? { serverUrl } : {}), ...(gaps.length || left.length ? { gaps: [...gaps, ...left] } : {}), ...(unclear.length ? { unclear: [...unclear] } : {}), ...(tried.length ? { checks: [...tried] } : {}), ...(outOfRoom ? { noRoom: true as const } : {}) });
  // A command this Mac had no room to start, even after trying again: Companion's own words, nothing on screen to point at.
  const noRoom = (rung: Rung, t0: number) => { outOfRoom = true; return result("failed", finish(rung, "failed", NO_ROOM, t0, { kind: "message", message: NO_ROOM, from: rung })); };
  // Point at the problem changes nothing, so it cannot install what is missing. When that is why nothing could be
  // checked, that is what it found (as for a Node project whose packages are missing), said with the command to run. No
  // place goes with it: these are Companion's own words, not something on the screen to circle.
  const unchecked = (): LadderResult => {
    if (!o.noInstall || !(py || nat) || !gaps.length) return result("nothing_to_check");
    const s: Step = { rung: "install", label: LABELS.install, status: "failed", detail: redact(gaps[0]), ms: 0 };
    const at = steps.findIndex((x) => x.rung === "install");
    if (at >= 0) steps[at] = s; else steps.push(s);
    emit("install", "failed", gaps[0]);
    return result("failed", s);
  };

  // --- 1. install
  if (cancelled()) return result("cancelled");
  let t0 = Date.now(); emit("install", "running");
  const [bf, af] = [await readRunFiles(o.store, o.beforeId), await readRunFiles(o.store, o.afterId)];
  // Every command of the project's runs in the safety box for checks (box.ts): writes only to the project and the package
  // caches, none of the private places, and no internet but for an install or a download the person allowed. Where the box
  // cannot be used on this Mac, nothing runs without a yes in this check (below).
  boxed = o.box ?? await boxWorks(o.project);
  if (cancelled()) return result("cancelled");
  const inBox = (net: Net): Pick<RunOptions, "box"> => (boxed ? { box: { project: o.project, net } } : {});
  // What the check would run differs from what the person said yes to (or, with no record, the task changed it): none of
  // it runs without a yes (rule 13). A yes covers installing the packages too, so the person answers one card, and it is
  // remembered. A Python project is asked the same way: its start from .replit or .claude/launch.json is the project's.
  let runYes = false, noRun = false, runShort = RUN_CHANGED_SHORT;
  // A package manager's settings file git ignores (an .npmrc often is) is in no saved version, yet the commands read it: what
  // is said yes to is the project folder's own. The saved version alone is remembered beside it on a yes, so which task
  // broke it (which checks copies made from saved versions, without such files) still finds that yes.
  const afRun = o.afterId === "live" ? af : withInstallConfig(af, await liveInstallConfig(o.project));
  const [printBefore, printAfter, printSaved] = [runPrint(bf), runPrint(afRun), runPrint(af)];
  let unapproved: "task" | "since" | null = null;
  if (o.approvals) {
    if (o.approvals.empty()) o.approvals.add(printBefore);
    if (!o.approvals.has(printAfter)) unapproved = printAfter !== printBefore ? "task" : "since";
  } else if (o.askScripts && printAfter !== printBefore) unapproved = "task";
  // No box: anything the task changed (its tests, sources and configs, not only its scripts) would run outside it, and so
  // would anything an earlier task changed that was never checked. So this check asks whatever changed, and with no way to
  // ask runs nothing.
  if (!boxed) unapproved ??= o.beforeId !== o.afterId ? "task" : "since";
  if (unapproved) {
    if (o.askScripts) {
      runYes = await (boxed ? o.askScripts(unapproved === "task") : o.askScripts(unapproved === "task", true)).then((x) => x === true, () => false);
      if (cancelled()) return result("cancelled");
    }
    if (runYes) { o.approvals?.add(printAfter); if (printSaved !== printAfter) o.approvals?.add(printSaved); }
    else {
      noRun = true;
      runShort = !boxed ? RUN_UNBOXED_SHORT : o.askScripts && unapproved === "task" ? RUN_CHANGED_SHORT : RUN_SINCE_SHORT;
      left.push(!boxed ? (o.askScripts ? RUN_UNBOXED_NO : RUN_UNBOXED_UNASKED) : !o.askScripts ? RUN_UNASKED : unapproved === "task" ? RUN_CHANGED_NO : RUN_SINCE_NO);
    }
  }
  // Scripts that change a database or put something online are never run by a check.
  // A Python check is the checker's own command, not a script of the project's; a start from .claude/launch.json or .replit
  // is the project's, whatever it is written in.
  const screened = (command: string, install = false, own = !!py || !!nat) => !own && changesData(command, o.project, install);
  // May a build download packages? Decided once. Point at the problem and earlier versions never do; "never" never does;
  // "ask" asks, always on its own card (a yes to running the changed scripts does not count); "auto" does. Whatever the answer, the offline try comes first.
  const mayDownload = async (command: string): Promise<boolean> => {
    if (download !== null) return download;
    if (o.noInstall) { netWhy = "noInstall"; return (download = false); }
    const rules = loadRules(o.project);
    const mode = installMode(o.check?.install, rules.rules, rules.broken === true);
    if (mode === "never") { netWhy = "never"; return (download = false); }
    if (mode === "auto") return (download = true);
    // A yes to the changed scripts card is not this answer: that card never says a build may download packages.
    const yes = !!o.askInstall && await o.askInstall(`${DOWNLOAD_ASK}${command.replace(/^(?:[A-Z_]+=\S+\s+)+/, "")}`).then((x) => x === true, () => false);
    netWhy = "no";
    return (download = yes);
  };
  // One command of a Go, Rust, Java, Kotlin, Swift or Xcode project. The offline way first; only when it says a package is
  // not on this Mac yet (and a download is allowed) the command that may download. A wrapper whose build tool is not here
  // yet has no offline way, so it counts as having asked for a download.
  const nativeRun = async (c: { command: string; offline?: string | null }, limitMs: number, env: Record<string, string>): Promise<RunResult> => {
    // Only the way that may download gets the internet, and only once a download is allowed.
    const go = (command: string, net: Net = "local") => run(command, { cwd: o.project, timeoutMs: limitMs, signal: o.signal, env, ...inBox(net) });
    if (online) return go(c.command, "open");
    let r: RunResult;
    if (c.offline) {
      r = await go(c.offline);
      if (r.code === 0 || r.timedOut || r.aborted || cancelled() || couldNotStart(r) || !needsDownload(r.stdout + "\n" + r.stderr, nat!.ecosystem)) return r;
    } else r = { code: 1, signal: null, stdout: "", stderr: WRAPPER_NOT_CACHED, timedOut: false, ms: 0 };
    if (await mayDownload(c.command) && !cancelled()) { online = true; return go(c.command, "open"); }
    return r;
  };
  // Python packages are never installed by Companion; the note says what it uses. With no Python to use (none on this
  // Mac, or a virtual environment whose Python is gone), nothing can be checked, and Point at the problem says so.
  if (py && !py.command && o.noInstall) return result("failed", finish("install", "failed", py.note, t0));
  if (nat?.missing && o.noInstall) return result("failed", finish("install", "failed", nat.missing, t0));
  if (py) finish("install", "skipped", py.note, t0);
  else if (nat?.missing) { gaps.push(nat.missing); finish("install", "skipped", nat.missing, t0); }
  else if (noRun) { heldBack = true; finish("install", "skipped", runShort, t0); }
  else if (nat) finish("install", "skipped", nat.note, t0);
  else if (det.packageManager && needsInstall(bf, af, det.lockfile, existsSync(join(o.project, "node_modules")))) {
    if (o.noInstall) {
      const why = `This project's packages are not installed, so it cannot be checked yet. Run ${det.packageManager} install in the project folder, or press Fix it with me.`;
      return result("failed", finish("install", "failed", why, t0, { kind: "message", message: why, from: "install" }));
    }
    const command = `${det.packageManager} install`;
    // check.install, made at least "ask" by the house rule "ask before installing packages" (or a rules file that could
    // not be read). Only a yes installs.
    const rules = loadRules(o.project);
    const mode = installMode(o.check?.install, rules.rules, rules.broken === true);
    const risky = screened(command, true);
    const yes = !risky && (mode === "auto" || (mode === "ask" && runYes) || (mode === "ask" && !!o.askInstall && await o.askInstall(command).then((x) => x === true, () => false)));
    if (cancelled()) return result("cancelled");
    if (risky) { const why = changesDataGap("install"); left.push(why); heldBack = true; finish("install", "skipped", why, t0); }
    else if (!yes) { const why = mode === "never" ? NOT_INSTALLED_NEVER : NOT_INSTALLED_NO; left.push(why); heldBack = true; finish("install", "skipped", why, t0); }
    else {
      const r = await run(command, { cwd: o.project, timeoutMs: limits.installMs, signal: o.signal, env: { CI: "1" }, ...inBox("open") });
      // Stop (or Stop everything) ended the command: that says nothing about the project, so it is never a failure.
      if (r.aborted || cancelled()) return result("cancelled");
      if (couldNotStart(r)) return noRoom("install", t0);
      const installBox = r.code !== 0 && !r.timedOut ? boxGap(r.stdout + "\n" + r.stderr, "the install", "open") : null;
      if (installBox) { heldBack = true; finish("install", "skipped", installBox, t0); }
      else if (r.code !== 0 || r.timedOut) return result("failed", finish("install", "failed", gist(r, limits.installMs), t0, locateProblem(r.stdout + "\n" + r.stderr, o.project, "install"), undefined, { summary: INSTALL_FAILED_SUMMARY }));
      else finish("install", "passed", "Installed.", t0);
    }
  } else finish("install", "skipped", "Nothing new to install.", t0);

  // --- 2. build and checks
  if (cancelled()) return result("cancelled");
  t0 = Date.now(); emit("checks", "running");
  // A task that "fixes" a failing check by making it check nothing has not fixed anything.
  const weakened = analyzeScripts(bf["package.json"], af["package.json"]);
  if (!weakened.ok) return result("failed", finish("checks", "failed", `${WEAKENED_SUMMARY} ${weakened.problems.join(". ")}.`, t0, null, undefined, { summary: WEAKENED_SUMMARY, forModel: weakened.problems.join(". ") + ". Please fix the real problem instead of weakening the check." }));
  if (det.checks.length && noRun) finish("checks", "skipped", runShort, t0);
  else if (det.checks.length) {
    const ran: string[] = [], missed: string[] = [], skipped: string[] = [];
    for (const c of det.checks) {
      if (skip.has(c.name)) { const w = leftOut(c.name); skipped.push(w); if (!left.includes(w)) left.push(w); continue; }
      if (screened(c.command)) { const w = changesDataGap(c.name); skipped.push(w); if (!left.includes(w)) left.push(w); continue; }
      const r = nat ? await nativeRun(c, limits.checkMs, {}) : await run(c.command, { cwd: o.project, timeoutMs: limits.checkMs, signal: o.signal, ...(py ? { env: pyEnv } : {}), ...inBox("local") });
      if (r.aborted || cancelled()) return result("cancelled");
      if (couldNotStart(r)) { tried.push({ name: c.name, status: "not_started" }); return noRoom("checks", t0); }
      if (r.code !== 0 || r.timedOut) {
        const why = r.timedOut ? null : held(r.stdout + "\n" + r.stderr, c.name) ?? gap(r.stdout + "\n" + r.stderr, c.tool, c.name === "typecheck" ? "the type check" : c.name === "build" ? "the build" : `the ${c.name} check`);
        if (why) { missed.push(why); tried.push({ name: c.name, status: "missing" }); continue; }
        const stopped = r.timedOut ? null : boxGap(r.stdout + "\n" + r.stderr, c.name === "typecheck" ? "the type check" : c.name === "build" ? "the build" : `the ${c.name} check`, nat && online ? "open" : "local");
        if (stopped) { missed.push(stopped); tried.push({ name: c.name, status: "not_started" }); continue; }
        tried.push({ name: c.name, status: "failed" });
        return result("failed", finish("checks", "failed", `${c.name} failed. ${gist(r, limits.checkMs, nat ? withoutNoise : undefined)}`, t0, locateProblem(r.stdout + "\n" + r.stderr, o.project, "checks"), undefined, { summary: checkFailedSummary(c.name) }));
      }
      tried.push({ name: c.name, status: "passed" });
      ran.push(c.name);
    }
    if (ran.length) finish("checks", "passed", `${ran.join(", ")} passed.${missed.length ? ` ${missed.join(" ")}` : ""}${skipped.length ? ` ${skipped.join(" ")}` : ""}`, t0);
    else finish("checks", "skipped", [...missed, ...skipped].join(" "), t0);
  } else finish("checks", "skipped", (nat && (nat.missing ?? nat.gaps[0])) || "This project has no build or lint steps to run.", t0);

  // --- 3. tests, and were they weakened?
  if (cancelled()) return result("cancelled");
  t0 = Date.now(); emit("tests", "running");
  const [bt, at] = [await o.store.readFiles(o.beforeId, isTestFile), await o.store.readFiles(o.afterId, isTestFile)];
  const guard = analyzeTests(bt, at);
  if (!guard.ok) return result("failed", finish("tests", "failed", guard.problems.join(". ") + ".", t0, null, undefined, { summary: WEAKENED_SUMMARY }));
  if (det.tests && skip.has("test")) { const w = leftOut("test"); left.push(w); finish("tests", "skipped", w, t0); }
  else if (det.tests && noRun) finish("tests", "skipped", runShort, t0);
  else if (det.tests && screened(det.tests.command)) { const w = changesDataGap("test"); left.push(w); finish("tests", "skipped", w, t0); }
  else if (det.tests) {
    const r = nat ? await nativeRun(det.tests, limits.testMs, { CI: "1" }) : await run(det.tests.command, { cwd: o.project, timeoutMs: limits.testMs, signal: o.signal, env: { CI: "1", ...pyEnv }, ...inBox("local") });
    if (r.aborted || cancelled()) return result("cancelled");
    if (couldNotStart(r)) return noRoom("tests", t0);
    const why = r.code !== 0 && !r.timedOut ? held(r.stdout + "\n" + r.stderr, "test") ?? gap(r.stdout + "\n" + r.stderr, det.tests.tool, "the tests") : null;
    // The box itself stopped the tests (a fixed /tmp path, a browser with its own sandbox, the internet): a gap, never a failure.
    const stopped = r.code !== 0 && !r.timedOut && !why ? boxGap(r.stdout + "\n" + r.stderr, "the tests", nat && online ? "open" : "local") : null;
    // pytest's exit code 5 means it collected no tests: nothing was checked, and nothing failed. When the test files do
    // have tests, something stops pytest finding them (a conftest.py, the project's pytest settings), so the tests were not
    // checked: a gap, never a pass. Not a failure either: the same may have been true before the task.
    if (det.tests.tool === "pytest" && r.code === 5 && !r.timedOut) {
      cannotTell(false, "tests");
      if (guard.after > 0) { const w = `pytest found no tests to run, though the test files have ${guard.after} test${guard.after === 1 ? "" : "s"}, so the tests were not checked.`; if (!left.includes(w)) left.push(w); finish("tests", "skipped", w, t0); }
      else finish("tests", "skipped", "pytest found no tests to run.", t0);
    }
    else if (why) { cannotTell(true, "tests"); finish("tests", "skipped", why, t0); }
    else if (stopped) { cannotTell(false, "tests"); finish("tests", "skipped", stopped, t0); }
    // Exit code 0 with no test run at all (XCTest's "Executed 0 tests", cargo's "running 0 tests"): nothing was checked, so it is
    // a gap, never a pass, and not a failure either.
    else if (nat && r.code === 0 && !r.timedOut && ranNoTests(r.stdout + "\n" + r.stderr, nat.ecosystem)) {
      cannotTell(false, "tests");
      const w = "The test command ran, but it found no tests to run, so the tests were not checked.";
      if (!left.includes(w)) left.push(w);
      finish("tests", "skipped", w, t0);
    }
    else if (r.code !== 0 || r.timedOut) return result("failed", finish("tests", "failed", `The tests did not pass. ${gist(r, limits.testMs, nat ? withoutNoise : undefined)}`, t0, locateProblem(r.stdout + "\n" + r.stderr, o.project, "tests"), undefined, { summary: TESTS_FAILED_SUMMARY }));
    else finish("tests", "passed", `The tests passed${guard.after ? ` (${guard.after} found)` : ""}.`, t0);
  } else finish("tests", "skipped", (nat && nat.missing) || "This project has no tests to run.", t0);

  // --- 4 and 5. start it, open it
  if (cancelled()) return result("cancelled");
  if (o.noServer) {
    const why = "A watch runs the build and the tests only. It does not start the project or open a browser.";
    finish("start", "skipped", why, Date.now());
    finish("browser", "skipped", why, Date.now());
    return hasEvidence(steps) ? result("passed") : unchecked();
  }
  if (!det.start) {
    finish("start", "skipped", "There is nothing to open in a browser.", Date.now());
    finish("browser", "skipped", "There is nothing to open in a browser.", Date.now());
    return hasEvidence(steps) ? result("passed") : unchecked();
  }
  t0 = Date.now(); emit("start", "running");
  // The project's own server is project code like the rest: not without a yes for what the task changed, and never when it
  // changes a database or puts something online. A plain folder of files is served by Companion itself, so it is still opened.
  if (det.start.kind === "server" && (noRun || screened(det.start.command, false, !!det.start.python))) {
    const why = noRun ? runShort : changesDataGap("start");
    if (!noRun && !left.includes(why)) left.push(why);
    cannotTell(false, "start", "browser");
    finish("start", "skipped", why, t0);
    finish("browser", "skipped", "There is no page to open.", Date.now());
    return hasEvidence(steps) ? result("passed") : unchecked();
  }
  const textOf = (start: NonNullable<Detected["start"]>) => {
    try { const m = /(?:npm|pnpm|yarn|bun) run (\S+)/.exec(start.kind === "server" ? start.command : ""); return m ? JSON.parse(readFileSync(join(o.project, "package.json"), "utf8")).scripts?.[m[1]] ?? "" : ""; } catch { return ""; }
  };
  // A Python dev server may make an empty SQLite file on its way up (Django's runserver does): it is taken away again
  // once the server has stopped, however the rung ends.
  const dbBefore = py ? databaseFiles(o.project) : null;
  // A Go, Rust, Java, Kotlin or Swift project's server is told whether it may fetch packages, and never a toolchain.
  // Maven and Gradle get their offline switch in the command itself, when no download is allowed (serverOffline).
  // The server runs in the box too: it may listen on this Mac and Companion reaches it, and it reaches the internet only
  // when a download was allowed.
  const serve = (start: NonNullable<Detected["start"]>, allow = online) => {
    const command = (c: string) => (boxed && nat?.ecosystem === "swift" ? swiftInBox(c) : c);
    const s = nat && start.kind === "server" ? { ...start, command: command(allow ? start.command : serverOffline(start.command, nat).command), env: { ...(start.env ?? {}), ...serverEnv(allow) } } : start;
    return (o.server ?? startServer)(s, { cwd: o.project, timeoutMs: limits.startMs, scriptText: textOf(start), signal: o.signal, ...inBox(nat && allow ? "open" : "local") });
  };
  // A start that cannot run without downloading (a wrapper whose build tool is not here yet, swift run on a project with remote
  // packages) is a download like a build's: the same question, once, and without a yes it is not started and is said as a gap.
  if (nat && det.start.kind === "server" && !online && serverOffline(det.start.command, nat).download) {
    if (await mayDownload(det.start.command) && !cancelled()) online = true;
    else if (!cancelled()) {
      const w = serverHeldBack(det.start.command, netWhy);
      if (!left.includes(w)) left.push(w);
      cannotTell(false, "start", "browser");
      finish("start", "skipped", w, t0);
      finish("browser", "skipped", "There is no page to open.", Date.now());
      return hasEvidence(steps) ? result("passed") : unchecked();
    }
  }
  let srv = await serve(det.start);
  // It stopped for want of packages this check had not been allowed to fetch: the same question as for a build, once.
  if (nat && !srv.ok && !online && !cancelled() && needsDownload(srv.output ?? srv.reason, nat.ecosystem) && det.start.kind === "server" && await mayDownload(det.start.command) && !cancelled()) { online = true; srv = await serve(det.start, true); }
  // The start script chosen in Settings finished on its own, so it does not open the page. The page is still checked
  // (F14): the project is started the usual way when that is another way, and either way it is a gap, never a pass.
  let startNote = started.gap, chosen = started.chosen;
  if (!srv.ok && srv.notAServer && chosen && !cancelled()) {
    const usual = found.start;
    const other = !!usual && !(usual.kind === "server" && det.start.kind === "server" && usual.command === det.start.command);
    startNote = `The start script chosen in Settings (${chosen}) finished without opening a page, so ${other ? "the project was started the usual way" : "the page was not checked"}.`;
    left.push(startNote);
    if (other && usual!.kind === "server" && screened(usual!.command, false, !!usual!.python)) { const w = changesDataGap("start"); if (!left.includes(w)) left.push(w); }
    else if (other) { srv = await serve(usual!); chosen = undefined; }
  }
  try {
    if (!srv.ok && srv.aborted) return result("cancelled");
    if (!srv.ok && srv.notAServer && (looksLikeSite(det.start, o.project) || (!!found.start && looksLikeSite(found.start, o.project)))) {
      // A website whose start command finished instead of staying on (a task can break its server that way): the page
      // was never opened, so it is a gap, never a pass (F14). A chosen start script that did this already says so.
      if (!startNote) left.push(FINISHED_SITE);
      cannotTell(false, "start", "browser");
      finish("start", "skipped", startNote ?? FINISHED_SITE, t0);
      finish("browser", "skipped", "There is no page to open.", Date.now());
      return hasEvidence(steps) ? result("passed") : unchecked();
    }
    if (!srv.ok && srv.notAServer) {
      finish("start", "skipped", "This project's start command is a tool, not a website, so there is no page to open.", t0);
      finish("browser", "skipped", "There is no page to open.", Date.now());
      return hasEvidence(steps) ? result("passed") : unchecked();
    }
    // Its port is held by another program, perhaps the person's own copy of the site: the page could not be opened, which
    // is a gap, never the project's failure (no ring on the listen line, no fix round).
    if (!srv.ok && srv.portBusy !== undefined) {
      const w = `${srv.portBusy ? `Port ${srv.portBusy}` : "The port it uses"} is in use by another program, perhaps your own copy of the site, so the page was not checked.`;
      if (!left.includes(w)) left.push(w);
      cannotTell(false, "start", "browser");
      finish("start", "skipped", w, t0);
      finish("browser", "skipped", "There is no page to open.", Date.now());
      return hasEvidence(steps) ? result("passed") : unchecked();
    }
    const startGap = srv.ok ? null : held(srv.output ?? srv.reason, "start")
      ?? (nat ? gap(srv.output ?? srv.reason, undefined, "the server") : null)
      ?? (det.start.kind === "server" && det.start.python ? gap(srv.output ?? srv.reason, det.start.python === "uvicorn" ? "uvicorn" : det.start.python, "the server") : null);
    const startBox = srv.ok || startGap || det.start.kind !== "server" ? null : boxGap(srv.output ?? srv.reason, "the server", nat && online ? "open" : "local");
    if (startBox) {
      cannotTell(false, "start", "browser");
      finish("start", "skipped", startBox, t0);
      finish("browser", "skipped", "There is no page to open.", Date.now());
      return hasEvidence(steps) ? result("passed") : unchecked();
    }
    if (startGap) {
      cannotTell(true, "start", "browser");
      finish("start", "skipped", startGap, t0);
      finish("browser", "skipped", "There is no page to open.", Date.now());
      return hasEvidence(steps) ? result("passed") : unchecked();
    }
    if (!srv.ok) return result("failed", finish("start", "failed", chosen ? `It was started with the script chosen in Settings (${chosen}). ${srv.reason}` : startNote ? `${startNote} ${srv.reason}` : srv.reason, t0, srv.output ? locateProblem(srv.output, o.project, "start") : null, undefined, { summary: START_FAILED_SUMMARY }));
    finish("start", "passed", startNote ? `It started. ${startNote}` : "It started.", t0);
    if (cancelled()) return result("cancelled", undefined, srv.url);
    t0 = Date.now(); emit("browser", "running");
    // check.pageSize: desktop (today's 1280 by 800), phone (390 by 844), or both, one after the other. The picture for the
    // visual receipt comes from the first.
    const hints = hintsFor(o.project, o.check);
    const sizes = o.check?.pageSize === "both" ? ["desktop", "phone"] as const : o.check?.pageSize === "phone" ? ["phone"] as const : ["desktop"] as const;
    const two = sizes.length > 1;
    let shot: import("./browser.ts").PageShot | undefined;
    const notDone: string[] = [];   // what the browser check was asked for in Settings and did not do (a button it would not press)
    for (const [i, size] of sizes.entries()) {
      // The stop signal goes with it, so Stop everything closes the hidden browser at once.
      const b = await browser(srv.url, { ...hints, timeoutMs: limits.browserMs, shot: i === 0, ...(size === "phone" ? { viewport: { ...VIEWPORTS.phone } } : {}), ...(o.signal ? { signal: o.signal } : {}) });
      if (cancelled()) return result("cancelled", undefined, srv.url);
      if (b.skipped) { cannotTell(false, "browser"); finish("browser", "skipped", b.skipped, t0, null, b.notInstalled ? "browser" : undefined); return result("passed_with_gaps", undefined, srv.url); }
      for (const g of b.gaps ?? []) if (!left.includes(g)) { left.push(g); notDone.push(g); }
      const at = two ? `At ${size} size: ` : size === "phone" ? "At phone size: " : "";
      if (!b.ok) return result("failed", finish("browser", "failed", at + b.problems.slice(0, 3).join(". ") + ".", t0, buttonProblem(b.problems) ?? locateProblem(b.problems.join("\n"), o.project, "browser")), srv.url);
      if (i === 0 && b.shot) shot = b.shot;
      if (i < sizes.length - 1 && cancelled()) return result("cancelled", undefined, srv.url);
    }
    const opened = two ? "The page opened with no errors, at desktop and at phone size." : sizes[0] === "phone" ? "The page opened with no errors at phone size." : "The page opened with no errors.";
    finish("browser", "passed", notDone.length ? `${opened} ${notDone.join(" ")}` : opened, t0);
    return { ...result("passed", undefined, srv.url), ...(shot ? { shot } : {}) };
  } finally {
    if (srv.ok) await srv.stop();
    if (dbBefore) removeNewEmptyDatabases(o.project, dbBefore);
  }
}
