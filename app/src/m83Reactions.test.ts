// M83 Part B: the character reacts to what really happens (the founder, 12 Nov 2026: "it always has the same reaction").
// Each reaction comes only from a real event the pages already receive, settles back to rest by itself, and nothing changes
// with no event, except getting sleepy after ten minutes with none. Every state and reaction has a look in every style.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { initial, reduce, type CharacterState, type Model } from "./model.ts";
import { MOOD_MS } from "./motionTokens.ts";
import { REACTIONS, moodAt, moodEvent, moodHello, moodNextMs, moodSee, moodShown, moodStart, watchingNow, type Reaction } from "./moods.ts";
import { BEHAVIOR_STATES, Behavior, LOOKS, LOOK_KEYS, REACT_STATE, fromApp } from "./flowflow/behavior.ts";
import { POSES, poseFor, ringOf, visorPose, visorReaction, orbReaction } from "./characters.ts";

const APP: CharacterState[] = ["off", "idle", "listening", "thinking", "working", "checking", "needsYou", "done", "error"];
const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

// Real events, through the real reducer.
const P = "/Users/x/shop";
const base = (): Model => reduce(initial(), { type: "ui.projectChanged", project: P });
const ev = (m: Model, e: Record<string, unknown>): Model => reduce(m, e as { type: string });

/** A model with a task and a proven receipt, as task.done / receipt events leave it. */
function proven(m: Model, checkpoint = "c1"): Model {
  return { ...m, task: { agent: "a1", project: P, label: "fix", steps: [], proof: { verdict: "passed", steps: [] } } as unknown as Model["task"],
    receipt: { checkpoint, changed: [{ file: "a.ts", kind: "modified" }], commands: 0, notUndoable: [], usdEstimate: 0, proof: "passed", end: "done" } as unknown as Model["receipt"] };
}

describe("each real event gives its reaction (a table)", () => {
  const rows: { name: string; from: () => Model; to: (m: Model) => Model; want: ReturnType<typeof moodEvent> }[] = [
    { name: "the project's checks pass (Point at the problem)", from: () => ev(base(), { type: "ui.findProblem" }), to: (m) => ev(m, { type: "problem.found", verdict: "passed" }), want: "proud" },
    { name: "a review says Not safe yet", from: () => ({ ...base(), review: { project: P, batch: "b1", stage: "ready", files: [], count: 2, capped: false, secretFiles: [], auto: true, proof: false, asked: false, fix: null, note: null, result: null } as unknown as Model["review"] }),
      to: (m) => ({ ...m, review: { ...m.review!, stage: "reviewed", result: { rating: "stop" } as never } }), want: "worried" },
    { name: "a key written into the code is caught", from: base, to: (m) => ({ ...m, review: { project: P, batch: "b2", stage: "ready", files: [], count: 1, capped: false, secretFiles: [], auto: true, proof: false, asked: false, fix: null, note: null, result: null, keys: [{ file: "a.ts", line: 3 }] } as unknown as Model["review"] }), want: "worried" },
    { name: "an Undo is done", from: () => ({ ...base(), undo: { stage: "working", checkpoint: "c1" } }), to: (m) => ev(m, { type: "checkpoint.restored", checkpoint: "c1", project: P }), want: "relieved" },
    { name: "Stop everything", from: base, to: (m) => ev(m, { type: "app.stop_everything" }), want: "calm" },
  ];
  for (const r of rows) test(r.name, () => { const a = r.from(); expect(moodEvent(a, r.to(a))).toBe(r.want); });
  test("a fix proven (a new proven receipt)", () => { const a = base(); expect(moodEvent(a, proven(a))).toBe("proud"); });
  test("the same proven receipt again is not news", () => { const a = proven(base()); expect(moodEvent(a, { ...a, receipt: { ...a.receipt! } })).toBeNull(); });
  test("Claude Code waiting for you (hook.waiting) is held as watching, and ends when it stops waiting", () => {
    const a = ev(base(), { type: "hook.waiting", project: P, waiting: true });
    expect(watchingNow(a)).toBe(true);
    expect(watchingNow(ev(a, { type: "hook.waiting", project: P, waiting: false }))).toBe(false);
    // Waiting in another project is not this one's.
    expect(watchingNow(ev(base(), { type: "hook.waiting", project: "/Users/x/other", waiting: true }))).toBe(false);
  });
  test("ordinary events are not reactions", () => {
    const a = base();
    for (const e of [{ type: "agent.state", agent: "a1", state: "working" }, { type: "app.notice", message: "hi" }, { type: "ui.settle" }]) expect(moodEvent(a, ev(a, e))).toBeNull();
  });
});

