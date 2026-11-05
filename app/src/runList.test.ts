// M69 step 2, Fix it and proof (tests first, rule 17; the YC benchmark spec 3.4): the run list, the receipt's proof ticks, the
// failing lead, Copy for my AI and Replay what Squibby did, all from the engine's own events. Nothing is made up: no time a
// check did not report, no page count, no stale "Checking" once the result is in.
import { describe, expect, test } from "bun:test";
import { initial, reduce, type Model } from "./model.ts";
import { checkedMs, failCopy, failedStep, proofSentence, proofShort, proofTicks, replayRows, runList, secondsWords, REPLAY_MAX } from "./runList.ts";
import { notchStep } from "./islandPanel.ts";
import { islandWings } from "./home.ts";
import { S } from "./strings.ts";

const ev = (o: Record<string, unknown>) => ({ v: 1, id: "e", ...o });
const run = (events: Record<string, unknown>[], from: Model = { ...initial(), runnerUp: true }) => events.reduce<Model>((m, e) => reduce(m, e as never), from);
const task = (label = "fix the sign up button") => [ev({ type: "checkpoint.created", project: "/p", agent: "a", checkpoint: "cp_1", label: `Before: ${label}`, files: 3, skipped: [] }), ev({ type: "agent.state", agent: "a", state: "working" })];
const tool = (t: string, id: string, outcome = "ran", path = "/p/src/signup.js") => ev({ type: "agent.tool", agent: "a", toolUseId: id, tool: t, summary: `${t}: ${path}`, undoable: true, outcome });
const file = (f: string, kind = "modified") => ev({ type: "agent.file", agent: "a", file: f, kind });
const LABEL: Record<string, string> = { install: "Installing what the project needs", checks: "Building and checking the code", tests: "Running the tests", start: "Starting the project", browser: "Opening it in a browser" };
const step = (rung: string, status: string, o: Record<string, unknown> = {}) => ev({ type: "proof.step", agent: "a", rung, label: LABEL[rung], status, detail: "", ...o });
const checking = ev({ type: "agent.state", agent: "a", state: "checking" });
const result = (verdict: string, steps: Record<string, unknown>[] = []) => ev({ type: "proof.result", agent: "a", verdict, steps, tries: 1 });
const receipt = (o: Record<string, unknown> = {}) => ev({ type: "receipt", agent: "a", checkpoint: "cp_1", changed: [{ file: "src/signup.js", kind: "modified" }], commands: 0, notUndoable: [], usdEstimate: 0.05, proof: "passed", ended: "done", ...o });
const BUILD = { runs: [{ command: "npm run build", exit: 0 }] };
const problem = { kind: "line", file: "src/signup.js", line: 17, lineText: "if (form.email) setDone(true)", from: "tests" };

