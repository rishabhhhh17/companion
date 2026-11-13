// M84: the notch's hover panel and Home, minimal but detailed (docs/milestones/M84-design-pass.md). The founder, 13 Nov
// 2026, on the real app: "I hope the notch will be changed". The panel showed a greeting, "Not checked yet", then an empty
// reserved row (a blank gap) and two buttons. These tests hold the root fix: every state is made of rows that each say
// something, from the very first hover, without Home having been opened; the AI tools come from the panel's own ask.
// Research feature 1 (docs/research/2026-11-13-research-synthesis.md, section 3): one small card per AI tool with what it is
// doing now ("waiting on you" from the waiting hook), and the latest review as a small card with its proof result and a
// one tap Undo that only opens Home on its confirm step.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { initial, reduce, type HistoryItem, type Model } from "./model.ts";
import type { ReviewCard } from "./review.ts";
import type { DoneRow, DoneState } from "./doneSignal.ts";
import type { ReviewRowView, SavedRowView } from "../../protocol/index.ts";
import { PEEK_GAP, PEEK_PAD, PEEK_ROW_H, TOOLS_SHOWN, undoOffered, latestReview, nextPeek, peekHeight, peekRows, sideTools, todayLine, toolPeeks, toolsRow, type PeekRow } from "./notchPeek.ts";
import { LAYOUT_H, quickFact, quickFactKind } from "./notchQuick.ts";
import { arrivalFrom } from "./home.ts";
import { COPY_BASE } from "./practice.ts";
import NAMES from "../../protocol/names.json";
import { S } from "./strings.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const P = "/Users/me/signup-page";
const NOW = new Date(2026, 10, 13, 15, 0).getTime();
const at = (d: number, h: number, mi: number) => new Date(2026, 10, d, h, mi).toISOString();
const row = (o: Partial<HistoryItem> = {}): HistoryItem => ({ id: 1, label: "Make the signup button work", status: "done", usd: 0, startedAt: at(13, 14, 0), endedAt: at(13, 14, 14), checkpoint: "cp_9", changed: 2, proof: "passed", ...o });
const rv = (o: Partial<ReviewRowView> = {}): ReviewRowView => ({ id: 1, at: at(13, 14, 40), count: 3, files: ["src/a.ts"], rating: "safe", touches: [], checks: "passed", did: "looks_fine", summary: "Added an email check to the signup form.", ...o });
const batch = (count: number, o: Partial<ReviewCard> = {}): ReviewCard => ({ project: P, batch: "rv_1a2b", stage: "ready", files: [], count, capped: false, secretFiles: [], auto: false, proof: false, asked: false, fix: null, note: null, result: null, ...o });
const m = (o: Partial<Model> = {}): Model => ({ ...initial(), runnerUp: true, connected: "api_key", folder: P, ...o });
const hooks = (tool: DoneRow["tool"], on: boolean | "partly"): DoneRow[] => (tool === "claude" ? ["done", "guard", "waiting"] : ["done", "guard"]).map((hook, i) => ({ tool, hook: hook as DoneRow["hook"], on: on === "partly" ? i === 0 : on, file: "x", adds: "y", creates: false }));
const st = (...rows: DoneRow[][]): DoneState => ({ project: P, tools: rows.flat() });
const ALL: PeekRow[] = ["head", "tools", "card", "foot"];

