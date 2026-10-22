// Guided lessons on the card: the state follows the runner's walk events, and only the walk the person started.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { initial, reduce, type Model } from "./model.ts";
import { SETTINGS_LESSON_ID, walkActed, walkAnswer, walkList, walkSkip, walkStart, walkStop } from "./commands.ts";
import { KEYS_START, setKeysNow } from "./keys.ts";
import { PRODUCT } from "./strings.ts";

const run = (events: Record<string, unknown>[], m: Model = initial()): Model => events.reduce<Model>((x, e) => reduce(x, e as never), m);
const step = (over: Record<string, unknown> = {}) => ({ type: "walk.step", walk: "w1", project: "p", lesson: "keys", title: "Add your keys", index: 0, total: 3, variant: "main", say: "Open settings", find: "the Settings link", ask: true, ...over });
const started = [{ type: "ui.walkRequested", walk: "w1" }];

describe("lessons on the card", () => {
  test("the list of lessons is kept", () => {
    const m = run([{ type: "walk.lessons", project: "p", lessons: [{ id: "keys", title: "Add your keys", app: "Demo", goal: "g", steps: 3, saved: true }] }]);
    expect(m.lessons?.[0]).toMatchObject({ id: "keys", saved: true });
  });
  test("a lesson made from the project keeps its mark, so the list can say so", () => {
    const m = run([{ type: "walk.lessons", project: "p", lessons: [{ id: SETTINGS_LESSON_ID, title: "Set up the settings this project needs", app: "Your editor", goal: "g", steps: 3, saved: false, fromProject: true }] }]);
    expect(m.lessons?.[0]).toMatchObject({ id: "from-project-settings", fromProject: true });
  });
  test("a step from the walk the person started is shown", () => {
    expect(run([...started, step()]).walk).toMatchObject({ stage: "step", id: "w1", index: 0, total: 3, say: "Open settings", ask: true });
  });
  test("a step keeps the lesson's own words, so the keys in use are filled in when it is shown and said, not when it arrived", () => {
    // The keys changed before the step arrived; the model still keeps the words as sent (card.tsx and speech.ts fill in
    // the keys in use each time they draw or speak, so a later change in Settings shows at once).
    const say = `Press Control, Option, Command and F in ${PRODUCT}.`;
    setKeysNow({ using: { ...KEYS_START.using, problem: "control-option-command-p" }, picked: { ...KEYS_START.picked, problem: "control-option-command-p" } });
    try {
      const m = run([...started, step({ say, log: [{ say, how: "done" }] }), { type: "walk.wait", walk: "w1", index: 0, say }]);
      expect(m.walk).toMatchObject({ say, note: say });
      expect(m.walk?.log[0]?.say).toBe(say);
      expect(run([...started, step(), { type: "walk.help", walk: "w1", say }]).walk?.note).toBe(say);
    } finally { setKeysNow(KEYS_START); }
  });
  test("a step from a walk nobody started here is ignored", () => {
    expect(run([step()]).walk).toBeNull();
    expect(run([...started, step({ walk: "other" })]).walk).toBeNull();
  });
  test("asking, help, done and stopped follow the events", () => {
    expect(run([...started, step(), { type: "walk.ask", walk: "w1", index: 0 }]).walk?.stage).toBe("asking");
    expect(run([...started, step(), { type: "walk.help", walk: "w1", say: "words" }]).walk).toMatchObject({ stage: "help", note: "words" });
    expect(run([...started, step(), { type: "walk.done", walk: "w1", project: "p", lesson: "keys", title: "T", steps: 3 }]).walk?.stage).toBe("done");
    expect(run([...started, step(), { type: "walk.stopped", walk: "w1", reason: "Stopped." }]).walk).toMatchObject({ stage: "stopped", note: "Stopped." });
  });
  test("the finished steps travel with the step so the card can list them", () => {
    const m = run([...started, step({ index: 2, log: [{ say: "Open settings", how: "done" }, { say: "Pick the pane", how: "skipped" }] })]);
    expect(m.walk?.log).toEqual([{ say: "Open settings", how: "done" }, { say: "Pick the pane", how: "skipped" }]);
    expect(run([...started, step()]).walk?.log).toEqual([]);
    expect(run([...started, step({ log: "junk" })]).walk?.log).toEqual([]);
  });
  test("after a pause, 'did you already do this?' is its own stage, and the next step leaves it", () => {
    const m = run([...started, step({ index: 1, already: true })]);
    expect(m.walk).toMatchObject({ stage: "already", index: 1, say: "Open settings" });
    expect(run([...started, step({ already: "yes" })]).walk?.stage).toBe("step");   // only a real true counts
    expect(run([...started, step({ index: 1, already: true }), step({ index: 2 })]).walk).toMatchObject({ stage: "step", index: 2 });
    expect(run([...started, step({ index: 1, already: true }), step({ index: 1 })]).walk).toMatchObject({ stage: "step", index: 1 });   // "No": the same step, to do
  });
  test("a step the project cannot see yet stays on the card with plain words on what is missing; the next step clears them", () => {
    const wait = { type: "walk.wait", walk: "w1", index: 0, say: "I do not see SHOP_NAME in the project's settings files yet." };
    const m = run([...started, step({ ask: false }), wait]);
    expect(m.walk).toMatchObject({ stage: "step", index: 0, note: wait.say });
    expect(run([step({ index: 1, ask: false })], m).walk).toMatchObject({ stage: "step", index: 1 });
    expect(run([step({ index: 1, ask: false })], m).walk?.note).toBeUndefined();
    // Words for another walk, or an older step, change nothing.
    expect(run([...started, step({ ask: false }), { ...wait, walk: "other" }]).walk?.note).toBeUndefined();
    expect(run([...started, step({ index: 2, ask: false }), wait]).walk?.note).toBeUndefined();
    expect(run([...started, step({ ask: false }), { type: "walk.help", walk: "w1", say: "h" }, wait]).walk?.stage).toBe("help");
  });
  test("only the person's own press on the card says 'I did it'; a ring click is only a click", () => {
    const card = readFileSync(new URL("./card.tsx", import.meta.url), "utf8");
    const press = card.split("\n").find((l) => l.includes("{S.lessonDid}"))!;
    expect(press).toContain('"pressed"');
    expect(card).not.toMatch(/setTimeout\(\(\) => void send\(walkActed\([^)]*"pressed"/);
  });
  test("a new step after asking goes back to showing the step", () => {
    const m = run([...started, step(), { type: "walk.ask", walk: "w1", index: 0 }, step({ index: 1, say: "Copy it", ask: false })]);
    expect(m.walk).toMatchObject({ stage: "step", index: 1, say: "Copy it", ask: false });
  });
  test("events for another walk do not touch this one", () => {
    const m = run([...started, step(), { type: "walk.help", walk: "other", say: "x" }, { type: "walk.done", walk: "other", project: "p", lesson: "k", title: "T", steps: 1 }]);
    expect(m.walk?.stage).toBe("step");
  });
  test("Stop everything, a folder change and an engine restart end it; a late step does not bring it back", () => {
    for (const end of ["app.stop_everything", "ui.projectChanged", "app.runner_restarted"]) {
      const m = run([...started, step(), { type: end }, step({ index: 1 })]);
      expect(m.walk, end).toBeNull();
    }
  });
  test("a lesson that could not start still says why", () => {
    const m = run([...started, { type: "walk.stopped", walk: "w1", reason: "I could not find that lesson." }]);
    expect(m.walk).toMatchObject({ stage: "stopped", note: "I could not find that lesson." });
    expect(run([{ type: "walk.stopped", walk: "w1", reason: "x" }]).walk).toBeNull();
  });
  test("closing it clears it", () => {
    expect(run([...started, step(), { type: "ui.walkClosed" }]).walk).toBeNull();
  });
});

describe("lesson commands", () => {
  test("they are built the way the runner expects", () => {
    expect(walkList("p")).toMatchObject({ type: "walk.list", project: "p" });
    const s = walkStart("p", "keys", true) as any; expect(s).toMatchObject({ type: "walk.start", project: "p", lesson: "keys", fresh: true });
    expect(walkStart("p", "keys")).not.toHaveProperty("fresh");
    expect(walkActed("w1", "clicked", 2)).toMatchObject({ type: "walk.acted", walk: "w1", how: "clicked", index: 2 });
    expect(walkActed("w1", "pressed", 2)).toMatchObject({ type: "walk.acted", walk: "w1", how: "pressed", index: 2 });
    expect(walkAnswer("w1", false)).toMatchObject({ type: "walk.answer", walk: "w1", worked: false });
    expect(walkSkip("w1")).toMatchObject({ type: "walk.skip", walk: "w1" });
    expect(walkStop("w1")).toMatchObject({ type: "walk.stop", walk: "w1" });
    // About this project starts the lesson made from its own settings: the runner's name for it, bound to the project.
    expect(walkStart("p", SETTINGS_LESSON_ID)).toMatchObject({ type: "walk.start", project: "p", lesson: "from-project-settings" });
  });
});

// HeyClicky v1.0.53 parity: a lesson that starts where the person already is (teach.startWhereYouAre, off unless turned
// on) says how many steps it passed by, once, on its first step, and offers to do them again (Start over from step one).
describe("a lesson that starts where the person already is", () => {
  test("the first step says how many steps were passed by; the next step no longer does", () => {
    const m = run([...started, step({ index: 2, passed: 2, log: [{ say: "Add the key", how: "done" }, { say: "Save the file", how: "done" }] })]);
    expect(m.walk?.passed).toBe(2);
    expect(run([step({ index: 3 })], m).walk?.passed).toBeUndefined();
    for (const bad of [0, -1, 1.5, "2", null]) expect(run([...started, step({ passed: bad })]).walk?.passed).toBeUndefined();
  });
  test("the card says it in plain words, and Do them again starts the same lesson over from step one", async () => {
    const { S } = await import("./strings.ts");
    expect(S.lessonPassed(1)).toMatch(/1 step/);
    expect(S.lessonPassed(3)).toMatch(/3 steps/);
    for (const t of [S.lessonPassed(2), S.lessonDoAgain]) expect(/[–—]/.test(t), t).toBe(false);
    const card = readFileSync(new URL("./card.tsx", import.meta.url), "utf8");
    expect(card).toContain("S.lessonPassed(m.walk.passed)");
    expect(card).toMatch(/onClick=\{\(\) => beginLesson\(m\.walk!\.lesson, true\)\}>\{S\.lessonDoAgain\}/);
  });
});
