// M105, which tool finished, and did it work: the pages' side. The review card and the model carry the tool that finished
// (review.batch and review.result `by`); the notch's line, its one pill and Home's side list say "Codex finished in shop:
// works" or "... 2 problems" while that card is open and fresh; Codex can say it waits, with no words. Pure.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { CONNECT_HOOKS, connection, connectCommands } from "./aiTools.ts";
import { doneAsk, hookLabel, removedLine, type DoneState } from "./doneSignal.ts";
import { islandLine, need } from "./home.ts";
import { initial, reduce, type Model } from "./model.ts";
import { hoverAction, hoverLine, hoverPill } from "./notchMinimal.ts";
import { sideTools } from "./notchPeek.ts";
import { reviewReduce } from "./review.ts";
import { FINISHED_MS, finishedNow, finishOf, waitingTool } from "./toolFinished.ts";
import { S } from "./strings.ts";

const P = "/Users/me/shop";
const lines = readFileSync(new URL("../../protocol/fixtures/events.jsonl", import.meta.url), "utf8").split("\n");
const fixture = (id: string) => ({ ...JSON.parse(lines.find((l) => l.includes(`"id":"${id}"`))!), project: P });
const base = (o: Partial<Model> = {}): Model => ({ ...initial(), runnerUp: true, connected: "api_key", folder: P, ...o });
const feed = (m: Model, ...events: Record<string, unknown>[]): Model => events.reduce<Model>((x, e) => reduce(x, e as never), m);
/** Codex finished, its batch was said and reviewed: 2 problems (the m105e1 and m105e2 fixtures). */
const codexProblems = () => feed(base(), fixture("m105e1"), fixture("m105e2"));
/** Cursor finished and its change works (m105e3: safe, the checks passed). */
const cursorWorks = () => feed(base(), { ...fixture("m105e1"), batch: "rv_5a0b1c2d3f", by: "cursor" }, fixture("m105e3"));
const NOW = () => Date.now();

describe("the card and the model carry the tool that finished", () => {
  test("review.batch and review.result name it; a result without one keeps the batch's", () => {
    const b = reviewReduce(null, fixture("m105e1"));
    expect(b?.by).toBe("codex");
    const { by: _x, ...noBy } = fixture("m105e2");
    expect(reviewReduce(b, noBy)?.by).toBe("codex");
    // An unknown tool is left out, never shown.
    // M115 (changed on purpose): Zed is a known tool now, so a tool that is not on the list stands in.
    expect(reviewReduce(null, { ...fixture("m105e1"), by: "lovable" })?.by).toBeUndefined();
  });
  test("the model remembers which tool finished and when, only for the card's own result", () => {
    const m = codexProblems();
    expect(m.toolFinished).toMatchObject({ project: P, tool: "codex", batch: "rv_5a0b1c2d3e" });
    // A result without a tool remembers nothing.
    const { by: _b, ...plainBatch } = fixture("m105e1"); const { by: _r, ...plainResult } = fixture("m105e2");
    expect(feed(base(), plainBatch, plainResult).toolFinished ?? null).toBeNull();
    // A new project forgets it.
    expect(reduce(m, { type: "ui.projectChanged", project: "/Users/me/other" } as never).toolFinished ?? null).toBeNull();
  });
});

describe("what the notch says", () => {
  test("the four results, never works without passing checks (rule 14)", () => {
    expect(finishOf(codexProblems().review)).toEqual({ kind: "problems", n: 2 });
    expect(finishOf(cursorWorks().review)).toEqual({ kind: "works", n: 0 });
    const fine = feed(base(), { ...fixture("m105e1"), batch: "rv_5a0b1c2d3f" }, { ...fixture("m105e3"), checks: "not_run" });
    expect(finishOf(fine.review)).toEqual({ kind: "fine", n: 0 });
    const look = feed(base(), fixture("m105e1"), { ...fixture("m105e2"), rating: "worth_a_look", reasons: [fixture("m105e2").reasons[0]] });
    expect(finishOf(look.review)).toEqual({ kind: "look", n: 1 });
  });
  test("the line names the tool, the project and the result", () => {
    expect(finishedNow(codexProblems(), NOW())!.line).toBe("Codex finished in shop: 2 problems");
    expect(finishedNow(cursorWorks(), NOW())!.line).toBe("Cursor finished in shop: works");
    expect(islandLine(codexProblems(), { now: NOW() })).toBe("Codex finished in shop: 2 problems");
    expect(hoverLine(cursorWorks(), NOW())?.words).toBe("Cursor finished in shop: works");
  });
  test("the pill opens the review card (where Undo is) with the result's own words, and a dot when something was found", () => {
    const a = hoverAction(codexProblems(), NOW(), { layout: "quick" });
    expect(a.id).toBe("finished");
    expect(a.go).toEqual({ then: { do: "review" } });
    expect(hoverPill(a, codexProblems())).toEqual({ words: "See 2 problems", dot: true });
    const w = hoverAction(cursorWorks(), NOW(), { layout: "quick" });
    expect(hoverPill(w, cursorWorks())).toEqual({ words: S.m105.pill.works, dot: false });
    // With the review tool turned off, the pill is Open Home, as for every other action.
    expect(hoverAction(codexProblems(), NOW(), { layout: "quick", on: (t) => t !== "review" }).id).toBe("home");
  });
  test("it is news only while the card is open and fresh; then the notch says what it said before", () => {
    const m = codexProblems();
    const later = m.toolFinished!.at + FINISHED_MS + 1;
    expect(finishedNow(m, later)).toBeNull();
    expect(islandLine(m, { now: later })).not.toContain("finished");
    // Closing the card ends it at once.
    const closed = reduce(m, { type: "ui.reviewDismissed", batch: "rv_5a0b1c2d3e" } as never);
    expect(finishedNow(closed, NOW())).toBeNull();
    // Another project open: nothing about this one.
    expect(finishedNow({ ...m, folder: "/Users/me/other" }, NOW())).toBeNull();
  });
  test("anything that needs the person comes first", () => {
    const m = feed(codexProblems(), fixture("m105e4"));
    expect(islandLine(m, { now: NOW() })).toBe(S.islandNeedsYou("Codex is waiting for you in shop"));
    expect(hoverAction(m, NOW(), { layout: "quick" }).id).toBe("claude");
  });
});