describe("the run list: verb first rows, live status on the right, the same four steps as the notch", () => {
  // M69 step 4: which checks a project has is only known once the engine reports them, so before that one "Checking the
  // work" row waits, never a check that may never run. The first row is the change itself, "Changing the code".
  const wait = { key: "plan:check", words: S.fixRun.waitRow, state: "waiting" as const, status: S.fixRun.waiting };
  test("finding: Changing the code, Finding..., step 1 of 4, and Checking the work waiting", () => {
    const l = runList(run(task()))!;
    expect(l.rows).toEqual([{ key: "work", words: S.fixRun.workRow, state: "now", status: S.fixRun.finding }, wait]);
    expect([l.at, l.of, l.counter]).toEqual([1, 4, "1 of 4"]);
    expect(l.say).toBe("Step 1 of 4: Finding");
  });
  test("fixing: Fixing..., and Checking the work waits; 2 of 4", () => {
    const l = runList(run([...task(), tool("Edit", "t1"), file("src/signup.js")]))!;
    expect(l.rows.map((r) => [r.words, r.state, r.status])).toEqual([[S.fixRun.workRow, "now", S.fixRun.fixing], [wait.words, wait.state, wait.status]]);
    // What its tools are doing now sits under the change's row; a refused step is never said as what it is doing.
    expect(l.rows[0].detail).toBe("Changing signup.js");
    expect(runList(run([...task(), tool("Read", "t0"), tool("Bash", "t1", "denied")]))!.rows[0].detail).toBe("Reading signup.js");
    expect(l.counter).toBe("2 of 4");
  });
  test("checking: the change is done; each check as the engine says it, a skipped one left out; times only when reported", () => {
    const m = run([...task(), tool("Edit", "t1"), checking, step("install", "skipped"), step("checks", "passed", { ms: 2100, ...BUILD }), step("tests", "running")]);
    const l = runList(m)!;
    expect(l.rows.map((r) => [r.key, r.words, r.state, r.status, r.ms])).toEqual([
      ["work", S.fixRun.workRow, "done", S.fixRun.done, undefined],
      ["checks", LABEL.checks, "done", S.fixRun.done, 2100],
      ["tests", LABEL.tests, "now", S.fixRun.running, undefined],
    ]);
    // Only the checks the engine said: none waits that may never run.
    const later = runList(run([...task(), tool("Edit", "t1"), checking, step("checks", "passed", { ms: 900 }), step("browser", "running")]))!;
    expect(later.rows.map((r) => r.key)).toEqual(["work", "checks", "browser"]);
    expect(l.counter).toBe("3 of 4");
    // The notch says the same step (islandPanel.ts notchStep reads the same jobStep).
    expect(notchStep(m, islandWings(m))?.word).toBe(S.home.steps[l.at - 1]);
  });
  test("a failed check being fixed again: the change says which try, the failed check stays as the reason", () => {
    const m = run([...task(), tool("Edit", "t1"), checking, step("tests", "failed", { ms: 900 }), result("failed"), ev({ type: "agent.state", agent: "a", state: "working" })]);
    const l = runList(m)!;
    expect(l.rows[0].status).toBe(S.home.tryingAgain(2, 3));
    expect(l.rows[0].state).toBe("now");
    expect(l.rows.find((r) => r.key === "tests")?.state).toBe("failed");
    // One counter (review of 5 Nov): the try is the count, so the step "2 of 4" is not said beside "Trying again (2 of 3)".
    expect(l.counter).toBe("");
    expect(l.say).not.toContain("of 4");
  });
  test("rows run oldest first, and the clock never reads less than the checks already listed", () => {
    const m = run([...task(), tool("Edit", "t1"), checking, step("checks", "passed", { ms: 4100, ...BUILD }), step("tests", "failed", { ms: 2100 })]);
    const l = runList(m)!;
    expect(l.rows.map((r) => r.key)).toEqual(["work", "checks", "tests"]);
    expect(l.ms).toBe(6200);
  });
  test("the first row is always the verb first change, whatever the task was called; no task, no list", () => {
    expect(runList(run(task("")))!.rows[0].words).toBe(S.fixRun.workRow);
    expect(runList(run([]))).toBeNull();
  });
  test("times read as people say them, in tabular figures on the card", () => {
    expect([secondsWords(2100), secondsWords(400), secondsWords(14_400), secondsWords(65_000)]).toEqual(["2.1", "0.4", "14", "1:05"]);
  });
});