describe("the clock: each reaction settles back to rest, nothing happens with no event", () => {
  const flashes: Exclude<Reaction, "watching" | "sleepy">[] = ["proud", "worried", "relieved", "hello"];
  for (const f of flashes) test(`${f} shows, then returns to rest`, () => {
    let c = moodStart(0);
    c = f === "hello" ? moodHello(c, 1000) : moodSee(c, f, 1000);
    expect(moodAt(c, 1000, false)).toBe(f);
    expect(moodAt(c, 1000 + MOOD_MS[f] - 1, false)).toBe(f);
    expect(moodAt(c, 1000 + MOOD_MS[f], false)).toBeNull();
    expect(moodNextMs(c, 1000, false)).toBe(MOOD_MS[f]);
  });
  test("watching holds while it lasts and ends with it", () => {
    const c = moodStart(0);
    expect(moodAt(c, 5000, true)).toBe("watching");
    expect(moodAt(c, 5000, false)).toBeNull();
  });
  test("with no event nothing changes for ten minutes; then sleepy, and any activity wakes it", () => {
    const c = moodStart(0);
    for (const t of [0, 1000, 60_000, MOOD_MS.sleepy - 1]) expect(moodAt(c, t, false)).toBeNull();
    expect(moodNextMs(c, 0, false)).toBe(MOOD_MS.sleepy);
    expect(moodAt(c, MOOD_MS.sleepy, false)).toBe("sleepy");
    const woke = moodSee(c, null, MOOD_MS.sleepy + 5, true);
    expect(moodAt(woke, MOOD_MS.sleepy + 5, false)).toBeNull();
    // The pointer is activity too (moodHello also wakes).
    expect(moodAt(moodHello(c, MOOD_MS.sleepy + 5), MOOD_MS.sleepy + 5, false)).toBe("hello");
  });
  test("Stop everything ends a reaction at once", () => {
    const c = moodSee(moodStart(0), "worried", 10);
    expect(moodAt(moodSee(c, "calm", 20), 20, false)).toBeNull();
  });
  test("hello never cuts a reaction short, and is said once per arrival", () => {
    const c = moodSee(moodStart(0), "proud", 10);
    expect(moodAt(moodHello(c, 20), 20, false)).toBe("proud");
  });
  test("a reaction shows only over rest (and proud over done); work, needs you, error, listening and off keep their own look", () => {
    for (const r of REACTIONS) {
      expect(moodShown("idle", r)).toBe(r);
      for (const s of ["working", "thinking", "checking", "needsYou", "error", "listening", "off"] as CharacterState[]) expect(moodShown(s, r), `${s} ${r}`).toBeNull();
    }
    expect(moodShown("done", "proud")).toBe("proud");
    expect(moodShown("done", "hello")).toBeNull();
    expect(moodShown("idle", null)).toBeNull();
  });
});

