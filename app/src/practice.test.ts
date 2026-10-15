// The first run's practice project, as the card follows it: find it, fix it, prove it.
import { describe, expect, test } from "bun:test";
import { parseCommand, serialize } from "../../protocol/index.ts";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PRACTICE_PROMPT, SETTINGS_LESSON_ID, startPractice } from "./commands.ts";
import { initial, PRACTICES, reduce, type Model } from "./model.ts";

const ev = (o: Record<string, unknown>) => ({ v: 1, id: "e", ...o });
const run = (events: Record<string, unknown>[], from: Model = initial()) => events.reduce<Model>((m, e) => reduce(m, e as never), from);
const P = "/Users/sam/Companion practice";
const start = ev({ type: "ui.practiceStarted", project: P });
const mine = ev({ type: "checkpoint.created", agent: "a", checkpoint: "cp1", label: "Before: The tests in this project fail. Find the cause", files: 3, skipped: [] });
const found = ev({ type: "problem.found", project: P, agent: "a", verdict: "failed", label: "Running the tests", detail: "x", problem: { kind: "line", file: "test/signup.test.js", line: 17, lineText: "assert", message: "Pressing Join sends the email to /api/signup, which answered 404", from: "tests" } });

describe("the practice", () => {
  test("the fix is one cheap, fixed request that does not touch the tests", () => {
    const c = startPractice(P);
    expect(parseCommand(serialize(c)).ok).toBe(true);
    expect(c).toMatchObject({ type: "agent.start", project: P, mode: "drive", budgetUsd: 0.6 });
    expect(PRACTICE_PROMPT).toMatch(/Do not change the tests/);
  });
  test("it starts, finds the failure in its own project, fixes it and proves it", () => {
    let m = run([start]); expect(m.practice?.stage).toBe("start");
    m = run([found], m); expect(m.practice).toMatchObject({ stage: "found", label: "Running the tests", where: { file: "test/signup.test.js", line: 17 } });
    m = run([ev({ type: "ui.practiceFixing" })], m); expect(m.practice?.stage).toBe("fixing");
    m = run([mine, ev({ type: "receipt", agent: "a", checkpoint: "cp", changed: [{ file: "public/signup.js", kind: "modified" }], commands: 2, notUndoable: [], proof: "passed", usdEstimate: 0.05 })], m);
    expect(m.practice?.stage).toBe("done");
  });
  test("a fix that did not pass is told plainly and can be tried again", () => {
    let m = run([start, found, ev({ type: "ui.practiceFixing" }), mine, ev({ type: "receipt", agent: "a", checkpoint: "cp", changed: [], commands: 1, notUndoable: [], proof: "failed", usdEstimate: 0.05 })]);
    expect(m.practice?.stage).toBe("failed");
    m = run([ev({ type: "ui.practiceFixing" })], m); expect(m.practice?.stage).toBe("fixing");
  });
  test("a failure in some other project, or a pass, does not move it on", () => {
    expect(run([start, ev({ ...found, project: "/other" })]).practice?.stage).toBe("start");
    expect(run([start, ev({ type: "problem.found", project: P, agent: "a", verdict: "passed" })]).practice?.stage).toBe("start");
  });
  test("a receipt from some other task does not finish it", () => {
    expect(run([start, found, ev({ type: "receipt", agent: "a", checkpoint: "cp", changed: [], commands: 0, notUndoable: [], proof: "passed", usdEstimate: 0 })]).practice?.stage).toBe("found");
  });
  test("closing, Stop everything and changing to another project end it; the practice project becoming current does not", () => {
    for (const end of [ev({ type: "ui.practiceClosed" }), { v: 1, id: "k", type: "app.stop_everything" }, ev({ type: "ui.projectChanged", project: "/other" })]) expect(run([start, end]).practice).toBeNull();
    expect(run([start, ev({ type: "ui.projectChanged", project: P })]).practice?.stage).toBe("start");
  });
  test("a check that could not run (no Node) is told as that, not as the practice's bug", () => {
    const m = run([start, ev({ type: "problem.found", project: P, agent: "a", verdict: "failed", label: "Building and checking the code", detail: "x", problem: { kind: "message", message: "sh: npm: command not found", from: "install" } })]);
    expect(m.practice).toMatchObject({ stage: "blocked", why: "sh: npm: command not found" });
    const other = run([start, ev({ type: "problem.found", project: P, agent: "a", verdict: "failed", label: "Running the tests", detail: "x", problem: { kind: "line", file: "server.js", line: 3, message: "boom", from: "tests" } })]);
    expect(other.practice?.stage).toBe("blocked");
  });
  test("only the practice's own task finishes it, not another task's receipt", () => {
    const receipt = ev({ type: "receipt", agent: "a", checkpoint: "cp", changed: [], commands: 0, notUndoable: [], proof: "passed", usdEstimate: 0 });
    const ours = run([start, found, ev({ type: "ui.practiceFixing" }), mine, receipt]);
    expect(ours.practice?.stage).toBe("done");
    const other = run([start, found, ev({ type: "ui.practiceFixing" }), ev({ type: "checkpoint.created", agent: "a", checkpoint: "cp2", label: "Before: add a footer", files: 3, skipped: [] }), receipt]);
    expect(other.practice?.stage).toBe("fixing");
  });
  test("an error, or the engine restarting, while fixing ends it as not passed; it never waits forever", () => {
    for (const bad of [ev({ type: "protocol.error", reason: "That agent is busy" }), ev({ type: "app.runner_restarted" })]) {
      expect(run([start, found, ev({ type: "ui.practiceFixing" }), bad]).practice?.stage).toBe("failed");
    }
    expect(run([start, ev({ type: "protocol.error", reason: "x" })]).practice?.stage).toBe("start");   // an error elsewhere changes nothing here
  });
});