describe("the receipt: proof ticks with the commands and exit codes, one proof sentence, never a stale Checking", () => {
  const proven = () => run([...task(), tool("Edit", "t1"), file("src/signup.js"), checking, step("install", "skipped"), step("checks", "passed", { ms: 2100, ...BUILD }), step("tests", "passed", { ms: 1400, runs: [{ command: "npm test", exit: 0 }] }), step("browser", "passed", { ms: 1600 }), result("passed"), receipt()]);
  test("each check that ran, in its result words, with what it ran and its time", () => {
    expect(proofTicks(proven())).toEqual([
      { rung: "checks", words: S.proofChip.checks, state: "ok", runs: ["npm run build · exit 0"], ms: 2100 },
      { rung: "tests", words: S.proofChip.tests, state: "ok", runs: ["npm test · exit 0"], ms: 1400 },
      { rung: "browser", words: S.proofChip.browser, state: "ok", runs: [], ms: 1600 },
    ]);
  });
  test("the proof sentence names the strongest check and the real total time", () => {
    const m = proven();
    expect(checkedMs(m)).toBe(5100);
    expect(proofSentence(m, true)).toBe("Checked in a browser in 5 seconds.");
    expect(proofShort(m, true)).toBe("Checked in a browser · 5 s");
    // Not proven, undone, or no time reported: no sentence (never a made up number).
    expect(proofSentence(m, false)).toBeNull();
    expect(proofSentence({ ...m, receipt: { ...m.receipt!, undone: true } }, true)).toBeNull();
    const noTime = run([...task(), tool("Edit", "t1"), checking, step("tests", "passed"), result("passed"), receipt()]);
    expect(proofSentence(noTime, true)).toBeNull();
    const tests = run([...task(), tool("Edit", "t1"), checking, step("tests", "passed", { ms: 2600 }), result("passed"), receipt()]);
    expect(proofSentence(tests, true)).toBe("The tests passed in 3 seconds.");
    expect(proofShort(tests, true)).toBe("Tests passed · 3 s");
  });
  test("a check still running when the result came did not finish: never shown as Checking under a result", () => {
    const m = run([...task(), tool("Edit", "t1"), checking, step("checks", "passed", { ms: 800 }), step("browser", "running"), result("passed_with_gaps"), receipt({ proof: "partial" })]);
    const t = proofTicks(m);
    expect(t.at(-1)).toEqual({ rung: "browser", words: LABEL.browser, state: "unfinished", runs: [] });
    expect(t.map((x) => x.words)).not.toContain(S.stepRunning);
  });
  test("no receipt, no ticks", () => {
    expect(proofTicks(run([...task(), checking, step("checks", "passed")]))).toEqual([]);
  });
});

describe("failing: name the step that really failed, point at its line, and copy it for the person's AI", () => {
  const failing = () => run([...task(), tool("Edit", "t1"), checking, step("checks", "passed", { ms: 2100, ...BUILD }), step("tests", "failed", { ms: 1400, detail: "The tests did not pass. expected thanks", summary: "A test expected a thank you message.", problem, runs: [{ command: "npm test", exit: 1 }] }), result("failed"), receipt({ proof: "failed", ended: "failed", endedWhy: "check_failed" })]);
  test("the failed step is the one that failed (not the last one, not a passed one), with why and where", () => {
    const f = failedStep(failing())!;
    expect(f).toEqual({ rung: "tests", label: LABEL.tests, why: "A test expected a thank you message.", place: S.ehWhere("src/signup.js", 17), problem: problem as never });
    expect(S.fixRun.stoppedAt(f.label)).toBe("It stopped at: running the tests");
    expect(proofTicks(failing()).find((t) => t.rung === "tests")).toMatchObject({ state: "bad", words: S.proofChipFailed.tests, runs: ["npm test · exit 1"] });
  });
  test("nothing failed, or the fix was undone: no failing lead", () => {
    expect(failedStep(run([...task(), checking, step("tests", "passed"), result("passed"), receipt()]))).toBeNull();
    const m = failing();
    expect(failedStep({ ...m, receipt: { ...m.receipt!, undone: true } })).toBeNull();
  });
  test("Copy for my AI: the step, why, where and the line, and never weaken the check; no raw output", () => {
    const t = failCopy(failedStep(failing())!);
    expect(t.split("\n")).toEqual([S.fixRun.failCopy.head, `Step: ${LABEL.tests}.`, "A test expected a thank you message.", `Where: ${S.ehWhere("src/signup.js", 17)}.`, "The line: if (form.email) setDone(true)", S.fixRun.failCopy.ask]);
    expect(t).not.toContain("expected thanks");
  });
});