describe("Codex waiting", () => {
  test("said in Codex's name, with no words of its question, and cleared by waiting: false", () => {
    const m = feed(base(), fixture("m105e4"));
    expect(waitingTool(m)).toBe("codex");
    expect(m.claudeWaiting).toEqual({ project: P, tool: "codex" });
    expect(need(m)?.why).toBe("Codex is waiting for you in shop");
    expect(hoverLine(m, NOW())?.words).toBe("Codex is waiting for you");
    const a = hoverAction(m, NOW(), { layout: "quick" });
    expect(a.label).toBe("Codex is waiting");
    expect(hoverPill(a, m).dot).toBe(true);
    // A message on another tool's line is never kept.
    expect(feed(base(), { ...fixture("m105e4"), message: "rm -rf build" }).claudeWaiting).toEqual({ project: P, tool: "codex" });
    expect(feed(m, { type: "hook.waiting", project: P, waiting: false }).claudeWaiting ?? null).toBeNull();
  });
  test("Claude Code keeps its own words", () => {
    const m = feed(base(), { type: "hook.waiting", project: P, waiting: true, message: "Claude needs your permission" });
    expect(waitingTool(m)).toBe("claude");
    expect(need(m)?.why).toBe(S.guard.waitingWhy("shop"));
    expect(hoverLine(m, NOW())?.words).toBe(S.m93.line.claude);
  });
});

describe("Home's side list and Settings", () => {
  const row = (tool: string, hook: string, on: boolean) => ({ tool, hook, on, file: ".codex/hooks.json", adds: "{}", creates: false });
  const st = (rows: ReturnType<typeof row>[]): DoneState => ({ project: P, tools: rows as never });
  test("the tool that finished says its result and opens the card; the one waiting says so", () => {
    const s = st([row("codex", "done", true), row("codex", "guard", true), row("cursor", "done", true), row("cursor", "guard", true)]);
    const t = sideTools(codexProblems(), s);
    expect(t?.kind).toBe("tools");
    const tools = (t as { tools: { tool: string; state: string; words: string; go: unknown }[] }).tools;
    expect(tools.find((x) => x.tool === "codex")).toMatchObject({ state: "finished", words: "Finished, 2 problems", go: { then: { do: "review" } } });
    expect(tools.find((x) => x.tool === "cursor")?.state).toBe("watching");
    const waiting = (sideTools(feed(base(), fixture("m105e4")), s) as { tools: { tool: string; state: string }[] }).tools;
    expect(waiting[0]).toMatchObject({ tool: "codex", state: "waiting" });
  });
  test("a Codex connected before M105 stays connected; Connect for a new Codex adds its waiting signal too", () => {
    // Changed on purpose (M113, 19 Nov 2026): Connect also offers Codex's live feed.
    // Changed on purpose (M114, 20 Nov 2026): and approve, so its permission requests can be answered from the notch.
    expect([...CONNECT_HOOKS.codex]).toEqual(["done", "guard", "waiting", "feed", "approve"]);
    expect(connection(st([row("codex", "done", true), row("codex", "guard", true), row("codex", "waiting", false)]), "codex")).toBe("on");
    const fresh = st([row("codex", "done", false), row("codex", "guard", false), row("codex", "waiting", false)]);
    expect(connection(fresh, "codex")).toBe("off");
    expect(connectCommands(P, fresh, "codex").map((c) => (c as { hook?: string }).hook ?? "done")).toEqual(["done", "guard", "waiting"]);
  });
  test("the Codex waiting row and its card say what travels: nothing of the question", () => {
    const r = row("codex", "waiting", false) as never;
    expect(hookLabel(r).label).toBe("Codex: tell me in the notch when it waits for me");
    const ask = doneAsk(r);
    expect(ask.title).toBe("Add the waiting signal for Codex?");
    expect(ask.notes[0]).toContain("its question never travels");
    expect(ask.notes).toContain(S.doneSignal.askCodex);
    expect(removedLine(r)).toBe(S.m105.removed("Codex"));
    // The group says which tools can say they wait.
    expect(S.m105.waitingNote).toContain("Cursor, the VS Code agent, Antigravity, Gemini CLI and Windsurf cannot tell when they wait");
  });
  test("plain words: no em dash, never 'every agent'", () => {
    const all = JSON.stringify(S.m105);
    expect(all.includes("—")).toBe(false);
    expect(/every agent/i.test(all)).toBe(false);
  });
});
