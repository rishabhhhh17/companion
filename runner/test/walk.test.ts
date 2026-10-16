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
const of = (l: Lesson, id: string) => l.steps.find((s) => s.id === id)!;

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
  test("a click on the ring is not the moment of proof: what the project does not show yet waits, and is not a failure", async () => {
    // The ring points at where the value comes from (a dashboard, the settings file), so the click comes before the save.
    const l = lesson([step("a", { check: { kind: "env_name", name: "ONE" }, instead: { say: "Use the menu", find: "the menu" } }), step("b")]);
    const w = new Walkthrough(l, null, { now: T, project: "/p" });
    expect(await w.settle("clicked", async () => false)).toBe("wait");
    expect(await w.settle("done_for_you", async () => false)).toBe("wait");
    expect(w.current()).toMatchObject({ index: 0, variant: "main", step: { id: "a" } });
    expect(w.progress()).toMatchObject({ failed: [], usedInstead: [], blocked: null });
    // Once it is saved, the next click (or the press) passes it.
    expect(await w.settle("clicked", async () => true)).toBe("advance");
    expect(w.current()?.step.id).toBe("b");
  });
  test("only the person's own 'I did it' press counts a step the project cannot prove as not working", async () => {
    const w = new Walkthrough(lesson([step("a", { check: { kind: "env_name", name: "ONE" } }), step("b")]), null, { now: T, project: "/p" });
    expect(await w.settle("clicked", async () => false)).toBe("wait");
    expect(await w.settle("pressed", async () => false)).toBe("help");
    expect(w.progress().failed).toEqual(["a"]);
    expect(w.progress().log.map((x) => x.outcome)).toEqual(["clicked", "not_yet", "pressed", "failed"]);
  });
  test("a failed step is not shown again; the other way comes first, then words only", async () => {
    const l = lesson([step("a", { check: { kind: "file_exists", path: "x" }, instead: { say: "Use the menu", find: "the menu" } }), step("b")]);
    const w = new Walkthrough(l, null, { now: T, project: "/p" });
    expect(await w.settle("pressed", async () => false)).toBe("instead");
    expect(w.current()).toMatchObject({ index: 0, variant: "instead", step: { say: "Use the menu", find: "the menu" } });
    expect(await w.settle("pressed", async () => false)).toBe("help");
    expect(w.current()).toBeNull();           // nothing is shown again: the person gets words, not the same ring
    expect(w.progress().blocked).toBe("a");
    expect(w.progress().failed).toEqual(["a", "a:instead"]);
  });
  test("a step with no other way goes straight to words when it fails", async () => {
    const w = new Walkthrough(lesson([step("a", { check: { kind: "file_exists", path: "x" } })]), null, { now: T, project: "/p" });
    expect(await w.settle("pressed", async () => false)).toBe("help");
  });
  test("a checker that throws counts as not proven, never as passed", async () => {
    const w = new Walkthrough(lesson([step("a", { check: { kind: "file_exists", path: "x" } })]), null, { now: T, project: "/p" });
    expect(await w.settle("clicked", async () => { throw new Error("boom"); })).toBe("wait");
    expect(await w.settle("pressed", async () => { throw new Error("boom"); })).toBe("help");
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
    await w.settle("pressed", async () => false);
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
    await w1.settle("pressed", has());
    expect(w1.progress().blocked).toBe("a");
    const w2 = new Walkthrough(l(), JSON.parse(JSON.stringify(w1.progress())), { now: T, project: "/p" });
    await w2.resume(has());
    expect(w2.current()).toBeNull();
  });
  test("a pause on a step only the person can confirm asks 'did you already do this?' instead of stopping, and points at nothing yet", async () => {
    const lp = lesson([step("a"), step("b"), auto("c", "THREE")]);
    const w1 = new Walkthrough(lp, null, { now: T, project: "/p" });
    await w1.answer(true);   // a is done, b is next
    const w2 = new Walkthrough(lp, JSON.parse(JSON.stringify(w1.progress())), { now: T, project: "/p" });
    await w2.resume(has());
    expect(w2.needs()).toBe("already");
    expect(w2.current()).toMatchObject({ index: 1, already: true, step: { id: "b" } });
  });
  test("'yes, I did it' moves past it, proves what the project can prove, and asks again at the next step only the person knows", async () => {
    const lp = lesson([step("a"), step("b"), auto("c", "THREE"), step("d"), step("e")]);
    const w1 = new Walkthrough(lp, null, { now: T, project: "/p" });
    await w1.answer(true);
    const w2 = new Walkthrough(lp, JSON.parse(JSON.stringify(w1.progress())), { now: T, project: "/p" });
    await w2.resume(has("THREE"));
    expect(w2.current()).toMatchObject({ index: 1, already: true });
    expect(await w2.confirm(true, has("THREE"))).toBe("advance");
    expect(w2.current()).toMatchObject({ index: 3, already: true, step: { id: "d" } });   // c was proven from the project on the way
    expect(w2.progress().log.slice(-2).map((l) => [l.step, l.outcome])).toEqual([["b", "already_done"], ["c", "already_done"]]);
    expect(w2.history().map((h) => h.how)).toEqual(["done", "done", "done"]);
  });
  test("'no' shows the step itself, the normal way", async () => {
    const lp = lesson([step("a"), step("b"), step("c")]);
    const w1 = new Walkthrough(lp, null, { now: T, project: "/p" });
    await w1.answer(true);
    const w2 = new Walkthrough(lp, JSON.parse(JSON.stringify(w1.progress())), { now: T, project: "/p" });
    await w2.resume(has());
    expect(await w2.confirm(false, has())).toBe("advance");
    expect(w2.needs()).toBe("ask");
    expect(w2.current()).toMatchObject({ index: 1, already: false, step: { id: "b" } });
    expect(w2.progress().failed).toEqual([]);   // not having done it yet is not a failure
  });
  test("a step the project cannot prove yet stops the skipping there, without asking", async () => {
    const lp = lesson([step("a"), step("b"), auto("c", "THREE"), step("d")]);
    const w1 = new Walkthrough(lp, null, { now: T, project: "/p" });
    await w1.answer(true);
    const w2 = new Walkthrough(lp, JSON.parse(JSON.stringify(w1.progress())), { now: T, project: "/p" });
    await w2.resume(has());
    await w2.confirm(true, has());   // THREE is not set
    expect(w2.needs()).toBe("verify");
    expect(w2.current()).toMatchObject({ index: 2, already: false });
  });
  test("'yes' on the last step finishes the lesson", async () => {
    const lp = lesson([step("a"), step("b")]);
    const w1 = new Walkthrough(lp, null, { now: T, project: "/p" });
    await w1.answer(true);
    const w2 = new Walkthrough(lp, JSON.parse(JSON.stringify(w1.progress())), { now: T, project: "/p" });
    await w2.resume(has());
    expect(await w2.confirm(true, has())).toBe("done");
    expect(w2.progress().done).toBe(true);
  });
  test("an answer to a question nobody asked changes nothing, and Stop while asking ends it", async () => {
    const w = new Walkthrough(lesson(), null, { now: T, project: "/p" });
    expect(await w.confirm(true, has())).toBe("advance");
    expect(w.current()).toMatchObject({ index: 0, already: false });
    expect(w.progress().log).toEqual([]);
    const lp = lesson([step("a"), step("b")]);
    const w1 = new Walkthrough(lp, null, { now: T, project: "/p" }); await w1.answer(true);
    const w2 = new Walkthrough(lp, JSON.parse(JSON.stringify(w1.progress())), { now: T, project: "/p" });
    await w2.resume(has()); w2.stop();
    expect(await w2.confirm(true, has())).toBe("stopped");
    expect(w2.current()).toBeNull();
  });
  test("'I did it myself' while asking moves on and stops asking", async () => {
    const lp = lesson([step("a"), step("b"), step("c")]);
    const w1 = new Walkthrough(lp, null, { now: T, project: "/p" }); await w1.answer(true);
    const w2 = new Walkthrough(lp, JSON.parse(JSON.stringify(w1.progress())), { now: T, project: "/p" });
    await w2.resume(has()); w2.skip();
    expect(w2.current()).toMatchObject({ index: 2, already: false });
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
    expect(r.lessons.length).toBeGreaterThanOrEqual(12);
    // Nothing is called tried until a person has walked it on a real screen (written down in docs/lessons.md).
    for (const l of r.lessons) expect(l.status, l.id).toBe("draft");
    for (const l of r.lessons) expect(l.steps.length).toBeLessThanOrEqual(MAX_STEPS);
  });
  test("a shipped lesson that needs a project proves at least one step from it (otherwise it would not need one)", () => {
    const r = loadLessons([join(import.meta.dir, "../../lessons")]);
    for (const l of r.lessons.filter((x) => x.needsProject)) expect(l.steps.some((s) => s.check.kind !== "ask"), l.id).toBe(true);
  });
  test("the GitHub lesson proves only what the project really shows: keys left out of git, and a git folder", async () => {
    const l = loadLessons([join(import.meta.dir, "../../lessons")]).lessons.find((x) => x.id === "github-new-repo")!;
    expect(l.needsProject).toBe(true);
    const ids = l.steps.map((s) => s.id);
    const of = (id: string) => l.steps.find((s) => s.id === id)!;
    expect(of("ignore").check).toEqual({ kind: "file_contains", path: ".gitignore", text: ".env*" });
    expect(of("init").check).toEqual({ kind: "file_exists", path: ".git" });
    // The .env files are left out before anything is saved in git, and saving comes before sending it to GitHub.
    expect(ids.indexOf("ignore")).toBeLessThan(ids.indexOf("commit"));
    expect(ids.indexOf("init")).toBeLessThan(ids.indexOf("commit"));
    expect(ids.indexOf("commit")).toBeLessThan(ids.indexOf("push"));
    // Plain text files standing in for what git writes (no git is run here).
    const p = tmp("gh"), c = projectChecker(p);
    expect(await c(of("ignore").check)).toBe(false);
    expect(await c(of("init").check)).toBe(false);
    writeFileSync(join(p, ".gitignore"), "node_modules\n.env*\n"); mkdirSync(join(p, ".git"));
    expect(await c(of("ignore").check)).toBe(true);
    expect(await c(of("init").check)).toBe(true);
  });
  test("the GitHub lesson does not call a project linked because some GitHub address is in it, nor send only a README", () => {
    const l = loadLessons([join(import.meta.dir, "../../lessons")]).lessons.find((x) => x.id === "github-new-repo")!;
    // A project cloned from someone else's repository already names github.com: that proves nothing about the new one.
    for (const s of l.steps) expect(JSON.stringify(s.check), s.id).not.toContain(".git/config");
    // Sending the code and seeing it on GitHub are the person's to confirm: only GitHub's page shows the new repository.
    for (const id of ["commit", "push", "seen"]) expect(l.steps.find((s) => s.id === id)?.check, id).toEqual({ kind: "ask" });
    expect(l.steps.at(-1)!.id).toBe("seen");
    // GitHub's "create a new repository on the command line" steps save and send only README.md.
    const text = JSON.stringify(l.steps);
    expect(text).not.toMatch(/README\.md|new repository on the command line/i);
    expect(of(l, "commit").say).toContain("git add .");
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