describe("the panel never leaves an empty row or a blank gap (the founder's 13 Nov shot)", () => {
  test("the founder's exact case: a project not checked yet, nothing known, Home never opened, the engine not answered yet", () => {
    const x = m();
    // Every row of the layout has something in it: the head, the tools (checking, then the answer), a card and the foot.
    expect(peekRows(x, "quick")).toEqual(ALL);
    expect(toolsRow(x, null)).toEqual({ kind: "looking" });
    // The card says the next useful thing: on a real project never checked (and no practice done), the practice offer.
    expect(nextPeek(x, NOW)).toMatchObject({ id: "practice", title: S.m84.next.practice, go: { then: { place: "learn" } } });
    expect(latestReview(x, NOW)).toBeNull();
  });

  test("the founder's own project was a practice copy: never told to try a practice, but to check it once", () => {
    // M84 review: the founder's project, "Squibby practice signup page", is already a practice copy.
    const copy = `/Users/me/${COPY_BASE} signup page`;
    const unchecked = { id: "unchecked", title: S.m84.next.unchecked, line: S.m84.next.uncheckedLine, icon: "tick", go: { then: { do: "find" } } };
    expect(nextPeek(m({ folder: copy }), NOW)).toMatchObject(unchecked);
    // A copy made before the rename is still a practice copy.
    expect(nextPeek(m({ folder: `/Users/me/${NAMES.earlierPracticeCopyBases[0]} signup page` }), NOW)).toMatchObject(unchecked);
    // The practice open now is this very folder, whatever it is called.
    expect(nextPeek(m({ practice: { kind: "signup", stage: "found", project: P } }), NOW)).toMatchObject(unchecked);
    // A practice was done already (back on a real project): checking it is the next thing, not another practice.
    expect(nextPeek(m({ practice: { kind: "signup", stage: "done", project: "/Users/me/elsewhere" } }), NOW)).toMatchObject(unchecked);
    // A real project, no practice done: the practice offer stays.
    expect(nextPeek(m({ practice: { kind: "signup", stage: "found", project: "/Users/me/elsewhere" } }), NOW)).toMatchObject({ id: "practice" });
    expect(arrivalFrom(nextPeek(m({ folder: copy }), NOW).go)).not.toBeNull();
  });

  test("once the engine answers: the tools connected as small cards, or the one Connect action, never an empty row", () => {
    expect(toolsRow(m(), st(hooks("claude", true), hooks("cursor", true)))).toMatchObject({ kind: "tools", more: 0, tools: [{ tool: "claude", state: "watching" }, { tool: "cursor", state: "watching" }] });
    expect(toolsRow(m(), st(hooks("claude", false)))).toEqual({ kind: "connect", go: { then: { set: "fixing.tools" } } });
    expect(toolsRow(m(), st())).toEqual({ kind: "connect", go: { then: { set: "fixing.tools" } } });
  });

  test("every state of the quick and job layouts: each row it lists has content, and the card row is never empty", () => {
    const states: [string, Model][] = [
      ["engine stopped", m({ runnerUp: false })], ["no Claude yet", m({ connected: "none" })], ["no project", m({ folder: null })],
      ["unchecked", m()], ["passed", m({ history: [row()] })], ["failed", m({ history: [row({ status: "not_done", proof: "failed" })] })],
      ["changes waiting", m({ review: batch(2) })], ["changed since", m({ history: [row()], sinceCheck: { project: P, changed: true } })],
      ["waiting on you", m({ claudeWaiting: { project: P } })], ["reviewed", m({ reviewHistory: [rv()] })],
    ];
    for (const [name, x] of states) {
      const rows = peekRows(x, "quick");
      expect(rows[0]).toBe("head");
      expect(rows.at(-1)).toBe("foot");
      expect(rows).toContain("card");
      // A card always says something: the latest review, else the next useful thing.
      const card = latestReview(x, NOW) ?? nextPeek(x, NOW);
      expect(card.title.length, name).toBeGreaterThan(0);
      // The tools row is there only with a project the engine can be asked about, and then it always has a card in it.
      if (rows.includes("tools")) expect(toolsRow(x, null), name).not.toBeNull();
      else expect(toolsRow(x, null), name).toBeNull();
    }
  });

  test("the height is the rows' own: no reserved room for a row that is not there, and inside the shell's limits", () => {
    expect(peekHeight(ALL)).toBe(PEEK_PAD.top + PEEK_PAD.bottom + PEEK_ROW_H.head + PEEK_ROW_H.tools + PEEK_ROW_H.card + PEEK_ROW_H.foot + 3 * PEEK_GAP);
    expect(peekHeight(["head", "card", "foot"])).toBe(peekHeight(ALL) - PEEK_ROW_H.tools - PEEK_GAP);
    const rs = read("../src-tauri/src/island.rs");
    const min = Number(/pub const PANEL_MIN: f64 = ([\d.]+);/.exec(rs)![1]), max = Number(/pub const PANEL_MAX: f64 = ([\d.]+);/.exec(rs)![1]);
    for (const r of [ALL, ["head", "card", "foot"] as PeekRow[]]) { expect(peekHeight(r)).toBeGreaterThanOrEqual(min); expect(peekHeight(r)).toBeLessThanOrEqual(max); }
    // The fixed height of the full layout is LAYOUT_H, the same for the quick and the job layouts (nothing moves as a job starts).
    expect({ ...LAYOUT_H } as Record<string, number>).toEqual({ quick: peekHeight(ALL), job: peekHeight(ALL) });
    expect(peekRows(m({ history: [row()] }), "job")).toEqual(ALL);
  });

  test("the M83 facts row with its fixed empty 22 point slot is gone from the panel", () => {
    const panel = read("./islandPanel.tsx");
    expect(panel).not.toContain("ip-facts");
    expect(read("./ui/notch.css")).not.toMatch(/grid-template-rows: auto 22px auto/);
  });
});

