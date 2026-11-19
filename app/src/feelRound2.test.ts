// Feel round 2 (19 Nov 2026): the plain logic behind the round's fixes (the notch's news, the places as one segmented
// control, the work card's clock, the engine that has not said hello).
import { describe, expect, test } from "bun:test";
import { initial, type Model } from "./model.ts";
import type { ReviewCard, ReviewDone } from "./review.ts";
import { hoverHeadline } from "./notchMinimal.ts";
import { blockerOf, clockOnly, placeAfter } from "./homeHero.ts";
import { S } from "./strings.ts";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NOTCH, OPEN_H_DELAY_MS } from "./islandSpring.ts";
import { springPath } from "./motionTokens.ts";
import { OPEN_R } from "./homeShape.ts";

const css = (f: string) => readFileSync(join(import.meta.dir, "ui", f), "utf8");
const rule = (sheet: string, sel: string): string => {
  const at = sheet.indexOf(`${sel} {`);
  if (at < 0) throw new Error(`no rule ${sel}`);
  return sheet.slice(at, sheet.indexOf("}", at));
};

const P = "/Users/me/signup-page";
const m = (o: Partial<Model> = {}): Model => ({ ...initial(), runnerUp: true, connected: "api_key", folder: P, ...o });
const done = (summary: string): ReviewCard => ({ project: P, batch: "rv_1", stage: "reviewed", files: [], count: 1, capped: false, secretFiles: [], auto: true, proof: false, asked: false, fix: null, note: null,
  result: { rating: "safe", touches: [], summary, notes: [], reasons: [], checks: "passed", sendBack: "", lane: "none", usdEstimate: 0 } as unknown as ReviewDone });

describe("the notch row says the news, the greeting only when there is none", () => {
  test("with no news, the greeting", () => {
    expect(hoverHeadline(m(), "hey there", null)).toEqual({ words: "hey there", news: false });
  });
  test("the one short line, when there is one", () => {
    expect(hoverHeadline(m(), "hey there", { words: "2 changes to look at", colour: "amber" } as never)).toEqual({ words: "2 changes to look at", news: true });
  });
  test("a finished review's own summary, when nothing else is said", () => {
    // Feel round 3 (19 Nov 2026), changed on purpose: the news carries whether the review passed, for its tick or cross.
    expect(hoverHeadline(m({ review: done("The button is blue now.") }), "hey there", null)).toMatchObject({ words: "The button is blue now.", news: true });
    expect(hoverHeadline(m({ review: done("   ") }), "hey sam", null)).toEqual({ words: "hey sam", news: false });
  });
});

describe("the places are one segmented control", () => {
  test("pressing the open place stays on it; another place opens that one", () => {
    for (const t of ["now", "learn", "did", "memory"] as const) expect(placeAfter(t, t)).toBe(t);
    expect(placeAfter("now", "did")).toBe("did");
  });
});

describe("the work card's top line", () => {
  test("the time so far is the clock alone, on whole seconds", () => {
    expect(clockOnly(0)).toBe("0:00");
    expect(clockOnly(4.6)).toBe("0:05");
    expect(clockOnly(3725)).toBe("1:02:05");
  });
});

describe("an engine that has not said hello", () => {
  test("Home says it is starting, after a stopped engine and before everything else", () => {
    expect(blockerOf({ connected: "api_key", runnerUp: true, claude: "ready", starting: true })).toBe("starting");
    expect(blockerOf({ connected: "api_key", runnerUp: false, claude: "ready", starting: true })).toBe("engine");
    expect(blockerOf({ connected: "none", runnerUp: true, claude: "ready", starting: false })).toBe("key");
    expect(S.home.blocked.starting.main).toBe("Restart");
    for (const b of ["key", "engine", "claude", "claudeGetting", "starting"] as const) expect(S.home.blockedTag[b].length).toBeGreaterThan(0);
  });
});

