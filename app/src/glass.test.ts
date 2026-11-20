// GLASS (the founder, 19 Nov 2026: "the liquid glass looks so very good. Also, the menu bar, I think you need to change it
// and make it better"). Written before the code (rule 17): the material choice and its usual, the one line greeting built
// only from real state, the menu bar popover's rows and its dot, and the glass text measured at 4.5 to 1 over a white and
// a black wallpaper (the lab's known risk).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { initial, type HistoryItem, type Model } from "./model.ts";
import type { ReviewCard } from "./review.ts";
import { OFF, type PlanStatus } from "./plan.ts";
import { S } from "./strings.ts";
import { lookAttrs } from "./lookfeel.ts";
import { PAGES } from "./settingsPages.ts";
import { MATERIALS, materialOf, partOfDay, glassGreeting, trayView, trayNeeds, parseColour, over, contrastRatio, glassTokens, TRAY_ACTIONS, TRAY_TOOL, trayActionWord, LABEL_MAX, clipWords, glassGreetingWhole } from "./glass.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const P = "/Users/me/my-shop";
const NOW = Date.parse("2026-11-20T18:00:00Z");
const row = (o: Partial<HistoryItem> = {}): HistoryItem => ({ id: 1, label: "Fix the join button", status: "done", usd: 0.05, startedAt: "2026-11-20T17:50:00Z", endedAt: "2026-11-20T17:55:00Z", checkpoint: "cp_9", changed: 1, proof: "passed", ...o });
const review = (count: number): ReviewCard => ({ project: P, batch: "rv_1a2b", stage: "ready", files: [], count, capped: false, secretFiles: [], auto: false, proof: false, asked: false, fix: null, note: null, result: null });
const approval = { approval: "ap_1", agent: "a", checkpoint: "cp", toolUseId: "t", risk: "irreversible", title: "install a package", expiresAt: "2099-01-01T00:00:00Z" };
const m = (o: Partial<Model> = {}): Model => ({ ...initial(), folder: P, runnerUp: true, helloSeen: true, ...o });
const pro: PlanStatus = { ...OFF, paymentsOn: true, plan: "pro", state: "pro" };
const free: PlanStatus = { ...OFF, paymentsOn: true, plan: "free", state: "free" };

describe("the material: Glass, the usual, or the look from before", () => {
  test("two choices, Glass first; anything odd is Glass", () => {
    expect([...MATERIALS]).toEqual(["glass", "classic"]);
    expect(materialOf(undefined)).toBe("glass");
    expect(materialOf("classic")).toBe("classic");
    expect(materialOf("chrome")).toBe("glass");
  });
  test("the page's root says which (data-material), so every glass rule hangs off one attribute", () => {
    expect(lookAttrs({})["data-material"]).toBe("glass");
    expect(lookAttrs({ "look.material": "classic" })["data-material"]).toBe("classic");
  });
  test("Settings offers it on the Look page, beside Colour (customizable everything)", () => {
    const look = PAGES.look.groups.find((g) => g.id === "look.home");
    expect(look?.items).toContain("look.material");
    expect(S.set["look.material"].options).toEqual({ glass: "Glass", classic: "Before" });
  });
});

describe("the greeting beside the notch: one line, only what is true now", () => {
  test("the part of the day by the Mac's own hour", () => {
    expect(partOfDay(6)).toBe("morning");
    expect(partOfDay(12)).toBe("afternoon");
    expect(partOfDay(17)).toBe("evening");
    expect(partOfDay(2)).toBe("evening");
  });
  test("nothing waiting: Evening. Nothing needs you.", () => {
    expect(glassGreeting(m(), NOW, 19)).toBe("Evening. Nothing needs you.");
  });
  test("a question waiting comes first, with its count", () => {
    expect(glassGreeting(m({ approvals: [approval, { ...approval, approval: "ap_2" }] as unknown as Model["approvals"] }), NOW, 9)).toBe(`Morning. ${S.hello.questions(2)}.`);
  });
  test("changes to review, and a failing check, say so; never a made up fact", () => {
    expect(glassGreeting(m({ review: review(3) }), NOW, 14)).toBe(`Afternoon. ${S.hello.changes("my-shop", 3)}.`);
    const g = glassGreeting(m({ history: [row()] }), NOW, 19);
    expect(g.startsWith("Evening. ")).toBe(true);
    expect(g).not.toMatch(/signup|Join button green/);
  });
  test("work running: what it is working on, by its own name", () => {
    const g = glassGreeting(m({ character: "working", task: { agent: "a", project: P, label: "Make the join button work", lines: [], costUsd: 0 } }), NOW, 19);
    expect(g).toBe(`Evening. ${S.glass.workingOn("Make the join button work")}.`);
    expect(g).toBe("Evening. Working: Make the join button work.");
  });
  test("a question waiting while work runs: the question, never Working (the work waits on the answer)", () => {
    const g = glassGreeting(m({ character: "working", task: { agent: "a", project: P, label: "Make the join button work", lines: [], costUsd: 0 }, approvals: [approval] as unknown as Model["approvals"] }), NOW, 19);
    expect(g).toBe(`Evening. ${S.hello.questions(1)}.`);
  });
  test("the engine has not said hello yet (just opened, or offline): Starting up, never Nothing needs you", () => {
    expect(glassGreeting(m({ helloSeen: false }), NOW, 19)).toBe(`Evening. ${S.glass.starting}.`);
  });
  test("the engine not up yet: says it is starting, nothing else", () => {
    expect(glassGreeting(m({ runnerUp: false }), NOW, 19)).toBe(`Evening. ${S.glass.starting}.`);
  });
  test("no em dashes in any greeting word", () => {
    for (const w of [S.glass.nothing, S.glass.starting, S.glass.workingOn("x"), ...Object.values(S.glass.part)]) expect(w).not.toContain("—");
  });
});

