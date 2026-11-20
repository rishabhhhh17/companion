// M114 (docs/milestones/M114-approve-from-notch.md): approve and answer from the notch, as words and steps. Pure: the model
// keeps only a valid toolask.request and drops it when it is resolved, pressed, stopped or when the engine goes; notchAsk.ts
// turns it into the card's words, and walks a question card from one question to the next. Every press is one command,
// toolask.answer, and nothing is answered without one.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { initial, reduce, type Model } from "./model.ts";
import { askCard, askStep, ASKS_SHOWN, toolAskFrom, waitingAsks, type AskStep, type ToolAsk } from "./notchAsk.ts";
import { answerToolAsk } from "./commands.ts";
import { CONNECT_HOOKS, connection, connectAsk, OPTIONAL_HOOKS } from "./aiTools.ts";
import { doneAsk, doneStateFrom, hookLabel, removedLine } from "./doneSignal.ts";
import { panelView } from "./islandPanel.ts";
import { S } from "./strings.ts";
import { parseCommand } from "../../protocol/index.ts";

const fx = readFileSync(new URL("../../protocol/fixtures/events.jsonl", import.meta.url), "utf8").split("\n").filter((l) => l.includes('"id":"m114e')).map((l) => JSON.parse(l));
const [perm, question, codexEdit, plan] = fx as Record<string, unknown>[];
const withAsks = (...es: Record<string, unknown>[]) => es.reduce<Model>((m, e) => reduce(m, e as never), initial());

describe("the model", () => {
  test("keeps each valid ask once, oldest first, and drops it when it is resolved", () => {
    const m = withAsks(perm!, question!, perm!);
    expect(m.toolAsks!.map((a) => a.ask)).toEqual(["ta_0123456789ab", "ta_a1b2c3d4e5f6"]);
    const r = reduce(m, { v: 1, id: "r", type: "toolask.resolved", ask: "ta_0123456789ab", outcome: "elsewhere" } as never);
    expect(r.toolAsks!.map((a) => a.ask)).toEqual(["ta_a1b2c3d4e5f6"]);
    expect(reduce(r, { v: 1, id: "r2", type: "toolask.resolved", ask: "ta_a1b2c3d4e5f6", outcome: "answered" } as never).toolAsks).toBeNull();
  });
  test("a broken or foreign ask is never kept", () => {
    for (const bad of [{ ...perm, ask: "x" }, { ...perm, tool: "cursor" }, { ...perm, tool_input: {} }, { ...question, tool: "codex" }, { ...perm, target: "a\nb" }]) {
      expect(withAsks(bad).toolAsks ?? null).toBeNull();
    }
    expect(toolAskFrom(perm)).toMatchObject({ ask: "ta_0123456789ab", tool: "claude", kind: "permission", action: "run", target: "npm test", always: "Bash(npm test:*)" });
    expect(toolAskFrom({ type: "toolask.request" })).toBeNull();
  });
  test("a press takes the card away at once; Stop everything and the engine going take them all", () => {
    const m = withAsks(perm!, question!);
    expect(reduce(m, { type: "ui.toolAskAnswered", ask: "ta_0123456789ab" } as never).toolAsks!.map((a) => a.ask)).toEqual(["ta_a1b2c3d4e5f6"]);
    expect(reduce(m, { type: "app.stop_everything" } as never).toolAsks).toBeNull();
    expect(reduce(m, { type: "app.runner_down" } as never).toolAsks).toBeNull();
  });
  test("an ask whose time is over is not shown, even before the engine says so", () => {
    const m = withAsks(perm!, question!);
    expect(waitingAsks(m, Date.parse("2026-11-20T10:00:00Z")).length).toBe(2);
    expect(waitingAsks(m, Date.parse("2026-11-20T10:02:00Z")).length).toBe(0);
    expect(waitingAsks(initial(), 0)).toEqual([]);
  });
  test("the notch shows its questions view while an ask waits", () => {
    const m = withAsks(perm!);
    expect(panelView(m, [], { note: "", status: "Nothing needs you." }).kind).toBe("questions");
    expect(panelView(initial(), [], { note: "", status: "Nothing needs you." }).kind).toBe("line");
  });
});