describe("Flowflow's looks (behavior.ts)", () => {
  test("idle looks awake: soft open round eyes, the happy closed arcs kept for proud", () => {
    expect(LOOKS.idle.eyeDot).toBeCloseTo(0.85, 2); expect(LOOKS.idle.eyeArc).toBeCloseTo(0.3, 2);
    expect(LOOKS.success.eyeDot).toBe(0); expect(LOOKS.success.eyeArc).toBeGreaterThanOrEqual(1.5);
  });
  test("every reaction has its own look, different from rest", () => {
    const d = (a: keyof typeof LOOKS, b: keyof typeof LOOKS) => LOOK_KEYS.reduce((s, k) => s + Math.abs(LOOKS[a][k] - LOOKS[b][k]), 0);
    for (const r of REACTIONS) { const st = REACT_STATE[r]; expect(BEHAVIOR_STATES).toContain(st); expect(d(st, "idle"), r).toBeGreaterThan(0.25); }
    // Worried: wide open eyes, no red, no cloud. Sleepy: heavy half lids, slower breath. Relieved: the eyes close.
    expect(LOOKS.worried.eyeOpen).toBeGreaterThan(LOOKS.idle.eyeOpen); expect(LOOKS.worried.cloud).toBe(0); expect(LOOKS.worried.amber).toBe(0);
    expect(LOOKS.sleepy.lid).toBe(1);   // the heavy lids half close the eyes now (12 Nov review), not a squashed eye expect(LOOKS.sleepy.breathRate).toBeLessThan(LOOKS.idle.breathRate);
    // Relieved: the eyes close into soft content arcs with a small smile (12 Nov review: squeezed shut it read as working).
    expect(LOOKS.relieved.eyeDot).toBe(0); expect(LOOKS.relieved.eyeArc).toBeGreaterThanOrEqual(1); expect(LOOKS.relieved.mouth).toBeGreaterThan(0.5);
    expect(LOOKS.watching.gazeGain).toBeGreaterThan(0.5);
  });
  test("a reaction shows only over rest, and returns to rest when it ends", () => {
    const b = new Behavior(); b.applyReaction("worried"); expect(b.state).toBe("worried");
    b.applyReaction(null); expect(b.state).toBe("idle");
    b.applyApp("working"); b.applyReaction("worried"); expect(b.state).toBe("working");
  });
  test("done is proud, a little longer than the old success flash", () => {
    expect(fromApp("done")).toEqual({ base: "idle", flash: "success" });
    expect(MOOD_MS.proud).toBeGreaterThan(2400);
  });
});

describe("each reaction is unmistakable at a glance (the review of 12 Nov: idle, hello, watching, worried, sleepy looked the same)", () => {
  // A clear margin: at least two look values differ from idle by at least 0.25 each (the face's own keys are 0 to 1 or so).
  const clear = (st: keyof typeof LOOKS) => LOOK_KEYS.filter((k) => Math.abs(LOOKS[st][k] - LOOKS.idle[k]) >= 0.25);
  for (const r of REACTIONS) test(`${r} differs from idle in at least two ways`, () => { expect(clear(REACT_STATE[r]).length, `${r}: ${clear(REACT_STATE[r]).join(", ")}`).toBeGreaterThanOrEqual(2); });
  test("each reaction has its own mark", () => {
    // Hello: bigger eyes with catch lights and a small smile. Watching: the eyes turned far to the side, with a slow blink.
    expect(LOOKS.hello.eyeSize).toBeGreaterThanOrEqual(1.3); expect(LOOKS.hello.glint).toBe(1); expect(LOOKS.hello.mouth).toBe(1);
    expect(LOOKS.watching.reach).toBeGreaterThanOrEqual(2); expect(LOOKS.watching.blinkSlow).toBe(1);
    // Worried: wide eyes with catch lights, two slanted brows, a touch smaller, one sweat drop (engine.ts sweat).
    expect(LOOKS.worried.eyeSize).toBeGreaterThanOrEqual(1.25); expect(LOOKS.worried.brow).toBe(1); expect(LOOKS.worried.glint).toBe(1); expect(LOOKS.worried.expand).toBeLessThan(-0.02);
    // Sleepy: heavy half lids, a slower breath, bubbles rising like z's.
    expect(LOOKS.sleepy.lid).toBe(1); expect(LOOKS.sleepy.zz).toBe(1); expect(LOOKS.sleepy.breathRate).toBeLessThan(LOOKS.idle.breathRate / 1.5);
    // Idle keeps none of these.
    for (const k of ["glint", "brow", "mouth", "lid", "zz", "blinkSlow"] as const) expect(LOOKS.idle[k], k).toBe(0);
    expect(LOOKS.idle.eyeSize).toBe(1); expect(LOOKS.idle.reach).toBe(1);
  });
  test("the shader draws each mark from the look", () => {
    const sh = read("./flowflow/shaders.ts"), rd = read("./flowflow/renderer.ts");
    for (const u of ["uFace2", "uFace3", "uSweat"]) { expect(sh, u).toContain(`uniform `); expect(sh).toContain(u); expect(rd).toContain(u); }
    expect(rd).toContain("u.uFace2.value = [look.eyeSize, look.glint, look.brow, look.mouth];");
    expect(rd).toContain("u.uFace3.value = [look.lid, look.reach, look.zz, look.blinkSlow];");
  });
});

