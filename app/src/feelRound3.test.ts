// Feel round 3 (19 Nov 2026): the pure decisions behind the round. The founder: "Please fucking improve how it looks, man,
// and how it fucking feels", and his HeyClicky reference of 18 Nov 2026.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { S } from "./strings.ts";
import { barStatusWords, statusWords } from "./homeLayout.ts";
import { withPending } from "./notchChat.tsx";
import { CHAT_GAP_MS, chatBubbles } from "./notchChat.ts";
import { hoverHint } from "./notchMinimal.ts";
import { INTERRUPT_NUDGE, RESIZE_MS } from "./homeStage.tsx";
import { initial, type Model } from "./model.ts";
import { NOTCH, OPEN_H_DELAY_MS, TUCK_MS } from "./islandSpring.ts";
import { springMs } from "./homeShape.ts";
import { springPath } from "./motionTokens.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const P = "/Users/me/shop";

describe("the quiet status words", () => {
  test("Working while something runs, else the last check and when; nothing on Now or Settings", () => {
    expect(statusWords({ kind: "works", ago: "40 minutes ago", working: true })).toBe(S.meaning.tag.working);
    expect(statusWords({ kind: "works", ago: "40 minutes ago", working: false })).toBe(S.homeNow.passedAgo("40 minutes ago"));
    expect(statusWords({ kind: "failing", ago: "", working: false })).toBe(S.homeNow.pill.failed);
    expect(statusWords({ kind: "changed", ago: "", working: false })).toBe(S.homeNow.pill.look);
    expect(statusWords({ kind: "unchecked", ago: "", working: false })).toBe(S.homeNow.pill.new);
    expect(statusWords({ kind: "noProject", ago: "", working: false })).toBe("");
    for (const tab of ["now", "settings"] as const) expect(barStatusWords({ tab, kind: "works", ago: "1 minute ago", working: false })).toBe("");
    expect(barStatusWords({ tab: "did", kind: "works", ago: "1 minute ago", working: false })).toBe(S.homeNow.passedAgo("1 minute ago"));
  });
});

describe("the small chat", () => {
  test("the words just sent show as the person's bubble with Squibby's working one, until the engine's own arrives", () => {
    const empty = [{ key: "empty", who: "squibby" as const, words: S.m96.chat.empty("shop") }];
    expect(withPending(empty, "make it blue").map((b) => [b.who, b.words])).toEqual([["you", "make it blue"], ["squibby", S.m96.chat.working]]);
    const arrived = [{ key: "you:live", who: "you" as const, words: "make it blue" }, { key: "sq:live", who: "squibby" as const, words: S.m96.chat.working }];
    expect(withPending(arrived, " make it blue ")).toBe(arrived);
    expect(withPending(empty, null)).toBe(empty);
    expect(withPending(empty, "   ")).toBe(empty);
  });
  test("a quiet time line over an ask asked more than 30 minutes after the one before, and over the first", () => {
    const now = Date.parse("2026-11-19T15:00:00");
    const at = (h: number, m: number) => new Date(`2026-11-19T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`).toISOString();
    const row = (id: number, h: number, m: number) => ({ id, label: `ask ${id}`, status: "done", usd: 0, startedAt: at(h, m), endedAt: at(h, m + 2), checkpoint: `cp_${id}`, changed: 1, proof: "passed" });
    const m = { ...initial(), folder: P, history: [row(1, 12, 0), row(2, 12, 10), row(3, 13, 30)] } as unknown as Model;
    const b = chatBubbles(m, P, { now });
    expect(b.filter((x) => x.when).map((x) => x.words)).toEqual(["ask 1", "ask 3"]);
    expect(CHAT_GAP_MS).toBe(30 * 60_000);
    // Oldest first, each ask then its answer.
    expect(b.filter((x) => x.who === "you").map((x) => x.words)).toEqual(["ask 1", "ask 2", "ask 3"]);
    expect(b.map((x) => x.who)).toEqual(["you", "squibby", "you", "squibby", "you", "squibby"]);
  });
  test("the field's hint is the short ask: the top row names the project", () => {
    expect(read("./notchChat.tsx")).toContain("placeholder={C.ask} aria-label={askFull}");
    expect(S.m96.chat.empty("shop")).not.toContain("shop");
  });
});

