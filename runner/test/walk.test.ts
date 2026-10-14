// The walkthrough engine: lessons are plain data, checked hard; a walkthrough keeps a progress log, checks the real
// result after each step, never shows a step that just failed again, and picks up where it left off.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isEnvFile } from "../src/diagram.ts";
import { FileWalkStore, loadLessons, MAX_STEPS, NO_PROJECT, parseLesson, projectChecker, Walkthrough, type Lesson } from "../src/walk.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-walk-${l}-`))); made.push(d); return d; };
const step = (id: string, extra: Record<string, unknown> = {}) => ({ id, say: `Do ${id}`, find: `the ${id} button`, check: { kind: "ask" }, ...extra });
const raw = (steps: unknown[], extra: Record<string, unknown> = {}) => ({ id: "demo", title: "Demo", app: "Demo app", goal: "Do the demo", steps, ...extra });
const lesson = (steps = [step("a"), step("b"), step("c")]): Lesson => { const r = parseLesson(raw(steps)); if (!r.ok) throw new Error(r.error); return r.lesson; };
const T = () => "2026-10-12T10:00:00Z";

describe("lesson files", () => {
  test("a good lesson is accepted", () => { expect(parseLesson(raw([step("a"), step("b")])).ok).toBe(true); });
  test("more than 15 steps is refused, 15 is fine", () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => step(`s${i}`));
    expect(parseLesson(raw(many(MAX_STEPS))).ok).toBe(true);
    const r = parseLesson(raw(many(MAX_STEPS + 1))); expect(r.ok).toBe(false);
  });
  test("it needs at least one step, unique step ids and plain words", () => {
    expect(parseLesson(raw([])).ok).toBe(false);
    expect(parseLesson(raw([step("a"), step("a")])).ok).toBe(false);
    expect(parseLesson(raw([step("a", { say: "<b>hi</b>" })])).ok).toBe(false);
    expect(parseLesson(raw([step("a", { say: "" })])).ok).toBe(false);
    expect(parseLesson(raw([step("a", { find: "x".repeat(200) })])).ok).toBe(false);
    expect(parseLesson(raw([step("a", { say: "bad\u0000text" })])).ok).toBe(false);
    expect(parseLesson(raw([step("bad id!")])).ok).toBe(false);
    expect(parseLesson("nope").ok).toBe(false);
  });
  test("checks must be known ones, and file checks stay inside the project", () => {
    expect(parseLesson(raw([step("a", { check: { kind: "env_name", name: "SUPABASE_URL" } })])).ok).toBe(true);
    expect(parseLesson(raw([step("a", { check: { kind: "env_name", name: "lower case" } })])).ok).toBe(false);
    expect(parseLesson(raw([step("a", { check: { kind: "run", command: "rm -rf /" } })])).ok).toBe(false);
    expect(parseLesson(raw([step("a", { check: { kind: "file_exists", path: "../outside" } })])).ok).toBe(false);
    expect(parseLesson(raw([step("a", { check: { kind: "file_exists", path: "/etc/passwd" } })])).ok).toBe(false);
    expect(parseLesson(raw([step("a", { check: { kind: "file_contains", path: ".env", text: "KEY" } })])).ok).toBe(false);
  });
  test("a lesson is a draft unless it says it was tried by a person", () => {
    const d = parseLesson(raw([step("a")])); expect(d.ok && d.lesson.status).toBe("draft");
    const t = parseLesson(raw([step("a")], { status: "tried" })); expect(t.ok && t.lesson.status).toBe("tried");
    expect(parseLesson(raw([step("a")], { status: "great" })).ok).toBe(false);
  });
  test("a lesson that needs no project says so, and then may only use 'did that work?' checks", () => {
    expect(parseLesson(raw([step("a")], { needsProject: false })).ok).toBe(true);
    const d = parseLesson(raw([step("a")])); expect(d.ok && d.lesson.needsProject).toBe(true);
    const n = parseLesson(raw([step("a")], { needsProject: false })); expect(n.ok && n.lesson.needsProject).toBe(false);
    expect(parseLesson(raw([step("a", { check: { kind: "file_exists", path: "x" } })], { needsProject: false })).ok).toBe(false);
    expect(parseLesson(raw([step("a")], { needsProject: "no" })).ok).toBe(false);
  });
  test("an 'instead' way must carry its own words", () => {
    expect(parseLesson(raw([step("a", { instead: { say: "Try the menu", find: "the menu" } })])).ok).toBe(true);
    expect(parseLesson(raw([step("a", { instead: { say: "" , find: "x" } })])).ok).toBe(false);
  });
  test("a folder of lessons loads the good ones and names the bad ones", () => {
    const d = tmp("l");
    writeFileSync(join(d, "good.json"), JSON.stringify(raw([step("a")])));
    writeFileSync(join(d, "bad.json"), "{not json");
    writeFileSync(join(d, "worse.json"), JSON.stringify(raw([])));
    writeFileSync(join(d, "note.txt"), "ignored");
    const r = loadLessons([d, join(d, "missing")]);
    expect(r.lessons.map((l) => l.id)).toEqual(["demo"]);
    expect(r.problems.map((p) => p.file).sort()).toEqual(["bad.json", "worse.json"]);
  });
  test("a lesson id seen twice keeps the first", () => {
    const a = tmp("a"), b = tmp("b");
    writeFileSync(join(a, "x.json"), JSON.stringify(raw([step("a")], { title: "First" })));
    writeFileSync(join(b, "x.json"), JSON.stringify(raw([step("a")], { title: "Second" })));
    expect(loadLessons([a, b]).lessons[0].title).toBe("First");
  });
});

