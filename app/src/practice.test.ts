// The practice projects, as Home follows them: one catalog (app/sample/practices.json), each practice from start to found
// to fixed to done, the ways it can fail or be blocked, the record of what was done, and the words. The reducer is fed the
// events the engine really records from each sample (protocol/fixtures/practice-found.jsonl, checked against the engine in
// runner/test/practice-e2e.test.ts), so the two agree.
import { describe, expect, test } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseCommand, serialize } from "../../protocol/index.ts";
import { DEFAULT_MODEL, SETTINGS_LESSON_ID, VERCEL_LESSON_ID, fixFound } from "./commands.ts";
import { VERCEL_LESSON } from "../../runner/src/lessongen.ts";
import { FIX_ASK, PRACTICE_BUDGET_USD } from "../../runner/src/fixfound.ts";
import { canFollowUp, canRetry, initial, lessonWordsOnly, reduce, type Model } from "./model.ts";
import { defaultOf } from "../../protocol/settings.ts";
import { COPY_BASE, CATALOG, FIRST_PRACTICE, usesSmallFix, pointFixRoute, workingOn, backTo, canStart, copyOf, gateFinding, isExpected, lessonsShown, listRows, markFor, nextPractice, nodeMissing, needsMacCheck, practiceNotes, practiceOf, recordFrom, resumeOnOpen, rowState, startOrOpen, type PracticeEntry, type PracticeRecord } from "./practice.ts";
import { S, PRODUCT, PRODUCT_S, NAMES } from "./strings.ts";