describe("Replay what Squibby did: the task's stored steps, in order", () => {
  test("its tool steps once each, then the checks with their results and times", () => {
    const m = run([...task(), tool("Read", "t0"), tool("Edit", "t1"), tool("Edit", "t2"), file("src/signup.js"), file("src/thanks.js", "added"), checking, step("checks", "passed", { ms: 2100 }), step("tests", "passed", { ms: 1400 }), result("passed"), receipt()]);
    const r = replayRows(m);
    const words = r.rows.map((x) => x.words);
    expect(words.slice(-2)).toEqual([LABEL.checks, LABEL.tests]);
    expect(new Set(words).size).toBe(words.length);
    // A file its tools did not already name is said; one they named is not said twice.
    expect(words).toContain(S.fixRun.replayAdded("thanks.js"));
    expect(words).not.toContain(S.fixRun.replayChanged("signup.js"));
    expect(words.slice(0, 2)).toEqual(["Reading signup.js", "Changing signup.js"]);
    expect(r.rows.at(-1)?.ms).toBe(1400);
    expect(r.more).toBe(0);
  });
  test("a refused step says so; past the most rows, the steps are counted and the checks always stay", () => {
    const many = Array.from({ length: REPLAY_MAX + 4 }, (_, i) => tool("Read", `r${i}`, "ran", `/p/src/f${i}.js`));
    const m = run([...task(), tool("Bash", "b1", "denied"), ...many, checking, step("tests", "passed", { ms: 900 }), result("passed"), receipt()]);
    const r = replayRows(m);
    expect(r.rows.length).toBe(REPLAY_MAX);
    expect(r.rows.at(-1)?.key).toBe("c:tests");
    expect(r.rows[0].state).toBe("failed");
    expect(r.more).toBe(REPLAY_MAX + 5 - (REPLAY_MAX - 1));
  });
  test("nothing to replay after an Undo or with no task", () => {
    const m = run([...task(), tool("Edit", "t1"), checking, step("tests", "passed"), result("passed"), receipt()]);
    expect(replayRows({ ...m, receipt: { ...m.receipt!, undone: true } }).rows).toEqual([]);
    expect(replayRows(run([])).rows).toEqual([]);
  });
});

describe("the notch's mini receipt (spec 3.13): the fix, how it was proven, the after picture, Keep", () => {
  const o = { note: "", status: "my-shop works" };
  const visual = ev({ type: "receipt.visual", agent: "a", project: "/p", checkpoint: "cp_1", made: true, image: "/9j/4AAQ", caption: "This works now.", circles: 1 });
  const proven = () => run([...task(), tool("Edit", "t1"), checking, step("checks", "passed", { ms: 2100 }), step("browser", "passed", { ms: 1600 }), result("passed"), receipt(), visual, ev({ type: "agent.state", agent: "a", state: "done" })]);
  test("a proven fix: how it was proven, its after picture, and Keep", async () => {
    const { islandJobs, panelView } = await import("./islandPanel.ts");
    const m = proven();
    const v = panelView(m, islandJobs(m), o);
    expect(v.kind).toBe("result");
    if (v.kind !== "result") return;
    expect(v.job.title).toBe("Fix the sign up button");
    // M69 step 3: the title is the outcome, as on Home ("Sign up button fixed").
    expect(v.mini).toEqual({ title: "Sign up button fixed", line: "Checked in a browser · 4 s", thumb: "data:image/jpeg;base64,/9j/4AAQ", keep: true });
  });
  test("a failed fix says its verdict, has no picture and no Keep", async () => {
    const { islandJobs, panelView } = await import("./islandPanel.ts");
    const m = run([...task(), tool("Edit", "t1"), checking, step("tests", "failed", { ms: 900 }), result("failed"), receipt({ proof: "failed", ended: "failed", endedWhy: "check_failed" }), ev({ type: "agent.state", agent: "a", state: "error" })]);
    const v = panelView(m, islandJobs(m), o);
    if (v.kind !== "result") throw new Error(v.kind);
    expect(v.mini.keep).toBe(false);
    expect(v.mini.thumb).toBeNull();
    expect(v.mini.line).toBe(v.verdict.headline);
    expect(v.mini.title).toBe("Fix the sign up button");   // never called fixed when it was not proven
  });
  test("an Undo asked or done takes the picture and Keep away", async () => {
    const { islandJobs, panelView } = await import("./islandPanel.ts");
    const asked = run([ev({ type: "ui.undoAsked", checkpoint: "cp_1" })], proven());
    const v = panelView(asked, islandJobs(asked), o);
    if (v.kind !== "result") throw new Error(v.kind);
    expect([v.mini.keep, v.mini.thumb]).toEqual([false, null]);
  });
  test("Keep folds it away: the panel then says the project's line, until the next result", async () => {
    const { islandJobs, panelView } = await import("./islandPanel.ts");
    const m = proven(), jobs = islandJobs(m);
    const key = jobs.find((j) => j.key.startsWith("done:"))!.key;
    expect(panelView(m, jobs, { ...o, kept: key })).toEqual({ kind: "line", line: o.status });
    expect(panelView(m, jobs, { ...o, kept: "done:another" }).kind).toBe("result");
  });
});

