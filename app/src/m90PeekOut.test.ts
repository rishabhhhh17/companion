// M90: Flowflow peeks out of the notch (F32, the founder, 14 Nov 2026). The notch at rest is no longer bare: Flowflow's eyes
// and the top of its head peek from the notch's side while something goes on, react to it, and hide when nothing does.
// These tests hold the plain decisions (peekOut.ts): what each state shows, the hide rules, the one timer, the settings
// read, and how each look is drawn (live and in pictures, with existing art only).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { initial, reduce, type Model } from "./model.ts";
import type { ReviewCard, ReviewDone } from "./review.ts";
import { MOOD_MS } from "./motionTokens.ts";
import { POSES } from "./characters.ts";
import { PAGES, mainKeys } from "./settingsPages.ts";
import {
  BUSY_HOLD_MS, HELLO_MS, PEEK_LOOKS, PEEK_SIDES, PEEK_HIDE_AFTER, peekClock, peekDraw, peekHideAfterMs, peekNextMs, peekNow, peekResult, peekSee,
  peekSide, peekSignals, sleepyMs, type PeekClock, type PeekRules, type PeekSignals,
} from "./peekOut.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const T0 = 1_800_000_000_000;
const MIN = 60_000;
const P = "/Users/me/shop";
const m = (o: Partial<Model> = {}): Model => ({ ...initial(), runnerUp: true, connected: "api_key", folder: P, ...o });
const RULES: PeekRules = { on: true, quiet: false, capturing: false, homeOpen: false, hideAfterMs: 2 * MIN };
const NONE: PeekSignals = { working: false, waiting: false, busyUntil: null };
const WORK: PeekSignals = { working: true, waiting: false, busyUntil: null };
const WAIT: PeekSignals = { working: false, waiting: true, busyUntil: null };
const done = (o: Partial<ReviewDone> = {}): ReviewDone => ({ rating: "safe", touches: [], summary: "Added a check.", notes: [], reasons: [], checks: "passed", sendBack: "", lane: "quick", usdEstimate: 0, ...o } as ReviewDone);
const card = (result: ReviewDone | null, o: Partial<ReviewCard> = {}): ReviewCard => ({ project: P, batch: "rv_1a2b", stage: result ? "reviewed" : "reviewing", files: [], count: 2, capped: false, secretFiles: [], auto: true, proof: true, asked: false, fix: null, note: null, result, ...o });
/** A clock that has seen `s` at `at`, from a launch at T0 (the hello long over unless asked). */
const seen = (s: PeekSignals, at: number, c: PeekClock = peekClock(T0 - 10 * MIN)): PeekClock => peekSee(c, { signals: s, result: null, stopped: false }, at);

