// The walkthrough service: commands in, events out. Lessons come from folders of data files; progress is saved after
// every move; Stop everything ends every walkthrough; the project is only ever read.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileWalkStore, projectChecker } from "../src/walk.ts";
import { WalkService } from "../src/walkservice.ts";
import { parseCommand, parseEvent } from "../../protocol/index.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-ws-${l}-`))); made.push(d); return d; };
const lessonFile = { id: "keys", title: "Add your keys", app: "Demo", goal: "Get the key into the project", steps: [
  { id: "open", say: "Open settings", find: "the Settings link", check: { kind: "ask" } },
  { id: "copy", say: "Copy the key name", find: "the key name", check: { kind: "env_name", name: "DEMO_KEY" }, instead: { say: "Use the menu", find: "the menu" } },
  { id: "done", say: "Save", find: "the Save button", check: { kind: "file_exists", path: "saved.txt" } },
] };
function setup() {
  const project = tmp("p"), lessons = tmp("l"), data = tmp("d");
  writeFileSync(join(lessons, "keys.json"), JSON.stringify(lessonFile));
  const events: any[] = [];
  const store = new FileWalkStore(join(data, "walks"));
  const svc = new WalkService({ emit: (e) => events.push(e), lessonDirs: [lessons], store, checker: projectChecker, now: () => "2026-10-12T10:00:00Z" });
  const cmd = (type: string, extra: Record<string, unknown> = {}) => svc.handle({ v: 1, id: "w1", type, ...extra } as never);
  const of = (t: string) => events.filter((e) => e.type === t);
  return { project, svc, events, cmd, of, store };
}