describe("the commands a check ran reach the page as the engine sent them, secrets hidden (protocol fixture em69a)", () => {
  test("the shared fixture's runs and time are kept on the step", async () => {
    const { readFileSync } = await import("node:fs");
    const line = readFileSync(new URL("../../protocol/fixtures/events.jsonl", import.meta.url), "utf8").split("\n").find((l) => l.includes('"id":"em69a"'))!;
    const e = JSON.parse(line);
    const m = run([...task(), checking, { ...e, agent: "a" }]);
    expect(m.task?.proof?.steps[0]).toMatchObject({ rung: "checks", ms: 2100, runs: [{ command: "npm run build", exit: 0 }] });
  });
  test("a key in a command is hidden again on the page; a run with no command or exit code is dropped", () => {
    const key = "sk-ant-api03-" + "a".repeat(40);
    const m = run([...task(), checking, step("checks", "passed", { ms: 10, runs: [{ command: `API_KEY=${key} npm run build`, exit: 0 }, { command: "", exit: 0 }, { command: "npm test", exit: "0" }] })]);
    const runs = m.task?.proof?.steps[0].runs ?? [];
    expect(runs.length).toBe(1);
    expect(runs[0].command).not.toContain(key);
    expect(proofTicks({ ...m, receipt: run([receipt()], m).receipt }).at(0)?.runs[0]).not.toContain(key);
  });
});

describe("M69 step 3: the before and after pair, and Keep on Home", () => {
  const proven = () => run([...task(), tool("Edit", "t1"), file("src/signup.js"), checking, step("browser", "passed", { ms: 1600 }), result("passed"), receipt({ picture: true })]);
  test("the earlier version's picture is kept with the after picture, from the same receipt only", () => {
    const m = run([ev({ type: "receipt.visual", agent: "a", project: "/p", checkpoint: "cp_1", made: true, image: "/9j/AFTER", before: "/9j/BEFORE", caption: "c", circles: 1 })], proven());
    expect(m.receipt?.visual).toEqual({ image: "/9j/AFTER", before: "/9j/BEFORE", caption: "c" });
    const noBefore = run([ev({ type: "receipt.visual", agent: "a", project: "/p", checkpoint: "cp_1", made: true, image: "/9j/AFTER", caption: "c", circles: 1 })], proven());
    expect(noBefore.receipt?.visual).toEqual({ image: "/9j/AFTER", caption: "c" });
  });
  test("Keep closes the result (Home goes back to rest, the fix stays in History); never while an Undo runs or work goes on", () => {
    const m = proven();
    const kept = run([ev({ type: "ui.resultKept" })], m);
    expect([kept.receipt, kept.task]).toEqual([null, null]);
    expect(run([ev({ type: "ui.resultKept" })], { ...m, undo: { stage: "working", checkpoint: "cp_1" } as never }).receipt).not.toBeNull();
    expect(run([ev({ type: "ui.resultKept" })], run(task())).task).not.toBeNull();
  });
});
