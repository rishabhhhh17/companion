// Home stuck on Needs you with nothing to press (M11 audit, 20 Oct 2026). The engine leaves an agent on "needs you" after
// a plan is shown, after Point at the problem found something, after which task broke it answered and after a failed check
// of your turn, and nothing it ran ends that. When the person put the thing aside on Home, only Home's own model heard it:
// Home kept only a Stop that did nothing, Install, Remove key and the practices said to wait, and the island and the
// character (each with their own model, fed only by the engine) kept saying Needs you for good. Now putting it aside asks the
// engine to let the agent rest (agent.interrupt with release, which never stops anything), so every window hears it.
// Each case is fed the engine's real order of events.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AGENT, releaseAgent } from "./commands.ts";
import { cardWorking, foundHandsOver, initial, reduce, releasable, stateLabel, teachActions, waitsForAnswer, type Model } from "./model.ts";
import { islandAlert, islandLine } from "./home.ts";
import { workingOn } from "./practice.ts";
import { installAllowed, isBusy } from "./updates.ts";
import { parseCommand, serialize } from "../../protocol/index.ts";
import { S } from "./strings.ts";

const ev = (o: Record<string, unknown>) => ({ v: 1, id: "e", ...o });
const run = (events: Record<string, unknown>[], from: Model = initial()) => events.reduce<Model>((m, e) => reduce(m, e as never), from);
const state = (s: string, agent = AGENT) => ev({ type: "agent.state", agent, state: s });
const card = readFileSync(new URL("./card.tsx", import.meta.url), "utf8");
const P = "/Users/me/site";
const planReady = ev({ type: "plan.ready", agent: AGENT, steps: [{ id: 1, title: "Make the page" }, { id: 2, title: "Add a form" }], truncated: false, estimateUsd: 0.4 });
// What the island sees: only what the engine says, never Home's own presses.
const island = (events: Record<string, unknown>[]) => run(events);

describe("A53: Cancel on a plan, or Close on Rescue's report", () => {
  const waiting = run([ev({ type: "ui.planRequested" }), state("thinking"), planReady, state("needsYou")]);
  test("before: the plan waits, so Home is working and the plan agent can be put aside", () => {
    expect(cardWorking(waiting)).toBe(true);
    expect(releasable(waiting, AGENT, true)).toBe(true);
    // Not while it also waits on something else: then nothing is put aside.
    const withCard = run([ev({ type: "approval.request", approval: "ap_1", agent: AGENT, checkpoint: "cp_1", toolUseId: "t", risk: "git", title: "x", expiresAt: "2999-01-01T00:00:00Z" })], waiting);
    expect(releasable(withCard, AGENT, true)).toBe(false);
    // Without the plan being cancelled, the plan itself holds it.
    expect(releasable(waiting, AGENT)).toBe(false);
  });
  test("Cancel puts the agent back to rest on Home at once: the Start row is back, nothing is busy", () => {
    const m = run([ev({ type: "ui.planCancelled", release: true })], waiting);
    expect(m.plan).toBeNull();
    expect(m.agents[AGENT]).toBe("idle");
    expect(cardWorking(m)).toBe(false);
    expect(isBusy(m)).toBe(false);
    expect(installAllowed(m)).toBe(true);
  });
  test("Start the plan clears the card but is no release: the plan runs", () => {
    const m = run([ev({ type: "ui.planCancelled" })], waiting);
    expect(m.plan).toBeNull();
    expect(m.agents[AGENT]).toBe("needsYou");
  });
  test("the engine's answer reaches the island too: no plan and no Needs you once the agent rests", () => {
    const before = island([state("thinking"), planReady, state("needsYou")]);
    expect(islandLine(before)).toBe(S.islandNeedsYou(S.planTitle));
    const after = island([state("thinking"), planReady, state("needsYou"), state("idle")]);
    expect(after.plan).toBeNull();
    expect(islandLine(after)).toBe(S.islandReady);
    expect(islandAlert(after)).toBe(false);
  });
  test("a plan stays on the card while its agent waits on the person for it", () => {
    expect(island([state("thinking"), planReady, state("needsYou")]).plan?.steps).toEqual(["Make the page", "Add a form"]);
  });
  test("Home's Cancel and Rescue's Close ask the engine to put the agent aside; Start the plan does not", () => {
    const plan = card.slice(card.indexOf("{m.plan && ("), card.indexOf("{show(\"promptHelp\")"));
    expect(plan).toContain("onClick={() => { putAside(m.plan!.agent, true); dispatch({ type: \"ui.planCancelled\", release: true }); }}>{S.planCancel}");
    expect(plan).toContain("dispatch({ type: \"ui.planCancelled\" }); }}>{S.planStart}");
    const rescue = card.slice(card.indexOf("{show(\"rescue\") && m.rescue && ("), card.indexOf("{show(\"task\")"));
    expect(rescue).toContain("putAside(m.plan?.agent, true); dispatch({ type: \"ui.planCancelled\", release: true });");
    expect(card).toMatch(/const putAside = \(agent: string \| undefined, planToo = false\) => \{ if \(agent && releasable\(m, agent, planToo\)\) void send\(releaseAgent\(agent\)\); \};/);
  });
  test("the release is the page's own Stop with one more word, allowed for a page and parsed by the engine", () => {
    const c = releaseAgent(AGENT);
    expect(c).toMatchObject({ type: "agent.interrupt", agent: AGENT, release: true });
    expect(parseCommand(serialize(c as never)).ok).toBe(true);
  });
});

