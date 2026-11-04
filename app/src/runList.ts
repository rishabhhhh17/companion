// M69 step 2, Fix it and proof (the YC benchmark spec 3.4, 3.13): what the work card, the receipt and the notch's mini receipt
// say, decided here from the engine's own events only, so card.tsx and islandPanel.tsx only draw it.
// - The run list while a fix works: one row per step, verb first, its live status on the right, and "2 of 4" from the same
//   four steps as the notch (homeHero.ts jobStep), so the two never disagree.
// - The receipt's proof ticks: each check that ran, the commands it ran with their exit codes, and how long it took.
// - The failing lead: the step that really failed, named, with its line when the engine found one.
// - Replay what Squibby did: the task's own stored steps, in order, played back.
// No number is made up: a check that did not say how long it took shows no time, and nothing says a page count.
import type { Model, ProofLine, Problem, ToolLine } from "./model.ts";
import { checkParts } from "./checkParts.ts";
import { jobStep } from "./homeHero.ts";
import { S } from "./strings.ts";

export type RowState = "done" | "now" | "waiting" | "failed";
export type RunRow = { key: string; words: string; state: RowState; status: string; ms?: number; detail?: string };
export type RunList = { rows: RunRow[]; at: number; of: number; counter: string; say: string };

/** A time in seconds as the rows say it: one decimal under ten seconds ("2.1"), whole seconds to a minute, then m:ss. */
export function secondsWords(ms: number): string {
  const s = Math.max(0, ms) / 1000;
  if (s < 10) return (Math.round(s * 10) / 10).toFixed(1);
  if (s < 60) return String(Math.round(s));
  const r = Math.round(s), m = Math.floor(r / 60);
  return `${m}:${String(r % 60).padStart(2, "0")}`;
}
const timed = (ms: number | undefined) => (ms && ms > 0 ? ms : undefined);
const STATE: Record<ProofLine["status"], RowState> = { running: "now", passed: "done", failed: "failed", skipped: "waiting" };
const STATUS: Record<ProofLine["status"], string> = { running: S.fixRun.running, passed: S.fixRun.done, failed: S.fixRun.failed, skipped: S.stepSkipped };

/** The run list while a task works (null with no task). The first row is the change itself, in the task's own words, with
 *  what its tools are doing under it while it finds and fixes; then
 *  each check as the engine reports it (a skipped one is not a step that ran, so it is left out); while it is still fixing
 *  and no check has started, one "Checking the work" row waits. The counter is the step under way of the four. */
export function runList(m: Model, maxTries = 3): RunList | null {
  if (!m.task) return null;
  const { step, retry } = jobStep(m, maxTries);
  const checks = (m.task.proof?.steps ?? []).filter((s) => s.status !== "skipped");
  // M69 step 3: the change itself, verb first ("Changing the code"); the task's name is the page title above it.
  const work: RunRow = {
    key: "work", words: S.fixRun.workRow,
    state: step >= 2 ? "done" : "now",
    status: step >= 2 ? S.fixRun.done : retry ?? (step === 0 ? S.fixRun.finding : S.fixRun.fixing),
  };
  // While it finds and fixes, what its tools are doing right now, under the change's row ("Changing signup.js").
  const doing = step < 2 ? [...m.task.lines].reverse().find((l) => l.outcome === "ran" || l.outcome === "")?.words.trim() : "";
  if (doing) work.detail = doing;
  const rows: RunRow[] = [work, ...checks.map((c): RunRow => ({ key: c.rung, words: c.label, state: STATE[c.status], status: STATUS[c.status], ...(c.status !== "running" && timed(c.ms) ? { ms: c.ms } : {}) }))];
  // M69 step 4: which checks a project has (tests, a page to open) is only known once the engine reports them, so nothing
  // lists a check that may never run. Until a check starts, one "Checking the work" row waits (a skipped one is not a
  // check); after that, only the checks the engine said.
  if (!checks.length) rows.push({ key: "plan:check", words: S.fixRun.waitRow, state: "waiting", status: S.fixRun.waiting });
  const of = S.home.steps.length, at = Math.min(step, of - 1) + 1;
  return { rows, at, of, counter: S.fixRun.counter(at, of), say: S.fixRun.counterSay(at, of, S.home.steps[at - 1]) };
}

/** One tick under a result: a check that ran, in its result words ("Tests pass", "Tests fail"), the commands it ran with
 *  their exit codes, how long it took, and for a failed one its plain parts (checkParts) for behind Details. A check that
 *  was still running when the result came did not finish, and says so (never a stale "Checking"). */
export type Tick = { rung: string; words: string; state: "ok" | "bad" | "unfinished"; runs: string[]; ms?: number; parts?: ReturnType<typeof checkParts> };
export function proofTicks(m: Pick<Model, "task" | "receipt">): Tick[] {
  if (!m.receipt || !m.task?.proof) return [];
  return m.task.proof.steps.filter((s) => s.status !== "skipped").map((s): Tick => {
    const runs = (s.runs ?? []).map((r) => S.fixRun.exit(r.command, r.exit));
    if (s.status === "running") return { rung: s.rung, words: s.label, state: "unfinished", runs };
    const ok = s.status === "passed";
    const words = ok ? (S.proofChip[s.rung] ?? s.label) : (S.proofChipFailed[s.rung] ?? S.ui.failedStep(s.label));
    return { rung: s.rung, words, state: ok ? "ok" : "bad", runs, ...(timed(s.ms) ? { ms: s.ms } : {}), ...(ok ? {} : { parts: checkParts(s) }) };
  });
}