describe("the card's words", () => {
  test("a command: what the tool wants, the short command, the project, and Always with its rule shown first", () => {
    const c = askCard(toolAskFrom(perm)!);
    expect(c.title).toBe(S.m114.wants.run("Claude Code"));
    expect(c.target).toBe("npm test");
    expect(c.where).toBe(S.m114.inProject("shop"));
    expect(c.always).toBe("Bash(npm test:*)");
    expect(c.alwaysLine).toBe(S.m114.alwaysLine("Bash(npm test:*)"));
    expect(c.buttons).toEqual(["deny", "always", "allow"]);
    expect(c.inTool).toBe(S.m114.inTool("Claude Code"));
    // VoiceOver hears the whole card in one line.
    expect(c.say).toBe(`${S.m114.wants.run("Claude Code")}: npm test. ${S.m114.inProject("shop")}.`);
  });
  test("Codex: a file edit, no Always", () => {
    const c = askCard(toolAskFrom(codexEdit)!);
    expect(c.title).toBe(S.m114.wants.edit("Codex"));
    expect(c.target).toBe("src/index.html");
    expect(c.buttons).toEqual(["deny", "allow"]);
    expect(c.always).toBeNull();
    expect(c.inTool).toBe(S.m114.inTool("Codex"));
  });
  test("a plan has its own words on both buttons", () => {
    const c = askCard(toolAskFrom(plan)!);
    expect(c.title).toBe(S.m114.plan("Claude Code"));
    expect(c.labels.allow).toBe(S.m114.planYes);
    expect(c.labels.deny).toBe(S.m114.planNo);
  });
  test("every word is plain: no em dashes, no Claude Code styling of our own", () => {
    for (const v of Object.values(S.m114)) {
      const words = typeof v === "function" ? (v as (...a: string[]) => string)("Claude Code", "shop") : typeof v === "string" ? v : JSON.stringify(v);
      expect(words).not.toContain("—");
    }
  });
});

describe("a question card, one question at a time", () => {
  const q = toolAskFrom(question)!;
  const start: AskStep = { at: 0, picks: [], chosen: [] };
  test("a one pick question: a press picks and goes on; the last question sends every pick", () => {
    const c = askCard(q);
    expect(c.questions!.length).toBe(2);
    expect(c.counter(0)).toBe(S.m114.of(1, 2));
    let s = askStep(q, start, { pick: 1 });
    expect(s.send).toBeUndefined();
    expect(s.step).toEqual({ at: 1, picks: [[1]], chosen: [] });
    // The second question allows several: presses toggle, Send sends.
    s = askStep(q, s.step, { pick: 0 });
    s = askStep(q, s.step, { pick: 2 });
    s = askStep(q, s.step, { pick: 0 });
    expect(s.step.chosen).toEqual([2]);
    s = askStep(q, s.step, { pick: 0 });
    expect(s.step.chosen).toEqual([0, 2]);
    const done = askStep(q, s.step, { next: true });
    expect(done.send).toEqual([[1], [0, 2]]);
  });
  test("Send with nothing picked does nothing", () => {
    const s = askStep(q, { at: 1, picks: [[0]], chosen: [] }, { next: true });
    expect(s.send).toBeUndefined();
    expect(s.step).toEqual({ at: 1, picks: [[0]], chosen: [] });
  });
  test("a pick that is not a choice does nothing", () => {
    expect(askStep(q, start, { pick: 9 }).step).toEqual(start);
    expect(askStep(q, start, { pick: -1 }).step).toEqual(start);
  });
});

describe("what each press sends", () => {
  test("one toolask.answer, the protocol's own shape", () => {
    for (const c of [answerToolAsk("ta_0123456789ab", "allow"), answerToolAsk("ta_0123456789ab", "always"), answerToolAsk("ta_0123456789ab", "deny"), answerToolAsk("ta_0123456789ab", "tool"), answerToolAsk("ta_a1b2c3d4e5f6", "answer", [[1], [0, 2]])]) {
      expect(parseCommand(JSON.stringify(c)).ok).toBe(true);
    }
    expect(answerToolAsk("ta_a1b2c3d4e5f6", "answer", [[1]])).toMatchObject({ type: "toolask.answer", ask: "ta_a1b2c3d4e5f6", choice: "answer", picks: [[1]] });
    expect("picks" in answerToolAsk("ta_0123456789ab", "allow")).toBe(false);
  });
  test("the notch shows only a few cards; the rest are counted", () => {
    expect(ASKS_SHOWN).toBe(1);
    expect(S.m114.more(1)).toBe("1 more waiting");
    expect(S.m114.more(3)).toBe("3 more waiting");
  });
});