describe("one small card per AI tool, with what it is doing now", () => {
  test("Claude Code waiting on you (the waiting hook, hook.waiting) comes first, in the question colour", () => {
    const x = m({ claudeWaiting: { project: P, message: "Claude needs your permission to use Bash" } });
    const t = toolPeeks(x, st(hooks("cursor", true), hooks("claude", true)))!;
    expect(t.map((p) => [p.tool, p.state])).toEqual([["claude", "waiting"], ["cursor", "watching"]]);
    expect(t[0]).toMatchObject({ name: "Claude Code", mark: "CC", words: S.m84.toolState.waiting, colour: "orange", go: {} });
    expect(t[1]).toMatchObject({ words: S.m84.toolState.watching, colour: "grey", go: { then: { set: "fixing.tools" } } });
  });

  test("waiting in another project is not this project's: the tool just watches", () => {
    const x = m({ claudeWaiting: { project: "/Users/me/other" } });
    expect(toolPeeks(x, st(hooks("claude", true)))![0].state).toBe("watching");
  });

  test("only Claude Code has a waiting hook, so only it can say waiting; the others never claim it", () => {
    const x = m({ claudeWaiting: { project: P } });
    const t = toolPeeks(x, st(hooks("codex", true), hooks("cursor", true)))!;
    expect(t.every((p) => p.state !== "waiting")).toBe(true);
  });

  test("a tool with only some of its hooks is half connected; a tool with none is not listed", () => {
    expect(toolPeeks(m(), st(hooks("codex", "partly"), hooks("gemini", false)))!.map((p) => [p.tool, p.state])).toEqual([["codex", "partly"]]);
  });

  test("at most three cards in the panel, then a count of the rest; Home's side list shows them all", () => {
    const s = st(hooks("claude", true), hooks("codex", true), hooks("cursor", true), hooks("copilot", true), hooks("gemini", true));
    const r = toolsRow(m(), s);
    expect(r).toMatchObject({ kind: "tools", more: 2 });
    expect(r && r.kind === "tools" && r.tools.length).toBe(TOOLS_SHOWN);
    expect(sideTools(m(), s)).toMatchObject({ kind: "tools", more: 0 });
    expect(sideTools(m(), s)!.kind === "tools" && (sideTools(m(), s) as { tools: unknown[] }).tools.length).toBe(5);
  });

  test("not known yet: nothing is guessed (looking), and with no project or engine there is no tools row at all", () => {
    expect(toolPeeks(m(), null)).toBeNull();
    expect(toolsRow(m({ folder: null }), null)).toBeNull();
    expect(toolsRow(m({ runnerUp: false }), null)).toBeNull();
    expect(toolsRow(m({ connected: "none" }), null)).toBeNull();
  });

  test("the head says when Claude Code waits on you, after a question waiting and before anything else", () => {
    const x = m({ claudeWaiting: { project: P }, review: batch(3) });
    expect(quickFact(x, NOW)).toBe(S.m84.waitingHead);
    expect(quickFactKind(x, NOW)).toBe("waiting");
  });

  test("the island's own waiting line as the note: the head still says Claude Code waits, with the orange dot", () => {
    // M84 review: hover-7 read "Needs you: Claude is waiting for you in signup-pa" with a grey dot, under an orange card.
    const x = m({ claudeWaiting: { project: P } });
    const note = `${S.needsYouTitle}: ${S.guard.waitingWhy("signup-page")}`;
    expect(quickFact(x, NOW, note)).toBe(S.m84.waitingHead);
    expect(quickFactKind(x, NOW, note)).toBe("waiting");
    // Any other note (the engine stopped, listening) still comes first.
    expect(quickFact(x, NOW, S.islandOff)).toBe(S.islandOff);
    expect(quickFactKind(x, NOW, S.islandOff)).toBe("note");
    // Waiting in another project: the note stays.
    const there = m({ claudeWaiting: { project: "/Users/me/other" } });
    expect(quickFact(there, NOW, note)).toBe(note);
  });

  test("a check that never answers: after a short wait the tools row says so with an action, never 'One moment' forever", () => {
    expect(toolsRow(m(), null, TOOLS_SHOWN, true)).toEqual({ kind: "unknown", go: { then: { set: "fixing.tools" } } });
    // An answer wins over the wait having run out.
    expect(toolsRow(m(), st(hooks("claude", true)), TOOLS_SHOWN, true)).toMatchObject({ kind: "tools" });
  });
});