describe("what each state shows (the state to reaction mapping)", () => {
  test("hello once at launch, then hidden when nothing goes on", () => {
    const c = peekClock(T0);
    expect(peekNow(c, NONE, RULES, T0 + 100)).toMatchObject({ show: true, look: "hello", dot: false, hide: null });
    expect(peekNow(c, NONE, RULES, T0 + HELLO_MS - 1).look).toBe("hello");
    // A launch hello is not activity: nothing went on, so it goes back once the hello is over.
    expect(peekNow(c, NONE, RULES, T0 + HELLO_MS + 1)).toMatchObject({ show: false, look: null, hide: "idle" });
  });
  test("watching while any connected AI tool or Squibby's own job runs", () => {
    const c = seen(WORK, T0);
    expect(peekNow(c, WORK, RULES, T0 + 30 * MIN)).toMatchObject({ show: true, look: "watching", dot: false });
  });
  test("waiting on you: a gentle look and a small amber dot, before anything else", () => {
    const c = seen({ ...WORK, waiting: true }, T0);
    expect(peekNow(c, { ...WORK, waiting: true }, RULES, T0 + 1000)).toMatchObject({ show: true, look: "waiting", dot: true });
    expect(peekNow(seen(WAIT, T0), WAIT, RULES, T0 + 40 * MIN)).toMatchObject({ show: true, look: "waiting", dot: true });
  });
  test("proud when a review's checks pass, worried when a check fails, each for its reaction's time", () => {
    for (const [kind, look] of [["proud", "proud"], ["worried", "worried"]] as const) {
      const c = peekSee(peekClock(T0 - 10 * MIN), { signals: NONE, result: kind, stopped: false }, T0);
      expect(peekNow(c, NONE, RULES, T0 + 10)).toMatchObject({ show: true, look, dot: false });
      expect(peekNow(c, NONE, RULES, T0 + MOOD_MS[kind] - 1).look).toBe(look);
      // Then it rests, still out, for the quiet spell.
      expect(peekNow(c, NONE, RULES, T0 + MOOD_MS[kind] + 1)).toMatchObject({ show: true, look: "rest" });
      // A result shows over work going on, then work's own look comes back.
      const w = peekSee(peekClock(T0 - 10 * MIN), { signals: WORK, result: kind, stopped: false }, T0);
      expect(peekNow(w, WORK, RULES, T0 + 10).look).toBe(look);
      expect(peekNow(w, WORK, RULES, T0 + MOOD_MS[kind] + 1).look).toBe("watching");
    }
  });
  test("sleepy, then hidden, after a quiet spell of the chosen length", () => {
    const end = T0 + 5 * MIN;
    const c = seen(NONE, end, seen(WORK, T0));
    const r = { ...RULES, hideAfterMs: 2 * MIN };
    expect(peekNow(c, NONE, r, end + 1000).look).toBe("rest");
    expect(peekNow(c, NONE, r, end + 2 * MIN - sleepyMs(2 * MIN) - 1).look).toBe("rest");
    expect(peekNow(c, NONE, r, end + 2 * MIN - sleepyMs(2 * MIN) + 1).look).toBe("sleepy");
    expect(peekNow(c, NONE, r, end + 2 * MIN + 1)).toMatchObject({ show: false, hide: "idle" });
    // Long work that just ended counts from its end, not its start (the spell is measured from the last activity).
    const r10 = { ...RULES, hideAfterMs: 10 * MIN };
    expect(peekNow(c, NONE, r10, end + 9 * MIN).look).toBe("rest");
  });
  test("the sleepy part is never more than a third of the spell, and never more than 20 seconds", () => {
    expect(sleepyMs(MIN)).toBe(20_000);
    expect(sleepyMs(30_000)).toBe(10_000);
    expect(sleepyMs(10 * MIN)).toBe(20_000);
  });
  test("every look is one of the six reactions or rest", () => {
    expect([...PEEK_LOOKS]).toEqual(["hello", "watching", "waiting", "proud", "worried", "sleepy", "rest"]);
  });
});

describe("the hide rules", () => {
  const busy = seen(WAIT, T0);
  test("turned off in Settings: never shown", () => {
    expect(peekNow(busy, WAIT, { ...RULES, on: false }, T0 + 10)).toMatchObject({ show: false, hide: "off" });
    expect(peekNow(peekClock(T0), NONE, { ...RULES, on: false }, T0 + 10)).toMatchObject({ show: false, hide: "off" });
  });
  test("presentation mode (a call in front, rule 7) hides it, even with something waiting", () => {
    expect(peekNow(busy, WAIT, { ...RULES, quiet: true }, T0 + 10)).toMatchObject({ show: false, hide: "call" });
  });
  test("a capture or Show me how being on hides it (rule 5: only the light shows then)", () => {
    expect(peekNow(busy, WAIT, { ...RULES, capturing: true }, T0 + 10)).toMatchObject({ show: false, hide: "capture" });
  });
  test("Home or the hover panel open hides it: the panel says the same, and its shape covers that place", () => {
    expect(peekNow(busy, WAIT, { ...RULES, homeOpen: true }, T0 + 10)).toMatchObject({ show: false, hide: "home" });
  });
  test("Stop everything hides it at once, until something new happens after", () => {
    const stopped = peekSee(seen(WORK, T0), { signals: WORK, result: null, stopped: true }, T0 + 1000);
    expect(peekNow(stopped, WORK, RULES, T0 + 1001)).toMatchObject({ show: false, hide: "stopped" });
    // The same work still said as going on after the stop is not news.
    const still = peekSee(stopped, { signals: WORK, result: null, stopped: false }, T0 + 2000);
    expect(peekNow(still, WORK, RULES, T0 + 2001).hide).toBe("stopped");
    // Nothing at all for a while: still hidden (and no rest or sleepy left over from before the stop).
    const quiet = peekSee(stopped, { signals: NONE, result: null, stopped: false }, T0 + 3000);
    expect(peekNow(quiet, NONE, RULES, T0 + 3001).show).toBe(false);
    // Something new after the stop: a tool waits, or a result comes.
    const next = peekSee(quiet, { signals: WAIT, result: null, stopped: false }, T0 + 9000);
    expect(peekNow(next, WAIT, RULES, T0 + 9001)).toMatchObject({ show: true, look: "waiting" });
    const res = peekSee(quiet, { signals: NONE, result: "proud", stopped: false }, T0 + 9000);
    expect(peekNow(res, NONE, RULES, T0 + 9001)).toMatchObject({ show: true, look: "proud" });
  });
  test("Stop during the launch hello ends the hello too", () => {
    const c = peekSee(peekClock(T0), { signals: NONE, result: null, stopped: true }, T0 + 200);
    expect(peekNow(c, NONE, RULES, T0 + 300).show).toBe(false);
  });
  test("the order of the rules: off, Home, a call, a capture, then Stop", () => {
    const all: PeekRules = { on: false, quiet: true, capturing: true, homeOpen: true, hideAfterMs: MIN };
    expect(peekNow(busy, WAIT, all, T0).hide).toBe("off");
    expect(peekNow(busy, WAIT, { ...all, on: true }, T0).hide).toBe("home");
    expect(peekNow(busy, WAIT, { ...all, on: true, homeOpen: false }, T0).hide).toBe("call");
    expect(peekNow(busy, WAIT, { ...all, on: true, homeOpen: false, quiet: false }, T0).hide).toBe("capture");
  });
});

