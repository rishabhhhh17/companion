// M58 Area B (docs/milestones/M58-fix-and-first-run.md): a first run that shows both jobs (feature 9), Fix it kept in view
// (UI 1), and the small wording slips (UI 20). Plain code first, then the page's source where only the shape can be checked
// without a screen. What needs a real Mac is listed as [verify] in the plan.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { BUILDS_WITH, buildsWithSettings, buildsWithTip, isBuildsWith, moreShown } from "./onboarding.ts";
import { firstWayTip } from "./askChips.ts";
import { formatUsd } from "./model.ts";
import { aboutCost, S } from "./strings.ts";
import { REGISTRY } from "../../protocol/settings.ts";
import { PAGES } from "./settingsPages.ts";

const read = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");
const stepOf = (ui: string, step: string) => { const at = ui.indexOf(`{step === "${step}" && (`); const after = ui.indexOf("{step === ", at + 10); return ui.slice(at, after < 0 ? undefined : after); };
const REAL_TOOLS = /lovable|bolt|replit|cursor|claude code|chatgpt|copilot|v0|windsurf/i;

describe("feature 9: the hello names both jobs", () => {
  test("the line under the welcome says both jobs, in the roadmap's own words, and the welcome title is M69's", () => {
    expect(S.screens.welcomeLine).toBe("I look over every change your AI makes, and fix what breaks.");
    const hello = stepOf(read("./onboarding.tsx"), "hello");
    expect(hello).toContain("twoTone(S.screens.welcomeTitle)");
    expect(hello).toContain("{S.screens.welcomeLine}");
    // The line comes right under the title, before the key and the promises.
    expect(hello.indexOf("S.screens.welcomeLine")).toBeLessThan(hello.indexOf("S.screens.promises.map("));
  });
});

describe("feature 9: Which AI do you build with? is optional and only picks a tip", () => {
  test("six answers, and Skip is not one of them", () => {
    expect([...BUILDS_WITH]).toEqual(["lovable", "bolt", "replit", "cursor", "claudeCode", "other"]);
    expect(isBuildsWith("cursor")).toBe(true);
    expect(isBuildsWith("unset")).toBe(false);
    expect(isBuildsWith("skip")).toBe(false);
    for (const b of BUILDS_WITH) expect(S.screens.buildsWithNames[b].length).toBeGreaterThan(0);
  });
  test("only a pressed chip is saved, only you.buildsWith, and only when it changes; Skip writes nothing", () => {
    expect(buildsWithSettings(null, "unset")).toEqual([]);
    expect(buildsWithSettings("lovable", "unset")).toEqual([["you.buildsWith", "lovable"]]);
    expect(buildsWithSettings("lovable", "lovable")).toEqual([]);
  });
  test("the answer picks one tip about where Copy for my AI's words go, and never says the other tool made or broke anything", () => {
    expect(buildsWithTip("unset")).toBeNull();
    expect(buildsWithTip(undefined)).toBeNull();
    expect(buildsWithTip("lovable")).toContain("Lovable's chat");
    expect(buildsWithTip("other")).not.toMatch(REAL_TOOLS);
    for (const b of BUILDS_WITH) {
      const t = buildsWithTip(b)!;
      expect(t).toContain("Copy for my AI");
      // M57 honest words: the tip is about where to paste, never who made a change.
      expect(t).not.toMatch(/\b(made|broke|wrote|changed|caused|did)\b/i);
      expect(t).not.toMatch(/[–—]/);
    }
  });
  test("the hello has the chips with Skip, the tip, and keeps the answer however the first run ends (keepChoices)", () => {
    const ui = read("./onboarding.tsx"), hello = stepOf(ui, "hello");
    expect(hello).toContain("BUILDS_WITH.map((b) =>");
    expect(hello).toContain("{S.screens.buildsWithSkip}");
    expect(hello).toContain("buildsWithTip(buildsWith)");
    const keep = ui.slice(ui.indexOf("const keepChoices = () => {"), ui.indexOf("const finish = () => {"));
    expect(keep).toContain('buildsWithSettings(buildsWith, getSetting("you.buildsWith"))');
  });
  test("you.buildsWith is a setting for the pages only, unset until picked, with its place in Settings and its words", () => {
    const d = REGISTRY.settings.find((x) => x.key === "you.buildsWith")!;
    expect(d).toMatchObject({ kind: "choice", default: "unset", applies: ["pages"], scope: "app" });
    const places = Object.values(PAGES).flatMap((p) => [...p.groups, ...p.more]).filter((g) => g.items.includes("you.buildsWith"));
    expect(places.map((g) => g.id)).toEqual(["more.account.you"]);
    const w = S.set["you.buildsWith"];
    expect(w.label).toBe("The AI you build with");
    expect(w.help).toMatch(/never sent/);
    for (const o of d.options!) expect((w.options as Record<string, string>)[o], o).toBeTruthy();
    // The runner never gets it: it is not on the list of settings applied to the engine.
    expect(d.applies).not.toContain("runner");
  });
  test("the hello offers the practice too, so the key practice is one press from both screens", () => {
    const ui = read("./onboarding.tsx");
    expect(stepOf(ui, "hello")).toContain("startPractice(first.id)");
    expect(stepOf(ui, "project")).toContain("startPractice(first.id)");
  });
});