describe("the hooks in Settings and Connect", () => {
  const P = "/Users/me/shop";
  const row = (tool: string, hook: string, on = false) => ({ tool, hook, on, file: tool === "claude" ? ".claude/settings.local.json" : ".codex/hooks.json", adds: "{}", creates: false });
  test("Connect adds approve and answer for Claude Code and approve for Codex; a tool connected before still counts", () => {
    expect(CONNECT_HOOKS.claude).toContain("approve");
    expect(CONNECT_HOOKS.claude).toContain("answer");
    expect(CONNECT_HOOKS.codex).toContain("approve");
    expect(OPTIONAL_HOOKS.claude).toEqual(expect.arrayContaining(["approve", "answer"]));
    expect(OPTIONAL_HOOKS.codex).toEqual(expect.arrayContaining(["approve"]));
    const st = doneStateFrom({ type: "donesignal.state", project: P, tools: [row("claude", "done", true), row("claude", "guard", true), row("claude", "waiting", true), row("claude", "feed", true), row("claude", "approve"), row("claude", "answer")] }, P)!;
    expect(st.tools.map((t) => t.hook)).toEqual(["done", "guard", "waiting", "feed", "approve", "answer"]);
    expect(connection(st, "claude")).toBe("on");
    const ask = connectAsk(st, "claude")!;
    expect(ask.parts.map((p) => p.hook)).toEqual(["approve", "answer"]);
    expect(ask.parts[0]!.label).toBe(S.m82.partLabel.approve("Claude Code"));
  });
  test("each row and its card say what it does in plain words", () => {
    const a = doneAsk(row("claude", "approve") as never);
    expect(a.title).toBe(S.m114.askTitle("Claude Code"));
    expect(a.notes[0]).toBe(S.m114.askWhat("Claude Code"));
    expect(doneAsk(row("claude", "answer") as never).title).toBe(S.m114.answerTitle);
    expect(doneAsk(row("codex", "approve") as never).notes).toContain(S.doneSignal.askCodex);
    expect(hookLabel({ tool: "codex", hook: "approve" })).toEqual({ label: S.m114.rowTitle("Codex"), line: S.m114.rowLine("Codex") });
    expect(hookLabel({ tool: "claude", hook: "answer" })).toEqual({ label: S.m114.answerRowTitle, line: S.m114.answerRowLine });
    expect(removedLine({ tool: "claude", hook: "approve" })).toBe(S.m114.removed("Claude Code"));
    expect(removedLine({ tool: "claude", hook: "answer" })).toBe(S.m114.removed("Claude Code"));
  });
  test("M114 review: the wait setting's help names the section the rows are really in, and that group says the notch can answer", () => {
    const help = S.set["notch.askWait"]!.help;
    expect(help).toContain("(Fixing, Start reviews sooner)");
    expect(help).not.toContain("(Fixing, Your AI tools)");
    expect(S.m114.groupNote).toContain("Claude Code and Codex");
    expect(S.m114.groupNote).toContain("notch");
    const page = readFileSync(new URL("./settingsPage.tsx", import.meta.url), "utf8");
    expect(page).toContain("${S.m105.waitingNote} ${S.m114.groupNote}");
  });
  test("M114 review: every m114 word is used (no leftover label)", () => {
    expect("label" in S.m114).toBe(false);
    const card = readFileSync(new URL("./notchAsk.tsx", import.meta.url), "utf8");
    expect(card).toContain("S.m114.picked(");
    expect(card).toContain("S.m114.aboutHint");
  });
});

// A type check: the card is built from what the model keeps.
const _t: ToolAsk | null = toolAskFrom(perm);
void _t;
