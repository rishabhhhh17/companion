// The founder's screenshot (2 Nov 2026: tall, Deep, Calm, midnight water, a practice open; "does this look good??"). Five
// problems, each pinned here so it cannot come back: Flowflow's glow cut by a box, a bubble that says one thing while the page
// says another, no next step above the fold, cards that say nothing, and a muddy room. Plain code where it is decided
// (homeHero.ts, homeLayout.ts, element.ts), and the stylesheets read as text.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { initial, reduce, type Model } from "./model.ts";
import { aboutWorthACard, heroWords, homeMode, needMainFor, recapShownLines, recapWorthACard, sayFor } from "./homeHero.ts";
import { need } from "./home.ts";
import { seaFills } from "./homeLayout.ts";
import { roomElement } from "./element.ts";
import { S } from "./strings.ts";
import { ALL_CSS, TOKENS_CSS } from "./ui/cssFiles.ts";

const P = "/Users/me/practice-signup";
const ev = (o: Record<string, unknown>) => ({ v: 1, id: "e", ...o });
const run = (events: Record<string, unknown>[], from: Model = initial()) => events.reduce<Model>((m, e) => reduce(m, e as never), from);
const practice = (stage?: string) => {
  let m = run([ev({ type: "ui.practiceStarted", project: P, kind: "signup" })]);
  return stage ? ({ ...m, practice: { ...m.practice!, stage } } as Model) : m;
};
const css = ALL_CSS(), tokens = TOKENS_CSS();
const card = readFileSync(new URL("./card.tsx", import.meta.url), "utf8");

describe("(2, 3) a practice open on Now: one next step above the fold, and Flowflow says what the page says", () => {
  test("ready: the main button starts the practice, and the line and the bubble agree", () => {
    const m = practice();
    expect(m.practice?.stage).toBe("start");
    const n = need(m);
    expect(homeMode(m, n)).toBe("needs");
    expect(needMainFor(m, n, P)).toBe("practiceStart");
    const h = heroWords(m, P, n);
    // M71: the practice in its own words (the mock), not what the button does.
    expect(h.line).toBe(S.home.practiceOn(S.practices[m.practice!.kind as keyof typeof S.practices].title));
    expect(h.line).not.toBe("Ready");
    // The bubble says the practice's own word for the moment, never "Needs a tap." over a line that says Ready.
    expect(sayFor(m, h)).toBe(S.practiceSay.start);
  });
  test("found: the main button fixes it; other stages open the practice on Learn", () => {
    const m = practice("found");
    expect(m.practice?.stage).toBe("found");
    expect(needMainFor(m, need(m), P)).toBe("practiceFix");
    expect(sayFor(m, heroWords(m, P, need(m)))).toBe(S.practiceSay.found);
    const failed = { ...m, practice: { ...m.practice!, stage: "failed" } } as Model;
    expect(needMainFor(failed, need(failed), P)).toBe("openLearn");
  });
  test("a practice in another folder opens it on Learn (M71: the founder's screenshot had no button); a question never gets this button", () => {
    const m = practice();
    expect(needMainFor(m, need(m), "/Users/me/other")).toBe("openLearn");
    expect(needMainFor(initial(), null, P)).toBe(null);
  });
  test("the page draws it as the gel main button, with words from the strings", () => {
    expect(card).toContain("needMainFor(m, needNow, project)");
    for (const k of ["practiceStart", "practiceFix", "openLearn"] as const) expect(S.home.needMain[k]).toMatch(/^[A-Z][a-z ]+$/);
  });
});

