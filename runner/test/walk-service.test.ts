// The walkthrough service: commands in, events out. Lessons come from folders of data files; progress is saved after
// every move; Stop everything ends every walkthrough; the project is only ever read.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileWalkStore, NO_PROJECT, projectChecker } from "../src/walk.ts";
import { WalkService } from "../src/walkservice.ts";
import { lessonsFromProject, SETTINGS_LESSON, VERCEL_LESSON } from "../src/lessongen.ts";
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
  const lessonsDir = lessons;
  const events: any[] = [];
  const store = new FileWalkStore(join(data, "walks"));
  const svc = new WalkService({ emit: (e) => events.push(e), lessonDirs: [lessons], store, checker: projectChecker, now: () => "2026-10-12T10:00:00Z" });
  const cmd = (type: string, extra: Record<string, unknown> = {}) => svc.handle({ v: 1, id: "w1", type, ...extra } as never);
  const of = (t: string) => events.filter((e) => e.type === t);
  return { project, svc, events, cmd, of, store, lessonsDir };
}

describe("walkthrough service", () => {
  test("it lists the lessons it can teach", async () => {
    const s = setup(); await s.cmd("walk.list", { project: s.project });
    expect(s.of("walk.lessons")[0]).toMatchObject({ lessons: [{ id: "keys", title: "Add your keys", status: "draft", steps: 3, saved: false }] });
  });
  test("starting shows step one, and an 'ask' step asks after the click", async () => {
    const s = setup(); await s.cmd("walk.start", { project: s.project, lesson: "keys" });
    expect(s.of("walk.step")[0]).toMatchObject({ walk: "w1", index: 0, total: 3, say: "Open settings", find: "the Settings link", ask: true });
    await s.cmd("walk.acted", { walk: "w1", how: "clicked" });
    expect(s.of("walk.ask")).toHaveLength(1);
    await s.cmd("walk.answer", { walk: "w1", worked: true });
    expect(s.of("walk.step")[1]).toMatchObject({ index: 1, say: "Copy the key name", ask: false });
  });
  test("each step carries the list of what is already done, so the card can show it", async () => {
    const s = setup(); await s.cmd("walk.start", { project: s.project, lesson: "keys" });
    expect(s.of("walk.step")[0].log).toEqual([]);
    await s.cmd("walk.acted", { walk: "w1", how: "clicked" }); await s.cmd("walk.answer", { walk: "w1", worked: true });
    expect(s.of("walk.step")[1].log).toEqual([{ say: "Open settings", how: "done" }]);
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
    await s.cmd("walk.acted", { walk: "w1", how: "pressed" });   // the key is not there
    expect(s.of("walk.step").at(-1)).toMatchObject({ index: 1, variant: "instead", say: "Use the menu" });
    await s.cmd("walk.acted", { walk: "w1", how: "pressed" });
    expect(s.of("walk.help")).toHaveLength(1);
    expect(s.of("walk.help")[0].say).toContain("Copy the key name");
    const steps = s.of("walk.step").length;
    await s.cmd("walk.acted", { walk: "w1", how: "pressed" });   // nothing more is drawn
    expect(s.of("walk.step").length).toBe(steps);
  });
  test("after help, 'I did it myself' moves past the step", async () => {
    const s = setup(); await s.cmd("walk.start", { project: s.project, lesson: "keys" });
    await s.cmd("walk.skip", { walk: "w1" });
    await s.cmd("walk.acted", { walk: "w1", how: "pressed" }); await s.cmd("walk.acted", { walk: "w1", how: "pressed" });
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
  test("a lesson paused on a step only the person knows asks 'did you already do this?' first, without pointing", async () => {
    const s = setup(); await s.cmd("walk.start", { project: s.project, lesson: "keys" });
    expect(s.of("walk.step")[0]).not.toHaveProperty("already");   // a fresh start asks nothing
    await s.cmd("walk.stop", { walk: "w1" });                        // paused on step 1, an 'ask' step
    await s.svc.handle({ v: 1, id: "w2", type: "walk.start", project: s.project, lesson: "keys" } as never);
    expect(s.of("walk.step").at(-1)).toMatchObject({ walk: "w2", index: 0, say: "Open settings", already: true });
    // A click while asking means nothing: there is no ring to click.
    const n = s.events.length;
    await s.svc.handle({ v: 1, id: "x", type: "walk.acted", walk: "w2", how: "clicked", index: 0 } as never);
    expect(s.events.length).toBe(n);
    // "Yes" moves on; the next step is one the project proves, so it is shown the normal way.
    await s.svc.handle({ v: 1, id: "y", type: "walk.answer", walk: "w2", worked: true, index: 0 } as never);
    expect(s.of("walk.step").at(-1)).toMatchObject({ walk: "w2", index: 1, say: "Copy the key name" });
    expect(s.of("walk.step").at(-1)).not.toHaveProperty("already");
    expect(s.of("walk.step").at(-1).log).toEqual([{ say: "Open settings", how: "done" }]);
  });
  test("'no' to 'did you already do this?' shows that same step to do", async () => {
    const s = setup(); await s.cmd("walk.start", { project: s.project, lesson: "keys" });
    await s.cmd("walk.stop", { walk: "w1" });
    await s.svc.handle({ v: 1, id: "w2", type: "walk.start", project: s.project, lesson: "keys" } as never);
    await s.svc.handle({ v: 1, id: "y", type: "walk.answer", walk: "w2", worked: false, index: 0 } as never);
    expect(s.of("walk.step").at(-1)).toMatchObject({ walk: "w2", index: 0, say: "Open settings", ask: true });
    expect(s.of("walk.step").at(-1)).not.toHaveProperty("already");
    expect(s.of("walk.help")).toHaveLength(0);
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

describe("lessons made from the project", () => {
  function made() {
    const s = setup();
    const svc = new WalkService({ emit: (e) => s.events.push(e), lessonDirs: [s.lessonsDir], store: s.store, checker: projectChecker, now: () => "2026-10-12T10:00:00Z", fromProject: lessonsFromProject });
    writeFileSync(join(s.project, "package.json"), JSON.stringify({ name: "x", dependencies: { vite: "5", react: "18" } }));
    mkdirSync(join(s.project, "src")); writeFileSync(join(s.project, "src", "db.ts"), "createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY)");
    const cmd = (type: string, extra: Record<string, unknown> = {}, id = "w1") => svc.handle({ v: 1, id, type, ...extra } as never);
    return { ...s, svc, cmd };
  }
  test("they come first in the list, marked as made from this project, for a real folder only", async () => {
    const s = made(); await s.cmd("walk.list", { project: s.project });
    const list = s.of("walk.lessons")[0].lessons;
    expect(list.slice(0, 2).map((l: any) => l.id)).toEqual([SETTINGS_LESSON, VERCEL_LESSON]);
    expect(list[0]).toMatchObject({ fromProject: true, needsProject: true, status: "draft", steps: 4, saved: false });
    expect(list.find((l: any) => l.id === "keys")).not.toHaveProperty("fromProject");
    await s.cmd("walk.list", { project: NO_PROJECT });
    expect(s.of("walk.lessons")[1].lessons.map((l: any) => l.id)).not.toContain(SETTINGS_LESSON);
  });
  test("each setting step is proven from the project, and the name set is the proof", async () => {
    const s = made(); await s.cmd("walk.start", { project: s.project, lesson: SETTINGS_LESSON });
    expect(s.of("walk.step")[0]).toMatchObject({ index: 0, total: 4, ask: false });
    writeFileSync(join(s.project, ".env.local"), "");
    await s.cmd("walk.acted", { walk: "w1", how: "clicked" });
    expect(s.of("walk.step").at(-1)).toMatchObject({ index: 1, ask: false });
    expect(s.of("walk.step").at(-1).say).toContain("VITE_SUPABASE_ANON_KEY");
    writeFileSync(join(s.project, ".env.local"), "VITE_SUPABASE_ANON_KEY=eyJ-not-a-real-key\n");
    await s.cmd("walk.acted", { walk: "w1", how: "clicked" });
    expect(s.of("walk.step").at(-1)).toMatchObject({ index: 2 });
    expect(JSON.stringify(s.events)).not.toContain("eyJ-not-a-real-key");
  });
  test("a ring click before the value is saved keeps the step and says what is not there yet: it is not a failure", async () => {
    // The ring points at where the value comes from (the Supabase settings), so the click always comes before the save.
    const s = made(); await s.cmd("walk.start", { project: s.project, lesson: SETTINGS_LESSON });
    writeFileSync(join(s.project, ".env.local"), "");
    await s.cmd("walk.acted", { walk: "w1", how: "clicked", index: 0 });
    expect(s.of("walk.step").at(-1)).toMatchObject({ index: 1 });
    await s.cmd("walk.acted", { walk: "w1", how: "clicked", index: 1 });       // clicked the Supabase page, nothing saved yet
    await s.cmd("walk.acted", { walk: "w1", how: "done_for_you", index: 1 });  // or Do it for me clicked it
    expect(s.of("walk.help")).toHaveLength(0);
    expect(s.of("walk.wait")).toHaveLength(2);
    expect(s.of("walk.wait")[0]).toMatchObject({ walk: "w1", index: 1 });
    expect(s.of("walk.wait")[0].say).toContain("VITE_SUPABASE_ANON_KEY");
    expect(s.of("walk.wait")[0].say).toContain('"I did it"');
    expect(s.of("walk.step").at(-1)).toMatchObject({ index: 1, variant: "main" });
    // Saved, then the person's own press: proven, on to the next name.
    writeFileSync(join(s.project, ".env.local"), "VITE_SUPABASE_ANON_KEY=x\n");
    await s.cmd("walk.acted", { walk: "w1", how: "pressed", index: 1 });
    expect(s.of("walk.step").at(-1)).toMatchObject({ index: 2 });
    expect(s.of("walk.help")).toHaveLength(0);
  });
  test("the person's own press on a setting that is not there is said plainly, with the name", async () => {
    const s = made(); await s.cmd("walk.start", { project: s.project, lesson: SETTINGS_LESSON });
    writeFileSync(join(s.project, ".env.local"), "");
    await s.cmd("walk.acted", { walk: "w1", how: "clicked", index: 0 });
    await s.cmd("walk.acted", { walk: "w1", how: "pressed", index: 1 });
    expect(s.of("walk.help")).toHaveLength(1);
    expect(s.of("walk.help")[0].say).toContain("I do not see VITE_SUPABASE_ANON_KEY");
  });
  test("a pause keeps the lesson's names, so it carries on where it was instead of starting over", async () => {
    const s = made(); await s.cmd("walk.start", { project: s.project, lesson: SETTINGS_LESSON });
    writeFileSync(join(s.project, ".env.local"), "VITE_SUPABASE_ANON_KEY=x\n");
    await s.cmd("walk.acted", { walk: "w1", how: "clicked" }); await s.cmd("walk.acted", { walk: "w1", how: "clicked" });
    await s.cmd("walk.stop", { walk: "w1" });
    await s.cmd("walk.list", { project: s.project });
    expect(s.of("walk.lessons").at(-1).lessons[0]).toMatchObject({ id: SETTINGS_LESSON, saved: true, steps: 4 });
    await s.cmd("walk.start", { project: s.project, lesson: SETTINGS_LESSON }, "w2");
    expect(s.of("walk.step").at(-1)).toMatchObject({ walk: "w2", index: 2, total: 4 });
    expect(s.of("walk.step").at(-1).say).toContain("VITE_SUPABASE_URL");
  });
  test("without a folder it says to choose one; with nothing left to set it says so", async () => {
    const s = made(); await s.cmd("walk.start", { project: NO_PROJECT, lesson: SETTINGS_LESSON });
    expect(s.of("walk.stopped")[0].reason).toMatch(/folder/i);
    writeFileSync(join(s.project, ".env.local"), "VITE_SUPABASE_URL=x\nVITE_SUPABASE_ANON_KEY=y\n");
    await s.cmd("walk.start", { project: s.project, lesson: SETTINGS_LESSON }, "w2");
    expect(s.of("walk.stopped")[1].reason).toMatch(/already set/i);
  });
  test("a lesson file cannot take the name of a lesson made from the project", async () => {
    const s = made();
    writeFileSync(join(s.lessonsDir, "fake.json"), JSON.stringify({ id: SETTINGS_LESSON, title: "Fake", app: "Demo", goal: "g", steps: [{ id: "a", say: "Do a", find: "the a button" }] }));
    writeFileSync(join(s.project, ".env.local"), "VITE_SUPABASE_URL=x\nVITE_SUPABASE_ANON_KEY=y\n");   // nothing left, so no lesson is made
    await s.cmd("walk.list", { project: s.project });
    expect(s.of("walk.lessons")[0].lessons.map((l: any) => l.title)).not.toContain("Fake");
    await s.cmd("walk.start", { project: s.project, lesson: SETTINGS_LESSON });
    expect(s.of("walk.step")).toHaveLength(0);
  });
});

describe("the GitHub lesson's steps that the project proves", () => {
  test("a ring click before the file is saved or the command is run waits for it, and is never a failure", async () => {
    const project = tmp("gh"), data = tmp("ghd"), events: any[] = [];
    const svc = new WalkService({ emit: (e) => events.push(e), lessonDirs: [join(import.meta.dir, "../../lessons")], store: new FileWalkStore(join(data, "walks")), checker: projectChecker, now: () => "t" });
    const cmd = (type: string, extra: Record<string, unknown> = {}) => svc.handle({ v: 1, id: "w1", type, ...extra } as never);
    const of = (t: string) => events.filter((e) => e.type === t);
    const at = () => of("walk.step").at(-1);
    await cmd("walk.start", { project, lesson: "github-new-repo" });
    // The steps on GitHub's own site are the person's to confirm.
    while (at().ask) { const i = at().index; await cmd("walk.acted", { walk: "w1", how: "clicked", index: i }); await cmd("walk.answer", { walk: "w1", worked: true, index: i }); }
    for (const [file, make] of [[".gitignore", () => writeFileSync(join(project, ".gitignore"), ".env*\n")], [".git", () => mkdirSync(join(project, ".git"))]] as const) {
      const i = at().index;
      expect(at().ask, file).toBe(false);
      await cmd("walk.acted", { walk: "w1", how: "clicked", index: i });
      expect(of("walk.help"), file).toHaveLength(0);
      expect(at().index, file).toBe(i);
      expect(of("walk.wait").at(-1)).toMatchObject({ index: i });
      make();
      await cmd("walk.acted", { walk: "w1", how: "pressed", index: i });
      expect(at().index, file).toBe(i + 1);
    }
    expect(of("walk.help")).toHaveLength(0);
    expect(at().ask).toBe(true);   // saving and sending the code: the person says
  });
});

describe("lessons that need no project", () => {
  function plain() {
    const s = setup();
    writeFileSync(join(s.lessonsDir, "free.json"), JSON.stringify({ id: "free", title: "Free", app: "Demo", goal: "g", needsProject: false, steps: [{ id: "a", say: "Do a", find: "the a button", check: { kind: "ask" } }] }));
    return s;
  }
  test("they start without a folder, and say so in the list", async () => {
    const s = plain(); await s.cmd("walk.list", { project: NO_PROJECT });
    expect(s.of("walk.lessons")[0].lessons.find((l: any) => l.id === "free").needsProject).toBe(false);
    expect(s.of("walk.lessons")[0].lessons.find((l: any) => l.id === "keys").needsProject).toBe(true);
    await s.cmd("walk.start", { project: NO_PROJECT, lesson: "free" });
    expect(s.of("walk.step")[0]).toMatchObject({ say: "Do a", project: NO_PROJECT });
    await s.cmd("walk.acted", { walk: "w1", how: "clicked" }); await s.cmd("walk.answer", { walk: "w1", worked: true });
    expect(s.of("walk.done")).toHaveLength(1);
  });
  test("a lesson that reads the project will not start without one", async () => {
    const s = plain(); await s.cmd("walk.start", { project: NO_PROJECT, lesson: "keys" });
    expect(s.of("walk.stopped")[0].reason).toMatch(/folder/i);
    expect(s.of("walk.step")).toHaveLength(0);
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
      '{"v":1,"id":"a","type":"walk.acted","walk":"w1","how":"pressed","index":2}',
      '{"v":1,"id":"a","type":"walk.answer","walk":"w1","worked":true}',
      '{"v":1,"id":"a","type":"walk.skip","walk":"w1"}',
      '{"v":1,"id":"a","type":"walk.stop","walk":"w1"}',
    ]) expect(parseCommand(l).ok, l).toBe(true);
    expect(parseCommand('{"v":1,"id":"a","type":"walk.acted","walk":"w1","how":"typed"}').ok).toBe(false);
    expect(parseCommand('{"v":1,"id":"a","type":"walk.start","project":"p"}').ok).toBe(false);
    expect(parseEvent('{"v":1,"id":"e","type":"walk.wait","walk":"w1","say":"words"}').ok).toBe(false);
    for (const l of [
      '{"v":1,"id":"e","type":"walk.lessons","project":"p","lessons":[]}',
      '{"v":1,"id":"e","type":"walk.step","walk":"w1","project":"p","lesson":"keys","title":"T","index":0,"total":3,"variant":"main","say":"s","find":"f","ask":true}',
      '{"v":1,"id":"e","type":"walk.ask","walk":"w1","index":0}',
      '{"v":1,"id":"e","type":"walk.help","walk":"w1","say":"words"}',
      '{"v":1,"id":"e","type":"walk.wait","walk":"w1","index":1,"say":"words"}',
      '{"v":1,"id":"e","type":"walk.done","walk":"w1","project":"p","lesson":"keys","title":"T","steps":3}',
      '{"v":1,"id":"e","type":"walk.stopped","walk":"w1","reason":"r"}',
    ]) expect(parseEvent(l).ok, l).toBe(true);
  });
});