describe("walking through a lesson", () => {
  test("it starts on step one and moves on after each step that passes", async () => {
    const w = new Walkthrough(lesson(), null, { now: T, project: "/p" });
    expect(w.current()).toMatchObject({ index: 0, total: 3, step: { id: "a" } });
    expect(await w.settle("clicked", async () => true)).toBe("advance");
    expect(w.current()?.step.id).toBe("b");
    await w.settle("done_for_you", async () => true);
    expect(await w.settle("clicked", async () => true)).toBe("done");
    expect(w.current()).toBeNull();
    expect(w.progress().done).toBe(true);
    expect(w.progress().log.map((l) => l.outcome)).toEqual(["clicked", "passed", "done_for_you", "passed", "clicked", "passed"]);
  });
  test("an 'ask' step waits for the person's answer instead of checking itself", async () => {
    const w = new Walkthrough(lesson(), null, { now: T, project: "/p" });
    expect(w.needs()).toBe("ask");
    expect(await w.answer(true)).toBe("advance");
    expect(w.current()?.step.id).toBe("b");
  });
  test("a failed step is not shown again; the other way comes first, then words only", async () => {
    const l = lesson([step("a", { check: { kind: "file_exists", path: "x" }, instead: { say: "Use the menu", find: "the menu" } }), step("b")]);
    const w = new Walkthrough(l, null, { now: T, project: "/p" });
    expect(await w.settle("clicked", async () => false)).toBe("instead");
    expect(w.current()).toMatchObject({ index: 0, variant: "instead", step: { say: "Use the menu", find: "the menu" } });
    expect(await w.settle("clicked", async () => false)).toBe("help");
    expect(w.current()).toBeNull();           // nothing is shown again: the person gets words, not the same ring
    expect(w.progress().blocked).toBe("a");
    expect(w.progress().failed).toEqual(["a", "a:instead"]);
  });
  test("a step with no other way goes straight to words when it fails", async () => {
    const w = new Walkthrough(lesson([step("a", { check: { kind: "file_exists", path: "x" } })]), null, { now: T, project: "/p" });
    expect(await w.settle("clicked", async () => false)).toBe("help");
  });
  test("a checker that throws counts as not proven, never as passed", async () => {
    const w = new Walkthrough(lesson([step("a", { check: { kind: "file_exists", path: "x" } })]), null, { now: T, project: "/p" });
    expect(await w.settle("clicked", async () => { throw new Error("boom"); })).toBe("help");
  });
  test("saying 'no' to did that work follows the same rule", async () => {
    const w = new Walkthrough(lesson([step("a", { instead: { say: "Other way", find: "other" } })]), null, { now: T, project: "/p" });
    expect(await w.answer(false)).toBe("instead");
    expect(await w.answer(false)).toBe("help");
  });
  test("'I already did this' skips a step and says so in the log", async () => {
    const w = new Walkthrough(lesson(), null, { now: T, project: "/p" });
    w.skip();
    expect(w.current()?.step.id).toBe("b");
    expect(w.progress().log.at(-1)?.outcome).toBe("skipped");
  });
  test("after words only, 'I did it myself' moves past the blocked step", async () => {
    const w = new Walkthrough(lesson([step("a", { check: { kind: "file_exists", path: "x" } }), step("b")]), null, { now: T, project: "/p" });
    await w.settle("clicked", async () => false);
    expect(w.current()).toBeNull();
    w.skip();
    expect(w.current()?.step.id).toBe("b");
    expect(w.progress().blocked).toBeNull();
  });
  test("stopping ends it; nothing more is asked", async () => {
    const w = new Walkthrough(lesson(), null, { now: T, project: "/p" });
    w.stop();
    expect(w.current()).toBeNull();
    expect(await w.settle("clicked", async () => true)).toBe("stopped");
  });
});