describe("the one timer: when the peek may change by itself (no loop runs while nothing changes)", () => {
  test("the hello's end, a result's end, the sleepy start and the hide", () => {
    expect(peekNextMs(peekClock(T0), NONE, RULES, T0 + 400)).toBe(HELLO_MS - 400);
    const r = peekSee(peekClock(T0 - 10 * MIN), { signals: NONE, result: "proud", stopped: false }, T0);
    expect(peekNextMs(r, NONE, RULES, T0)).toBe(MOOD_MS.proud);
    const q = seen(NONE, T0 + MIN, seen(WORK, T0));
    expect(peekNextMs(q, NONE, RULES, T0 + MIN)).toBe(2 * MIN - sleepyMs(2 * MIN));
    expect(peekNextMs(q, NONE, RULES, T0 + MIN + 2 * MIN - 5000)).toBe(5000);
  });
  test("a tool said busy goes quiet by itself after its hold, so the timer wakes for that too", () => {
    const s: PeekSignals = { working: true, waiting: false, busyUntil: T0 + BUSY_HOLD_MS };
    expect(peekNextMs(seen(s, T0), s, RULES, T0)).toBe(BUSY_HOLD_MS);
  });
  test("hidden for good (off, idle, stopped): no timer at all", () => {
    expect(peekNextMs(seen(NONE, T0, seen(WORK, T0 - 20 * MIN)), NONE, RULES, T0 + 30 * MIN)).toBeNull();
    expect(peekNextMs(seen(WORK, T0), WORK, { ...RULES, on: false }, T0)).toBeNull();
    expect(peekNextMs(seen(WORK, T0), WORK, RULES, T0 + 5 * MIN)).toBeNull();
  });
});

