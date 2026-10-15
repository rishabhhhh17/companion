// Guided lessons on the card: the state follows the runner's walk events, and only the walk the person started.
import { describe, expect, test } from "bun:test";
import { initial, reduce, type Model } from "./model.ts";
import { walkActed, walkAnswer, walkList, walkSkip, walkStart, walkStop } from "./commands.ts";

const run = (events: Record<string, unknown>[], m: Model = initial()): Model => events.reduce<Model>((x, e) => reduce(x, e as never), m);
const step = (over: Record<string, unknown> = {}) => ({ type: "walk.step", walk: "w1", project: "p", lesson: "keys", title: "Add your keys", index: 0, total: 3, variant: "main", say: "Open settings", find: "the Settings link", ask: true, ...over });
const started = [{ type: "ui.walkRequested", walk: "w1" }];

describe("lessons on the card", () => {
  test("the list of lessons is kept", () => {
    const m = run([{ type: "walk.lessons", project: "p", lessons: [{ id: "keys", title: "Add your keys", app: "Demo", goal: "g", steps: 3, saved: true }] }]);
    expect(m.lessons?.[0]).toMatchObject({ id: "keys", saved: true });
  });
  test("a step from the walk the person started is shown", () => {
    expect(run([...started, step()]).walk).toMatchObject({ stage: "step", id: "w1", index: 0, total: 3, say: "Open settings", ask: true });
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
    expect(walkAnswer("w1", false)).toMatchObject({ type: "walk.answer", walk: "w1", worked: false });
    expect(walkSkip("w1")).toMatchObject({ type: "walk.skip", walk: "w1" });
    expect(walkStop("w1")).toMatchObject({ type: "walk.stop", walk: "w1" });
  });
});