describe("the menu bar popover: what it shows, from real state only", () => {
  test("at rest: Nothing needs you, the project, no dot", () => {
    const v = trayView(m(), NOW, OFF, null);
    expect(v.doing).toEqual({ words: S.glass.nothing, tone: "calm" });
    expect(v.project).toEqual({ name: "my-shop", path: P });
    expect(v.dot).toBe(false);
  });
  test("no project: no project row's name, and the words say how to pick one", () => {
    const v = trayView(m({ folder: null }), NOW, OFF, null);
    expect(v.project).toBeNull();
  });
  test("a question waiting: needs you, and the dot", () => {
    const v = trayView(m({ approvals: [approval] as unknown as Model["approvals"] }), NOW, OFF, null);
    expect(v.doing.tone).toBe("needsYou");
    expect(v.doing.words).toBe(S.hello.questions(1));
    expect(v.dot).toBe(true);
    expect(trayNeeds(m({ approvals: [approval] as unknown as Model["approvals"] }))).toBe(true);
  });
  test("work running: working, with its name; no dot for work alone", () => {
    const v = trayView(m({ character: "working", task: { agent: "a", project: P, label: "Make the join button work", lines: [], costUsd: 0 } }), NOW, OFF, null);
    expect(v.doing).toEqual({ words: S.glass.workingOn("Make the join button work"), tone: "working" });
    expect(v.dot).toBe(false);
  });
  test("the last check with its result, from the project's own history", () => {
    const v = trayView(m({ history: [row()] }), NOW, OFF, null);
    expect(v.check?.kind).toBe("works");
    expect(v.check?.words.length).toBeGreaterThan(0);
    expect(trayView(m(), NOW, OFF, null).check).toBeNull();
  });
  test("plan and usage: hidden while payments are off; Free with what is left, or Pro", () => {
    expect(trayView(m(), NOW, OFF, null).plan).toBeNull();
    expect(trayView(m(), NOW, pro, null).plan).toBe(S.glass.planPro);
    expect(trayView(m(), NOW, free, { used: 2, limit: 5, resetsOn: "2026-12-01", everUsed: true }).plan).toBe(S.glass.planFree(3, 5));
    expect(trayView(m(), NOW, free, null).plan).toBe(S.glass.planFreeOnly);
  });
  test("the engine down: says so, calm, no dot", () => {
    expect(trayView(m({ runnerUp: false }), NOW, OFF, null).doing).toEqual({ words: S.glass.starting, tone: "off" });
  });
  // The GLASS review (changed on purpose): "Explain an error" ran Find the problem, and "Check my project" ran the check
  // before going live, so the words said one thing and did another. Each action now says Home's own word for the tool it
  // starts, and the shell starts exactly that tool (traypop.rs, shell_traypop.rs tray_do).
  test("the actions the popover offers, in order; each says Home's own word for the tool it starts", () => {
    expect([...TRAY_ACTIONS]).toEqual(["check", "shipCheck", "open"]);
    expect(TRAY_TOOL).toEqual({ check: "check", shipCheck: "shipCheck" });
    for (const a of ["check", "shipCheck"] as const) expect(trayActionWord(a)).toBe(S.home.main[TRAY_TOOL[a]]);
    expect(trayActionWord("check")).toBe("Check my project");
    expect(trayActionWord("shipCheck")).toBe("Check before going live");
    expect(trayActionWord("open")).toBe(S.glass.actions.open);
    expect(trayActionWord("pick")).toBe(S.home.main.folder);
    for (const a of ["check", "shipCheck", "open", "pick"] as const) expect(S.glass.actionsHelp[a].length, a).toBeGreaterThan(0);
  });
  test("with a project: Check my project is the one filled button, then the check before going live, then Open", () => {
    expect(trayView(m(), NOW, OFF, null).actions).toEqual([{ id: "check", primary: true }, { id: "shipCheck", primary: false }, { id: "open", primary: false }]);
  });
  test("with no project: Choose a project is the one filled button, and nothing that needs a project is offered", () => {
    expect(trayView(m({ folder: null }), NOW, OFF, null).actions).toEqual([{ id: "pick", primary: true }, { id: "open", primary: false }]);
  });
  test("the top line goes straight to what it names: a question or the work to Now, changes to their review, calm to nothing", () => {
    expect(trayView(m({ approvals: [approval] as unknown as Model["approvals"] }), NOW, OFF, null).go).toBe("now");
    expect(trayView(m({ review: review(2) }), NOW, OFF, null).go).toBe("review");
    expect(trayView(m({ character: "working", task: { agent: "a", project: P, label: "x", lines: [], costUsd: 0 } }), NOW, OFF, null).go).toBe("now");
    expect(trayView(m(), NOW, OFF, null).go).toBeNull();
    expect(trayView(m({ runnerUp: false }), NOW, OFF, null).go).toBeNull();
  });
});