describe("walkthrough service", () => {
  test("it lists the lessons it can teach", async () => {
    const s = setup(); await s.cmd("walk.list", { project: s.project });
    expect(s.of("walk.lessons")[0]).toMatchObject({ lessons: [{ id: "keys", title: "Add your keys", steps: 3, saved: false }] });
  });
  test("starting shows step one, and an 'ask' step asks after the click", async () => {
    const s = setup(); await s.cmd("walk.start", { project: s.project, lesson: "keys" });
    expect(s.of("walk.step")[0]).toMatchObject({ walk: "w1", index: 0, total: 3, say: "Open settings", find: "the Settings link", ask: true });
    await s.cmd("walk.acted", { walk: "w1", how: "clicked" });
    expect(s.of("walk.ask")).toHaveLength(1);
    await s.cmd("walk.answer", { walk: "w1", worked: true });
    expect(s.of("walk.step")[1]).toMatchObject({ index: 1, say: "Copy the key name", ask: false });
  });
  test("a step the project can prove moves on by itself when it passes", async () => {
    const s = setup(); await s.cmd("walk.start", { project: s.project, lesson: "keys" });
    await s.cmd("walk.acted", { walk: "w1", how: "clicked" }); await s.cmd("walk.answer", { walk: "w1", worked: true });
    writeFileSync(join(s.project, ".env"), "DEMO_KEY=abc\n");
    await s.cmd("walk.acted", { walk: "w1", how: "done_for_you" });
    expect(s.of("walk.step").at(-1)).toMatchObject({ index: 2, say: "Save" });
  });
  test("a step that did not work offers the other way, then words, and never the same ring again", async () => {
    const s = setup(); await s.cmd("walk.start", { project: s.project, lesson: "keys" });
    await s.cmd("walk.acted", { walk: "w1", how: "clicked" }); await s.cmd("walk.answer", { walk: "w1", worked: true });
    await s.cmd("walk.acted", { walk: "w1", how: "clicked" });   // the key is not there
    expect(s.of("walk.step").at(-1)).toMatchObject({ index: 1, variant: "instead", say: "Use the menu" });
    await s.cmd("walk.acted", { walk: "w1", how: "clicked" });
    expect(s.of("walk.help")).toHaveLength(1);
    expect(s.of("walk.help")[0].say).toContain("Copy the key name");
    const steps = s.of("walk.step").length;
    await s.cmd("walk.acted", { walk: "w1", how: "clicked" });   // nothing more is drawn
    expect(s.of("walk.step").length).toBe(steps);
  });
  test("after help, 'I did it myself' moves past the step", async () => {
    const s = setup(); await s.cmd("walk.start", { project: s.project, lesson: "keys" });
    await s.cmd("walk.skip", { walk: "w1" });
    await s.cmd("walk.acted", { walk: "w1", how: "clicked" }); await s.cmd("walk.acted", { walk: "w1", how: "clicked" });
    expect(s.of("walk.help")).toHaveLength(1);
    await s.cmd("walk.skip", { walk: "w1" });
    expect(s.of("walk.step").at(-1)).toMatchObject({ index: 2 });
  });
  test("finishing says so and forgets the saved place", async () => {
    const s = setup(); await s.cmd("walk.start", { project: s.project, lesson: "keys" });
    writeFileSync(join(s.project, ".env"), "DEMO_KEY=abc\n"); writeFileSync(join(s.project, "saved.txt"), "x");
    await s.cmd("walk.skip", { walk: "w1" });
    await s.cmd("walk.acted", { walk: "w1", how: "clicked" }); await s.cmd("walk.acted", { walk: "w1", how: "clicked" });
    expect(s.of("walk.done")[0]).toMatchObject({ lesson: "keys", steps: 3 });
    expect(s.store.load(s.project, "keys")).toBeNull();
  });
  test("it saves after every move, so a pause can be picked up, and noticing what was done meanwhile", async () => {
    const s = setup(); await s.cmd("walk.start", { project: s.project, lesson: "keys" });
    await s.cmd("walk.skip", { walk: "w1" });
    await s.cmd("walk.stop", { walk: "w1" });
    expect(s.store.load(s.project, "keys")?.index).toBe(1);
    writeFileSync(join(s.project, ".env"), "DEMO_KEY=abc\n");   // done while away
    await s.cmd("walk.list", { project: s.project });
    expect(s.of("walk.lessons").at(-1).lessons[0].saved).toBe(true);
    await s.cmd("walk.start", { project: s.project, lesson: "keys" });
    expect(s.of("walk.step").at(-1)).toMatchObject({ index: 2, say: "Save" });
  });
  test("'start over' ignores the saved place", async () => {
    const s = setup(); await s.cmd("walk.start", { project: s.project, lesson: "keys" });
    await s.cmd("walk.skip", { walk: "w1" }); await s.cmd("walk.stop", { walk: "w1" });
    await s.cmd("walk.start", { project: s.project, lesson: "keys", fresh: true });
    expect(s.of("walk.step").at(-1)).toMatchObject({ index: 0 });
  });
  test("an unknown lesson is said plainly, and an unknown walk is ignored", async () => {
    const s = setup(); await s.cmd("walk.start", { project: s.project, lesson: "nope" });
    expect(s.of("walk.stopped")[0].reason).toMatch(/not find|no lesson/i);
    await s.cmd("walk.acted", { walk: "ghost", how: "clicked" });
    expect(s.of("walk.step")).toHaveLength(0);
  });
  test("Stop everything ends every walkthrough", async () => {
    const s = setup(); await s.cmd("walk.start", { project: s.project, lesson: "keys" });
    s.svc.stopAll();
    const n = s.events.length;
    await s.cmd("walk.acted", { walk: "w1", how: "clicked" });
    expect(s.events.length).toBe(n);
  });
  test("a second start in the same project replaces the first", async () => {
    const s = setup(); await s.cmd("walk.start", { project: s.project, lesson: "keys" });
    await s.svc.handle({ v: 1, id: "w2", type: "walk.start", project: s.project, lesson: "keys", fresh: true } as never);
    const n = s.events.length;
    await s.cmd("walk.acted", { walk: "w1", how: "clicked" });   // the old one is gone
    expect(s.events.length).toBe(n);
  });
  test("two quick clicks on the same step are one click", async () => {
    const s = setup(); await s.cmd("walk.start", { project: s.project, lesson: "keys" });
    await Promise.all([s.cmd("walk.acted", { walk: "w1", how: "clicked" }), s.cmd("walk.acted", { walk: "w1", how: "clicked" })]);
    expect(s.of("walk.ask")).toHaveLength(1);
  });
});

