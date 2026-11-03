// M55, section 4 (the character reacts): how the pages wire the water bubble's reactions to real events. The engine and the
// frame loop are tested in flowflow/reacts.test.ts; here, what tells it: Home's ask box (only that a key went in), the review
// card while changes wait, the switch (character.reacts), and that each state reaches it only as the app's own state.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { initial, lookState, reduce, type Model } from "./model.ts";
import { changesWait, type ReviewCard } from "./review.ts";
import { fromApp } from "./flowflow/behavior.ts";
import { toward } from "./flowflow/view.tsx";
import { placeOf } from "./settingsPages.ts";
import { searchSettingsFor } from "./settingsSearch.ts";
import { REGISTRY } from "../../protocol/settings.ts";
import { S } from "./strings.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const card = read("./card.tsx"), home = read("./homeCharacter.tsx"), view = read("./flowflow/view.tsx"), dock = read("./dock.tsx"), mini = read("./flowflowMini.tsx");
const ev = (o: Record<string, unknown>) => ({ v: 1, id: "e", ...o });
const run = (events: Record<string, unknown>[], from: Model = initial()) => events.reduce<Model>((m, e) => reduce(m, e as never), from);

describe("each reaction answers the app's own state, never a guess (rule 14)", () => {
  const P = "/p";
  const begin = [ev({ type: "checkpoint.created", project: P, agent: "a", checkpoint: "cp_0001", label: "Before: fix the cart", files: 3, skipped: [] }), ev({ type: "agent.state", agent: "a", state: "working" })];
  const receipt = (o: Record<string, unknown> = {}) => ev({ type: "receipt", agent: "a", checkpoint: "cp_0001", changed: [{ file: "cart.js", kind: "modified" }], commands: 1, notUndoable: [], proof: "passed", usdEstimate: 0.05, ended: "done", ...o });
  const after = (o: Record<string, unknown> = {}, state = "done") => run([...begin, receipt(o), ev({ type: "agent.state", agent: "a", state })]);
  test("working: the bubbles circle; a proven fix: the splash; a finished task that is not proven: no splash", () => {
    expect(fromApp(lookState(run(begin))).base).toBe("working");
    expect(fromApp(lookState(after())).flash).toBe("success");
    expect(fromApp(lookState(after({ proof: "skipped" }))).flash).toBeUndefined();
    expect(fromApp(lookState(after({ proof: "partial" }))).flash).toBeUndefined();
  });
  test("failed: the dip; it needs you: the lift", () => {
    expect(fromApp(lookState(after({ ended: "failed", endedWhy: "check_failed", proof: "failed" }, "error"))).base).toBe("error");
    expect(fromApp(lookState(after({ ended: "needs_you" }, "needsYou"))).base).toBe("needsYou");
  });
});

describe("changes waiting: it leans toward the review card", () => {
  const r = (o: Partial<ReviewCard> = {}): ReviewCard => ({ project: "/p", batch: "rv_0123456789", stage: "ready", files: [], count: 2, capped: false, secretFiles: [], auto: false, proof: false, asked: false, fix: null, note: null, result: null, ...o });
  test("only while the card offers Review them and it has not been pressed", () => {
    expect(changesWait(r())).toBe(true);
    expect(changesWait(r({ asked: true }))).toBe(false);
    expect(changesWait(r({ stage: "reviewing" }))).toBe(false);
    expect(changesWait(r({ stage: "reviewed" }))).toBe(false);
    expect(changesWait(null)).toBe(false);
    expect(changesWait(undefined)).toBe(false);
  });
  test("Home names the card only while it is shown on Now and changes wait; otherwise nothing to lean toward", () => {
    expect(card).toContain('leanTo={home.tab === "now" && show("review") && reviewOn && changesWait(m.review) ? REVIEW_ID : null}');
    expect(home).toContain("leanTo={leanTo}");
    // The view leans toward it once laid out, again once it has grown in and when the window resizes, and lets go when
    // nothing waits; the listener it adds is removed again.
    expect(view).toContain("if (!leanTo) { made.leanToward(null); return; }");
    expect(view).toContain('window.addEventListener("resize", aim, { passive: true });');
    expect(view).toContain('window.removeEventListener("resize", aim);');
  });
  test("the way to the card is from the middle of the character to the middle of the card, and nothing when either is not laid out", () => {
    const box = (left: number, top: number, width: number, height: number) => ({ getBoundingClientRect: () => ({ left, top, width, height }) }) as unknown as Element;
    expect(toward(box(0, 0, 100, 100), box(200, 300, 100, 40))).toEqual({ dx: 200, dy: 270 });
    expect(toward(box(0, 0, 100, 100), box(0, 0, 0, 0))).toBeNull();   // hidden
    expect(toward(box(0, 0, 0, 0), box(0, 0, 10, 10))).toBeNull();
  });
});