describe("the working line reads as a sentence and never runs long (the GLASS review)", () => {
  test("Working: and the task's own words, never 'Working on make the button blue'", () => {
    expect(S.glass.workingOn("make the button blue")).toBe("Working: make the button blue");
  });
  // No CSS clamp: Home's page never hides overflow (the bigger text rule), so a long task name is cut in words instead.
  test("a long task name is cut at a word with an ellipsis, so the line stays short; the whole of it stays for the pointer and VoiceOver", () => {
    const long = "rewrite the whole onboarding flow so that every customer of Northwind Industries can sign up with SSO";
    const mm = m({ character: "working", task: { agent: "a", project: P, label: long, lines: [], costUsd: 0 } });
    const short = glassGreeting(mm, NOW, 19);
    expect(short.length).toBeLessThanOrEqual(`Evening. Working: .`.length + LABEL_MAX);
    expect(short).toMatch(/…\.$/);
    expect(short).not.toMatch(/ …/);
    expect(glassGreetingWhole(mm, NOW, 19)).toBe(`Evening. Working: ${long}.`);
    const v = trayView(mm, NOW, OFF, null);
    expect(v.doing.words.length).toBeLessThan(S.glass.workingOn(long).length);
    expect(v.whole).toBe(S.glass.workingOn(long));
    // A short name is never cut.
    expect(glassGreeting(m({ character: "working", task: { agent: "a", project: P, label: "make the button blue", lines: [], costUsd: 0 } }), NOW, 19)).toBe("Evening. Working: make the button blue.");
    expect(clipWords("one two three", 8)).toBe("one two…");
    expect(clipWords("abcdefghijkl", 6)).toBe("abcde…");
  });
  test("the strip and the popover show the whole words as their tooltip", () => {
    expect(read("./glassHome.tsx")).toContain("title={whole}");
    expect(read("./trayPanel.tsx")).toContain("title={v.whole}");
  });
});

describe("glass contrast, measured over the worst wallpapers (the lab's known risk)", () => {
  test("colours parse and stack the way a browser composites them", () => {
    expect(parseColour("#FFFFFF")).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColour("rgba(20, 20, 24, 0.5)")).toEqual({ r: 20, g: 20, b: 24, a: 0.5 });
    expect(over(parseColour("rgba(0,0,0,0.5)"), parseColour("#FFFFFF"))).toEqual({ r: 128, g: 128, b: 128, a: 1 });
    expect(contrastRatio(parseColour("#000000"), parseColour("#FFFFFF"))).toBeCloseTo(21, 1);
  });
  const t = glassTokens(read("./ui/tokens.css"));
  for (const [name, wall] of [["white", "#FFFFFF"], ["black", "#000000"], ["mid grey", "#808080"]] as const) {
    const bg = over(parseColour(t.tint), parseColour(wall));
    test(`over a ${name} wallpaper: words 4.5 to 1, secondary words 4.5 to 1, hints 3 to 1, the focus ring 3 to 1`, () => {
      expect(contrastRatio(over(parseColour(t.ink), bg), bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(over(parseColour(t.ink2), bg), bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(over(parseColour(t.ink3), bg), bg)).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(over(parseColour(t.focus), bg), bg)).toBeGreaterThanOrEqual(3);
    });
    test(`over a ${name} wallpaper: a raised row keeps its words at 4.5 to 1`, () => {
      const row = over(parseColour(t.raised), bg);
      expect(contrastRatio(over(parseColour(t.ink2), row), row)).toBeGreaterThanOrEqual(4.5);
    });
  }
  test("the tint is neutral (no navy): its channels within 8 of each other", () => {
    const c = parseColour(t.tint);
    expect(Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b)).toBeLessThanOrEqual(8);
  });
});

describe("the tabs: arrows, Home and End move and open (automatic activation, the panels draw at once)", () => {
  const list = ["now", "learn", "did", "memory"] as const;
  test("right and left wrap round, Home and End go to the ends, other keys do nothing", async () => {
    const { tabStep } = await import("./glass.ts");
    expect(tabStep(list, "now", "ArrowRight")).toBe("learn");
    expect(tabStep(list, "memory", "ArrowRight")).toBe("now");
    expect(tabStep(list, "now", "ArrowLeft")).toBe("memory");
    expect(tabStep(list, "did", "Home")).toBe("now");
    expect(tabStep(list, "did", "End")).toBe("memory");
    expect(tabStep(list, "did", "a")).toBeNull();
    // From Settings (no tab open) the first arrow lands on the first tab.
    expect(tabStep(list, "settings", "ArrowRight")).toBe("now");
  });
});