describe("late and racing commands (review)", () => {
  test("a command for an earlier step does nothing", async () => {
    const s = setup(); await s.cmd("walk.start", { project: s.project, lesson: "keys" });
    await s.cmd("walk.skip", { walk: "w1" });                          // now on step 2 (verify)
    const n = s.events.length;
    await s.cmd("walk.acted", { walk: "w1", how: "clicked", index: 0 });   // a late click for step 1
    expect(s.events.length).toBe(n);
  });
  test("Stop works even while a step is being proven, and nothing is shown after it", async () => {
    const project = tmp("p2"), lessons = tmp("l2"), data = tmp("d2");
    writeFileSync(join(lessons, "keys.json"), JSON.stringify(lessonFile));
    const events: any[] = []; let release!: () => void; const gate = new Promise<void>((r) => (release = r));
    const svc = new WalkService({ emit: (e) => events.push(e), lessonDirs: [lessons], store: new FileWalkStore(join(data, "walks")), checker: () => async () => { await gate; return true; }, now: () => "t" });
    const cmd = (type: string, extra: Record<string, unknown> = {}) => svc.handle({ v: 1, id: "w1", type, ...extra } as never);
    await cmd("walk.start", { project, lesson: "keys" });
    await cmd("walk.skip", { walk: "w1" });                       // on step 2, which the project proves
    const acted = cmd("walk.acted", { walk: "w1", how: "clicked" });   // waiting on the slow proof
    await cmd("walk.stop", { walk: "w1" });                       // not dropped
    release(); await acted;
    expect(events.filter((e) => e.type === "walk.stopped")).toHaveLength(1);
    expect(events.filter((e) => e.type === "walk.step")).toHaveLength(2);   // step 1 and step 2, nothing after the stop
  });
  test("Stop everything tells the app each walk has stopped", async () => {
    const s = setup(); await s.cmd("walk.start", { project: s.project, lesson: "keys" });
    s.svc.stopAll();
    expect(s.of("walk.stopped")).toHaveLength(1);
  });
  test("a damaged saved place is forgotten and the lesson starts fresh", async () => {
    const s = setup(); await s.cmd("walk.start", { project: s.project, lesson: "keys" });
    await s.cmd("walk.skip", { walk: "w1" }); await s.cmd("walk.stop", { walk: "w1" });
    const { readdirSync, writeFileSync: w } = await import("node:fs");
    const dir = (s.store as any).dir as string; const f = readdirSync(dir)[0];
    const p = JSON.parse((await import("node:fs")).readFileSync(join(dir, f), "utf8")); p.log = [null]; w(join(dir, f), JSON.stringify(p));
    await s.svc.handle({ v: 1, id: "w9", type: "walk.start", project: s.project, lesson: "keys" } as never);
    expect(s.of("walk.step").at(-1)).toMatchObject({ walk: "w9", index: 0 });
  });
});

describe("walkthrough messages are in the protocol", () => {
  test("commands and events parse, and the strict ones are strict", () => {
    for (const l of [
      '{"v":1,"id":"a","type":"walk.list","project":"p"}',
      '{"v":1,"id":"a","type":"walk.start","project":"p","lesson":"keys"}',
      '{"v":1,"id":"a","type":"walk.acted","walk":"w1","how":"clicked"}',
      '{"v":1,"id":"a","type":"walk.answer","walk":"w1","worked":true}',
      '{"v":1,"id":"a","type":"walk.skip","walk":"w1"}',
      '{"v":1,"id":"a","type":"walk.stop","walk":"w1"}',
    ]) expect(parseCommand(l).ok, l).toBe(true);
    expect(parseCommand('{"v":1,"id":"a","type":"walk.acted","walk":"w1","how":"typed"}').ok).toBe(false);
    expect(parseCommand('{"v":1,"id":"a","type":"walk.start","project":"p"}').ok).toBe(false);
    for (const l of [
      '{"v":1,"id":"e","type":"walk.lessons","project":"p","lessons":[]}',
      '{"v":1,"id":"e","type":"walk.step","walk":"w1","project":"p","lesson":"keys","title":"T","index":0,"total":3,"variant":"main","say":"s","find":"f","ask":true}',
      '{"v":1,"id":"e","type":"walk.ask","walk":"w1","index":0}',
      '{"v":1,"id":"e","type":"walk.help","walk":"w1","say":"words"}',
      '{"v":1,"id":"e","type":"walk.done","walk":"w1","project":"p","lesson":"keys","title":"T","steps":3}',
      '{"v":1,"id":"e","type":"walk.stopped","walk":"w1","reason":"r"}',
    ]) expect(parseEvent(l).ok, l).toBe(true);
  });
});