describe("(4) cards that say nothing take no room", () => {
  const about = { project: P, about: "A project: A plain web page.", origin: "local", needsInstall: false, installCommand: null, missing: [], missingCount: 0, example: null, notes: [] };
  test("About this project shows only with something to act on or know", () => {
    expect(aboutWorthACard(about, P)).toBe(false);
    expect(aboutWorthACard({ ...about, needsInstall: true }, P)).toBe(true);
    expect(aboutWorthACard({ ...about, missingCount: 2, missing: ["A", "B"] }, P)).toBe(true);
    expect(aboutWorthACard({ ...about, notes: ["It has no tests."] }, P)).toBe(true);
    expect(aboutWorthACard({ ...about, needsInstall: true }, "/other")).toBe(false);
    expect(aboutWorthACard(null, P)).toBe(false);
  });
  test("Where you left off drops the lines that say nothing, and shows only when something is left", () => {
    expect(recapWorthACard({ lines: ["You have not run a task in this project yet.", "Nothing is unfinished."] })).toBe(false);
    expect(recapShownLines(["You were working on: Fix it. It finished.", "Nothing is unfinished."])).toEqual(["You were working on: Fix it. It finished."]);
    expect(recapWorthACard({ lines: ["Nothing is unfinished."], next: { action: "open" } })).toBe(true);
    expect(card).toContain("const ls = recapShownLines(m.recap.lines);");   // M69: the first as the headline, the rest as rows
    expect(card).toContain('show("about") && aboutCard && m.about && (');
  });
});

describe("(1) Flowflow's glow is never cut by a box, and its water has no step", () => {
  // M71: Home is black; the soft glow circle behind the character and the band of water under it are retired (no glow or
  // halo, no gradient outside the character's own art). The character's art keeps its own light.
  test("M71: no glow behind the character and no band of water under it, and still no drop shadow filter on it", () => {
    expect(css).not.toMatch(/\.home-char\[data-state="(needsYou|done)"\] \{ filter: drop-shadow/);
    expect(css).not.toMatch(/\.home-pond::after \{[^}]*gradient/);
    expect(css).not.toMatch(/\.home \.home-pond > \.ch-water \{[^}]*gradient/);
    expect(css).toContain(".home-pond .ch-water .waterline, .companion-hero .ch-water .waterline { position: absolute; left: 0; right: 0; top: -11px; height: 22px;");
  });
  test("Flowflow is bigger in the tall Home, so it is not a tiny mark in a corner", () => {
    expect(css).toMatch(/\.home:not\(\[data-side\]\) \.hero\[data-mode\] \{ --char: calc\(1[2-9]\drem \/ 14\); \}/);
  });
});

describe("(5) calm and grown up: the usual Home is a plain page with one blue accent", () => {
  test("M71: the sea that filled the work is retired: Home draws no sea fill", () => {
    const base = { side: true, tab: "now" as const, mode: "rest", cardsUnder: false };
    expect(seaFills(base)).toBe(true);   // the rule itself is kept in homeLayout.ts for the record; Home no longer draws it
    expect(card).not.toContain('className="sea-fill"');
    expect(css).not.toMatch(/\.sea-fill \{/);
  });
  test("Calm keeps Home in Flow's blue whatever group is at work, by tokens only; Vivid gives each group its room", () => {
    const calm = /\n:root\[data-colour="calm"\] \.home\[data-element\] \{([^}]*)\}/.exec(tokens.replace(/\/\*[\s\S]*?\*\//g, ""))?.[1] ?? "";
    const flow = /\n\[data-element="flow"\] \{([^}]*)\}/.exec(tokens.replace(/\/\*[\s\S]*?\*\//g, ""))?.[1] ?? "";
    const norm = (x: string) => x.split(";").map((d) => d.trim()).filter(Boolean).sort();
    expect(norm(calm)).toEqual(norm(flow));
    expect(roomElement({ tab: "learn", active: null })).toBe("guide");
  });
  test("the water colours Flowflow and its pond only: no water block sets a room colour", () => {
    const blocks = [...tokens.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/\n([^{}\n]*\[data-water=[^{}]*)\{([^}]*)\}/g)];
    expect(blocks.length).toBe(4);
    for (const b of blocks) {
      expect(b[1].trim()).toMatch(/^:root\[data-water="\w+"\]$/);
      expect(b[2]).not.toContain("--el-");
    }
  });
});
