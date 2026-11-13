// M83 Part A: the wider notch panel that says more (notchQuick.ts notchFacts). Every fact comes from data the pages already
// hold, a fact with no data is left out (never a made up number), the head's own fact is never said twice, and each press
// only opens Home at a place. The new width and height are pinned on both sides (TypeScript, CSS and Rust).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { initial, type HistoryItem, type Model } from "./model.ts";
import type { ReviewCard } from "./review.ts";
import type { DoneRow, DoneState } from "./doneSignal.ts";
import { FACT_GO, HOME_FACTS_MAX, LAYOUT_H, NOTCH_FACTS_MAX, PANEL_W, connectedTools, homeFacts, notchFacts, quickFactKind, whenWords } from "./notchQuick.ts";
import { arrivalFrom } from "./home.ts";
import { MEANING_COLOUR } from "./meaning.ts";
import { S } from "./strings.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const P = "/Users/me/my-shop";
// Local times, so the clock words do not depend on the Mac's time zone.
const NOW = new Date(2026, 10, 12, 15, 0).getTime();
const at = (d: number, h: number, mi: number) => new Date(2026, 10, d, h, mi).toISOString();
const row = (o: Partial<HistoryItem> = {}): HistoryItem => ({ id: 1, label: "Fix the join button", status: "done", usd: 0, startedAt: at(12, 14, 0), endedAt: at(12, 14, 14), checkpoint: "cp_9", changed: 1, proof: "passed", ...o });
const review = (count: number, o: Partial<ReviewCard> = {}): ReviewCard => ({ project: P, batch: "rv_1a2b", stage: "ready", files: [], count, capped: false, secretFiles: [], auto: false, proof: false, asked: false, fix: null, note: null, result: null, ...o });
const m = (o: Partial<Model> = {}): Model => ({ ...initial(), connected: "api_key", folder: P, ...o });
const hooks = (tool: DoneRow["tool"], on: boolean): DoneRow[] => (tool === "claude" ? ["done", "guard", "waiting"] : ["done", "guard"]).map((hook) => ({ tool, hook: hook as DoneRow["hook"], on, file: "x", adds: "y", creates: false }));
const st = (...rows: DoneRow[][]): DoneState => ({ project: P, tools: rows.flat() });
const facts = (x: Model, o: Partial<Parameters<typeof notchFacts>[1]> = {}) => notchFacts(x, { now: NOW, head: quickFactKind(x, NOW), ...o });
const words = (x: Model, o: Partial<Parameters<typeof notchFacts>[1]> = {}) => facts(x, o).map((f) => f.words);

describe("when a fact happened, in plain clock words", () => {
  test("today the clock, this week the weekday, older the date, and nothing for a missing or future time", () => {
    expect(whenWords(at(12, 14, 14), NOW)).toBe("2:14 pm");
    expect(whenWords(at(10, 9, 5), NOW)).toBe("Tue 9:05 am");
    expect(whenWords(at(1, 9, 5), NOW)).toBe("Nov 1");
    expect(whenWords(null, NOW)).toBe("");
    expect(whenWords("not a time", NOW)).toBe("");
    expect(whenWords(at(13, 9, 0), NOW)).toBe("");
  });
});

