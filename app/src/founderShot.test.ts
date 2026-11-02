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
    expect(h.line).toBe(S.home.practiceLine.start);
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
  test("a practice in another folder, or a question, never gets this button", () => {
    const m = practice();
    expect(needMainFor(m, need(m), "/Users/me/other")).toBe(null);
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
    expect(card).toContain("recapShownLines(m.recap.lines).map(");
    expect(card).toContain('show("about") && aboutCard && m.about && (');
  });
});

describe("(1) Flowflow's glow is never cut by a box, and its water has no step", () => {
  test("the glow is a soft circle behind Flowflow in its pond, outside the masked box, and no drop shadow filter is left", () => {
    expect(css).not.toMatch(/\.home-char\[data-state="(needsYou|done)"\] \{ filter: drop-shadow/);
    expect(css).toMatch(/\.home-pond::after \{[^}]*radial-gradient/);
    expect(css).toMatch(/\.home-pond\[data-glow="needsYou"\]::after \{[^}]*var\(--amber\)/);
    expect(css).toMatch(/\.home-pond\[data-glow="done"\]::after \{[^}]*var\(--ok\)/);
    expect(card).toContain("data-glow={");
  });
  test("the water under the line is solid for 12 px before it fades, in both layouts, and starts under the wave, never as a flat edge above a trough", () => {
    // It started at the box's top, 11 points above the wave's foot, so a flat edge showed over every trough (the review, 2 Nov
    // 2026). The wave's own path fills down to its foot; the box's fill starts there, as a colour (no layer opacity), so the
    // line over it keeps its strength.
    expect(css).toMatch(/\.home \.home-pond > \.ch-water \{[^}]*transparent var\(--wave-foot\), var\(--sea-tint\) var\(--wave-foot\), var\(--sea-tint\) calc\(var\(--wave-foot\) \+ 12px\),/);
    expect(css).not.toMatch(/\.home \.home-pond > \.ch-water \{[^}]*opacity/);
    expect(css).toContain(".ch-water, .fr-tank { --wave-foot: 11px; }");
    expect(css).toContain(".home-pond .ch-water .waterline, .companion-hero .ch-water .waterline { position: absolute; left: 0; right: 0; top: -11px; height: 22px;");
    expect(tokens).toContain("--sea-tint: color-mix(in srgb, var(--sea-room) calc(var(--sea-see) * 100%), transparent);");
  });
  test("Flowflow is bigger in the tall Home, so it is not a tiny mark in a corner", () => {
    expect(css).toMatch(/\.home:not\(\[data-side\]\) \.hero\[data-mode\] \{ --char: calc\(1[2-9]\drem \/ 14\); \}/);
  });
});

describe("(5) calm and grown up: the usual Home is a plain page with one blue accent", () => {
  test("the sea fills the work only with nothing under the status, and with the light off (the usual) it is drawn at no strength", () => {
    const base = { side: true, tab: "now" as const, mode: "rest", cardsUnder: false };
    expect(seaFills(base)).toBe(true);
    expect(seaFills({ ...base, cardsUnder: true })).toBe(false);
    expect(seaFills({ ...base, side: false })).toBe(false);
    expect(seaFills({ ...base, mode: "working" })).toBe(false);
    expect(tokens).toMatch(/:root\[data-light="off"\] \{[^}]*--room-show: 0;[^}]*--sea-fill-a: 0;[^}]*--sea-tail-a: 0%;/);
    expect(css).toMatch(/\.sea-fill \{[^}]*opacity: var\(--sea-fill-a\); background: linear-gradient\(180deg, color-mix\(in srgb, var\(--sea-tint\) 80%/);
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