describe("the hover panel's hint line", () => {
  test("the moment's own line when the headline is not it, else the key for being stuck, else nothing", () => {
    expect(hoverHint({ words: "hey there", news: false }, "2 changes to look at", "Press ⌃⌥⌘F when stuck")).toBe("2 changes to look at");
    expect(hoverHint({ words: "2 changes to look at", news: true }, "2 changes to look at", "Press ⌃⌥⌘F when stuck")).toBe("Press ⌃⌥⌘F when stuck");
    expect(hoverHint({ words: "hey there", news: false }, null, "")).toBe("");
  });
});

describe("the motion", () => {
  test("open, the content's clip is an inset() of nothing, never none, so a close interpolates from the open rect", () => {
    const css = read("./ui/homeShape.css");
    expect(css).not.toMatch(/\[data-phase="open"\][^{]*\{[^}]*clip-path: none/);
    expect(css).toContain(".home-stage[data-told] .home-frame > * { clip-path: inset(0 var(--clip-x, 0px) var(--clip-b, 0px) var(--clip-x, 0px) round 0 0 var(--r-xl) var(--r-xl));");
    // One clip only: the frame itself is never clipped (a second, narrower box cut words at both edges).
    expect(css).not.toMatch(/\.home-frame \{[^}]*clip-path: inset/);
  });
  test("width and height share one clock, so one clip matches the shape", () => {
    expect(OPEN_H_DELAY_MS).toBe(0);
    expect(NOTCH.OPEN_W).toEqual(NOTCH.OPEN_H);
  });
  test("a motion that turns round mid way is a new transition from where it is, on one clock (never a CSS reversal)", () => {
    const stage = read("./homeStage.tsx");
    expect(INTERRUPT_NUDGE).toBe("translate(0px, 0.01px)");
    expect(stage).toContain('const turned = (stage.quick && phase === "closing") || (stage.reopen && phase === "opening");');
    // Interrupted at 90 ms, the close starts from the value the open reached, on the whole CLOSE curve: a 300 point height
    // falls a few points in its first 60 Hz frame (under 7 percent of the way; before, about 110 points fell in one), and
    // never more than a fifth of the way in any one frame after.
    const open = springPath(NOTCH.OPEN_H), close = springPath(NOTCH.CLOSE);
    const reached = open[90]! * 300;
    expect(close[16]!).toBeLessThan(0.07);
    let last = reached;
    for (let ms = 16; ms < close.length; ms += 16) { const y = reached * (1 - close[ms]!); expect(last - y).toBeLessThanOrEqual(reached / 5); last = y; }
  });
  test("a close rests in under 400 ms, and the notch tucks back within its wait", () => {
    expect(springMs(NOTCH.CLOSE)).toBeLessThan(400);
    expect(TUCK_MS).toBeLessThanOrEqual(460);
    expect(RESIZE_MS).toBeGreaterThanOrEqual(springMs(NOTCH.OPEN_H));
  });
  test("an open Home's resize springs instead of jumping", () => {
    expect(read("./ui/homeShape.css")).toContain('.home-stage[data-phase="open"] :is(.hs > i, .hs > span, .hs > span > i) { transition: transform var(--dur-notch-open-h) var(--ease-notch-open-h); }');
  });
});

describe("the look stays the approved one", () => {
  test("round 3 adds no colour: every value in its rules is a token", () => {
    const black = read("./ui/black.css");
    const round3 = black.slice(black.indexOf("---------- Feel round 3 (19 Nov 2026) ----------"));
    expect(round3).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
    const notch = read("./ui/notch.css");
    expect(notch.slice(notch.indexOf("---------- Feel round 3"))).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
  });
  test("Home's buttons are pills of one weight, the places one full width track", () => {
    const black = read("./ui/black.css");
    expect(black).toContain(".home :is(.hero .hero-main, .ui-lead-acts, .learn-ask, .hist-extra, .mem-ask, .panel.practice) .btn:not(.icon, .sm) { min-height: var(--h-btn); padding: 0 var(--space-4); border-radius: var(--r-pill); font-weight: var(--w-bold);");
    expect(black).toContain(".home:not([data-side]):not([data-view=\"settings\"]) .bar > .places { box-sizing: border-box; gap: 0; padding: var(--space-1); border-radius: var(--r-pill); background: var(--surface-1);");
  });
});