describe("the facts row (M83)", () => {
  test("no project, the engine stopped, or no Claude: no facts at all", () => {
    expect(facts(m({ folder: null }))).toEqual([]);
    expect(facts(m({ runnerUp: false, history: [row()] }))).toEqual([]);
    expect(facts(m({ connected: "none", history: [row()] }))).toEqual([]);
  });

  test("a project never checked, with nothing known: no facts (nothing is faked)", () => {
    expect(facts(m())).toEqual([]);
  });

  test("the last check's result and when, in its meaning colour, only when the head does not already say it", () => {
    // The head says "last check passed": the row does not say it again.
    expect(quickFactKind(m({ history: [row()] }), NOW)).toBe("passed");
    expect(words(m({ history: [row()] }))).toEqual([]);
    // With changes waiting the head says those, so the row says the check with its clock time, green.
    const x = m({ history: [row()], review: review(3) });
    expect(quickFactKind(x, NOW)).toBe("changes");
    expect(facts(x)[0]).toMatchObject({ id: "check", words: "Checked 2:14 pm, working", colour: MEANING_COLOUR.proven, go: {} });
    // A failed check is red; files changed since a pass are orange.
    const failed = m({ history: [row({ proof: "failed", failedCheck: "tests" })], review: review(1) });
    expect(facts(failed)[0]).toMatchObject({ words: "Check failed 2:14 pm", colour: "red" });
    const changed = m({ history: [row()], sinceCheck: { project: P, changed: true } });
    expect(quickFactKind(changed, NOW)).toBe("changedSince");
    expect(facts(changed)[0]).toMatchObject({ words: "Passed 2:14 pm, changed since", colour: "orange" });
  });

  test("changes waiting: the real file count, orange, opening the review; capped counts say so", () => {
    const tools = st(hooks("claude", true));
    const x = m({ history: [row()], review: review(3) });
    // The head says the changes; the row says the check and the tools instead, never the changes twice.
    expect(words(x, { tools })).toEqual(["Checked 2:14 pm, working", "Claude Code connected"]);
    // While a question waits the head says the question, so the changes are in the row.
    const asked = { ...x, approvals: [{ id: "q1" }] as unknown as Model["approvals"] };
    const ch = facts(asked).find((f) => f.id === "changes")!;
    expect(ch).toMatchObject({ id: "changes", words: "3 files changed", colour: "orange", go: { then: { do: "review" } } });
    expect(facts({ ...asked, review: review(200, { capped: true }) }).find((f) => f.id === "changes")!.words).toBe("200+ files changed");
    expect(facts({ ...asked, review: review(1) }).find((f) => f.id === "changes")!.words).toBe("1 file changed");
    // A review already done is not waiting.
    expect(facts({ ...asked, review: review(3, { stage: "reviewed" }) }).some((f) => f.id === "changes")).toBe(false);
  });

  test("the AI tools connected from M82, or none, and nothing until the engine has said", () => {
    expect(connectedTools(null)).toBeNull();
    expect(words(m(), { tools: null })).toEqual([]);
    expect(facts(m(), { tools: st(hooks("claude", false)) })).toMatchObject([{ id: "tools", words: S.notch.facts.noTool, colour: null, go: { then: { set: "fixing.tools" } } }]);
    expect(words(m(), { tools: st(hooks("claude", true), hooks("cursor", true)) })).toEqual(["Claude Code and Cursor connected"]);
    expect(words(m(), { tools: st(hooks("claude", true), hooks("cursor", true), hooks("codex", true), hooks("windsurf", true)) })).toEqual(["Claude Code, Codex and 2 more connected"]);
    // A tool with only some of its hooks on is not connected.
    const partly = st([{ ...hooks("cursor", true)[0] }, { ...hooks("cursor", false)[1] }]);
    expect(words(m(), { tools: partly })).toEqual([S.notch.facts.noTool]);
    expect(facts(m(), { tools: st(hooks("claude", true)) })[0].colour).toBe(MEANING_COLOUR.working);
  });

  test("what the safety net caught this week, only when it caught something", () => {
    const c = { since: "2026-11-05", falseDones: 1, keys: 1, weakened: 0, saved: 4, undone: 2 };
    expect(words(m({ caught: c }))).toEqual(["2 caught this week"]);
    expect(words(m({ caught: { ...c, falseDones: 0, keys: 0 } }))).toEqual([]);
  });

  test("a job at work: its step and real time first, and no check fact beside it", () => {
    const x = m({ history: [row()], review: review(2) });
    const f = facts(x, { job: { step: 2, ms: 83_000 } });
    expect(f[0]).toMatchObject({ id: "job", words: "Checking · 1:23", colour: MEANING_COLOUR.working, go: {} });
    expect(f.some((y) => y.id === "check")).toBe(false);
  });

  test("never more than three, in their order", () => {
    const asked = m({ history: [row()], review: review(3), approvals: [{ id: "q" }] as unknown as Model["approvals"], caught: { since: "x", falseDones: 1, keys: 0, weakened: 0, saved: 0, undone: 0 } });
    const f = facts(asked, { tools: st(hooks("claude", true)), job: { step: 1, ms: 1000 } });
    expect(f.length).toBe(NOTCH_FACTS_MAX);
    expect(f.map((y) => y.id)).toEqual(["job", "changes", "tools"]);
  });

  test("every fact only opens Home, at a place the shell allows", () => {
    for (const go of Object.values(FACT_GO)) {
      if (go.then) expect(arrivalFrom(go)).not.toBeNull();
      else expect(go).toEqual({});
    }
    const panel = read("./islandPanel.tsx");
    expect(panel).toContain('invoke("island_go", f.go)');
  });
});