describe("the latest review, a small card with its proof and a one tap Undo", () => {
  test("a fix of Squibby's own: its proof result and when; Undo only where Home can undo it, and only opens Home to ask", () => {
    const x = m({ history: [row()] });
    expect(latestReview(x, NOW)).toMatchObject({ kind: "task", title: "Make the signup button work", proof: "passed", colour: "green", when: "2:14 pm", undo: false, go: {} });
    // With the receipt of that fix on hand and Undo on offer, the card's Undo opens Home on its confirm step ({ do: "undo" }).
    const ev = (o: Record<string, unknown>) => ({ v: 1, id: "e", ...o });
    const done = [ev({ type: "auth.status", method: "api_key", source: "keychain" }), ev({ type: "ui.folderShown", project: P }),
      ev({ type: "checkpoint.created", project: P, agent: "a", checkpoint: "cp_9", label: "Before: make the signup button work", files: 3, skipped: [] }), ev({ type: "agent.state", agent: "a", state: "working" }),
      ev({ type: "receipt", agent: "a", checkpoint: "cp_9", changed: [{ file: "join.js", kind: "modified" }], commands: 1, notUndoable: [], proof: "passed", usdEstimate: 0.05, ended: "done" }), ev({ type: "agent.state", agent: "a", state: "done" })]
      .reduce<Model>((y, e) => reduce(y, e as never), initial());
    const withReceipt: Model = { ...done, history: [row()] };
    expect(undoOffered(withReceipt)).toBe(true);
    expect(latestReview(withReceipt, NOW)).toMatchObject({ kind: "task", undo: true, undoGo: { then: { do: "undo" } } });
    expect(arrivalFrom({ then: { do: "undo" } })).toEqual({ do: "undo" });
    // Never after it was undone, nor while an undo is already asked.
    expect(latestReview({ ...withReceipt, receipt: { ...withReceipt.receipt!, undone: true } }, NOW)!.undo).toBe(false);
    expect(latestReview({ ...withReceipt, undo: { checkpoint: "cp_9", stage: "confirm" } as Model["undo"] }, NOW)!.undo).toBe(false);
    // A newer fix of the history that is not the receipt's own never takes its Undo.
    expect(latestReview({ ...withReceipt, history: [row({ id: 2, checkpoint: "cp_10", endedAt: at(13, 14, 30) }), row()] }, NOW)!.undo).toBe(false);
  });

  test("a failed check is red and says so", () => {
    expect(latestReview(m({ history: [row({ status: "not_done", proof: "failed" })] }), NOW)).toMatchObject({ proof: "failed", colour: "red" });
  });

  test("a review of another tool's changes: its summary, its checks, never an Undo it cannot do from here", () => {
    const r = latestReview(m({ reviewHistory: [rv({ checks: "failed", rating: "stop", summary: "Removed the password length check." })] }), NOW)!;
    expect(r).toMatchObject({ kind: "review", title: "Removed the password length check.", proof: "failed", colour: "red", when: "2:40 pm", undo: false });
    expect(latestReview(m({ reviewHistory: [rv({ summary: "", checks: "not_run" })] }), NOW)).toMatchObject({ title: S.m84.reviewed(3), proof: "none", colour: "grey" });
  });

  test("the newest of the two wins", () => {
    expect(latestReview(m({ history: [row()], reviewHistory: [rv()] }), NOW)!.kind).toBe("review");
    expect(latestReview(m({ history: [row({ endedAt: at(13, 14, 50) })], reviewHistory: [rv()] }), NOW)!.kind).toBe("task");
  });
});