describe("what the model says (signals and results)", () => {
  test("Squibby's own job, a review running and a connected tool said busy are work", () => {
    expect(peekSignals(m(), T0).working).toBe(false);
    expect(peekSignals(m({ character: "working" }), T0).working).toBe(true);
    expect(peekSignals(m({ character: "checking" }), T0).working).toBe(true);
    expect(peekSignals(m({ review: card(null) }), T0).working).toBe(true);
    const b = m({ toolBusy: { "/Users/me/other": T0 } });
    expect(peekSignals(b, T0 + 1000)).toMatchObject({ working: true, busyUntil: T0 + BUSY_HOLD_MS });
    // Said busy long ago, and nothing since: the tool has gone quiet.
    expect(peekSignals(b, T0 + BUSY_HOLD_MS + 1)).toMatchObject({ working: false, busyUntil: null });
  });
  test("a question, an approval or Claude Code waiting in any project is waiting on you", () => {
    expect(peekSignals(m({ claudeWaiting: { project: "/Users/me/elsewhere" } }), T0).waiting).toBe(true);
    expect(peekSignals(m({ approvals: [{ id: "a1" } as Model["approvals"][number]] }), T0).waiting).toBe(true);
    expect(peekSignals(m({ character: "needsYou" }), T0).waiting).toBe(true);
    expect(peekSignals(m(), T0).waiting).toBe(false);
  });
  test("a review's checks passing is proud, a check failing (or Not safe yet) is worried, once per result", () => {
    const before = m({ review: card(null) });
    expect(peekResult(before, m({ review: card(done({ checks: "passed" })) }))).toBe("proud");
    expect(peekResult(before, m({ review: card(done({ checks: "failed" })) }))).toBe("worried");
    expect(peekResult(before, m({ review: card(done({ checks: "passed", rating: "stop" })) }))).toBe("worried");
    expect(peekResult(before, m({ review: card(done({ checks: "not_run" })) }))).toBeNull();
    const after = m({ review: card(done({ checks: "passed" })) });
    expect(peekResult(after, { ...after })).toBeNull();
  });
  test("hook.busy reaches the model, ends with busy false, and Stop everything clears it", () => {
    let x = reduce(m(), { v: 1, id: "b1", type: "hook.busy", project: P, busy: true } as never);
    expect(Object.keys(x.toolBusy ?? {})).toEqual([P]);
    expect(typeof x.toolBusy?.[P]).toBe("number");
    x = reduce(x, { v: 1, id: "b2", type: "hook.busy", project: "/Users/me/other", busy: false } as never);
    expect(Object.keys(x.toolBusy ?? {})).toEqual([P]);
    x = reduce(x, { v: 1, id: "b3", type: "hook.busy", project: P, busy: false } as never);
    expect(x.toolBusy ?? null).toBeNull();
    const y = reduce(reduce(m(), { v: 1, id: "b1", type: "hook.busy", project: P, busy: true } as never), { v: 1, id: "s", type: "app.stop_everything" } as never);
    expect(y.toolBusy ?? null).toBeNull();
  });
  test("a second busy project's done never ends the first one's watching", () => {
    const B = "/Users/me/other";
    const now = Date.now();
    let x = reduce(m(), { v: 1, id: "b1", type: "hook.busy", project: P, busy: true } as never);
    x = reduce(x, { v: 1, id: "b2", type: "hook.busy", project: B, busy: true } as never);
    x = reduce(x, { v: 1, id: "b3", type: "hook.busy", project: B, busy: false } as never);
    expect(Object.keys(x.toolBusy ?? {})).toEqual([P]);
    expect(peekSignals(x, now + 1000).working).toBe(true);
    x = reduce(x, { v: 1, id: "b4", type: "hook.busy", project: P, busy: false } as never);
    expect(peekSignals(x, now + 1000).working).toBe(false);
  });
  test("a busy said long ago and replayed as the page opens is the past, not 90 seconds of fresh watching", () => {
    const old = new Date(Date.now() - 10 * MIN).toISOString();
    const x = reduce(m(), { v: 1, id: "b1", ts: old, type: "hook.busy", project: P, busy: true } as never);
    expect(x.toolBusy?.[P]).toBe(Date.parse(old));
    expect(peekSignals(x, Date.now()).working).toBe(false);
    // A time from the future, or no time at all, counts as now.
    const later = reduce(m(), { v: 1, id: "b2", ts: new Date(Date.now() + 10 * MIN).toISOString(), type: "hook.busy", project: P, busy: true } as never);
    expect(later.toolBusy![P]!).toBeLessThanOrEqual(Date.now());
    const none = reduce(m(), { v: 1, id: "b3", type: "hook.busy", project: P, busy: true } as never);
    expect(peekSignals(none, Date.now()).working).toBe(true);
  });
  test("the latest busy project counts: watching lasts until the last one goes quiet", () => {
    const b = m({ toolBusy: { [P]: T0, "/Users/me/other": T0 + 60_000 } });
    expect(peekSignals(b, T0 + BUSY_HOLD_MS + 1)).toMatchObject({ working: true, busyUntil: T0 + 60_000 + BUSY_HOLD_MS });
  });
});

