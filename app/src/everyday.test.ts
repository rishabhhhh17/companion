// Everyday stuck moments: the hero key works in any app. With no project, or with an app in front that is not a code tool
// (a spreadsheet, a document, Mail, System Settings), the key looks at the screen once, light first, names the problem in
// two sentences, walks the person through the fix, looks again only on a press, and says fixed only when the error is gone.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { checkQuestion, everydayGoal, everydayStepsAsk, frontOf, heroRoute, mainAction, nextLookMode, whyShown, type Everyday } from "./everyday.ts";
import { initial, reduce, type Model } from "./model.ts";
import { need, islandLine } from "./home.ts";
import { defOf } from "../../protocol/settings.ts";
import { S, PRODUCT } from "./strings.ts";

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
  test(`a project with a code tool, a browser (its own page or a builder) or ${PRODUCT} in front is checked as before`, () => {
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
    expect(ask.everyday?.ask).toBeUndefined();
    expect(run([ev({ type: "ui.everydaySaid", worked: true })], ask).everyday?.stage).toBe("saidWorks");
    expect(run([ev({ type: "ui.everydaySaid", worked: false })], ask).everyday?.stage).toBe("still");
  });
  test("only the look says it is gone (a guess from a picture): it asks, and never says Fixed", () => {
    const m = recheck(found(), { found: false, gone: "looks" });
    expect(m.everyday).toMatchObject({ stage: "ask", ask: "looks" });
    const said = run([ev({ type: "ui.everydaySaid", worked: true })], m);
    expect(said.everyday).toMatchObject({ stage: "saidWorks", ask: "looks" });
  });
  test("the code the first look read is still read: it says so and asks, never Fixed", () => {
    const m = recheck(found(), { found: false, gone: "unsure", code: "#REF!" });
    expect(m.everyday).toMatchObject({ stage: "ask", ask: "stillRead", code: "#REF!" });
    // A later verdict starts clean.
    expect(recheck(m, { found: false, gone: "unsure" }).everyday?.ask).toBeUndefined();
  });
  test("still there in Claude's own words is never shown under the table's label", () => {
    const m = recheck(found(), { found: true, gone: "no", problem: "C4 now shows a different number." });
    expect(m.everyday).toMatchObject({ stage: "still", problem: "C4 now shows a different number.", code: "#REF!" });
    expect(m.everyday?.fromTable).toBeUndefined();
    const t = recheck(found(), { found: true, gone: "no", problem: "Table words.", code: "#REF!", fromTable: true, fixes: ["Undo it."] });
    expect(t.everyday).toMatchObject({ stage: "still", fromTable: true, fixes: ["Undo it."] });
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
  test("the card words the question by why it asks", () => {
    expect(card).toContain('ed.ask === "looks" ? S.everydayLooksFixed : ed.ask === "stillRead" && ed.code ? S.everydayStillRead(ed.code) : S.everydayAsk');
    expect(S.everydayLooksFixed).toMatch(/Did it work\?/);
    expect(S.everydayLooksFixed).not.toMatch(/^Fixed/);
    expect(S.everydayStillRead("#REF!")).toContain("#REF!");
  });
});

describe("only the everyday walkthrough is an everyday fix", () => {
  test("a step of the everyday walkthrough looks again with the recheck; any other walkthrough never does", () => {
    const f = found().everyday;
    expect(nextLookMode(true, f)).toBe("recheck");
    expect(nextLookMode(true, { ...f!, stage: "still" })).toBe("recheck");
    // An ordinary Show me question asked while the everyday panel is up (S, or the ask box): an ordinary next step.
    expect(nextLookMode(false, f)).toBeUndefined();
    for (const stage of ["fixed", "ask", "none", "saidWorks", "looking", "checking"] as const) expect(nextLookMode(true, { ...f!, stage }), stage).toBeUndefined();
    expect(nextLookMode(true, null)).toBeUndefined();
  });
  test("an ordinary Show me question closes the everyday panel, so no verdict can land on it", () => {
    const m = run([ev({ type: "ui.everydayClosed" }), ev({ type: "assist.problem", req: "sm_1", mode: "recheck", found: false, gone: "yes", steps: 0, usdEstimate: 0 })], found());
    expect(m.everyday).toBeNull();
  });
  test("the card marks the everyday walkthrough itself, and an ordinary question clears the mark and closes the panel", () => {
    const show = card.slice(card.indexOf("const showMe = "), card.indexOf("// An everyday stuck moment: Show me's own look"));
    expect(show).toContain("everydayWalk.current = !!mode;");
    expect(show).toContain('if (!mode) { lastWalk.current = null; if (nowModel.current.everyday) dispatch({ type: "ui.everydayClosed" }); }');
    const next = card.slice(card.indexOf("const nextStep = "), card.indexOf("// How this answer's ring went"));
    expect(next).toContain("nextLookMode(everydayWalk.current, nowModel.current.everyday)");
    const check = card.slice(card.indexOf("const checkEveryday = "), card.indexOf("latest.current.lookEveryday = "));
    expect(check).toContain("everydayWalk.current && walk ? walk : null");
  });
  test("a look again carries the code the first look read, so the engine can prove it gone", () => {
    expect(card).toContain('invoke("showme_start", { question, allScreens: allScreensOn(), settle, mode, before })');
    const check = card.slice(card.indexOf("const checkEveryday = "), card.indexOf("latest.current.lookEveryday = "));
    expect(check).toContain('showMe(checkQuestion(w), w.goal, w.steps, true, "recheck", ed.code)');
  });
  test("what the walkthrough saw is forgotten when the panel closes, on Stop and on a new look", () => {
    expect(card).toContain("if (walk && everydayWalk.current) lastWalk.current = walk;");
    expect(card).toContain("useEffect(() => { if (!m.everyday) { lastWalk.current = null; everydayWalk.current = false; } }, [m.everyday]);");
    const look = card.slice(card.indexOf("const lookEveryday = "), card.indexOf("const checkEveryday = "));
    expect(look).toContain("lastWalk.current = null;");
  });
});