describe("typing: its eyes go to the ask box (Gentle and Lively), from that one box, never what is typed (rule 5)", () => {
  const listener = view.slice(view.indexOf("const onInput"), view.indexOf('document.removeEventListener("input", onInput)'));
  test("Home hands it its own ask box, and the view listens only for that box", () => {
    expect(card).toContain("askId={askId}");
    expect(card).toContain("<textarea ref={box} id={askId}");
    expect(home).toContain("askId={askId}");
    expect(listener).toContain("if (!box || box.id !== askId) return;");
    expect(view).toContain('document.addEventListener("input", onInput, { passive: true });');
    expect(view).toContain('return () => document.removeEventListener("input", onInput);');
  });
  test("nothing typed is ever read: no value, no text, no selection, no key", () => {
    expect(listener.length).toBeGreaterThan(100);
    expect(listener).not.toMatch(/\.value|textContent|innerText|innerHTML|selection|\.data\b|\.key\b|getRangeAt|clipboard/);
    // Only where the box is, at most every ASK_MEASURE_MS, so typing never lays the page out per key.
    expect(listener).toContain("t - at > ASK_MEASURE_MS");
    expect(view.slice(view.indexOf("export function toward"), view.indexOf("const ASK_MEASURE_MS"))).not.toMatch(/\.value|textContent|innerText/);
  });
  test("the page never decides whether it may look: the controller does (never in Still, never with less motion)", () => {
    const c = read("./flowflow/controller.ts"), at = c.slice(c.indexOf("  attend(dx: number, dy: number): void {"));
    expect(at.slice(0, at.indexOf("\n  }\n"))).toContain('if (this.disposed || this.reduced || this.engine.mode === "still") return;');
  });
});

describe("the switch, and where each character takes it", () => {
  const def = REGISTRY.settings.find((d) => d.key === "character.reacts");
  test("character.reacts: on by usual, the pages' own, in More options, Flowflow's section, beside reactions", () => {
    expect(def).toMatchObject({ section: "home", kind: "switch", default: true, scope: "app", applies: ["pages"], store: "settings", live: true });
    expect(placeOf("character.reacts")).toMatchObject({ page: "more", topic: "more.flowflow.motion", more: true });
    const found = (q: string) => searchSettingsFor(q).some((x) => "key" in x.hit && x.hit.key === "character.reacts");
    expect(found("lean")).toBe(true);
    expect(found("typing")).toBe(true);
  });
  test("Home's character and the one on the edge follow it; the notch's small one stays quiet", () => {
    expect(home).toContain('const reacts = useSetting("character.reacts") !== false;');
    expect(home).toContain("reacts={reacts} askId={askId} leanTo={leanTo}");
    expect(dock).toContain('const reacts = useSetting("character.reacts") !== false;');
    expect(dock).toContain("reacts={reacts}");
    expect(mini).toContain("small reacts={false}");
    expect(view).toContain("useEffect(() => { ctl.current?.setReacts(reacts !== false); }, [reacts, ctl.current]);");
  });
  test("its words: plain, short sentences, no dash, nothing in capitals, and it says how lively and less motion still rule", () => {
    const w = S.set["character.reacts"];
    expect(w.label).toBe("Reacts to what happens");
    for (const t of [w.label, w.help]) { expect(t).not.toMatch(/[–—]/); expect(t).not.toMatch(/\b[A-Z]{2,}\b/); }
    expect(w.help).toContain("Only that you are typing is used, never what you type.");
    expect(w.help).toContain("In Still it stays put while you type.");
    // The review, 3 Nov 2026: "news" and "there it does not look" were the code's words, not a person's.
    expect(w.help).not.toMatch(/\bnews\b|does not look/);
    expect(w.help).toContain("less motion");
  });
});

describe("frame cost", () => {
  test("the engine's reactions make nothing new per frame", () => {
    const e = read("./flowflow/engine.ts");
    const body = (name: string) => { const i = e.indexOf(name); return e.slice(i, e.indexOf("\n  }\n", i)); };
    for (const f of ["private aimHome(", "private aimEyes("]) expect(body(f), f).not.toMatch(/new \w+\(|\[\s*\]|\{\s*\w+:/);
  });
});