/** How long the checks took together, from the times the engine reported (null when none did). */
export function checkedMs(m: Pick<Model, "task">): number | null {
  const ms = (m.task?.proof?.steps ?? []).filter((s) => s.status === "passed" || s.status === "failed").reduce((n, s) => n + (timed(s.ms) ?? 0), 0);
  return ms > 0 ? ms : null;
}
/** The strongest check that passed, for the one line under a proven result: a browser, else the tests, else the build. */
function strongest(m: Pick<Model, "task">): "browser" | "tests" | "checks" | null {
  const passed = new Set((m.task?.proof?.steps ?? []).filter((s) => s.status === "passed").map((s) => s.rung));
  return passed.has("browser") ? "browser" : passed.has("tests") ? "tests" : passed.has("checks") ? "checks" : null;
}
/** The receipt's proof sentence ("Checked in a browser in 7 seconds."), only for a proven result whose checks said their time. */
export function proofSentence(m: Pick<Model, "task" | "receipt">, proven: boolean): string | null {
  const k = strongest(m), ms = checkedMs(m);
  if (!proven || !k || !ms || m.receipt?.undone) return null;
  const t = S.fixRun.secondsLong(Math.max(1, Math.round(ms / 1000)));
  return k === "browser" ? S.fixRun.checkedBrowser(t) : k === "tests" ? S.fixRun.checkedTests(t) : S.fixRun.checkedBuild(t);
}
/** The same, short, for the notch's mini receipt ("Checked in a browser · 7 s"). */
export function proofShort(m: Pick<Model, "task" | "receipt">, proven: boolean): string | null {
  const k = strongest(m), ms = checkedMs(m);
  if (!proven || !k || !ms || m.receipt?.undone) return null;
  const t = S.fixRun.seconds(String(Math.max(1, Math.round(ms / 1000))));
  return k === "browser" ? S.fixRun.shortBrowser(t) : k === "tests" ? S.fixRun.shortTests(t) : S.fixRun.shortBuild(t);
}

/** The step that really failed (the first failed check), for the failing lead: its name, the plain why, where, and the
 *  problem to point at. Null when no check failed, or after an Undo (the files are not the ones that were checked). */
export type FailedStep = { rung: string; label: string; why: string; place: string; problem: Problem | null };
export function failedStep(m: Pick<Model, "task" | "receipt">): FailedStep | null {
  if (m.receipt?.undone) return null;
  const f = (m.task?.proof?.steps ?? []).find((s) => s.status === "failed");
  if (!f) return null;
  const p = checkParts(f);
  return { rung: f.rung, label: f.label, why: p.summary, place: p.place, problem: f.problem ?? null };
}
/** What Copy for my AI puts on the clipboard after a failed check: the step, why, where and the line (already redacted by the
 *  engine and the page), and the ask not to weaken the check. Never the raw output. */
export function failCopy(f: FailedStep): string {
  const line = f.problem && f.problem.kind === "line" ? (f.problem.lineText ?? "").trim() : "";
  return [S.fixRun.failCopy.head, S.fixRun.failCopy.step(f.label), f.why, f.place && S.fixRun.failCopy.at(f.place), line && S.fixRun.failCopy.line(line), S.fixRun.failCopy.ask].filter(Boolean).join("\n");
}

/** Replay what Squibby did: the task's stored steps in the order they happened. What its tools did (the same words as the
 *  card said live, said once each), the files it changed, then each check with its result and time. At most `max` rows;
 *  the rest are counted. Nothing is replayed after an Undo. */
export const REPLAY_MAX = 12;
export function replayRows(m: Pick<Model, "task" | "receipt">, max = REPLAY_MAX): { rows: RunRow[]; more: number } {
  if (!m.task || m.receipt?.undone) return { rows: [], more: 0 };
  const said = new Set<string>(), rows: RunRow[] = [];
  m.task.lines.forEach((l: ToolLine, i) => {
    const w = l.words.trim();
    if (!w || said.has(w)) return;
    said.add(w);
    const odd = l.outcome === "blocked" ? S.fixRun.replayBlocked(w) : l.outcome === "denied" ? S.fixRun.replayDenied(w) : null;
    rows.push({ key: `t${i}`, words: odd ?? w, state: odd ? "failed" : "done", status: "" });
  });
  for (const f of m.task.files ?? []) {
    const name = f.file.split("/").pop() || f.file;
    // Its tool already said it ("Changing signup.js"): the file is not said again.
    if ([...said].some((w) => w.includes(name))) continue;
    const words = f.kind === "added" ? S.fixRun.replayAdded(name) : f.kind === "deleted" ? S.fixRun.replayRemoved(name) : S.fixRun.replayChanged(name);
    if (said.has(words)) continue;
    said.add(words);
    rows.push({ key: `f:${f.file}`, words, state: "done", status: "" });
  }
  for (const s of m.task.proof?.steps ?? []) {
    if (s.status === "skipped") continue;
    rows.push({ key: `c:${s.rung}`, words: s.label, state: s.status === "running" ? "waiting" : STATE[s.status], status: s.status === "running" ? S.fixRun.unfinished : STATUS[s.status], ...(timed(s.ms) ? { ms: s.ms } : {}) });
  }
  // Past the most, the last of the steps before the checks are counted instead, never the checks: they are the proof.
  const checks = rows.filter((r) => r.key.startsWith("c:")), before = rows.filter((r) => !r.key.startsWith("c:"));
  const room = Math.max(0, max - checks.length);
  const more = Math.max(0, before.length - room);
  return { rows: [...before.slice(0, room), ...checks], more };
}
