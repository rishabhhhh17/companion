// Five everyday starter lessons, as TEST CASES only (F17: authored lessons for general apps are not shipped at launch):
// share a document, make a mail rule, make a chart in a spreadsheet, change a system setting, rename files in Finder. Each
// is run through the walkthrough engine in anywhere mode (no project, every step asks "did that work?"), with each step's
// ring asked of a stand in vision lane exactly as the card asks it, as a tutor for the lesson's app. No screen, no model.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileWalkStore, loadLessons, NO_PROJECT, projectChecker, type Lesson } from "../src/walk.ts";
import { WalkService } from "../src/walkservice.ts";
import { AssistService, ImageStore, visionSystem, type LocateReq } from "../src/lanes.ts";
import { RunnerSettings } from "../src/settings.ts";
import { NEVER_LINE } from "../src/tutor.ts";
import { parseEvent, type Event } from "../../protocol/index.ts";

const DIR = join(import.meta.dir, "fixtures", "everyday-lessons");
const SHIPPED = join(import.meta.dir, "..", "..", "lessons");
/** The app each lesson is for, by the id the shell would send for it. */
const BUNDLE: Record<string, string> = { Pages: "com.apple.iWork.Pages", Mail: "com.apple.mail", Numbers: "com.apple.iWork.Numbers", "System Settings": "com.apple.systempreferences", Finder: "com.apple.finder" };
const { lessons, problems } = loadLessons([DIR]);

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });

describe("the five everyday lessons are sound test cases", () => {
  test("all five load with no problems: share, a mail rule, a chart, a system setting, renaming files", () => {
    expect(problems).toEqual([]);
    expect(lessons.map((l) => l.id).sort()).toEqual(["everyday-dark-mode", "everyday-mail-rule", "everyday-rename-files", "everyday-share-document", "everyday-sheet-chart"]);
    expect(lessons.map((l) => l.app).sort()).toEqual(["Finder", "Mail", "Numbers", "Pages", "System Settings"]);
  });
  test("each is anywhere mode: no project, and every step asks the person whether it worked", () => {
    for (const l of lessons) {
      expect(l.needsProject, l.id).toBe(false);
      expect(l.steps.every((s) => s.check.kind === "ask"), l.id).toBe(true);
      expect(l.status, l.id).toBe("draft");
    }
  });
  test("plain steps, one action each, never about projects or code", () => {
    for (const l of lessons) for (const s of [...l.steps, ...l.steps.flatMap((x) => (x.instead ? [x.instead] : []))]) {
      expect(`${s.say} ${s.find}`, `${l.id}`).not.toMatch(/project|code|terminal|deploy|repositor|command line/i);
      expect(s.say.split(/\s+/).length, `${l.id}: ${s.say}`).toBeLessThanOrEqual(20);
    }
  });
  test("they are not shipped: no lesson file in lessons/ is one of them or for one of their apps", () => {
    const shipped = loadLessons([SHIPPED]).lessons;
    expect(shipped.length).toBeGreaterThan(0);
    for (const l of lessons) {
      expect(shipped.some((s) => s.id === l.id), l.id).toBe(false);
      // The only shipped lessons in an everyday app are for Companion's own permissions in System Settings (F17 4.6).
      expect(shipped.filter((s) => s.app === l.app && !s.id.startsWith("companion-")).map((s) => s.id), l.app).toEqual([]);
    }
    expect(readdirSync(SHIPPED).some((n) => n.startsWith("everyday-"))).toBe(false);
  });
  test("the card asks for a lesson step's ring with these words, so the stand in below asks the same", () => {
    const card = readFileSync(join(import.meta.dir, "..", "..", "app", "src", "card.tsx"), "utf8");
    expect(card).toContain("question: `Where do I click for this: ${wk.find}`");
  });
});

/** The walkthrough engine with no project, and a Show me lane whose model is a stand in that names one target. */
function rig() {
  const data = realpathSync(mkdtempSync(join(tmpdir(), "companion-everyday-")));
  made.push(data);
  const events: any[] = [];
  const walks = new WalkService({ emit: (e) => events.push(e), lessonDirs: [DIR], store: new FileWalkStore(join(data, "walks")), checker: projectChecker, now: () => "2026-10-20T10:00:00Z" });
  const settings = new RunnerSettings();
  settings.apply({ v: 1, id: "s", type: "settings.apply", values: { "showme.everydayTutor": true } });
  const asked: LocateReq[] = [], points: Event[] = [];
  const images = new ImageStore();
  const vision = { locate: async (r: LocateReq) => { asked.push(r); return { point: { x: 200, y: 120, targetText: "Here", confidence: 0.85, caption: "Click here" }, costUsd: 0.01 }; } };
  const assist = new AssistService({ fast: { run: async () => ({ text: "", costUsd: 0 }) }, vision, images, emit: (e) => points.push(e), settings });
  const cmd = (type: string, extra: Record<string, unknown> = {}) => walks.handle({ v: 1, id: "w1", type, ...extra } as never);
  /** One look for the current step, as the card asks for it, with the lesson's app in front. */
  const point = async (find: string, app: string) => {
    const req = `sm_${asked.length + 1}`;
    images.put(req, { base64: "AAAA", mediaType: "image/jpeg", w: 1280, h: 800 });
    await assist.handle({ v: 1, id: req, type: "assist.locate", req, question: `Where do I click for this: ${find}`, image: { ref: req, w: 1280, h: 800 }, app } as never);
    return { req: asked.at(-1)!, point: points.at(-1) as any };
  };
  return { events, cmd, point, asked, last: (t: string) => events.filter((e) => e.type === t).at(-1) };
}