describe("A54: the first practice's Find shows the problem and Fix it with me can be pressed", () => {
  const FOUND = new Map(readFileSync(join(import.meta.dir, "../../protocol/fixtures/practice-found.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => { const x = JSON.parse(l); return [x.practice as string, x.event as Record<string, unknown>]; }));
  const copy = "/Users/sam/Companion practice signup";
  const found = run([ev({ type: "ui.practiceStarted", project: copy, kind: "signup" }), ev({ type: "ui.findProblem" }), state("checking"), { ...FOUND.get("signup")!, project: copy }, state("needsYou")]);
  test("before: the agent waits on the person, so the practice said to wait (the real order of events)", () => {
    expect(found.practice?.stage).toBe("found");
    expect(workingOn(found)).toBe(true);
  });
  test("the practice takes over the problem: its agent is put aside, and once it rests Fix it with me is free", () => {
    expect(foundHandsOver(found, copy)).toBe(AGENT);
    expect(foundHandsOver(found, "/Users/sam/other")).toBeNull();
    const rested = run([state("idle")], found);
    expect(rested.practice?.stage).toBe("found");
    expect(workingOn(rested)).toBe(false);
    expect(cardWorking(rested)).toBe(false);
    expect(foundHandsOver(rested, copy)).toBeNull();   // asked once
  });
  test("not while a task is running or a question waits", () => {
    const withCard = run([ev({ type: "approval.request", approval: "ap_1", agent: AGENT, checkpoint: "cp_1", toolUseId: "t", risk: "git", title: "x", expiresAt: "2999-01-01T00:00:00Z" })], found);
    expect(foundHandsOver(withCard, copy)).toBeNull();
  });
  test("Home asks for it as soon as the practice has found the problem", () => {
    expect(card).toContain("const hand = foundHandsOver(m, project);");
    expect(card).toContain("if (hand) void send(releaseAgent(hand));");
  });
});

describe("A56: closing Point at the problem or which task broke it is heard by the island and the character", () => {
  const foundIsland = island([state("checking"), ev({ type: "problem.found", project: P, agent: AGENT, verdict: "failed", label: "Running the tests", detail: "1 failed" }), state("needsYou")]);
  test("the island never says the same word twice", () => {
    expect(islandLine(foundIsland)).not.toBe("Needs you: Needs you");
    expect(islandLine(foundIsland)).toBe(stateLabel("needsYou"));
  });
  test("once the engine lets the agent rest, the mark and the words go", () => {
    const rested = run([state("idle")], foundIsland);
    expect(islandAlert(rested)).toBe(false);
    expect(islandLine(rested)).toBe(S.islandReady);
  });
  test("Close on Home asks the engine to let the agent rest, only when nothing else waits for it", () => {
    const point = card.slice(card.indexOf("{show(\"point\") && m.point && ("), card.indexOf("{show(\"bisect\")"));
    expect(point).toContain("putAside(m.point?.agent); void invoke(\"showme_clear\"); dispatch({ type: \"ui.pointClosed\" });");
    expect(point).toContain("putAside(pt.agent); void invoke(\"showme_clear\"); dispatch({ type: \"ui.pointClosed\" });");   // Fix it too
    const bisect = card.slice(card.indexOf("{show(\"bisect\") && m.bisect && ("), card.indexOf("{show(\"errorHelp\")"));
    expect(bisect).toContain("putAside(m.bisect?.agent); dispatch({ type: \"ui.bisectClosed\" });");
  });
});

describe("A57: a finished Drive plan is not work in progress", () => {
  const finished = run([ev({ type: "drive.step", index: 1, total: 2, title: "Make the page", status: "running" }), ev({ type: "drive.step", index: 2, total: 2, title: "Add a form", status: "done" }), ev({ type: "drive.done", status: "done", completed: 2, total: 2 }), state("done"), ev({ type: "ui.settle" })]);
  test("Install, Remove key and the practices are free once it has finished", () => {
    expect(finished.character).toBe("idle");
    expect(isBusy(finished)).toBe(false);
    expect(installAllowed(finished)).toBe(true);
    expect(workingOn(finished)).toBe(false);
  });
  test("a plan that is still running is still busy", () => {
    expect(isBusy(run([ev({ type: "drive.step", index: 1, total: 2, title: "Make the page", status: "running" })]))).toBe(true);
  });
  test("its panel can be closed, and a new task outside the plan closes it too", () => {
    const closed = run([ev({ type: "ui.driveClosed" })], finished);
    expect(closed.drive).toBeNull();
    expect(closed.stepExplains).toEqual([]);
    expect(closed.planCheckpoints).toEqual([]);
    const next = run([ev({ type: "checkpoint.created", project: P, agent: AGENT, checkpoint: "cp_9", label: "Before: x", files: 1, skipped: [] })], finished);
    expect(next.drive).toBeNull();
    // Only a finished plan: a running one keeps counting its steps.
    const running = run([ev({ type: "drive.step", index: 1, total: 2, title: "Make the page", status: "running" }), ev({ type: "checkpoint.created", project: P, agent: AGENT, checkpoint: "cp_9", label: "Before: x", files: 1, skipped: [] })]);
    expect(running.drive?.index).toBe(1);
    expect(running.planCheckpoints).toEqual(["cp_9"]);
  });
  test("the finished panel shows a Close", () => {
    const drive = card.slice(card.indexOf("{show(\"drive\") && m.drive && ("), card.indexOf("{show(\"ship\") && m.shipFlow"));
    expect(drive).toContain("{m.drive.finished && <div className=\"row\"><button className=\"btn\" type=\"button\" onClick={() => dispatch({ type: \"ui.driveClosed\" })}>{S.closeFinished}</button></div>}");
  });
});

describe("A60: Your turn after a failed Check my change", () => {
  const ready = ev({ type: "teach.ready", project: P, checkpoint: "cp_1", made: true, target: { file: "src/b.js", line: 2, lineText: "return title(user.name);" }, restore: "cp_3" });
  const failed = run([ev({ type: "ui.teachAsked", checkpoint: "cp_1" }), ready, ev({ type: "ui.teachChecking", agent: AGENT }), state("checking"),
    ev({ type: "teach.result", project: P, checkpoint: "cp_1", verdict: "failed", same: false, label: "Running the tests", detail: "1 failed" }), state("needsYou")]);
  test("Put my fix back, then Close: Home is not left on Needs you", () => {
    expect(failed.teach?.agent).toBe(AGENT);
    const back = run([ev({ type: "ui.teachRestore" }), ev({ type: "checkpoint.restored", project: P, checkpoint: "cp_3", safety: "s", recovered: [], largeLeftAlone: [], leftAlone: [] })], failed);
    expect(teachActions(back.teach!)).toEqual(["close"]);
    const closed = run([ev({ type: "ui.teachClosed" })], back);
    expect(closed.teach).toBeNull();
    expect(closed.agents[AGENT]).toBe("idle");
    expect(cardWorking(closed)).toBe(false);
    expect(isBusy(closed)).toBe(false);
  });
  test("Leave it as it is lets the agent rest too, and the turn stays", () => {
    const left = run([ev({ type: "ui.teachLeft" })], failed);
    expect(left.teach?.stage).toBe("left");
    expect(left.agents[AGENT]).toBe("idle");
    expect(cardWorking(left)).toBe(false);
  });
  test("Close and Leave ask the engine to let the agent rest, so the island hears it", () => {
    const teach = card.slice(card.indexOf("{show(\"teach\") && m.teach && ("), card.indexOf("{show(\"browser\")"));
    expect(teach).toContain("putAside(t.agent); void invoke(\"showme_clear\"); dispatch({ type: \"ui.teachLeft\" });");
    expect(teach).toContain("putAside(t.agent); void invoke(\"showme_clear\"); dispatch({ type: \"ui.teachClosed\" });");
    expect(teach).toContain("dispatch({ type: \"ui.teachChecking\", agent: AGENT });");
  });
});

describe("A61: Check before going live or Put it online while a question waits", () => {
  const begin = [ev({ type: "checkpoint.created", project: P, agent: AGENT, checkpoint: "cp_1", label: "Before: make the button", files: 3, skipped: [] }), state("working")];
  const asked = run([...begin, ev({ type: "receipt", agent: AGENT, checkpoint: "cp_1", changed: [], commands: 0, notUndoable: [], proof: "skipped", usdEstimate: 0.02, said: "Which colour do you want for the button?", asks: true }), state("needsYou")]);
  test("the question and its answer box stay, and Home is not left on a Stop that does nothing", () => {
    expect(waitsForAnswer(asked)).toBe(true);
    const m = run([ev({ type: "ui.planRequested", ship: true })], asked);
    expect(m.receipt?.asks).toBe(true);
    expect(m.task?.agent).toBe(AGENT);
    expect(waitsForAnswer(m)).toBe(true);
    expect(cardWorking(m)).toBe(false);
  });
  test("Plan it and Rescue still start afresh", () => {
    const m = run([ev({ type: "ui.planRequested" })], asked);
    expect(m.receipt).toBeNull();
  });
  test("both buttons say they are the check before going live", () => {
    expect(card).toContain("const shipIt = (o: { runChecks?: boolean; confirm?: string[] } = {}) => { if (!project) return; dispatch({ type: \"ui.planRequested\", ship: true });");
    expect(card).toContain("if (project) { dispatch({ type: \"ui.planRequested\", ship: true }); void send(shipPreview(project)); }");
  });
});