describe("the next useful thing, when nothing was reviewed yet", () => {
  test("changes waiting, then files changed since the last check, then the practice, else quiet", () => {
    expect(nextPeek(m({ review: batch(2) }), NOW)).toMatchObject({ id: "changes", title: S.m84.next.changes(2), colour: "orange", go: { then: { do: "review" } } });
    expect(nextPeek(m({ history: [row()], sinceCheck: { project: P, changed: true } }), NOW)).toMatchObject({ id: "since", colour: "orange", go: { then: { do: "find" } } });
    expect(nextPeek(m(), NOW)).toMatchObject({ id: "practice", colour: "purple" });
    expect(nextPeek(m({ history: [row()] }), NOW)).toMatchObject({ id: "quiet", colour: "grey" });
    expect(nextPeek(m({ folder: null }), NOW)).toMatchObject({ id: "pick", go: { then: { place: "learn" } } });
    expect(nextPeek(m({ runnerUp: false }), NOW)).toMatchObject({ id: "off", colour: "red", go: {} });
  });

  test("every place a card opens is one Home accepts (arrival.rs and home.ts arrivalFrom)", () => {
    const xs = [m({ review: batch(2) }), m({ history: [row()], sinceCheck: { project: P, changed: true } }), m(), m({ folder: null }), m({ runnerUp: false })];
    for (const x of xs) { const g = nextPeek(x, NOW).go; if (g.then) expect(arrivalFrom(g)).not.toBeNull(); }
  });
});

describe("Now's calm timeline of today", () => {
  const saved = (o: Partial<SavedRowView> = {}): SavedRowView => ({ id: 1, at: at(13, 13, 5), checkpoint: "cp_7", command: "rm -rf dist", undone: false, ...o });
  test("reviewed, caught, fixed and undone, newest first, each with its clock time and meaning colour; only today", () => {
    const x = m({
      history: [row(), row({ id: 2, label: "Make the menu open", startedAt: at(13, 11, 0), endedAt: at(13, 11, 5), undone: true }), row({ id: 3, endedAt: at(12, 9, 0), startedAt: at(12, 8, 0) })],
      reviewHistory: [rv()], savedRows: [saved()],
    });
    const t = todayLine(x, NOW);
    expect(t.map((e) => [e.kind, e.when])).toEqual([["reviewed", "2:40 pm"], ["fixed", "2:14 pm"], ["caught", "1:05 pm"], ["undone", "11:05 am"]]);
    expect(t[0]).toMatchObject({ words: S.m84.line.reviewed(3, "Added an email check to the signup form."), colour: "green" });
    expect(t[1]).toMatchObject({ words: S.m84.line.fixed("Make the signup button work"), colour: "green" });
    expect(t[2]).toMatchObject({ words: S.m84.line.caught("rm -rf dist"), colour: "orange" });
    expect(t[3]).toMatchObject({ words: S.m84.line.undone("Make the menu open"), colour: "orange" });
  });

  test("at most six, nothing made up, and nothing when nothing happened today", () => {
    const many = Array.from({ length: 9 }, (_, i) => row({ id: i + 1, endedAt: at(13, 9, i), startedAt: at(13, 8, i) }));
    expect(todayLine(m({ history: many }), NOW)).toHaveLength(6);
    expect(todayLine(m(), NOW)).toEqual([]);
    expect(todayLine(m({ history: [row({ status: "running", endedAt: null })] }), NOW)).toEqual([]);
  });
});

describe("words and colours stay in their one place", () => {
  test("notchPeek.ts has no words of its own and no colour values", () => {
    const src = read("./notchPeek.ts");
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,6}\b|rgb\(/);
    // Every user facing word comes from strings.ts (S.); string literals here are ids only.
    const code = src.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*\*)/.test(l)).map((l) => l.replace(/\/\/.*$/, "")).join("\n");
    for (const lit of code.match(/"[^"\n]*"/g) ?? []) expect(lit, lit).not.toMatch(/\s/);
  });
  test("no em dashes in the new words", () => {
    expect(JSON.stringify(S.m84)).not.toContain("—");
  });
});