describe("the settings, read safely", () => {
  test("the side: left (the usual) or right", () => {
    expect([...PEEK_SIDES]).toEqual(["left", "right"]);
    expect(peekSide("right")).toBe("right");
    for (const v of [undefined, null, "up", 3, "left"]) expect(peekSide(v)).toBe("left");
  });
  test("hide after: 1, 2 (the usual), 5 or 10 minutes; anything else is the usual", () => {
    expect([...PEEK_HIDE_AFTER]).toEqual(["1", "2", "5", "10"]);
    expect(peekHideAfterMs("1")).toBe(MIN);
    expect(peekHideAfterMs("10")).toBe(10 * MIN);
    for (const v of [undefined, null, "3", 0, "x"]) expect(peekHideAfterMs(v)).toBe(2 * MIN);
  });
  test("the registry agrees: on by default, left by default, 2 minutes by default, in General's More options under Notch", () => {
    const reg = JSON.parse(read("../../protocol/settings.json")) as { settings: { key: string; default: unknown; options?: string[]; applies: string[] }[] };
    const def = (k: string) => reg.settings.find((s) => s.key === k);
    expect(def("notch.peek")).toMatchObject({ default: true, applies: ["shell", "pages"] });
    expect(def("notch.peekSide")).toMatchObject({ default: "left", options: [...PEEK_SIDES], applies: ["shell", "pages"] });
    expect(def("notch.peekHideAfter")).toMatchObject({ default: "2", options: [...PEEK_HIDE_AFTER], applies: ["pages"] });
    // General's main level holds at most ten (the spec, 3.4), so the three sit in More options' Notch group, right after
    // what pointing at the notch opens: "what the notch shows at rest".
    expect(PAGES.general.more.find((t) => t.id === "more.general.notch")!.items.slice(0, 4)).toEqual(["island.pointOpens", "notch.peek", "notch.peekSide", "notch.peekHideAfter"]);
    expect(mainKeys("general")).not.toContain("notch.peek");
  });
});

describe("how each look is drawn", () => {
  test("live: the Draw live renderer's own reactions over rest; waiting is the gentle resting face with the amber dot", () => {
    expect(peekDraw("hello")).toMatchObject({ state: "idle", mood: "hello", dot: false });
    expect(peekDraw("watching")).toMatchObject({ state: "idle", mood: "watching", dot: false });
    expect(peekDraw("waiting")).toMatchObject({ state: "idle", mood: null, dot: true });
    expect(peekDraw("proud")).toMatchObject({ state: "idle", mood: "proud" });
    expect(peekDraw("worried")).toMatchObject({ state: "idle", mood: "worried" });
    expect(peekDraw("sleepy")).toMatchObject({ state: "idle", mood: "sleepy" });
    expect(peekDraw("rest")).toMatchObject({ state: "idle", mood: null, dot: false });
  });
  test("pictures (Draw live off): only the existing glance, peek, worry and sleep art, never new art", () => {
    const used = new Set(PEEK_LOOKS.map((l) => peekDraw(l).pose));
    for (const p of used) expect(["glance", "peek", "worry", "sleep"]).toContain(p);
    for (const p of used) expect(POSES as readonly string[]).toContain(p);
    expect(peekDraw("worried").pose).toBe("worry");
    expect(peekDraw("sleepy").pose).toBe("sleep");
    expect(peekDraw("watching").pose).toBe("glance");
  });
  test("pictures: which looks share one picture (the founder's art closes these; until then the help says the reactions need Draw live)", () => {
    const by = new Map<string, string[]>();
    for (const l of PEEK_LOOKS) by.set(peekDraw(l).pose, [...(by.get(peekDraw(l).pose) ?? []), l]);
    const shared = [...by.values()].filter((ls) => ls.length > 1);
    expect(shared).toEqual([["hello", "proud", "rest"], ["watching", "waiting"]]);
    // So the help and the CHANGELOG say so plainly.
    expect(read("./strings.ts")).toContain("With Draw live off, the character's pictures show fewer of these looks.");
    expect(read("../../CHANGELOG.md")).toContain("With Draw live off it uses the character's pictures, which show fewer of these looks");
  });
  test("the words promise only what it does: watching needs a job or the saved copy signal, pointing does what the notch does, and it sits over the menu bar", async () => {
    const { S } = await import("./strings.ts");
    const help = S.set["notch.peek"].help;
    expect(help).not.toContain("While your AI tool or a job works");
    expect(help).toContain("with the saved copy signal set up");
    expect(help).toContain("Point at it as you would the notch");
    expect(help).toContain("over the menu bar");
    expect(S.m90.name(S.m90.look.watching)).not.toContain("for the status");
    expect(S.m90.name(S.m90.look.watching)).toContain("as you would the notch");
    expect(S.m90.look.watching).not.toContain("your AI tool");
  });
  test("the live drawing is pinned: the orb holds its place and size in the small window (flowflow engine.ts pinned)", () => {
    expect(read("./peekOutPage.tsx")).toMatch(/<FlowflowView [^>]*\bpinned\b/);
  });
  test("no words or colours in the logic: the words are in strings.ts and the colours in tokens.css", () => {
    const src = read("./peekOut.ts");
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
    expect(src).not.toMatch(/"[A-Z][a-z]+ [a-z]+[^"]*"/);
  });
});