describe("the missing setting practice", () => {
  const SP = "/Users/sam/Companion practice 2";
  const begin = ev({ type: "ui.practiceStarted", project: SP, kind: "setting" });
  const foundSetting = ev({ type: "problem.found", project: SP, agent: "a", verdict: "failed", label: "Running the tests", detail: "x", problem: { kind: "line", file: "settings.js", line: 16, lineText: "throw", message: "Error: SHOP_NAME is not set. Add it to .env.local in this folder.", from: "tests" } });
  const lessonDone = ev({ type: "walk.done", walk: "w1", project: SP, lesson: SETTINGS_LESSON_ID, title: "T", steps: 3 });
  test("each practice is a folder the shell knows, and the first run's stays the default", () => {
    expect(PRACTICES.signup.folder).toBe("stuck-signup");
    expect(PRACTICES.setting.folder).toBe("stuck-setting");
    const rust = readFileSync(join(import.meta.dir, "../src-tauri/src/practice.rs"), "utf8");
    for (const p of Object.values(PRACTICES)) expect(rust).toContain(`"${p.folder}"`);
    expect(run([start]).practice).toMatchObject({ kind: "signup" });
  });
  test("it finds the line that stops the page, and only that line counts", () => {
    expect(run([begin, foundSetting]).practice).toMatchObject({ kind: "setting", stage: "found", where: { file: "settings.js", line: 16 } });
    expect(run([begin, ev({ ...found, project: SP })]).practice?.stage).toBe("blocked");   // a failure in some other file is not this practice's
  });
  test("the fix is the lesson made from the project, then the checks run again: a pass is done, a failure is said", () => {
    let m = run([begin, foundSetting, ev({ type: "ui.practiceLesson" })]);
    expect(m.practice?.stage).toBe("lesson");
    m = run([lessonDone], m); expect(m.practice?.stage).toBe("proving");
    expect(run([ev({ type: "problem.found", project: SP, agent: "a", verdict: "passed" })], m).practice?.stage).toBe("done");
    expect(run([ev({ type: "problem.found", project: SP, agent: "a", verdict: "passed_with_gaps" })], m).practice?.stage).toBe("done");
    expect(run([foundSetting], m).practice?.stage).toBe("failed");
  });
  test("only that lesson finishing in that project moves it on; stopping the lesson goes back to the start of the fix", () => {
    const m = run([begin, foundSetting, ev({ type: "ui.practiceLesson" })]);
    expect(run([ev({ ...lessonDone, project: "/other" })], m).practice?.stage).toBe("lesson");
    expect(run([ev({ ...lessonDone, lesson: "vercel-add-env-var" })], m).practice?.stage).toBe("lesson");
    const walking = run([ev({ type: "ui.walkRequested", walk: "w1" }), ev({ type: "walk.step", walk: "w1", project: SP, lesson: SETTINGS_LESSON_ID, title: "T", index: 0, total: 3, variant: "main", say: "s", find: "f", ask: false })], m);
    expect(run([ev({ type: "walk.stopped", walk: "w1", reason: "Stopped." })], walking).practice?.stage).toBe("found");
  });
  test("the engine restarting during the lesson or the second check goes back to the start of the fix, never waits forever", () => {
    for (const at of [[ev({ type: "ui.practiceLesson" })], [ev({ type: "ui.practiceLesson" }), lessonDone]]) {
      expect(run([begin, foundSetting, ...at, ev({ type: "app.runner_restarted" })]).practice?.stage).toBe("found");
    }
  });
  test("the signup practice never waits on a lesson", () => {
    expect(run([start, found, ev({ type: "ui.practiceLesson" })]).practice?.stage).toBe("found");
  });
});