describe("every state and reaction has a look in every character style", () => {
  test("Water pictures", () => {
    for (const s of APP) { expect(POSES).toContain(poseFor(s)); for (const r of REACTIONS) expect(POSES, `${s} ${r}`).toContain(poseFor(s, { mood: moodShown(s, r) })); }
    // Idle is awake (open eyes), proud splashes, worried is the worry pose, sleepy sleeps, relieved closes its eyes softly.
    expect(poseFor("idle")).toBe("peek"); expect(poseFor("idle", { mood: "proud" })).toBe("splash"); expect(poseFor("idle", { mood: "worried" })).toBe("worry");
    expect(poseFor("idle", { mood: "sleepy" })).toBe("sleep"); expect(poseFor("idle", { mood: "relieved" })).toBe("look"); expect(poseFor("idle", { mood: "watching" })).toBe("glance");
    // A reaction never hides work or a question.
    expect(poseFor("working", { mood: "hello" })).toBe("laptop");
  });
  test("the Visor", () => {
    for (const s of APP) for (const r of [null, ...REACTIONS]) {
      const v = visorReaction(visorPose(s, ringOf(s)), moodShown(s, r));
      expect(["none", "rest", "scan", "meter", "needs", "smile"]).toContain(v.pose.lights);
      if (moodShown(s, r) && r !== "proud") expect(v.react, `${s} ${r}`).toBe(r);
    }
    expect(visorReaction(visorPose("idle", null), "proud").pose.lights).toBe("smile");
    // The reaction never changes the meaning colour of the lights (no red, no amber for worried).
    expect(visorReaction(visorPose("idle", null), "worried").pose.tone).toBe("light");
    const css = read("./ui/parts.css");
    for (const r of REACTIONS.filter((x) => x !== "proud")) expect(css, r).toContain(`.ui-visor[data-react="${r}"]`);
  });
  test("the glass orb", () => {
    for (const s of APP) for (const r of [null, ...REACTIONS]) { const o = orbReaction(ringOf(s), moodShown(s, r)); expect(o.ring === null || ["stop", "needs", "proven", "working"].includes(o.ring)).toBe(true); }
    expect(orbReaction(null, "proud").ring).toBe("proven");
    expect(orbReaction(null, "worried").ring).toBeNull();   // no red, no amber: worry is not a meaning
    const css = read("./ui/parts.css");
    for (const r of REACTIONS.filter((x) => x !== "proud")) expect(css, r).toContain(`.ui-orb:not(.ui-visor)[data-react="${r}"]`);
  });
  test("Reduce motion: every reaction is a still look (no animation) for the Visor and the orb", () => {
    const css = read("./ui/parts.css");
    expect(css).toMatch(/\.ui-orb\[data-calm\][^{]*\{[^}]*animation: none !important;[^}]*transition: none !important;/);
  });
});

describe("wired through the pages' own model, the protocol untouched", () => {
  test("the dock, Home and the notch read the same reactions", () => {
    expect(read("./dock.tsx")).toContain("useMood(m, { state, host: button })");
    expect(read("./homeCharacter.tsx")).toContain("useMood(");
    expect(read("./island.tsx")).toContain("useMood(");
    expect(read("./flowflow/view.tsx")).toContain("setReaction(");
  });
});