describe("UI 1: the check screen keeps Fix it in view", () => {
  test("the folds wait behind Set up more (optional), shown only once the check has an answer or ended", () => {
    expect(moreShown("idle", false)).toEqual({ link: false, folds: false });
    expect(moreShown("checking", false)).toEqual({ link: false, folds: false });
    expect(moreShown("asking", true)).toEqual({ link: false, folds: false });
    expect(moreShown("done", false)).toEqual({ link: true, folds: false });
    expect(moreShown("done", true)).toEqual({ link: false, folds: true });
    expect(moreShown("stopped", true)).toEqual({ link: false, folds: true });
    expect(S.screens.setUpMore).toBe("Set up more (optional)");
  });
  test("the page draws the folds only through moreShown, and Go to my project sits beside Fix it at the bottom like the other screens", () => {
    const check = stepOf(read("./onboarding.tsx"), "check");
    expect(check).toContain("moreShown(stage, more).link");
    expect(check).toContain('{moreShown(stage, more).folds && (<div className="fr-folds">');
    expect(check).not.toContain('(stage === "done" || stage === "stopped") && (<div className="fr-folds">');
    expect(check).toContain('<Button kind="quiet" className="fr-link fr-skip" onClick={finish}>{S.fr.goProject}</Button>');
    // The main button is still the last thing on the screen, after the grow.
    expect(check.lastIndexOf('<div className="fr-grow" />')).toBeLessThan(check.lastIndexOf("main(S.fr.fixIt"));
  });
});

describe("UI 20: small wording slips", () => {
  test("a cost under a cent is Less than 1 cent, never About less than 1 cent", () => {
    expect(aboutCost(formatUsd(0.004))).toBe("Less than 1 cent");
    expect(aboutCost(formatUsd(0.07))).toBe("About 7 cents");
    expect(S.fixCost(formatUsd(0.004))).toBe("Less than 1 cent");
    expect(S.review.cost(formatUsd(0.001))).toBe("Less than 1 cent");
    expect(S.look.working(formatUsd(0.002))).toBe("Less than 1 cent so far");
    expect(S.look.working(formatUsd(0.12))).toBe("About 12 cents so far");
    // Only aboutCost itself puts "About" before a cost.
    expect(read("./strings.ts").match(/`About \$\{(usd|cost)\}/g)).toEqual(["`About ${cost}"]);
  });
  test("a passing card is titled Checks pass and names the real button, Look at my screen", () => {
    expect(S.screens.pass.title).toBe("Checks pass");
    expect(S.screens.pass.clear(S.everydayLookInstead)).toContain("press Look at my screen");
    expect(S.screens.pass.gaps(S.everydayLookInstead)).toContain("Press Look at my screen");
    expect(S.screens.pass.nothing(S.everydayLookInstead)).toContain("Press Look at my screen");
    // With the button switched off, no line names a button that is not there.
    for (const t of [S.screens.pass.clear(null), S.screens.pass.gaps(null), S.screens.pass.nothing(null)]) { expect(t).not.toMatch(/press/i); expect(t).toContain("in the box"); }
    const card = read("./card.tsx");
    expect(card).toContain('{m.point.stage === "clear" ? S.screens.pass.title : S.pointTitle}');
    expect(card).toContain("S.screens.pass.clear(everydayOn ? S.everydayLookInstead : null)");
    expect(card).not.toContain("{S.pointClear}");
  });
  test("More ways to ask shows the first way's line when it opens, and again when the pointer leaves", () => {
    const box = { querySelector: (q: string) => (q === ".more-ways button" ? { title: "Find the problem: runs your checks" } : null) } as unknown as Element;
    expect(firstWayTip(box)).toBe("Find the problem: runs your checks");
    expect(firstWayTip(null)).toBe("");
    expect(firstWayTip({ querySelector: () => null } as unknown as Element)).toBe("");
    const card = read("./card.tsx");
    expect(card).toContain("setTimeout(() => setMoreDesc(firstWayTip(d)), 0)");
    expect(card).toContain("onMouseLeave={(e) => setMoreDesc(firstWayTip(e.currentTarget))}");
    expect(card).not.toContain('onMouseLeave={() => setMoreDesc("")}');
  });
});