describe("the progress log you can read", () => {
  test("it lists the steps already finished, in order, with how each ended", async () => {
    const w = new Walkthrough(lesson([step("a"), step("b"), step("c"), step("d")]), null, { now: T, project: "/p" });
    expect(w.history()).toEqual([]);
    await w.settle("clicked", async () => true);
    w.skip();
    await w.answer(true);
    expect(w.history()).toEqual([{ say: "Do a", how: "done" }, { say: "Do b", how: "skipped" }, { say: "Do c", how: "done" }]);
  });
  test("steps that came undone on resume leave the list, and the current step is never in it", async () => {
    const auto = (id: string, name: string) => step(id, { check: { kind: "env_name", name } });
    const w = new Walkthrough(lesson([auto("a", "ONE"), auto("b", "TWO")]), null, { now: T, project: "/p" });
    await w.settle("clicked", async () => true);
    expect(w.history().map((h) => h.say)).toEqual(["Do a"]);
    await w.resume(async () => false);   // ONE has vanished
    expect(w.history()).toEqual([]);
  });
});

describe("picking up after a pause", () => {
  const auto = (id: string, name: string) => step(id, { check: { kind: "env_name", name } });
  const l = () => lesson([auto("a", "ONE"), auto("b", "TWO"), auto("c", "THREE")]);
  const has = (...names: string[]) => async (c: { kind: string; name?: string }) => names.includes(c.name ?? "");
  test("it carries on from the saved place", async () => {
    const w1 = new Walkthrough(l(), null, { now: T, project: "/p" });
    await w1.settle("clicked", has("ONE"));
    const saved = JSON.parse(JSON.stringify(w1.progress()));
    const w2 = new Walkthrough(l(), saved, { now: T, project: "/p" });
    await w2.resume(has("ONE"));
    expect(w2.current()?.step.id).toBe("b");
  });
  test("steps done while it was paused are noticed and skipped", async () => {
    const w1 = new Walkthrough(l(), null, { now: T, project: "/p" });
    await w1.settle("clicked", has("ONE"));
    const w2 = new Walkthrough(l(), JSON.parse(JSON.stringify(w1.progress())), { now: T, project: "/p" });
    await w2.resume(has("ONE", "TWO"));
    expect(w2.current()?.step.id).toBe("c");
  });
  test("a finished step that is no longer true brings the walkthrough back to it, without calling it a failure", async () => {
    const w1 = new Walkthrough(l(), null, { now: T, project: "/p" });
    await w1.settle("clicked", has("ONE"));
    await w1.settle("clicked", has("TWO"));
    const w2 = new Walkthrough(l(), JSON.parse(JSON.stringify(w1.progress())), { now: T, project: "/p" });
    await w2.resume(has("TWO"));   // ONE has vanished
    expect(w2.current()).toMatchObject({ index: 0, variant: "main" });
    expect(w2.progress().failed).toEqual([]);
  });
  test("a step that failed before stays blocked after a resume", async () => {
    const w1 = new Walkthrough(l(), null, { now: T, project: "/p" });
    await w1.settle("clicked", has());
    expect(w1.progress().blocked).toBe("a");
    const w2 = new Walkthrough(l(), JSON.parse(JSON.stringify(w1.progress())), { now: T, project: "/p" });
    await w2.resume(has());
    expect(w2.current()).toBeNull();
  });
  test("progress from a different lesson or an older version is ignored", () => {
    const stale = { lesson: "other", project: "/p", index: 2, log: [], failed: [], done: false, version: 1, shape: "a,b,c" };
    const w = new Walkthrough(l(), stale as never, { now: T, project: "/p" });
    expect(w.current()?.index).toBe(0);
  });
  test("an index past the end in a damaged file is clamped, not trusted", () => {
    const w = new Walkthrough(l(), { lesson: "demo", project: "/p", index: 99, log: [], failed: [], usedInstead: [], done: false, version: 1, shape: "a,b,c" } as never, { now: T, project: "/p" });
    expect(w.current()).toBeNull();
  });
});

