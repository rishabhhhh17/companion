// M66 step 3, Home and its cards (homeFlow.ts, changeSize.ts, resultChips.ts), plus the source checks that pin how
// card.tsx, useModel.ts and the stylesheets use them.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { changeSize, BIG_CHANGE_LINES, SMALL_ASK_WORDS } from "./changeSize.ts";
import { checksOnOpen, FrameBatch, Landing, mergeDeltas, onlyStreamChanged, revealTo, STREAM_CHUNK, STREAM_LINES, threadLands, waitNeedsScroll, waitScroll } from "./homeFlow.ts";
import { changesFiles, MAX_CHIPS, resultChips, type ChipFacts } from "./resultChips.ts";
import { reduce, initial } from "./model.ts";
import { S } from "./strings.ts";

const src = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const delta = (text: string, req = "r1") => ({ type: "assist.prompt.delta", req, text });

describe("streamed deltas reach the page once a frame", () => {
  test("a run of deltas for one request becomes one, in order, and nothing else moves", () => {
    const got = mergeDeltas([delta("Hel"), delta("lo "), { type: "agent.state", state: "working" }, delta("wor"), delta("ld", "r2")]);
    expect(got).toEqual([delta("Hello "), { type: "agent.state", state: "working" }, delta("wor"), delta("ld", "r2")]);
  });
  test("200 tokens in one frame are drawn once; any other event alone goes on at once", () => {
    const out: unknown[] = []; const frames: (() => void)[] = [];
    const b = new FrameBatch((e) => out.push(e), (f) => frames.push(f));
    b.push({ type: "receipt" });
    expect(out).toHaveLength(1);
    for (let i = 0; i < 200; i++) b.push(delta(`t${i} `));
    expect(frames).toHaveLength(1);
    expect(out).toHaveLength(1);
    frames.shift()!();
    expect(out).toHaveLength(2);
    expect((out[1] as { text: string }).text.split(" ").filter(Boolean)).toHaveLength(200);
  });
  test("an event behind waiting deltas waits its turn, so the order holds", () => {
    const out: { type: string }[] = []; const frames: (() => void)[] = [];
    const b = new FrameBatch((e) => out.push(e), (f) => frames.push(f));
    b.push(delta("a ")); b.push({ type: "assist.prompt.done", req: "r1" });
    expect(out).toEqual([]);
    frames.shift()!();
    expect(out.map((e) => e.type)).toEqual(["assist.prompt.delta", "assist.prompt.done"]);
  });
  test("useModel sends runner events through the frame batch", () => {
    const u = src("./useModel.ts");
    expect(u).toContain("new FrameBatch(");
    expect(u).toMatch(/listen\("runner-event", \(e\) => batch\.push\(/);
  });
});

describe("streamed text is shown in whole words, a chunk at a time", () => {
  test("never half a word, and nothing until a chunk is worth it", () => {
    expect(revealTo("", "Make the")).toBe("");
    expect(revealTo("", "Make the butt")).toBe("");
    const long = "Make the login button bigger and blu";
    expect(revealTo("", long)).toBe("Make the login button bigger and ");
    expect(revealTo("", "Done. Now")).toBe("Done. ");
    expect(revealTo("", "One line\nTwo")).toBe("One line\n");
  });
  test("it only grows, and new text for a new request starts again", () => {
    const a = revealTo("", "a".repeat(30) + " b");
    expect(revealTo(a, "a".repeat(30) + " b")).toBe(a);
    expect(revealTo("old words ", "New text that is long enough to show ")).toBe("New text that is long enough to show ");
  });
  test("a 200 token stream changes the box far fewer times than it gets tokens", () => {
    const words = Array.from({ length: 200 }, (_, i) => `word${i % 7}`);
    let full = "", shown = "", changes = 0;
    for (const w of words) { full += `${w} `; const next = revealTo(shown, full); if (next !== shown) changes++; shown = next; }
    expect(changes).toBeLessThan(60);
    expect(shown.length).toBeGreaterThan(full.length - STREAM_CHUNK - 8);
  });
  test("the box keeps STREAM_LINES lines, pinned to the bottom, with a top fade, and the answer grows once", () => {
    const css = src("./ui/homeFlow.css");
    expect(STREAM_LINES).toBe(4);
    expect(css).toMatch(/\.ph-stream \{[^}]*height: calc\(var\(--stream-lines\) \* 1lh\)/);
    expect(css).toMatch(/\.ph-stream \{[^}]*justify-content: flex-end/);
    expect(css).toMatch(/\.ph-stream \{[^}]*mask-image: linear-gradient/);
    expect(css).toMatch(/\.ph-stream \{[^}]*overflow: clip/);
    const card = src("./card.tsx");
    expect(card).toContain("<StreamBox text={m.ph.streaming}");
    expect(card).toContain("--stream-lines");
  });
  test("Home is not measured for a render where only the streamed text changed", () => {
    const a = reduce({ ...initial(), ph: { stage: "thinking", req: "r1", streaming: "" } } as never, { type: "noop" });
    const b = reduce(a, delta("more words "));
    expect(onlyStreamChanged(a, b)).toBe(true);
    expect(onlyStreamChanged(null, b)).toBe(false);
    expect(onlyStreamChanged(b, { ...b, task: null, receipt: { checkpoint: "cp_1" } } as never)).toBe(false);
    expect(onlyStreamChanged(b, { ...b, ph: { ...b.ph!, stage: "ready" } } as never)).toBe(false);
    expect(src("./smoothMotion.ts")).toMatch(/export function useHomeMotion\([^)]*skip = false/);
    expect(src("./card.tsx")).toContain("const streamOnly = onlyStreamChanged(modelWas.current, m)");
    expect(src("./card.tsx")).toContain("useHomeMotion(root, work, view, home.tab, homeOpen, streamOnly)");
  });
});

describe("a card that needs you is scrolled to, not jumped to", () => {
  test("smooth when Home is open, placed at once while it opens or with motion reduced", () => {
    expect(waitScroll({ opening: false, reduced: false })).toBe("smooth");
    expect(waitScroll({ opening: true, reduced: false })).toBe("auto");
    expect(waitScroll({ opening: false, reduced: true })).toBe("auto");
    expect(src("./card.tsx")).toMatch(/scrollIntoView\?\.\(\{ block: "nearest", behavior: waitScroll\(/);
  });
  test("M71: a waiting card whose start is already in view scrolls nothing, so the lead above it stays (the wide review)", () => {
    // The wide review: the card starts under the lead, in view; Home stays put however tall the card is.
    expect(waitNeedsScroll({ cardTop: 180, viewTop: 0, viewBottom: 480 })).toBe(false);
    // Its start below the fold, or above the top: it is brought into view.
    expect(waitNeedsScroll({ cardTop: 460, viewTop: 0, viewBottom: 480 })).toBe(true);
    expect(waitNeedsScroll({ cardTop: 700, viewTop: 0, viewBottom: 480 })).toBe(true);
    expect(waitNeedsScroll({ cardTop: -20, viewTop: 0, viewBottom: 480 })).toBe(true);
    expect(src("./card.tsx")).toContain("if (!waitNeedsScroll({ cardTop: at.top,");
  });
});

describe("the proven check lands once", () => {
  test("only a proven result, only the first time it is seen", () => {
    const l = new Landing();
    expect(l.lands("cp_1", false)).toBe(false);
    expect(l.lands("cp_1", true)).toBe(true);
    expect(l.lands("cp_1", true)).toBe(false);
    expect(l.lands(null, true)).toBe(false);
    expect(l.lands("cp_2", true)).toBe(true);
  });
  test("a practice's thread lands when it moves into done, not when it already was", () => {
    expect(threadLands("proving", "done")).toBe(true);
    expect(threadLands("done", "done")).toBe(false);
    expect(threadLands(null, "done")).toBe(false);
    expect(threadLands("proving", "failed")).toBe(false);
  });
  test("the landing is a line filling in, the tick drawing in and one hairline coming and going (M71: never a glow), by transform, clip-path and opacity only", () => {
    const css = src("./ui/homeFlow.css");
    expect(css).toMatch(/\[data-landed\] \.ui-verdict-mark[^{]*\{[^}]*animation: land-tick var\(--dur-3\) var\(--ease-out\)/);
    expect(css).toMatch(/@keyframes land-tick \{[^}]*clip-path/);
    expect(css).toMatch(/\.panel\.receipt\[data-landed\]::after[^{]*\{[^}]*box-shadow: inset 0 0 0 var\(--hair\) var\(--line-strong\); opacity: 0; animation: land-glow var\(--seq-land\) var\(--ease-out\)/);
    expect(css).toMatch(/@keyframes land-glow \{[^]*?opacity/);
    expect(css).toMatch(/\.thread\[data-landed\] \.thread-step\[data-state="done"\]:last-child::before \{[^}]*animation: land-line var\(--dur-3\) var\(--ease-out\)/);
    expect(css).toMatch(/@keyframes land-line \{[^}]*scale/);
    // The old glow on every showing (a box-shadow, on every mount) is gone from look.css; with motion reduced every
    // animation stops (style.css), and the glow layer rests unseen at opacity 0.
    expect(src("./ui/look.css")).not.toContain("proven-glow");
    expect(src("./card.tsx")).toContain("data-landed={landed ? \"\" : undefined}");
    expect(src("./practicePanel.tsx")).toContain("data-landed");
  });
});

describe("a practice copy is checked once when it first opens", () => {
  const base = { practice: { project: "/p", stage: "start" }, project: "/p", busy: false, switched: true, seen: "" };
  test("a first open checks, as an open again always did", () => {
    expect(checksOnOpen(base)).toBe(true);
    expect(checksOnOpen({ ...base, practice: { ...base.practice, resumed: true } })).toBe(true);
  });
  test("never twice, never while busy, never past the start, never another folder's", () => {
    expect(checksOnOpen({ ...base, seen: "/p" })).toBe(false);
    expect(checksOnOpen({ ...base, busy: true })).toBe(false);
    expect(checksOnOpen({ ...base, switched: false })).toBe(false);
    expect(checksOnOpen({ ...base, practice: { project: "/p", stage: "found" } })).toBe(false);
    expect(checksOnOpen({ ...base, project: "/q" })).toBe(false);
    expect(checksOnOpen({ ...base, practice: null })).toBe(false);
  });
  test("card.tsx asks checksOnOpen, and the answer is quiet (nothing pointed at unasked)", () => {
    const card = src("./card.tsx");
    expect(card).toMatch(/if \(!pr \|\| !checksOnOpen\(\{ practice: pr, project, busy: isBusy\(m\), switched: switched\.current, seen: resumedKey\.current \}\)\) return;/);
    expect(card).not.toMatch(/if \(!pr\?\.resumed \|\| pr\.stage !== "start"/);
  });
});

describe("the size of a change", () => {
  test("a small edit says its lines and its file", () => {
    expect(changeSize([{ file: "src/login.js", kind: "modified", added: 3, removed: 2 }], 5)).toEqual({ line: "Changed 3 lines in login.js", lines: 3, rewrote: null, warn: null });
    expect(changeSize([{ file: "a.js", kind: "modified", added: 1, removed: 1 }])!.line).toBe("Changed 1 line in a.js");
  });
  test("several files say the total", () => {
    expect(changeSize([{ file: "a.js", kind: "modified", added: 10, removed: 2 }, { file: "b.css", kind: "added", added: 30, removed: 0 }])!.line).toBe("Changed 40 lines in 2 files");
  });
  test("a new file says it was added", () => {
    expect(changeSize([{ file: "css/new.css", kind: "added", added: 40, removed: 0 }])!.line).toBe("Added new.css, 40 lines");
  });
  test("a file that lost most of what it had was rewritten, and a small ask for it is warned about", () => {
    const s = changeSize([{ file: "pages/index.html", kind: "modified", added: 412, removed: 380, was: 400 }, { file: "a.js", kind: "modified", added: 1, removed: 1 }], 6)!;
    expect(s.line).toBe("Rewrote the whole of index.html, 412 lines");
    expect(s.rewrote).toBe("pages/index.html");
    expect(s.warn).toBe(S.changeSize.warn);
  });
  test("a big change for a big ask, or with no ask known, is said but not warned about", () => {
    const big = [{ file: "a.js", kind: "modified", added: BIG_CHANGE_LINES, removed: 0 }];
    expect(changeSize(big, SMALL_ASK_WORDS)!.warn).toBe(S.changeSize.warn);
    expect(changeSize(big, SMALL_ASK_WORDS + 1)!.warn).toBeNull();
    expect(changeSize(big)!.warn).toBeNull();
    expect(changeSize([{ file: "a.js", kind: "modified", added: 20, removed: 5 }], 3)!.warn).toBeNull();
  });
  test("no counts, or broken ones, say nothing: a size is never guessed", () => {
    expect(changeSize([{ file: "logo.png", kind: "modified" }])).toBeNull();
    expect(changeSize([])).toBeNull();
    expect(changeSize([{ file: "a.js", kind: "modified", added: -3, removed: 1 }])).toBeNull();
    expect(changeSize([{ file: "a.js", kind: "modified", added: 1.5, removed: 1 }])).toBeNull();
  });
  test("a small edit to a long file is not a rewrite", () => {
    expect(changeSize([{ file: "a.js", kind: "modified", added: 41, removed: 41, was: 900 }], 4)!.rewrote).toBeNull();
  });
  test("the receipt keeps the counts and the ask's words, and the card shows the line", () => {
    const m = reduce(initial(), { type: "receipt", agent: "builder-1", checkpoint: "cp_1", changed: [{ file: "a.js", kind: "modified", added: 2, removed: 1 }], commands: 0, notUndoable: [], proof: "passed", usdEstimate: 0, askWords: 4 });
    expect(m.receipt!.changed[0]).toEqual({ file: "a.js", kind: "modified", added: 2, removed: 1 });
    expect(m.receipt!.askWords).toBe(4);
    expect(src("./card.tsx")).toContain("changeSize(rcpt.changed, rcpt.askWords)");
    expect(src("./card.tsx")).toContain("{changeSz && <div className=\"line muted change-size\">{changeSz.line}</div>}");
  });
});

describe("the fixed chips at the end of a result", () => {
  const facts = (f: Partial<ChipFacts> = {}): ChipFacts => ({ changed: 2, undone: false, busy: false, failed: false, canUndo: true, undoShown: false, explainReady: true, canFix: true, fixShown: false, ...f });
  test("a good result: What changed, Explain this, Undo", () => {
    expect(resultChips(facts())).toEqual(["whatChanged", "explain", "undo"]);
  });
  test("a failed check: Fix it leads", () => {
    expect(resultChips(facts({ failed: true }))).toEqual(["fix", "whatChanged", "undo"]);
  });
  test("never more than three, never a button the card already shows", () => {
    expect(resultChips(facts({ failed: true })).length).toBeLessThanOrEqual(MAX_CHIPS);
    expect(resultChips(facts({ undoShown: true }))).toEqual(["whatChanged", "explain"]);
    expect(resultChips(facts({ failed: true, fixShown: true, undoShown: true }))).toEqual(["whatChanged", "explain"]);
  });
  test("only what can act: nothing changed has no What changed, no Why has no Explain this", () => {
    expect(resultChips(facts({ changed: 0, canUndo: false, explainReady: false }))).toEqual([]);
    expect(resultChips(facts({ explainReady: false, canUndo: false }))).toEqual(["whatChanged"]);
  });
  test("none while something is under way on the card, or after an Undo", () => {
    expect(resultChips(facts({ busy: true }))).toEqual([]);
    expect(resultChips(facts({ undone: true }))).toEqual([]);
  });
  test("the chips that change files ask first", () => {
    expect(changesFiles("undo")).toBe(true);
    expect(changesFiles("fix")).toBe(true);
    expect(changesFiles("explain")).toBe(false);
    expect(changesFiles("whatChanged")).toBe(false);
    const card = src("./card.tsx");
    // Undo goes through its own question (ui.undoAsked); Fix it opens a question before it sends anything.
    expect(card).toMatch(/case "undo": dispatch\(\{ type: "ui\.undoAsked"/);
    expect(card).toMatch(/case "fix": setChipFixAsk\(true\)/);
    expect(card).toMatch(/S\.resultChips\.fixSure/);
  });
});

describe("the hotkey is acknowledged at once, with the light first (rule 5)", () => {
  const main = src("../src-tauri/src/main.rs");
  const w = main.slice(main.indexOf("fn voice_worker("));
  const down = w.slice(w.indexOf("Ok(VoiceMsg::Down(t, mode)) => {"), w.indexOf("Ok(VoiceMsg::Up(t)) => {"));
  test("the light and the listening line come before the wait, and the wait before the microphone opens", () => {
    const light = down.indexOf("listening(true);"), said = down.indexOf('say_voice(&app, "listening"'), wait = down.indexOf("std::thread::sleep(Duration::from_millis(150))"), mic = down.indexOf("voice_mac::Recorder::start(");
    expect(light).toBeGreaterThan(0);
    expect(said).toBeGreaterThan(light);
    expect(wait).toBeGreaterThan(said);
    expect(mic).toBeGreaterThan(wait);
  });
  test("nothing slow runs between the keys going down and the light: no reading of another app, no sleep, no download", () => {
    const before = down.slice(0, down.indexOf("listening(true);"));
    expect(before).not.toContain("thread::sleep");
    expect(before).not.toContain("ax::focused(");
    expect(before).not.toContain("voice_download");
    expect(before).not.toContain("Recorder::start(");
  });
  test("the page takes the listening line in the frame it arrives: only streamed deltas wait for a frame", () => {
    const out: unknown[] = [];
    const b = new FrameBatch((e) => out.push(e), () => { throw new Error("waited for a frame"); });
    b.push({ type: "app.voice", stage: "listening" });
    expect(out).toEqual([{ type: "app.voice", stage: "listening" }]);
  });
});