async function walkThrough(l: Lesson, answers: (stepId: string, variant: string) => boolean = () => true) {
  const r = rig();
  await r.cmd("walk.start", { project: NO_PROJECT, lesson: l.id });
  const shown: { id: string; variant: string }[] = [];
  for (let guard = 0; guard < 40; guard++) {
    const step = r.last("walk.step");
    if (r.last("walk.done") || r.last("walk.help")) break;
    expect(parseEvent(JSON.stringify(step)).ok).toBe(true);
    const id = l.steps[step.index].id;
    shown.push({ id, variant: step.variant });
    // The ring for this step: asked as a tutor for the lesson's app, with the step's own words.
    const { req, point } = await r.point(step.find, BUNDLE[l.app]);
    expect(req.question).toBe(`Where do I click for this: ${step.find}`);
    expect(req.tutor).toEqual({ kind: "everyday", app: l.app });
    expect(point).toMatchObject({ type: "assist.point", req: expect.stringMatching(/^sm_/) });
    // The person clicks, is asked "did that work?", and answers.
    await r.cmd("walk.acted", { walk: "w1", index: step.index, how: "clicked" });
    expect(r.last("walk.ask")).toMatchObject({ walk: "w1", index: step.index });
    const before = r.events.length;
    await r.cmd("walk.answer", { walk: "w1", index: step.index, worked: answers(id, step.variant) });
    expect(r.events.length).toBeGreaterThan(before);
  }
  return { ...r, shown };
}

describe("each lesson, walked in anywhere mode with stubs", () => {
  for (const l of lessons) {
    test(`${l.title} (${l.app}): every step is pointed at as a tutor for ${l.app}, asked about, and the walk ends done`, async () => {
      const r = await walkThrough(l);
      expect(r.shown.map((s) => s.id)).toEqual(l.steps.map((s) => s.id));
      expect(r.last("walk.done")).toMatchObject({ walk: "w1", project: NO_PROJECT, lesson: l.id, steps: l.steps.length });
      // What the vision lane would send as its system prompt for these looks: a tutor for this app, nothing about code.
      const system = visionSystem(r.asked[0].tutor);
      expect(system).toContain(`tutor for ${l.app}`);
      expect(system.replace(NEVER_LINE, "")).not.toMatch(/project|code|deploy|terminal/i);
    });
  }

  test("a step that did not work gets its other way, and the first way is never shown again", async () => {
    const l = lessons.find((x) => x.id === "everyday-mail-rule")!;
    const r = await walkThrough(l, (id, variant) => !(id === "then" && variant === "main"));
    const then = r.shown.filter((s) => s.id === "then");
    expect(then).toEqual([{ id: "then", variant: "main" }, { id: "then", variant: "instead" }]);
    expect(r.last("walk.done")).toBeTruthy();
  });

  test("a step with no other way that does not work hands back to the person in words, and is not pointed at again", async () => {
    const l = lessons.find((x) => x.id === "everyday-sheet-chart")!;
    const r = await walkThrough(l, (id) => id !== "kind");
    expect(r.last("walk.done")).toBeUndefined();
    expect(r.last("walk.help").say).toContain("I will not point at it again");
    expect(r.shown.filter((s) => s.id === "kind").length).toBe(1);
  });

  test("Stop ends a lesson at once and keeps the place for later", async () => {
    const l = lessons.find((x) => x.id === "everyday-rename-files")!;
    const r = rig();
    await r.cmd("walk.start", { project: NO_PROJECT, lesson: l.id });
    await r.cmd("walk.acted", { walk: "w1", index: 0, how: "clicked" });
    await r.cmd("walk.answer", { walk: "w1", index: 0, worked: true });
    await r.cmd("walk.stop", { walk: "w1" });
    expect(r.last("walk.stopped")).toMatchObject({ walk: "w1", reason: "Stopped. Your place is saved." });
  });

  test("with the setting off (the usual value) the same steps are asked as before, with no tutor", async () => {
    const l = lessons[0];
    const settings = new RunnerSettings();
    const asked: LocateReq[] = [];
    const images = new ImageStore();
    images.put("sm_1", { base64: "AAAA", mediaType: "image/jpeg", w: 1280, h: 800 });
    const assist = new AssistService({ fast: { run: async () => ({ text: "", costUsd: 0 }) }, vision: { locate: async (q: LocateReq) => { asked.push(q); return { point: null, costUsd: 0 }; } }, images, emit: () => {}, settings });
    await assist.handle({ v: 1, id: "c", type: "assist.locate", req: "sm_1", question: `Where do I click for this: ${l.steps[0].find}`, image: { ref: "sm_1", w: 1280, h: 800 }, app: BUNDLE[l.app] } as never);
    expect(asked[0].tutor).toBeUndefined();
  });
});