describe("Home's status strip (M83 Part C): the same facts as a caption over a short value", () => {
  const tools = st(hooks("claude", true), hooks("cursor", true));
  const caught = { since: "2026-11-05", falseDones: 1, keys: 1, weakened: 0, saved: 0, undone: 0 };
  test("checked and working with tools: the check's time, the tools and what was caught, each with its caption", () => {
    const f = homeFacts(m({ history: [row()], caught }), { now: NOW, tools });
    expect(f.map((x) => [x.label, x.value, x.colour])).toEqual([["Last check", "2:14 pm · working", "green"], ["AI tools", "Claude Code and Cursor", "blue"], ["This week", "2 caught", "grey"]]);
  });
  test("changes waiting and a failing check are both said; at most four", () => {
    const f = homeFacts(m({ history: [row({ proof: "failed" })], review: review(3), caught }), { now: NOW, tools });
    expect(f.map((x) => x.id)).toEqual(["check", "changes", "tools", "caught"]);
    expect(f[0]).toMatchObject({ value: "2:14 pm · failed", colour: "red" });
    expect(f[1]).toMatchObject({ label: "Waiting", value: "3 files changed", colour: "orange" });
    expect(f.length).toBeLessThanOrEqual(HOME_FACTS_MAX);
  });
  test("nothing known: no tiles; no tool connected is left to the Connect your AI tools row", () => {
    expect(homeFacts(m(), { now: NOW, tools: null })).toEqual([]);
    expect(homeFacts(m(), { now: NOW, tools: st(hooks("claude", false)) })).toEqual([]);
  });
});

describe("the new size, pinned on both sides (M83)", () => {
  test("the width is about 1.4 times the old 400, the same in TypeScript, CSS and Rust, and fits the clear zone", () => {
    expect(PANEL_W).toBe(560);
    const rs = read("../src-tauri/src/island.rs");
    expect(rs).toContain(`pub const PANEL_W: f64 = ${PANEL_W}.0;`);
    expect(read("./style.css")).toMatch(new RegExp(`\\.island-panel \\{[^}]*width: ${PANEL_W}px;`));
    const docking = read("../src-tauri/src/docking.rs");
    const clear = Number(/pub const NOTCH_CLEAR: \(f64, f64\) = \(([\d.]+),/.exec(docking)![1]);
    const margin = Number(/pub const CLEAR_MARGIN: f64 = ([\d.]+);/.exec(docking)![1]);
    expect(PANEL_W + 2 * margin).toBeLessThanOrEqual(clear);
    // The smallest notched MacBook screen (1280 points wide at its most room setting) leaves room either side.
    expect(clear).toBeLessThan(1280 / 2);
  });

  test("the quick and job layouts are one fixed height with three rows, inside the shell's limits", () => {
    expect(LAYOUT_H).toEqual({ quick: 128, job: 128 });
    const rs = read("../src-tauri/src/island.rs");
    const max = Number(/pub const PANEL_MAX: f64 = ([\d.]+);/.exec(rs)![1]);
    expect(LAYOUT_H.quick).toBeLessThanOrEqual(max);
    const css = read("./ui/notch.css");
    expect(css).toContain(`.island-panel[data-layout="quick"], .island-panel[data-layout="job"] { height: ${LAYOUT_H.quick}px;`);
    expect(css).toMatch(/grid-template-rows: auto 22px auto;/);
    // The facts row keeps its place even with no fact in it, so nothing moves when one comes or goes.
    expect(read("./islandPanel.tsx")).toContain('<nav className="ip-facts"');
  });
});
