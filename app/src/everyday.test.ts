// Everyday stuck moments: the hero key works in any app. With no project, or with an app in front that is not a code tool
// (a spreadsheet, a document, Mail, System Settings), the key looks at the screen once, light first, names the problem in
// two sentences, walks the person through the fix, looks again only on a press, and says fixed only when the error is gone.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { checkQuestion, everydayGoal, frontOf, heroRoute, whyShown, type Everyday } from "./everyday.ts";
import { initial, reduce, type Model } from "./model.ts";
import { need, islandLine } from "./home.ts";
import { defOf } from "../../protocol/settings.ts";
import { S } from "./strings.ts";

const ev = (o: Record<string, unknown>) => ({ v: 1, id: "e", ...o });
const run = (events: Record<string, unknown>[], from: Model = initial()) => events.reduce<Model>((m, e) => reduce(m, e as never), from);
const card = readFileSync(new URL("./card.tsx", import.meta.url), "utf8");
const looking = [ev({ type: "ui.everydayLook", mode: "everyday" }), ev({ type: "app.showme", stage: "looking", message: "Looking at your screen" }), ev({ type: "app.showme", stage: "thinking", message: "Finding it", req: "sm_1" })];
const problem = (o: Record<string, unknown> = {}) => ev({ type: "assist.problem", req: "sm_1", mode: "everyday", found: true, kind: "sheet", code: "#REF!", problem: "A cell on your screen shows #REF!. The formula points at a cell that is no longer there.", why: ["One.", "Two."], question: { text: "Q?", options: ["a", "b"], correct: 0 }, steps: 1, fromTable: true, usdEstimate: 0, ...o });
const found = () => run([...looking, problem()]);
const recheck = (from: Model, o: Record<string, unknown>) => run([ev({ type: "ui.everydayLook", mode: "recheck" }), ev({ type: "app.showme", stage: "thinking", message: "Finding it", req: "sm_2" }), ev({ type: "assist.problem", req: "sm_2", mode: "recheck", steps: 0, usdEstimate: 0, ...o })], from);

describe("which way the key goes", () => {
  test("with the everyday path on (the usual): no project, or an app that is not a code tool, looks at the screen", () => {
    expect(heroRoute({ everyday: true, project: "", front: "code" })).toBe("screen");
    expect(heroRoute({ everyday: undefined, project: "", front: "unknown" })).toBe("screen");
    expect(heroRoute({ everyday: true, project: "/Users/me/site", front: "other" })).toBe("screen");
  });
  test("a project with a code tool, a browser (its own page or a builder) or Companion in front is checked as before", () => {
    for (const front of ["code", "browser", "own", "unknown"]) expect(heroRoute({ everyday: true, project: "/Users/me/site", front }), front).toBe("project");
  });
  test("a practice copy always runs its own Find, whatever app is in front", () => {
    expect(heroRoute({ everyday: true, project: "/Users/me/stuck-signup", front: "other", practice: true })).toBe("project");
  });
  test("turned off, the key does exactly what it did before", () => {
    expect(heroRoute({ everyday: false, project: "", front: "other" })).toBe("noProject");
    expect(heroRoute({ everyday: false, project: "/Users/me/site", front: "other" })).toBe("project");
  });
  test("the shell says only the kind of app in front; anything else is unknown", () => {
    expect(frontOf({ front: "other" })).toBe("other");
    expect(frontOf({ front: "com.microsoft.Excel" })).toBe("unknown");
    expect(frontOf(true)).toBe("unknown");
    expect(frontOf(null)).toBe("unknown");
  });
});

describe("the look and what it found", () => {
  test("the problem is shown for the look still waiting, in its own words", () => {
    const m = found();
    expect(m.everyday).toMatchObject({ stage: "found", code: "#REF!", fromTable: true, req: "sm_1" });
    expect(m.everyday?.problem).toContain("#REF!");
    expect(need(m)).toMatchObject({ tab: "now", why: S.everydayTitle });
  });
  test("an answer to another look, or with no look waiting, is old news", () => {
    expect(run([...looking, problem({ req: "sm_9" })]).everyday?.stage).toBe("looking");
    expect(run([problem()]).everyday).toBeNull();
  });
  test("nothing wrong on screen is said as such", () => {
    expect(run([...looking, problem({ found: false, problem: undefined, steps: 0 })]).everyday?.stage).toBe("none");
  });
  test("a look that failed (Claude out of reach, no permission, hidden) leaves nothing behind; the Show me panel says why", () => {
    expect(run([...looking, ev({ type: "assist.error", req: "sm_1", reason: "boom" })]).everyday).toBeNull();
    expect(run([ev({ type: "ui.everydayLook", mode: "everyday" }), ev({ type: "app.showme", stage: "needs_permission", message: "Allow Screen Recording" })]).everyday).toBeNull();
  });
  test("Stop everything ends it", () => {
    expect(run([ev({ type: "app.stop_everything" })], found()).everyday).toBeNull();
  });
  test("closing it ends it", () => { expect(run([ev({ type: "ui.everydayClosed" })], found()).everyday).toBeNull(); });
});