describe("saving progress", () => {
  test("it is saved and read back, and a damaged file is simply no progress", () => {
    const d = tmp("s"); const store = new FileWalkStore(d);
    const w = new Walkthrough(lesson(), null, { now: T, project: "/proj" });
    store.save("/proj", w.progress());
    expect(store.load("/proj", "demo")?.index).toBe(0);
    const f = readdirSync(d)[0]; writeFileSync(join(d, f), "{broken");
    expect(store.load("/proj", "demo")).toBeNull();
    expect(store.load("/other", "demo")).toBeNull();
  });
  test("it holds the step ids and outcomes only, never what was on screen", () => {
    const d = tmp("s2"); const store = new FileWalkStore(d);
    const w = new Walkthrough(lesson(), null, { now: T, project: "/proj" });
    store.save("/proj", w.progress());
    const text = readFileSync(join(d, readdirSync(d)[0]), "utf8");
    expect(Object.keys(JSON.parse(text)).sort()).toEqual(["blocked", "done", "failed", "index", "lesson", "log", "project", "shape", "usedInstead", "version"].sort());
  });
  test("the project's folder path is never written, only a fingerprint", () => {
    const d = tmp("s4"); const store = new FileWalkStore(d);
    const w = new Walkthrough(lesson(), null, { now: T, project: "/Users/me/secret-project" });
    store.save("/Users/me/secret-project", w.progress());
    expect(readFileSync(join(d, readdirSync(d)[0]), "utf8")).not.toContain("secret-project");
    expect(store.load("/Users/me/secret-project", "demo")?.project).toBe("/Users/me/secret-project");
  });
  test("forgetting removes it", () => {
    const d = tmp("s3"); const store = new FileWalkStore(d);
    const w = new Walkthrough(lesson(), null, { now: T, project: "/proj" });
    store.save("/proj", w.progress()); store.forget("/proj", "demo");
    expect(store.load("/proj", "demo")).toBeNull();
  });
});