const ev = (o: Record<string, unknown>) => ({ v: 1, id: "e", ...o });
const run = (events: Record<string, unknown>[], from: Model = initial()) => events.reduce<Model>((m, e) => reduce(m, e as never), from);
const FOUND = new Map(readFileSync(join(import.meta.dir, "../../protocol/fixtures/practice-found.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => { const x = JSON.parse(l); return [x.practice as string, x.event as Record<string, any>]; }));
const P = (e: PracticeEntry) => `/Users/sam/${COPY_BASE} ${e.copyName}`;
const entry = (id: string) => practiceOf(id)!;
const NO: PracticeRecord = { rows: [], damaged: false };
const start = (e: PracticeEntry, extra: Record<string, unknown> = {}) => ev({ type: "ui.practiceStarted", project: P(e), kind: e.id, ...extra });
// What Find answers for this practice, in its own project (the engine's real event, from the shared fixture).
const found = (e: PracticeEntry): Record<string, any> => ({ ...FOUND.get(e.id)!, project: P(e) });
const cp = (e: PracticeEntry, id = "cp_0001", practice: string | null = e.id) => ev({ type: "checkpoint.created", project: P(e), agent: "builder-1", checkpoint: id, label: `Before: ${PRODUCT} checked this project`, files: 4, skipped: [], ...(practice ? { practice } : {}) });
const receipt = (e: PracticeEntry, proof: string, o: Record<string, unknown> = {}) => ev({ type: "receipt", agent: "builder-1", checkpoint: "cp_0001", changed: [{ file: "x.js", kind: "modified" }], commands: 1, notUndoable: [], proof, usdEstimate: 0.12, practice: e.id, ...o });
const gates = (e: PracticeEntry, blocked: boolean) => ev({ type: "ship.gates", project: P(e), canShip: false, gates: blocked ? FOUND.get("open-table")!.gates : [{ id: "database_access", label: "Database access is protected", status: "could_not_check", detail: "I could not check your live database.", overridable: true }], blockedBy: [], needsYou: [], confirmed: [], allowedCount: 0 });
const passed = (e: PracticeEntry) => ev({ type: "problem.found", project: P(e), agent: "builder-1", verdict: "passed" });
const restored = (e: PracticeEntry, checkpoint: string) => ev({ type: "checkpoint.restored", project: P(e), checkpoint, safety: "s", recovered: [], largeLeftAlone: [], leftAlone: [] });
// The proof of the fix, the way each practice's catalog entry says it is proven.
const proveOk = (e: PracticeEntry) => (e.prove === "gate" ? [gates(e, false)] : e.prove === "checks" ? [passed(e)] : []);
const proveBad = (e: PracticeEntry) => (e.prove === "gate" ? [gates(e, true)] : e.prove === "checks" ? [found(e)] : []);
// The fix: a task (Fix it with me), or the setting's lesson.
const fix = (e: PracticeEntry, ok: boolean) => (e.fix === "lesson"
  ? [ev({ type: "ui.practiceLesson", walk: "w1" }), ev({ type: "walk.done", walk: "w1", project: P(e), lesson: SETTINGS_LESSON_ID, title: "T", steps: 3 })]
  : [ev({ type: "ui.practiceFixing" }), cp(e), receipt(e, ok || e.prove === "gate" ? "passed" : "failed")]);

describe("one catalog for every practice", () => {
  test("five practices, in order, each with its words and a folder the shell copies from the same file", () => {
    expect(CATALOG.map((e) => e.id)).toEqual(["signup", "setting", "route", "import", "open-table"]);
    expect(FIRST_PRACTICE).toBe("signup");
    for (const e of CATALOG) {
      const w = S.practices[e.id];
      for (const k of ["title", "teaches", "start", "foundMore", "doneMore"] as const) expect(w?.[k]?.length ?? 0, `${e.id} ${k}`).toBeGreaterThan(10);
      expect(e.minutes).toBeGreaterThan(0);
    }
    const rust = readFileSync(join(import.meta.dir, "../src-tauri/src/practice.rs"), "utf8");
    expect(rust).toContain('include_str!("../../sample/practices.json")');
  });
  test("only an id in the catalog starts a practice; a missing or unknown one is refused, never taken for the first", () => {
    for (const kind of [undefined, "deploy", "stuck-signup", "Signup", ""]) expect(run([ev({ type: "ui.practiceStarted", project: "/p", ...(kind === undefined ? {} : { kind }) })]).practice, String(kind)).toBeNull();
    expect(practiceOf("deploy")).toBeUndefined();
  });
  test("Found means the file, the line and the words the catalog expects, never only the end of a file name", () => {
    const e = entry("signup"), p = found(e).problem;
    expect(isExpected(e, p)).toBe(true);
    expect(isExpected(e, { ...p, line: 18 })).toBe(false);
    expect(isExpected(e, { ...p, message: "Something else broke" })).toBe(false);
    expect(isExpected(e, { ...p, file: "other/test/signup.test.js.bak" })).toBe(false);
    expect(isExpected(e, { kind: "message", message: "/api/signup", from: "tests" })).toBe(false);
  });
});

describe("each practice from start to done", () => {
  for (const e of CATALOG) {
    test(`${e.id}: start, found, fixed, done`, () => {
      let m = run([start(e)]); expect(m.practice).toMatchObject({ kind: e.id, stage: "start", project: P(e) });
      m = run([found(e)], m); expect(m.practice).toMatchObject({ stage: "found", where: { file: e.expect.file, line: e.expect.line } });
      expect(m.practice!.problem).toMatchObject({ kind: "line", file: e.expect.file, line: e.expect.line });
      m = run(fix(e, true), m);
      if (e.prove !== "receipt") { expect(m.practice?.stage).toBe("proving"); m = run(proveOk(e), m); }
      expect(m.practice?.stage).toBe("done");
    });
    test(`${e.id}: start, found, a fix that did not pass is told plainly and can be tried again`, () => {
      let m = run([start(e), found(e), ...fix(e, false)]);
      if (e.prove !== "receipt") m = run(proveBad(e), m);
      expect(m.practice?.stage).toBe("failed");
      m = run([ev({ type: e.fix === "lesson" ? "ui.practiceLesson" : "ui.practiceFixing" })], m);
      expect(m.practice?.stage).toBe(e.fix === "lesson" ? "lesson" : "fixing");
    });
    test(`${e.id}: a different failure is blocked, and says whether the check could not run or fails somewhere else`, () => {
      if (e.find === "gate") {
        const other = run([start(e), ev({ ...gates(e, true), gates: [{ id: "database_access", label: "L", status: "blocked", detail: "x", findings: ["orders"] }] })]);
        expect(other.practice).toMatchObject({ stage: "blocked", block: "elsewhere" });
        expect(run([start(e), gates(e, false)]).practice).toMatchObject({ stage: "blocked", block: "nothing" });
        expect(run([start(e), ev({ ...gates(e, true), gates: [] })]).practice).toMatchObject({ stage: "blocked", block: "couldNotRun" });
        return;
      }
      const elsewhere = run([start(e), ev({ ...found(e), problem: { kind: "line", file: "lib/other.js", line: 9, lineText: "x", message: "boom", from: "tests" } })]);
      expect(elsewhere.practice).toMatchObject({ stage: "blocked", block: "elsewhere", where: { file: "lib/other.js", line: 9 } });
      const noNode = run([start(e), ev({ type: "problem.found", project: P(e), agent: "a", verdict: "failed", label: "Running the tests", detail: "x", problem: { kind: "message", message: "sh: node: command not found", from: "tests" } })]);
      expect(noNode.practice).toMatchObject({ stage: "blocked", block: "couldNotRun", why: "sh: node: command not found" });
    });
  }
  test("Find for the open table is the check before going live, not the key; the other four use the key", () => {
    expect(CATALOG.filter((e) => e.find === "gate").map((e) => e.id)).toEqual(["open-table"]);
    // the key's answer (the checks pass: nothing on the page shows an open table) does not move the open table practice
    expect(run([start(entry("open-table")), passed(entry("open-table"))]).practice?.stage).toBe("start");
  });
  test("an answer about some other project, or a pass on a fresh copy, does not move it on", () => {
    const e = entry("route");
    expect(run([start(e), { ...found(e), project: "/other" }]).practice?.stage).toBe("start");
    expect(run([start(e), passed(e)]).practice?.stage).toBe("start");
    expect(run([start(entry("open-table")), { ...gates(entry("open-table"), true), project: "/other" }]).practice?.stage).toBe("start");
  });
});

describe("a fix that was refused goes back to where it was", () => {
  const e = entry("signup");
  test("the waiting line ends and Fix it with me can be pressed again (Flow switched off between the press and the engine)", () => {
    const fixing = run([start(e), found(e), ev({ type: "ui.practiceFixing" })]);
    expect(fixing.practice?.stage).toBe("fixing");
    const back = run([ev({ type: "ui.practiceFixRefused" })], fixing);
    expect(back.practice?.stage).toBe("found");
    expect(back.practice?.problem).toEqual(fixing.practice?.problem);
  });
  test("it changes nothing when the practice is not fixing", () => {
    const at = run([start(e), found(e)]);
    expect(run([ev({ type: "ui.practiceFixRefused" })], at)).toEqual(at);
  });
});

describe("the fix is the practice's own task, matched by its practice id", () => {
  const e = entry("signup");
  test("only a receipt carrying this practice's id finishes it, never one from another task or another practice", () => {
    const at = run([start(e), found(e), ev({ type: "ui.practiceFixing" })]);
    expect(run([cp(e, "cp_9", null), receipt(e, "passed", { practice: undefined, checkpoint: "cp_9" })], at).practice?.stage).toBe("fixing");
    expect(run([cp(e, "cp_9", "route"), receipt(e, "passed", { practice: "route", checkpoint: "cp_9" })], at).practice?.stage).toBe("fixing");
    expect(run([cp(e), receipt(e, "passed")], at).practice).toMatchObject({ stage: "done", checkpoint: "cp_0001", result: { proof: "passed", checkpoint: "cp_0001" } });
    // A receipt that comes before the fix was pressed is not the fix.
    expect(run([start(e), found(e), receipt(e, "passed")]).practice?.stage).toBe("found");
  });
  test("Try again from the result on Now (a follow up of the same task) is still the practice's fix", () => {
    const failed = run([start(e), found(e), ...fix(e, false)]);
    expect(failed.practice?.stage).toBe("failed");
    const again = run([cp(e, "cp_0002"), receipt(e, "passed", { checkpoint: "cp_0002" })], failed);
    expect(again.practice).toMatchObject({ stage: "done", checkpoint: "cp_0002" });
    // A task of another practice, or none, still never touches it.
    expect(run([cp(e, "cp_0003", null)], failed).practice?.stage).toBe("failed");
  });
  // Merge of main (PR 120): a task that ends on a question ends as needs you, with the question on its receipt, and is
  // answered in the follow up box. A practice's fix that asks is not passed, says what it asked, and its answer (a follow up
  // of the same task, carrying the practice id) is still the practice's fix.
  test("a fix that stops to ask is answered in the follow up box on Now, and the answer is still the practice's fix", () => {
    const Q = "The form could post to /api/register or /api/signup. Which one does your server use?";
    const state = (s: string) => ev({ type: "agent.state", agent: "builder-1", state: s });
    const asked = run([start(e), found(e), ev({ type: "ui.practiceFixing" }), cp(e), state("working"), receipt(e, "skipped", { changed: [], commands: 0, said: Q, asks: true }), state("needsYou")]);
    expect(asked.practice).toMatchObject({ stage: "failed", result: { asks: Q } });
    expect(asked.practice?.checksFailed).toBeUndefined();
    expect(canFollowUp(asked, P(e))).toBe(true);
    expect(canRetry(asked, P(e))).toBe(false);
    const answered = run([ev({ type: "ui.followUpSent" }), cp(e, "cp_0002"), state("working"), receipt(e, "passed", { checkpoint: "cp_0002" }), state("done")], asked);
    expect(answered.practice).toMatchObject({ stage: "done", checkpoint: "cp_0002" });
    expect(answered.practice?.result?.asks).toBeUndefined();
    // Words only: a receipt that says something without asking leaves nothing to answer.
    expect(run([start(e), found(e), ev({ type: "ui.practiceFixing" }), cp(e), receipt(e, "failed", { said: "I changed the form." })]).practice?.result?.asks).toBeUndefined();
  });
  test("the panel says what the fix asked and where to answer it, with Answer it first", () => {
    const panel = readFileSync(join(import.meta.dir, "./practicePanel.tsx"), "utf8");
    const failed = panel.slice(panel.indexOf('p.stage === "failed" && <>'));
    expect(failed).toContain("S.receiptAsks");
    expect(failed).toContain("S.practiceAsksHelp");
    expect(failed).toMatch(/asks && <button className="btn primary" type="button" onClick=\{act\.showResult\}>\{S\.practiceAnswer\}/);
    expect(S.practiceAsksHelp).toContain("box under the result");
  });
  test("a fix that changed the practice's own check does not count, even when the checks pass", () => {
    const m = run([start(e), found(e), ev({ type: "ui.practiceFixing" }), cp(e), receipt(e, "passed", { changed: [{ file: "test/signup.test.js", kind: "modified" }, { file: "public/signup.js", kind: "modified" }] })]);
    expect(m.practice).toMatchObject({ stage: "failed", result: { protectedChanged: ["test/signup.test.js"] } });
  });
  test("passed with a check that could not run (no browser) is done, and says so", () => {
    expect(run([start(e), found(e), ev({ type: "ui.practiceFixing" }), cp(e), receipt(e, "partial")]).practice).toMatchObject({ stage: "done", gaps: true });
  });
  test("an error or the engine restarting while fixing ends it as not passed; it never waits forever", () => {
    for (const bad of [ev({ type: "protocol.error", reason: "That agent is busy" }), ev({ type: "app.runner_restarted" })]) expect(run([start(e), found(e), ev({ type: "ui.practiceFixing" }), bad]).practice?.stage).toBe("failed");
    expect(run([start(e), ev({ type: "protocol.error", reason: "x" })]).practice?.stage).toBe("start");
  });
  // Found in the M11 audit (A55): any refusal while the fix ran (the Point at the problem key, which the practice teaches,
  // or Check before going live with checks) marked the practice failed while its fix kept running, and the passing receipt
  // was then dropped, so it never reached Done.
  test("once its task has begun, a refusal of another command does not end the fix; its receipt does", () => {
    for (const refused of [ev({ type: "protocol.error", agent: "builder-1", reason: `${PRODUCT} is already working on this project. Wait for it to finish, or press Stop.` }), ev({ type: "protocol.error", reason: "A task is still working on this project. Wait for it to finish, or press Stop, then check it." })]) {
      const m = run([start(e), found(e), ev({ type: "ui.practiceFixing" }), cp(e), refused]);
      expect(m.practice?.stage).toBe("fixing");
      expect(run([receipt(e, "passed")], m).practice).toMatchObject({ stage: "done" });
    }
  });
  test("the engine failing the fix's own request still ends it", () => {
    const m = run([start(e), found(e), ev({ type: "ui.practiceFixing" }), cp(e), ev({ type: "protocol.error", reason: "could not handle agent.start: boom" })]);
    expect(m.practice?.stage).toBe("failed");
  });
  // Found in review of the A55 fix: the engine catches a task that throws itself, tells the reason for its agent and sets it to
  // error, with no receipt. The fix must end then too, or the practice stayed on fixing and blocked updates and other practices.
  test("the fix's task stopping unexpectedly (the engine's own order of events) ends it as not passed", () => {
    const st = (s: string, agent = "builder-1") => ev({ type: "agent.state", agent, state: s });
    const began = run([start(e), found(e), ev({ type: "ui.practiceFixing" }), cp(e), st("thinking"), st("working")]);
    for (const reason of ["The task stopped unexpectedly (boom). Look at your project, and use Undo if something is not right.", "The task could not start (boom). Nothing in your project was changed."]) {
      expect(run([ev({ type: "protocol.error", agent: "builder-1", reason }), st("error")], began).practice?.stage).toBe("failed");
    }
    // Stopped: the agent rests with no receipt.
    expect(run([st("idle")], began).practice?.stage).toBe("failed");
    // Another agent resting, or the fix's own receipt and then its end, change nothing more.
    expect(run([st("idle", "checker-1")], began).practice?.stage).toBe("fixing");
    expect(run([receipt(e, "passed"), st("done")], began).practice?.stage).toBe("done");
    expect(run([receipt(e, "failed"), st("error")], began).practice?.stage).toBe("failed");
  });
  test("Undo of the practice's own fix puts it back to found, with Try again; another undo does nothing to it", () => {
    const done = run([start(e), found(e), ev({ type: "ui.practiceFixing" }), cp(e), receipt(e, "passed")]);
    expect(run([restored(e, "cp_0042")], done).practice?.stage).toBe("done");
    const undone = run([restored(e, "cp_0001")], done);
    expect(undone.practice).toMatchObject({ stage: "found", undone: true });
    expect(undone.practice?.result).toBeUndefined();
    expect(run([ev({ type: "ui.practiceFixing" })], undone).practice).toMatchObject({ stage: "fixing", undone: undefined });
  });
  test("the fix is the shipped request on its own small cap and the usual model, whatever Settings say, and names its practice", () => {
    const m = run([start(e), found(e)]);
    const c = fixFound(P(e), { label: m.practice!.label, detail: m.practice!.where?.message, problem: m.practice!.problem }, { practice: e.id }) as any;
    expect(parseCommand(serialize(c)).ok).toBe(true);
    expect(c).toMatchObject({ type: "agent.start", project: P(e), mode: "drive", budgetUsd: PRACTICE_BUDGET_USD, model: DEFAULT_MODEL, practice: "signup" });
    expect(PRACTICE_BUDGET_USD).toBe(0.6);
    expect(c.prompt.endsWith(FIX_ASK)).toBe(true);
    expect(c.prompt).toContain("test/signup.test.js, line 17");
    expect(c.offTheRecord).toBeUndefined();   // on the record: it gets Explain, a picture and a place in What I did
  });
});

describe("the checks after a lesson or a fix can always be left or run again (bug 2)", () => {
  const s = entry("setting"), t = entry("open-table");
  const proving = (e: PracticeEntry) => run([start(e), found(e), ...fix(e, true)]);
  test("a check that was cancelled (busy, or the checker stopped) or an error moves it to failed, with Run the checks again", () => {
    for (const e of [s, t]) {
      const bad = e.prove === "checks" ? ev({ type: "problem.found", project: P(e), agent: "a", verdict: "cancelled" }) : ev({ type: "protocol.error", reason: "A task is still working on this project." });
      const m = run([bad], proving(e));
      expect(m.practice, e.id).toMatchObject({ stage: "failed", checksFailed: true });
      expect(run([ev({ type: "ui.practiceProving" })], m).practice?.stage, e.id).toBe("proving");
    }
    expect(run([ev({ type: "protocol.error", reason: "x" })], proving(s)).practice).toMatchObject({ stage: "failed", checksFailed: true });
  });
  test("a refusal for the agent while the checks run (the key pressed again) does not end them", () => {
    for (const e of [s, t]) expect(run([ev({ type: "protocol.error", agent: "builder-1", reason: "That agent is already working. Wait for it to finish, or press Stop." })], proving(e)).practice?.stage, e.id).toBe("proving");
  });
  test("the key pressed while the checks run sends no second Find, whose refusal would end them before their answer", () => {
    // What a second Find would bring: the engine refuses it and answers "cancelled", which ends the checks still running.
    expect(run([ev({ type: "problem.found", project: P(s), agent: "builder-1", verdict: "cancelled" })], proving(s)).practice?.stage).toBe("failed");
    const card = readFileSync(join(import.meta.dir, "./card.tsx"), "utf8");
    const key = card.slice(card.indexOf("latest.current.find = (payload: unknown) => {"), card.indexOf("const findFromHome ="))   // the key and the chip share it;
    expect(key).toContain('if (nowModel.current.point?.stage === "checking") { homeDispatch({ type: "pick", tab: "now" }); return; }');
    expect(key.indexOf('nowModel.current.point?.stage === "checking"')).toBeLessThan(key.indexOf("sendOrExplain(findProblem("));
  });
  test("the person can stop the checks; then they can run them again", () => {
    const m = run([ev({ type: "ui.practiceStopProving" })], proving(s));
    expect(m.practice).toMatchObject({ stage: "failed", checksFailed: true });
    expect(run([ev({ type: "ui.practiceStopProving" })], run([start(s)])).practice?.stage).toBe("start");
  });
  test("Run the checks again is only for a practice whose checks did not run, or a setting whose name is there but the value is not", () => {
    const e = entry("signup");
    expect(run([start(e), found(e), ev({ type: "ui.practiceProving" })]).practice?.stage).toBe("found");
    const failedFix = run([start(e), found(e), ...fix(e, false)]);
    expect(run([ev({ type: "ui.practiceProving" })], failedFix).practice?.stage).toBe("failed");
  });
});

describe("the missing setting practice's lesson", () => {
  const e = entry("setting");
  const begin = start(e), foundSetting = found(e);
  const lessonDone = ev({ type: "walk.done", walk: "w1", project: P(e), lesson: SETTINGS_LESSON_ID, title: "T", steps: 3 });
  test("only that lesson finishing in that project moves it on; stopping the lesson goes back to the start of the fix", () => {
    const m = run([begin, foundSetting, ev({ type: "ui.practiceLesson" })]);
    expect(run([ev({ ...lessonDone, project: "/other" })], m).practice?.stage).toBe("lesson");
    expect(run([ev({ ...lessonDone, lesson: "vercel-add-env-var" })], m).practice?.stage).toBe("lesson");
    const walking = run([ev({ type: "ui.walkRequested", walk: "w1" }), ev({ type: "walk.step", walk: "w1", project: P(e), lesson: SETTINGS_LESSON_ID, title: "T", index: 0, total: 3, variant: "main", say: "s", find: "f", ask: false })], m);
    expect(run([ev({ type: "walk.stopped", walk: "w1", reason: "Stopped." })], walking).practice?.stage).toBe("found");
  });
  test("the engine restarting during the lesson or the second check goes back to the start of the fix, never waits forever", () => {
    for (const at of [[ev({ type: "ui.practiceLesson" })], [ev({ type: "ui.practiceLesson" }), lessonDone]]) expect(run([begin, foundSetting, ...at, ev({ type: "app.runner_restarted" })]).practice?.stage).toBe("found");
  });
  test("a lesson that cannot even start (the name is already in the file) does not leave it waiting: the checks run again", () => {
    const tryLesson = [ev({ type: "ui.walkRequested", walk: "w7" }), ev({ type: "ui.practiceLesson", walk: "w7" })];
    let m = run([begin, foundSetting, ...tryLesson]);
    m = run([ev({ type: "walk.stopped", walk: "w7", reason: "Every setting this project's code reads is already set, so there is nothing to walk through." })], m);
    expect(m.practice).toMatchObject({ stage: "proving", nameSet: true });
    expect(m.walk).toBeNull();
    m = run([foundSetting], m);
    expect(m.practice).toMatchObject({ stage: "failed", nameSet: true });
    m = run([ev({ type: "ui.practiceProving" })], m);
    expect(run([passed(e)], m).practice?.stage).toBe("done");
  });
  test("only the practice's own lesson not starting moves it; opening the lesson again clears what was said", () => {
    const m = run([begin, foundSetting, ev({ type: "ui.walkRequested", walk: "w7" }), ev({ type: "ui.practiceLesson", walk: "w7" })]);
    const other = run([ev({ type: "ui.walkRequested", walk: "w9" }), ev({ type: "walk.stopped", walk: "w9", reason: "I could not find that lesson." })], m);
    expect(other.practice?.stage).toBe("lesson");
    const failed = run([ev({ type: "walk.stopped", walk: "w7", reason: "x" }), foundSetting], m);
    expect(failed.practice?.nameSet).toBe(true);
    expect(run([ev({ type: "ui.practiceLesson", walk: "w10" })], failed).practice).toMatchObject({ stage: "lesson", nameSet: undefined });
  });
  test("a task practice never waits on a lesson, and the lesson practice never starts a task", () => {
    expect(run([start(entry("signup")), found(entry("signup")), ev({ type: "ui.practiceLesson" })]).practice?.stage).toBe("found");
    expect(run([begin, foundSetting, ev({ type: "ui.practiceFixing" })]).practice?.stage).toBe("found");
  });
});

describe("closing, stopping and opening a copy again", () => {
  const e = entry("import");
  test("closing, Stop everything and changing to another project end it; the practice project becoming current does not", () => {
    for (const end of [ev({ type: "ui.practiceClosed" }), { v: 1, id: "k", type: "app.stop_everything" }, ev({ type: "ui.projectChanged", project: "/other" })]) expect(run([start(e), end]).practice).toBeNull();
    expect(run([start(e), ev({ type: "ui.projectChanged", project: P(e) })]).practice?.stage).toBe("start");
  });
  test("a copy opened again starts over at Find, and a copy already fixed says so instead of pretending", () => {
    expect(run([start(e, { resumed: true }), found(e)]).practice).toMatchObject({ stage: "found", resumed: true });
    expect(run([start(e, { resumed: true }), passed(e)]).practice).toMatchObject({ stage: "done", already: true });
    const t = entry("open-table");
    expect(run([start(t, { resumed: true }), gates(t, false)]).practice).toMatchObject({ stage: "done", already: true });
  });
  test("it remembers the folder used before it, for Back to my project", () => {
    expect(run([start(e, { previous: "/Users/sam/shop" })]).practice?.previous).toBe("/Users/sam/shop");
  });
});

// Review fix (20 Oct 2026): the record is read again after every practice action, every mark and each time Learn opens, so
// bringing a copy's practice back on every new record made a closed panel come back by itself and run Find again unasked.
describe("a copy opened again comes back once per visit, so a closed practice stays closed", () => {
  const e = entry("import");
  const card = readFileSync(join(import.meta.dir, "./card.tsx"), "utf8");
  const r = recordFrom({ practices: [{ id: "import", path: P(e), there: true }] });
  test("opening the copy brings it back once; a record read again after the person closed it brings back nothing", () => {
    const first = resumeOnOpen(P(e), r, null, "");
    expect(first).toEqual({ resume: "import", seen: P(e) });
    // Skip the practice, Close or Stop the fix, then the record is read again (Learn opened, an action, a mark)
    const later = recordFrom({ practices: [{ id: "import", path: P(e), there: true, started: "2026-10-20", found: "2026-10-20" }] });
    expect(resumeOnOpen(P(e), later, null, first.seen)).toEqual({ resume: null, seen: P(e) });
    // the record not read yet: nothing yet, and the visit is not counted as handled
    expect(resumeOnOpen(P(e), NO, null, "")).toEqual({ resume: null, seen: "" });
    // the practice already open in this copy (it was just started): handled, never started a second time
    expect(resumeOnOpen(P(e), r, run([start(e)]).practice, "")).toEqual({ resume: null, seen: P(e) });
    // the person's own folder, or no folder
    expect(resumeOnOpen("/Users/sam/shop", r, null, "").resume).toBeNull();
    expect(resumeOnOpen("", r, null, "").resume).toBeNull();
    // opened again on another visit (the folder changed in between, so the card forgot what it handled): it comes back
    expect(resumeOnOpen(P(e), r, null, "").resume).toBe("import");
  });
  test("the card forgets what it handled only when the folder changes, so Find runs by itself at most once per visit", () => {
    expect(card).toContain("resumeOnOpen(project, practiceRec, nowModel.current.practice, resumeSeen.current)");
    const reset = 'useEffect(() => { resumeSeen.current = ""; resumedKey.current = ""; }, [project]);';
    expect(card).toContain(reset);
    expect(card.indexOf(reset)).toBeLessThan(card.indexOf("resumeOnOpen(project"));   // effects run in order: forget, then look
    // Find's own key is forgotten only there and when Continue is pressed for the copy already open (a press)
    expect(card.match(/resumedKey\.current = ""/g)?.length).toBe(2);
  });
  test("Continue on the copy already open brings its practice back, since opening the same folder again changes nothing", () => {
    const body = card.slice(card.indexOf("const continuePractice = "), card.indexOf("\n  };", card.indexOf("const continuePractice = ")));
    expect(body).toContain('if (project && copyOf(practiceRec, project) === id) { resumedKey.current = ""; dispatch({ type: "ui.practiceStarted", project, kind: id, resumed: true }); return; }');
    expect(body).toContain('invoke("open_practice", { which: id })');
  });
});

// Review fix (20 Oct 2026): Next on a practice in progress made a second copy, and the record forgot the first one, so it
// could never be removed or listed again.
describe("a practice whose copy is still there is opened, never copied a second time", () => {
  const card = readFileSync(join(import.meta.dir, "./card.tsx"), "utf8");
  const rt = entry("route");
  test("Next, Start and the first run open the copy that is there; only a practice with no copy left is copied", () => {
    expect(startOrOpen(recordFrom({ practices: [{ id: "route", path: P(rt), there: true }] }), "route")).toBe("open");
    expect(startOrOpen(recordFrom({ practices: [{ id: "route", path: P(rt), there: true, done: "2026-10-20" }] }), "route")).toBe("open");
    expect(startOrOpen(recordFrom({ practices: [{ id: "route", path: P(rt), there: false }] }), "route")).toBe("start");
    expect(startOrOpen(NO, "route")).toBe("start");
    // Next after the import practice, with the route practice left half way: its copy opens
    const rec2 = recordFrom({ practices: [{ id: "import", path: P(entry("import")), there: true, done: "2026-10-20" }, { id: "signup", there: false, done: "2026-10-19" }, { id: "setting", there: false, done: "2026-10-19" }, { id: "route", path: P(rt), there: true }] });
    expect(nextPractice(rec2, "import")?.id).toBe("open-table");
    expect(startOrOpen(rec2, nextPractice(rec2, "signup")!.id)).toBe("open");
  });
  test("the card asks first, so every way to start a practice goes through it", () => {
    const body = card.slice(card.indexOf("const beginPractice = "), card.indexOf("\n  };", card.indexOf("const beginPractice = ")));
    expect(body).toContain('if (startOrOpen(practiceRec, id) === "open") { continuePractice(id); return; }');
    expect(body.indexOf("startOrOpen")).toBeLessThan(body.indexOf('invoke("create_practice"'));
  });
});

describe("the record and the list on Learn", () => {
  const rec = (rows: unknown[], damaged = false): PracticeRecord => recordFrom({ practices: rows, damaged });
  test("the shell's list is checked: only catalog ids, real days and text paths", () => {
    const r = rec([{ id: "signup", path: `/Users/sam/${COPY_BASE} signup page`, there: true, started: "2026-10-19", done: "yesterday" }, { id: "deploy", there: true }, null, { id: "route", path: 3, there: "yes" }]);
    expect(r.rows).toEqual([{ id: "signup", path: `/Users/sam/${COPY_BASE} signup page`, there: true, started: "2026-10-19" }, { id: "route", there: false }]);
    expect(recordFrom(null)).toEqual({ rows: [], damaged: false });
    expect(recordFrom({ practices: [], damaged: true }).damaged).toBe(true);
  });
  test("each row is not started, in progress (its copy is there) or a plain Done, never a score", () => {
    expect(rowState(undefined)).toBe("notStarted");
    expect(rowState({ id: "signup", there: false, path: "/x" })).toBe("notStarted");
    expect(rowState({ id: "signup", there: true, path: "/x" })).toBe("inProgress");
    expect(rowState({ id: "signup", there: false, done: "2026-10-19" })).toBe("done");
    expect(Object.values(S.practiceState)).toEqual(["Not started", "In progress", "Done"]);
    for (const w of [...Object.values(S.practiceState), S.practiceDone, ...CATALOG.map((e) => S.practices[e.id].doneMore)]) expect(w).not.toMatch(/great|awesome|well done|streak|badge|score|points|%|congrat|amazing/i);
  });
  test("the list is in catalog order with the title, what it teaches, about how long, the cost and Needs Node when Node is missing", () => {
    const rows = listRows(rec([{ id: "route", path: `/Users/sam/${COPY_BASE} missing page`, there: true }]), null);
    expect(rows.map((r) => r.entry.id)).toEqual(CATALOG.map((e) => e.id));
    expect(rows.find((r) => r.entry.id === "route")!.state).toBe("inProgress");
    expect(rows[0]).toMatchObject({ title: "A Join button that fails", time: "About 2 minutes", cost: "About 20 cents on your key", needsNode: false });
    expect(rows[1].cost).toBe("Free, no Claude");
    const noNode = [{ id: "node", label: "Node", ok: false, detail: "Node is not installed.", fix: "Install it from nodejs.org.", missing: true as const }];
    expect(listRows(NO, noNode).every((r) => r.needsNode)).toBe(true);
    // An old Node still runs node --test: no wait for it.
    expect(listRows(NO, [{ id: "node", label: "Node", ok: false, detail: "Version 18 is too old", fix: "x" }]).some((r) => r.needsNode)).toBe(false);
    expect(nodeMissing(noNode)?.fix).toBe("Install it from nodejs.org.");
  });
  test("the Mac is checked again while Node is flagged missing (after it was installed), never again once Node is there", () => {
    const noNode = [{ id: "node", label: "Node", ok: false, detail: "x", missing: true as const }];
    const fine = [{ id: "node", label: "Node", ok: true, detail: "Node 22" }];
    expect(needsMacCheck(null)).toBe(true);
    expect(needsMacCheck(noNode)).toBe(true);
    expect(needsMacCheck(fine)).toBe(false);
    // An old Node is not a missing Node: nothing to wait for.
    expect(needsMacCheck([{ id: "node", label: "Node", ok: false, detail: "Version 18 is too old", fix: "x" }])).toBe(false);
  });
  test("a practice starts only while nothing is working, and only with Node when it needs it", () => {
    const e = entry("signup"), noNode = [{ id: "node", label: "Node", ok: false, detail: "x", missing: true as const }];
    expect(canStart(false, e, null)).toBe(true);
    expect(canStart(true, e, null)).toBe(false);
    expect(canStart(false, e, noNode)).toBe(false);
  });
  test("after a practice: the next one not done in catalog order, then round to the start, and none when all are done", () => {
    expect(nextPractice(NO, "signup")?.id).toBe("setting");
    expect(nextPractice(rec([{ id: "setting", there: false, done: "2026-10-19" }]), "signup")?.id).toBe("route");
    expect(nextPractice(rec([{ id: "signup", there: false }]), "open-table")?.id).toBe("signup");
    expect(nextPractice(rec(CATALOG.map((e) => ({ id: e.id, there: false, done: "2026-10-19" }))), "import")).toBeNull();
  });
  test("Back to my project is the folder used before, never a practice copy, else the newest folder of the person's own", () => {
    const r = rec([{ id: "signup", path: `/Users/sam/${COPY_BASE} signup page`, there: true }]);
    const recent = [`/Users/sam/${COPY_BASE} signup page`, `/Users/sam/${COPY_BASE} 2`, "/Users/sam/shop", "/Users/sam/blog"];
    expect(backTo("/Users/sam/blog", recent, r)).toBe("/Users/sam/blog");
    expect(backTo(undefined, recent, r)).toBe("/Users/sam/shop");
    expect(backTo(`/Users/sam/${COPY_BASE} signup page`, recent, r)).toBe("/Users/sam/shop");
    expect(backTo("/Users/sam/gone", [`/Users/sam/${COPY_BASE} signup page`], r)).toBeNull();
    expect(copyOf(r, `/Users/sam/${COPY_BASE} signup page`)).toBe("signup");
  });
  test("a copy made under the product's earlier name is still a practice copy for Back to my project", () => {
    const earlier = NAMES.earlierPracticeCopyBases[0];
    expect(earlier).toBeTruthy(); expect(earlier).not.toBe(COPY_BASE);
    const recent = [`/Users/sam/${earlier} signup page`, "/Users/sam/shop"];
    expect(backTo(undefined, recent, rec([]))).toBe("/Users/sam/shop");
  });
  test("the Vercel lesson is left out only in a practice copy, which is never on Vercel", () => {
    expect(VERCEL_LESSON_ID).toBe(VERCEL_LESSON);
    const r = rec([{ id: "setting", path: `/Users/sam/${COPY_BASE} missing setting`, there: true }]);
    const lessons = [{ id: SETTINGS_LESSON_ID }, { id: VERCEL_LESSON_ID }, { id: "lovable-publish" }];
    expect(lessonsShown(lessons, `/Users/sam/${COPY_BASE} missing setting`, r, VERCEL_LESSON_ID).map((l) => l.id)).toEqual([SETTINGS_LESSON_ID, "lovable-publish"]);
    expect(lessonsShown(lessons, "/Users/sam/shop", r, VERCEL_LESSON_ID)).toEqual(lessons);
  });
});

describe("beta numbers and the record count each stage once", () => {
  const e = entry("route");
  const at = (...events: Record<string, unknown>[]) => run(events).practice;
  test("started, found and done, each once; an opened copy is not a new start, and Undo then found is not found again", () => {
    const s0 = at(start(e)), s1 = at(start(e), found(e));
    expect(practiceNotes(null, s0)).toEqual(["practice_started"]);
    expect(practiceNotes(s0, s1)).toEqual(["practice_found"]);
    expect(practiceNotes(s1, s1)).toEqual([]);
    const done = at(start(e), found(e), ...fix(e, true));
    expect(practiceNotes(at(start(e), found(e), ev({ type: "ui.practiceFixing" })), done)).toEqual(["practice_done"]);
    expect(practiceNotes(null, at(start(e, { resumed: true })))).toEqual([]);
    const undone = run([restored(e, "cp_0001")], run([start(e), found(e), ...fix(e, true)])).practice;
    expect(practiceNotes(done, undone)).toEqual([]);
    expect(practiceNotes(done, null)).toEqual([]);
  });
  test("the record is told found and done, once each", () => {
    const s1 = at(start(e), found(e)), done = at(start(e), found(e), ...fix(e, true));
    expect(markFor(at(start(e)), s1)).toBe("found");
    expect(markFor(s1, s1)).toBeNull();
    expect(markFor(s1, done)).toBe("done");
    expect(markFor(null, null)).toBeNull();
  });
  test("every count is a name the engine accepts", () => {
    const notes = readFileSync(join(import.meta.dir, "../../runner/src/metrics.ts"), "utf8");
    for (const n of ["practice_started", "practice_found", "practice_done"]) expect(notes).toContain(`"${n}"`);
  });
});

describe("the words are plain and true", () => {
  test("the start words name the real folder of this copy", () => {
    expect(S.practiceStartIn(`${COPY_BASE} signup page 2`, S.practices.signup.start)).toContain(`${COPY_BASE} signup page 2`);
    expect(S.practiceStartIn("x", "y")).not.toContain(`the folder ${COPY_BASE} in`);
  });
  test("Join shows Something went wrong, as the page really does", () => {
    const page = readFileSync(join(import.meta.dir, "../sample/stuck-signup/public/signup.js"), "utf8");
    expect(page).toContain("Something went wrong");
    expect(S.practices.signup.start).toContain("Something went wrong");
    expect(S.practices.signup.start).not.toMatch(/does nothing/);
  });
  test("the setting's words name both files the page reads", () => {
    const code = readFileSync(join(import.meta.dir, "../sample/stuck-setting/settings.js"), "utf8");
    expect(code).toContain('".env.local", ".env"');
    expect(S.practiceSettingNameSet).toContain(".env.local or .env");
  });
  test("blocked says which it is: the check could not run (with what to install), or it fails somewhere else", () => {
    expect(S.practiceBlocked.couldNotRun).toMatch(/could not run/);
    expect(S.practiceBlocked.elsewhere).toMatch(/somewhere else/);
    expect(S.practiceBlocked.elsewhere).toMatch(/Start over/);
    expect(S.practiceBlocked.nothing).toMatch(/Start over/);
    expect(S.practiceBlocked.elsewhere).not.toMatch(/Node/);
  });
  test(`the first run says ${PRODUCT} will copy the project, before any copy exists`, () => {
    expect(S.obPracticeHelp).toMatch(/will copy/);
    expect(S.obPracticeHelp).not.toMatch(new RegExp(`${PRODUCT} made`));
  });
  test("for signup and route the ring is on the check that fails, and the words say so", () => {
    for (const id of ["signup", "route"]) { expect(entry(id).expect.file.startsWith("test/")).toBe(true); expect(S.practices[id].foundMore).toMatch(/check that fails/); }
  });
  test("the open table's done words say the live database is checked once it is connected", () => {
    expect(S.practices["open-table"].doneMore).toMatch(/live database/);
  });
  test(`the copy's house rule is said to be ${PRODUCT_S}, not the person's`, () => {
    expect(S.practiceRulesNote).toMatch(new RegExp(`${PRODUCT} added`));
  });
});

describe("the open table's gate", () => {
  const t = entry("open-table");
  test("found is the catalog's findings, with the line that makes the table to point at", () => {
    const g = gateFinding(t, FOUND.get("open-table")!.gates);
    expect(g).toMatchObject({ state: "found", label: "Database access is protected", problem: { kind: "line", file: t.expect.file, line: t.expect.line, from: "ship" } });
    expect(gateFinding(t, []).state).toBe("missing");
    expect(gateFinding(t, [{ id: "database_access", status: "passed" }]).state).toBe("clear");
    expect(gateFinding(t, [{ id: "database_access", status: "blocked", findings: ["notes", "orders"] }]).state).toBe("other");
    expect(gateFinding(t, "nonsense").state).toBe("missing");
  });
  // Review fix (20 Oct 2026): a fix that turns row level security on but adds a rule that says "true" leaves the table open.
  // The files only check then says could_not_check with that table in its findings, which is not "no table is open".
  const cnc = (findings?: string[]) => [{ id: "database_access", label: "Database access is protected", status: "could_not_check", detail: findings?.length ? `${findings.join(", ")} can be read or changed by anyone, signed in or not, because of a rule that says "true".` : "The tables in your migration files are protected, but I could not check your live database.", overridable: true, ...(findings ? { findings } : {}) }];
  test("clear only when no table is open in the files: a rule that says true, another open table or no Supabase at all is not fixed", () => {
    expect(gateFinding(t, cnc()).state).toBe("clear");
    expect(gateFinding(t, cnc([])).state).toBe("clear");
    expect(gateFinding(t, cnc(["notes"]))).toMatchObject({ state: "other", detail: expect.stringContaining("notes can be read") });
    expect(gateFinding(t, cnc(["profiles"])).state).toBe("other");
    expect(gateFinding(t, [{ id: "database_access", label: "L", status: "not_applicable", detail: "This project does not use Supabase." }]).state).toBe("other");
    expect(gateFinding(t, [{ id: "database_access", label: "L", status: "something new", detail: "x" }]).state).toBe("other");
  });
  test("after its fix, a table still open by a rule that says true ends in failed with the check's words, never done", () => {
    const proving = run([start(t), found(t), ...fix(t, true)]);
    expect(proving.practice?.stage).toBe("proving");
    const m = run([ev({ ...gates(t, false), gates: cnc(["notes"]) })], proving);
    expect(m.practice?.stage).toBe("failed");
    expect(m.practice?.where?.message).toContain("notes can be read");   // the panel shows it under the failed words
    expect(run([ev({ ...gates(t, false), gates: [{ id: "database_access", label: "L", status: "not_applicable", detail: "This project does not use Supabase." }] })], proving).practice?.stage).toBe("failed");
    expect(run([ev({ ...gates(t, false), gates: cnc() })], proving).practice?.stage).toBe("done");
  });
  test("a copy opened again whose table is still open by such a rule is not already fixed, and says what the check found", () => {
    const m = run([start(t, { resumed: true }), ev({ ...gates(t, false), gates: cnc(["notes"]) })]);
    expect(m.practice).toMatchObject({ stage: "blocked", block: "elsewhere" });
    expect(m.practice?.already).toBeUndefined();
    expect(m.practice?.where?.message).toContain("notes can be read");
    // blocked on another table: the panel shows what the check says, not an empty line
    expect(run([start(t), ev({ ...gates(t, true), gates: [{ id: "database_access", label: "L", status: "blocked", detail: "This table is open to anyone with your site address: orders.", findings: ["orders"] }] })]).practice?.where?.message).toContain("orders");
  });
  test("with the real check on a copy of the sample: the fix with a rule that says true is failed, the real fix is done", async () => {
    const { rlsGate } = await import("../../runner/src/ship/rls.ts");
    const dir = mkdtempSync(join(tmpdir(), "companion-opentable-"));
    try {
      const copy = join(dir, "copy");
      cpSync(join(import.meta.dir, "../sample/stuck-open-table"), copy, { recursive: true });
      const proving = run([start(t), found(t), ...fix(t, true)]);
      const after = async (sql: string) => {
        writeFileSync(join(copy, "supabase/migrations/20261003090000_protect_notes.sql"), sql);
        return run([ev({ ...gates(t, false), gates: [await rlsGate({ project: copy })] })], proving).practice;
      };
      const wide = await after('alter table public.notes enable row level security;\ncreate policy "Anyone reads notes" on public.notes for select using (true);\n');
      expect(wide).toMatchObject({ stage: "failed", where: { message: expect.stringContaining("notes") } });
      const right = await after('alter table public.notes enable row level security;\ncreate policy "Each person reads their own notes" on public.notes for select to authenticated using ((select auth.uid()) = user_id);\n');
      expect(right?.stage).toBe("done");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe("Point at the problem's own Fix it (point.fixWith)", () => {
  test("looks deeper first (Rescue), as before, unless Settings says one small checked fix, and then only for one line", () => {
    expect(defaultOf("point.fixWith")).toBe("rescue");
    const line = FOUND.get("route")!.problem;
    expect(usesSmallFix("rescue", line)).toBe(false);
    expect(usesSmallFix(undefined, line)).toBe(false);
    expect(usesSmallFix("smallFix", line)).toBe(true);
    expect(usesSmallFix("smallFix", { kind: "message", message: "x", from: "deploy" })).toBe(false);
    expect(usesSmallFix("smallFix", undefined)).toBe(false);
  });
  test("its small fix is the same shipped request as the practice's, on the usual task budget and work model", () => {
    const c = fixFound("/p", { label: "Running the tests", detail: "d", problem: FOUND.get("route")!.problem }) as any;
    expect(c.prompt.endsWith(FIX_ASK)).toBe(true);
    expect(c.practice).toBeUndefined();
    expect(c.budgetUsd).toBe(3);
  });
});

describe("on a practice copy, Point at the problem's Fix it is the practice's own fix (item 8)", () => {
  const e = entry("route"), s = entry("setting");
  const card = readFileSync(join(import.meta.dir, "./card.tsx"), "utf8");
  test("found or failed in its own copy: the practice's small fix, whatever point.fixWith says; anything else as usual", () => {
    const at = run([start(e), found(e)]), p = at.practice!.problem;
    for (const choice of ["rescue", "smallFix", undefined]) expect(pointFixRoute(choice, p, at.practice, P(e)), String(choice)).toBe("practice");
    const failed = run([start(e), found(e), ...fix(e, false)]);
    expect(pointFixRoute("rescue", p, failed.practice, P(e))).toBe("practice");
    // another folder, the lesson practice (its fix is the person's), a practice not found yet or already fixing: as usual
    expect(pointFixRoute("rescue", p, at.practice, "/Users/sam/shop")).toBe("rescue");
    expect(pointFixRoute("smallFix", p, at.practice, "/Users/sam/shop")).toBe("smallFix");
    const sf = run([start(s), found(s)]);
    expect(pointFixRoute("rescue", sf.practice!.problem, sf.practice, P(s))).toBe("rescue");
    expect(pointFixRoute("rescue", p, run([start(e)]).practice, P(e))).toBe("rescue");
    expect(pointFixRoute("rescue", p, run([start(e), found(e), ev({ type: "ui.practiceFixing" })]).practice, P(e))).toBe("rescue");
    expect(pointFixRoute("rescue", p, null, P(e))).toBe("rescue");
    expect(pointFixRoute("smallFix", { kind: "message", message: "x", from: "deploy" }, null, "/p")).toBe("rescue");
  });
  test("the card asks pointFixRoute, and either panel's fix of the practice is the one practiceFix", () => {
    expect(card).toContain('pointFixRoute(setting("point.fixWith"), pt.problem, nowModel.current.practice, project)');
    expect(card.match(/fixFound\([^\n]*\{ practice: /g)?.length).toBe(1);
    // the practice's fix closes the Point panel and its ring, as the Point panel's own Fix it does
    const at = card.indexOf("const practiceFix = ");
    expect(at).toBeGreaterThan(-1);
    const body = card.slice(at, card.indexOf("\n  };", at));
    expect(body).toContain('invoke("showme_clear")');
    expect(body).toContain('dispatch({ type: "ui.pointClosed" })');
  });
});

describe("a practice's copy is left alone while a lesson or a check works on it", () => {
  const lesson = { stage: "step", id: "w1", lesson: SETTINGS_LESSON_ID, title: "T", index: 0, total: 3, variant: "main", say: "s", find: "f", ask: false, log: [] } as const;
  test("Start, Continue, Start over and Remove my copy wait for a lesson, the practice's own checks or any work", () => {
    expect(workingOn(initial())).toBe(false);
    expect(workingOn(run([ev({ type: "ui.findProblem" })]))).toBe(true);
    expect(workingOn({ ...initial(), walk: lesson })).toBe(true);
    for (const stage of ["done", "stopped"] as const) expect(workingOn({ ...initial(), walk: { ...lesson, stage } }), stage).toBe(false);
    const s = entry("setting");
    expect(workingOn(run([start(s), found(s), ev({ type: "ui.practiceLesson", walk: "w1" })]))).toBe(true);
    expect(workingOn(run([start(s), found(s), ...fix(s, true)]))).toBe(true);   // proving: its checks are running
    expect(workingOn(run([start(s), found(s), ...fix(s, true), passed(s)]))).toBe(false);
  });
});

describe("the panel's buttons do what they say (bugs 1, 5 and starting while busy)", () => {
  const card = readFileSync(join(import.meta.dir, "./card.tsx"), "utf8");
  const panel = readFileSync(join(import.meta.dir, "./practicePanel.tsx"), "utf8");
  const settings = readFileSync(join(import.meta.dir, "./settingsPage.tsx"), "utf8");
  test("Stop the fix stops the task the way the task card's Stop does, then closes; Skip is never shown while it fixes", () => {
    expect(card).toContain('stopFix: () => { void send(stopAgent()); dispatch({ type: "ui.practiceClosed" }); }');
    const fixing = panel.slice(panel.indexOf('p.stage === "fixing"'), panel.indexOf('p.stage === "blocked"'));
    expect(fixing).toContain("act.stopFix"); expect(fixing).not.toContain("practiceSkip");
    const proving = panel.slice(panel.indexOf('p.stage === "proving"'), panel.indexOf('p.stage === "fixing"'));
    expect(proving).toContain("act.stopChecks");
  });
  test("a copy opened again runs its Find without pointing on the screen, and only Find by the key's checks is kept quiet", () => {
    // The open table's Find is the check before going live, which never answers with problem.found: marking it quiet would
    // keep the person's next press of the key on that copy from pointing.
    const resume = card.slice(card.indexOf("resumedKey.current = pr.project;"), card.indexOf("practiceFind();", card.indexOf("resumedKey.current = pr.project;")));
    expect(resume).toContain('if (practiceOf(pr.kind)?.find === "checks") quietFind.current = pr.project;');
    expect(card).toContain('if (ev.type === "problem.found" && quietFind.current === ev.project) { quietFind.current = ""; return; }');
  });
  test("an error making a copy is said on the Learn tab, where the press took the person, never only on Now", () => {
    expect(card).not.toMatch(/create_practice[^\n]*setFolderNote/);
    expect(panel).toContain('{note && <div className="line" role="status">{note}</div>}');
    expect(settings).not.toContain("create_practice");
  });
  test("a practice is never started while something works on the project, and Start waits for Node when it is missing", () => {
    expect(card).toContain("if (!canStart(workingOn(nowModel.current), e, nowModel.current.doctor))");
    expect(panel).toMatch(/disabled=\{blocked\}[^\n]*act\.start\(id\)/);
    // Start over and Remove my copy tell the shell the same (it refuses the open copy while something works on it).
    expect(card.match(/busy: isBusy\(nowModel\.current\)/g)).toBeNull();
    expect(card.match(/busy: workingOn\(nowModel\.current\)/g)?.length).toBe(2);
    expect(card).toContain("<PracticeList rows={listRows(practiceRec, m.doctor)} busy={workingOn(m)}");
  });
  // Review fix (20 Oct 2026): Settings' Move all my practice copies to the Trash told the shell only about tasks and checks,
  // so the copy open while its lesson or its proving check ran could go to the Trash under it.
  test("Move all my practice copies to the Trash tells the shell about an open lesson and the practice's own checks too", () => {
    expect(settings).toContain('invoke("remove_all_practices", { busy: practiceBusy })');
    expect(settings).not.toContain('invoke("remove_all_practices", { busy: working })');
    expect(card).toMatch(/<SettingsPage working=\{isBusy\(m\)\} practiceBusy=\{workingOn\(m\)\}/);
    // and every busy the card sends the shell for a practice is workingOn, never isBusy alone
    for (const call of card.match(/invoke\("(?:restart|remove)_practice"[^)]*\)/g) ?? []) expect(call).toContain("busy: workingOn(nowModel.current)");
  });
});

// Found in the M11 audit (A73): the setting practice is shown as free, no Claude (F17 section 13, PRIVACY.md), but its lesson
// pointed at each step like any lesson, so each step took a picture of the screen, sent it to Claude on the person's key
// and asked for Screen Recording. Its lesson is now words only, which keeps the promise.
describe("the setting practice's lesson uses no Claude and never looks at the screen", () => {
  const e = entry("setting");
  const step = ev({ type: "walk.step", walk: "w1", lesson: SETTINGS_LESSON_ID, title: "Add the setting", index: 0, total: 3, variant: "main", say: "Make a file named .env.local.", find: "the new file button", ask: false, log: [] });
  const inLesson = run([start(e), found(e), ev({ type: "ui.walkRequested", walk: "w1" }), ev({ type: "ui.practiceLesson", walk: "w1" }), step]);
  const card = readFileSync(join(import.meta.dir, "./card.tsx"), "utf8");
  test("its lesson is words only, and every other lesson still points", () => {
    expect(inLesson.walk?.id).toBe("w1");
    expect(lessonWordsOnly(inLesson)).toBe(true);
    expect(lessonWordsOnly(run([ev({ type: "ui.walkRequested", walk: "w2" }), { ...step, walk: "w2" }]))).toBe(false);
    expect(practiceOf("setting")?.costUsd).toBe(0);
  });
  test("skipping the practice during its lesson does not turn the lesson into one that looks at the screen", () => {
    const skipped = run([ev({ type: "ui.practiceClosed" })], inLesson);
    expect(skipped.practice).toBeNull();
    expect(skipped.walk?.id).toBe("w1");
    expect(lessonWordsOnly(skipped)).toBe(true);
    // The next step of the same lesson is still words only; another lesson started afterwards is not.
    const next = run([{ ...step, index: 1 } as never], skipped);
    expect(lessonWordsOnly(next)).toBe(true);
    expect(lessonWordsOnly(run([ev({ type: "ui.walkRequested", walk: "w2" }), { ...step, walk: "w2" } as never], skipped))).toBe(false);
  });
  test("Home neither looks at the screen for its steps nor offers to point, and says so", () => {
    const aim = card.slice(card.indexOf("const wkKey = wk ?"), card.indexOf("useEffect(() => { if (wk && m.showme?.stage === \"needs_permission\")"));
    expect(aim).toContain("if (noAim.current || lessonWordsOnly(m)) return;");
    expect(aim.indexOf("lessonWordsOnly(m)")).toBeLessThan(aim.indexOf("showme_start"));
    expect(card).toContain("{m.walk.stage === \"step\" && !lessonWordsOnly(m) && <button className=\"btn\" type=\"button\" onClick={() => { const w = m.walk!; staleReq.current = m.showme?.req;");
    expect(card).toContain("{lessonWordsOnly(m) && <div className=\"line muted\">{S.practiceLessonWords}</div>}");
    expect(S.practiceLessonWords).toMatch(/does not look at your screen/);
  });
});

// Found in the M11 audit (A77): the practice said its fix was "the same request Companion uses after its own check has found
// a problem in your project", but on a person's own project Fix it looks deeper first (Rescue, on the careful model, with a
// plan to approve) unless Settings says One small checked fix.
describe("the practice says what its fix is, and what Fix it does on your own project", () => {
  test("it names the setting and both of its choices, and promises no sameness", () => {
    const f = S.set["point.fixWith"];
    expect(S.practiceFixHelp).toContain(f.label);
    expect(S.practiceFixHelp).toContain(f.options.smallFix);
    expect(S.practiceFixHelp).toMatch(/looks deeper first/);
    expect(S.practiceFixHelp).not.toMatch(/the same request/);
    expect(defaultOf("point.fixWith")).toBe("rescue");
  });
});

// Found in the second audit: Remove my copy on the copy that was open left Home with no folder, although the folder used
// before it was known. It goes back there now, as Back to my project does.
describe("removing the practice copy that is open", () => {
  const card = readFileSync(join(import.meta.dir, "./card.tsx"), "utf8");
  test("Home goes back to the folder from before, else the newest folder of the person's own", () => {
    const f = card.slice(card.indexOf("const removePractice = "), card.indexOf("// A recorded copy opened again"));
    expect(f).toContain("backTo(open.previous, recent, practiceRec)");
    expect(f.indexOf("backTo(")).toBeLessThan(f.indexOf("useFolder(to)"));
  });
});