describe("Home's content never shows past its growing shape", () => {
  test("the content's round foot is cut at the same side inset as the frame, with the shape's own corner", () => {
    // The foot was rounded only at the frame's full width, so while the sides were cut in, the content's square corners
    // showed past the shape's round ones (grey corners on the desktop for about 100 ms).
    expect(rule(css("homeShape.css"), ".home-stage[data-told] .home-frame > *")).toContain("clip-path: inset(0 var(--clip-x, 0px) var(--clip-b, 0px) var(--clip-x, 0px) round 0 0 var(--r-xl) var(--r-xl))");
    expect(css("tokens.css")).toContain(`--r-xl: ${OPEN_R}px;`);
  });
  test("at every millisecond of the open, the cut content is no wider than the shape (its sides lag the width's spring)", () => {
    // The shape's width runs on OPEN_W from 0; the content's rounded cut runs on OPEN_H after its delay. Both start at
    // the island's width, so the content's half width is never more than the shape's.
    const w = springPath(NOTCH.OPEN_W), h = springPath(NOTCH.OPEN_H);
    const at = (p: number[], t: number) => (t <= 0 ? 0 : p[Math.min(t, p.length - 1)]);
    for (let t = 0; t <= 700; t++) expect(at(h, t - OPEN_H_DELAY_MS)).toBeLessThanOrEqual(at(w, t) + 1e-9);
  });
});

describe("words that change in place are never seen over each other", () => {
  test("the new words wait for the old ones to leave", () => {
    const parts = css("parts.css");
    expect(rule(parts, ".ui-swap-new[data-swapped]")).toContain("animation-delay: var(--dur-exit-menu)");
    expect(readFileSync(join(import.meta.dir, "ui", "parts.tsx"), "utf8")).toContain('this.el.current?.setAttribute("data-swapped", "");');
  });
});

describe("the small chat keeps the approved blue for its way on", () => {
  const black = css("black.css");
  test("send turns the approved blue once there are words, and Fix it is that blue too (Home's main button fill)", () => {
    expect(rule(black, ".notch-chat .nc-field:has(textarea:not(:placeholder-shown)) .nc-send:not(:disabled)")).toContain("background: var(--acc); color: var(--acc-ink)");
    expect(black).toMatch(/\.notch-chat \.nc-fix \{[^}]*background: var\(--acc\); color: var\(--acc-ink\)/);
    expect(rule(black, ".notch-chat .nc-fix:hover")).toContain("background: var(--acc-hover)");
  });
  test("focus is one ring, with no second glow", () => {
    expect(rule(black, ".notch-chat .nc-field:focus-within")).toContain("box-shadow: 0 0 0 1.5px var(--lav-1) inset, 0 0 12px var(--lav-glow-soft)");
  });
  test("older bubbles fade out under the top row, never cut by a hard edge", () => {
    expect(black).toContain("mask-image: linear-gradient(180deg, transparent 0, transparent 8px, var(--mask-solid) 28px); padding-top: 26px;");
  });
});

describe("every place starts the same distance under the row of places", () => {
  test("Learn's practice card and Memory's quiet rows sit 16 points under it, as Now's lead and History's list do", () => {
    const black = css("black.css");
    expect(rule(black, ".home .work > .view > .panel.practice:first-child")).toContain("margin-top: var(--space-4)");
    expect(black.lastIndexOf(".home .mem-loading { margin-top: var(--space-4); }")).toBeGreaterThan(black.indexOf(".home .mem-loading { display: grid"));
  });
  test("content under the top bar fades into it once the page scrolls", () => {
    const black = css("black.css");
    expect(rule(black, ".home .work > .bar::before")).toContain("background: var(--notch); -webkit-mask-image: linear-gradient(var(--mask-solid), transparent)");
    expect(rule(black, ".home[data-scrolled] .work > .bar::before")).toContain("opacity: 1");
  });
});