describe("checking the real result in the project", () => {
  test("a setting name counts as set when a .env file names it (the value is never read)", async () => {
    const p = tmp("c"); writeFileSync(join(p, ".env.local"), "SUPABASE_URL=https://secret.example\n");
    const c = projectChecker(p);
    expect(await c({ kind: "env_name", name: "SUPABASE_URL" })).toBe(true);
    expect(await c({ kind: "env_name", name: "OTHER" })).toBe(false);
  });
  test("files are checked inside the project only, and secret files are never read", async () => {
    const p = tmp("c2"); mkdirSync(join(p, "src")); writeFileSync(join(p, "src", "a.ts"), "export const x = 1;\n");
    writeFileSync(join(p, ".env"), "TOKEN=abc\n");
    const c = projectChecker(p);
    expect(await c({ kind: "file_exists", path: "src/a.ts" })).toBe(true);
    expect(await c({ kind: "file_exists", path: "src/none.ts" })).toBe(false);
    expect(await c({ kind: "file_contains", path: "src/a.ts", text: "export const x" })).toBe(true);
    expect(await c({ kind: "file_contains", path: ".env", text: "TOKEN" })).toBe(false);
    expect(await c({ kind: "file_exists", path: "../escape" })).toBe(false);
  });
  test("a link out of the project does not count", async () => {
    const p = tmp("c3"), out = tmp("c3o"); writeFileSync(join(out, "secret.txt"), "hi");
    const { symlinkSync } = await import("node:fs"); symlinkSync(join(out, "secret.txt"), join(p, "link.txt"));
    expect(await projectChecker(p)({ kind: "file_exists", path: "link.txt" })).toBe(false);
  });
  test("an 'ask' check is never settled by the project", async () => {
    expect(await projectChecker(tmp("c4"))({ kind: "ask" })).toBe(false);
  });
});

describe("the lessons that ship with the app", () => {
  test("every one is valid, has a unique id, and fits the step limit", () => {
    const r = loadLessons([join(import.meta.dir, "../../lessons")]);
    expect(r.problems).toEqual([]);
    expect(r.lessons.length).toBeGreaterThanOrEqual(10);
    // Nothing is called tried until a person has walked it on a real screen (written down in docs/lessons.md).
    for (const l of r.lessons) expect(l.status, l.id).toBe("draft");
    for (const l of r.lessons) expect(l.steps.length).toBeLessThanOrEqual(MAX_STEPS);
  });
});

describe("damaged or outdated progress (review)", () => {
  const l = () => lesson([step("a", { check: { kind: "env_name", name: "ONE" } }), step("b")]);
  test("a log with junk in it is ignored, not trusted, and cannot make resume throw", async () => {
    const bad = { version: 1, shape: "a,b", lesson: "demo", project: "/p", index: 1, log: [null, 5, { step: "a" }], failed: [], usedInstead: [], blocked: null, done: false };
    const w = new Walkthrough(l(), bad as never, { now: T, project: "/p" });
    await w.resume(async () => true);
    expect(w.current()?.index).toBeGreaterThanOrEqual(0);
  });
  test("a lesson whose steps changed starts over instead of trusting an old place", () => {
    const w1 = new Walkthrough(lesson([step("a"), step("b"), step("c")]), null, { now: T, project: "/p" }); w1.skip(); w1.skip();
    const saved = JSON.parse(JSON.stringify(w1.progress()));
    const w2 = new Walkthrough(lesson([step("a"), step("new"), step("b")]), saved, { now: T, project: "/p" });
    expect(w2.current()?.index).toBe(0);
  });
  test("a command for an earlier step is recognised as late", () => {
    const w = new Walkthrough(lesson(), null, { now: T, project: "/p" }); w.skip();
    expect(w.at(0)).toBe(false); expect(w.at(1)).toBe(true); expect(w.at(undefined)).toBe(true);
  });
  test("key files are recognised whatever the letter case", () => {
    for (const f of [".ENV", ".Env.local", "Prod.ENV", "ID_RSA", "Credentials.JSON", "SECRETS.yaml"]) expect(isEnvFile(f), f).toBe(true);
  });
});