describe("the main button", () => {
  test("Show me the steps is a fresh look while no step was shown yet; after that, Check it is fixed looks again", () => {
    const f = found().everyday;
    expect(mainAction(f, false, 0)).toBe("steps");
    expect(mainAction(f, true, 0)).toBe("check");
    expect(mainAction(f, false, 1)).toBe("check");
    expect(mainAction({ ...f!, stage: "still" }, false, 0)).toBe("check");
    for (const stage of ["fixed", "ask", "none", "saidWorks", "looking", "checking"] as const) expect(mainAction({ ...f!, stage }, false, 0), stage).toBeNull();
    expect(mainAction(null, false, 0)).toBeNull();
    expect(everydayStepsAsk("C4 shows #REF!.")).toContain("C4 shows #REF!.");
  });
  test("the card's Show me the steps is an everyday look, never a look again", () => {
    const line = card.split("\n").find((l) => l.includes("S.everydaySteps")) ?? "";
    expect(line).toContain("mainAction(ed, !!walk, lastWalk.current?.steps.length ?? 0)");
    expect(line).toContain("lookEveryday(everydayStepsAsk(ed.problem))");
  });
});

describe("the numbers count each press once", () => {
  test("the key counts the press and an anywhere use; the everyday look and its looks again count nothing more", () => {
    const key = card.slice(card.indexOf('const offKey = listen("find-problem"'), card.indexOf("const offFound ="));
    expect(key).toContain('if (route === "screen") { count("hero_press"); count("anywhere_use"); latest.current.lookEveryday(); return; }');
    const look = card.slice(card.indexOf("const lookEveryday = "), card.indexOf("const checkEveryday = "));
    expect(look).not.toContain("count(");
    const show = card.slice(card.indexOf("const showMe = "), card.indexOf("// An everyday stuck moment: Show me's own look"));
    expect(show).toContain('if (!mode && steps.length === 0) count("anywhere_use");');
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
    expect(key).toContain('heroRoute({ everyday: setting("point.everyday") !== false && toolOn("showMe"), project: projectRef.current, front: frontOf(e.payload), practice: nowModel.current.practice?.project === projectRef.current })');
    expect(key.indexOf("heroRoute(")).toBeLessThan(key.indexOf("sendOrExplain(findProblem("));
    expect(key).toContain("lookEveryday()");
  });
  test("the everyday look is Show me's own look (light first, nothing kept) with its mode", () => {
    const look = card.slice(card.indexOf("const lookEveryday = "), card.indexOf("const lookEveryday = ") + 600);
    expect(look).toContain('dispatch({ type: "ui.everydayLook", mode: "everyday" })');
    expect(look).toContain('"everyday")');
    expect(card).toContain('invoke("showme_start", { question, allScreens: allScreensOn(), settle, mode, before })');
  });
  test("a step of an everyday fix looks again with the recheck, so the next look says whether the error is gone", () => {
    const next = card.slice(card.indexOf("const nextStep = "), card.indexOf("const nextStep = ") + 900);
    expect(next).toContain('"recheck"');
  });
  test("after a project check that found nothing wrong, the screen can be looked at instead, and the other way round", () => {
    expect(card).toContain("S.everydayLookInstead");
    const back = card.split("\n").find((l) => l.includes("S.everydayCheckProject")) ?? "";
    expect(back).toContain('ed.stage === "none" && project');
    expect(back).toContain("pressed(); dispatch({ type: \"ui.everydayClosed\" }); dispatch({ type: \"ui.findProblem\" }); void sendOrExplain(findProblem(project), () => dispatch({ type: \"ui.pointClosed\" }));");
  });
});

describe("settings and words", () => {
  test("the everyday path is a setting, on by default since it only acts on the key; the why has its own", () => {
    expect(defOf("point.everyday")).toMatchObject({ kind: "switch", default: true, section: "pointing", applies: ["pages"] });
    expect(defOf("point.everydayWhy")).toMatchObject({ kind: "choice", default: "reasonsAndQuestion", options: ["reasonsAndQuestion", "reasons", "off"], section: "pointing" });
    // The walkthrough looks again after each step on its own, so the words never say it looks only when pressed.
    expect(S.set["point.everyday"].help).toMatch(/after each step/);
    expect(S.set["point.everyday"].help).not.toMatch(/looks again only when you press/);
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