describe("prove it: fixed only when the error is gone", () => {
  test("a look again that sees it gone says fixed", () => {
    const m = recheck(found(), { found: false, gone: "yes" });
    expect(m.everyday?.stage).toBe("fixed");
    expect(m.everyday?.problem).toContain("#REF!");   // what was fixed is still named
  });
  test("still there: not fixed, with what is still wrong", () => {
    const m = recheck(found(), { found: true, gone: "no", problem: "C4 still shows #REF!." });
    expect(m.everyday).toMatchObject({ stage: "still", problem: "C4 still shows #REF!." });
  });
  test("it cannot tell from the screen: it asks Did that work?, and the person's yes is never called fixed", () => {
    const ask = recheck(found(), { found: false, gone: "unsure" });
    expect(ask.everyday?.stage).toBe("ask");
    expect(run([ev({ type: "ui.everydaySaid", worked: true })], ask).everyday?.stage).toBe("saidWorks");
    expect(run([ev({ type: "ui.everydaySaid", worked: false })], ask).everyday?.stage).toBe("still");
  });
  test("a look again that failed goes back to where it was, so Check again is still there", () => {
    const m = run([ev({ type: "ui.everydayLook", mode: "recheck" }), ev({ type: "app.showme", stage: "thinking", message: "Finding it", req: "sm_2" }), ev({ type: "assist.error", req: "sm_2", reason: "boom" })], found());
    expect(m.everyday?.stage).toBe("found");
  });
  test("the card says Fixed only on a look that saw it gone", () => {
    const uses = card.split("\n").filter((l) => l.includes("S.everydayFixed"));
    expect(uses.length).toBe(1);
    expect(uses[0]).toContain('ed.stage === "fixed"');
  });
});

describe("the questions it asks", () => {
  test("the goal names the problem, so the look again knows what it was fixing", () => {
    expect(everydayGoal("A cell shows #N/A.")).toBe("Fix this problem on my screen: A cell shows #N/A.");
    const q = checkQuestion({ goal: everydayGoal("A cell shows #N/A."), steps: ["Click C4"] });
    expect(q).toContain("#N/A");
    expect(q).toContain("Click C4");
  });
});

describe("show you why", () => {
  const ed: Everyday = { stage: "fixed", problem: "p", why: ["One.", "Two."], question: { text: "Q?", options: ["a", "b"], correct: 0 } };
  test("two lines and the check question by default; reasons only, or nothing, by the setting", () => {
    expect(whyShown(ed, undefined)).toEqual({ checkpoint: "everyday", bullets: ["One.", "Two."], question: ed.question });
    expect(whyShown(ed, "reasons")).toEqual({ checkpoint: "everyday", bullets: ["One.", "Two."] });
    expect(whyShown(ed, "off")).toBeNull();
    expect(whyShown({ ...ed, why: [] }, undefined)).toBeNull();
  });
});

describe("the card", () => {
  const key = card.slice(card.indexOf('const offKey = listen("find-problem"'), card.indexOf("const offFound ="));
  test("the key chooses with heroRoute and the setting, before anything is checked or looked at", () => {
    expect(key).toContain('heroRoute({ everyday: setting("point.everyday"), project: projectRef.current, front: frontOf(e.payload), practice: nowModel.current.practice?.project === projectRef.current })');
    expect(key.indexOf("heroRoute(")).toBeLessThan(key.indexOf("send(findProblem("));
    expect(key).toContain("lookEveryday()");
  });
  test("the everyday look is Show me's own look (light first, nothing kept) with its mode", () => {
    const look = card.slice(card.indexOf("const lookEveryday = "), card.indexOf("const lookEveryday = ") + 600);
    expect(look).toContain('dispatch({ type: "ui.everydayLook", mode: "everyday" })');
    expect(look).toContain('"everyday")');
    expect(card).toContain('invoke("showme_start", { question, allScreens: allScreensOn(), settle, mode })');
  });
  test("a step of an everyday fix looks again with the recheck, so the next look says whether the error is gone", () => {
    const next = card.slice(card.indexOf("const nextStep = "), card.indexOf("const nextStep = ") + 900);
    expect(next).toContain('"recheck"');
  });
  test("after a project check that found nothing wrong, the screen can be looked at instead, and the other way round", () => {
    expect(card).toContain("S.everydayLookInstead");
    const back = card.split("\n").find((l) => l.includes("S.everydayCheckProject")) ?? "";
    expect(back).toContain('ed.stage === "none" && project');
    expect(back).toContain("pressed(); dispatch({ type: \"ui.everydayClosed\" }); dispatch({ type: \"ui.findProblem\" }); void send(findProblem(project));");
  });
});

describe("settings and words", () => {
  test("the everyday path is a setting, on by default since it only acts on the key; the why has its own", () => {
    expect(defOf("point.everyday")).toMatchObject({ kind: "switch", default: true, section: "pointing", applies: ["pages"] });
    expect(defOf("point.everydayWhy")).toMatchObject({ kind: "choice", default: "reasonsAndQuestion", options: ["reasonsAndQuestion", "reasons", "off"], section: "pointing" });
    expect(S.set["point.everyday"].label.length).toBeGreaterThan(5);
    expect(S.set["point.everydayWhy"].options).toBeTruthy();
  });
  test("the first run and the island say the key works in any app", () => {
    expect(S.pointHint).toMatch(/any app/);
    expect(S.obWelcome1 + S.obWelcome2).toMatch(/any app/);
    expect(S.islandReady).toMatch(/any app/);
    expect(islandLine({ ...initial(), runnerUp: true, connected: "api_key" })).toBe(S.islandReady);
    expect(S.islandReady.length).toBeLessThanOrEqual(64);
  });
  test("plain words, no em dashes", () => {
    const words = [S.everydayTitle, S.everydayNone, S.everydayFixed, S.everydaySaidWorks, S.everydayAsk, S.everydayCheck, S.everydaySteps, S.everydayChecking, S.everydayStill, S.everydayFromTable, S.everydayLookInstead, S.everydayCheckProject, S.everydayWhyTitle, S.pointHint, S.islandReady, S.obWelcome1, S.set["point.everyday"].help, S.set["point.everydayWhy"].help];
    for (const w of words) { expect(typeof w).toBe("string"); expect(w).not.toContain("\u2014"); }
  });
});
