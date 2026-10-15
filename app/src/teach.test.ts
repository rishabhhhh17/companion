// Teaching inside the fix, as the card sees it: "Show me what changed" rings the first changed line, each Drive step keeps
// its own explanation, and "your turn" (off unless turned on) walks the person through making the second of two identical
// changes and checking it.
import { describe, expect, test } from "bun:test";
import { parseCommand, serialize } from "../../protocol/index.ts";
import { AGENT, checkMyChange, pointChange, tryNextOne } from "./commands.ts";
import { initial, reduce, teachLines, type Model } from "./model.ts";
import { setYourTurn, yourTurnOn } from "./settings.ts";
import { S } from "./strings.ts";

const ev = (o: Record<string, unknown>) => ({ v: 1, id: "e", ...o });
const run = (events: Record<string, unknown>[], from: Model = initial()) => events.reduce<Model>((m, e) => reduce(m, e as never), from);
const at = { file: "src/a.js", line: 2, lineText: "const n = user?.name;" };
const second = { file: "src/b.js", line: 2, lineText: "return title(user?.name);" };
const receipt = (o: Record<string, unknown> = {}) => ev({ type: "receipt", agent: "a", checkpoint: "cp_1", changed: [{ file: "src/a.js", kind: "modified" }], commands: 0, notUndoable: [], proof: "passed", usdEstimate: 0.1, ...o });

describe("Show me what changed", () => {
  test("the receipt keeps the first changed line", () => {
    expect(run([receipt({ changedAt: at })]).receipt?.changedAt).toEqual(at);
  });
  test("a place that is not whole is not kept, so nothing wrong is ever opened", () => {
    for (const bad of [{ ...at, line: 0 }, { ...at, line: 1.5 }, { file: "", line: 2, lineText: "" }, "src/a.js:2", { file: "a", line: 2 }]) expect(run([receipt({ changedAt: bad })]).receipt?.changedAt, JSON.stringify(bad)).toBeUndefined();
  });
  test("the press opens that line the same way Point at the problem does, with a plain caption", () => {
    expect(pointChange("/Users/me/site", at, S.changedHere)).toEqual({ project: "/Users/me/site", problem: { kind: "line", file: "src/a.js", line: 2, lineText: "const n = user?.name;", message: S.changedHere, from: "change" } });
  });
});

describe("each Drive step keeps its own explanation", () => {
  const step = (index: number, title: string) => ev({ type: "explain.ready", agent: "a", checkpoint: `cp_${index}`, bullets: [`Why ${index}.`], step: { index, title }, usdEstimate: 0.001 });
  test("they are listed by step, even after the next step has started, and are not mixed with a task's own", () => {
    const m = run([ev({ type: "checkpoint.created", agent: "a", checkpoint: "cp_1", label: "Before: one", files: 1, skipped: [] }), step(1, "Make the page"), ev({ type: "checkpoint.created", agent: "a", checkpoint: "cp_2", label: "Before: two", files: 1, skipped: [] }), step(2, "Add the form")]);
    expect(m.stepExplains.map((s) => [s.index, s.title, s.explain.bullets[0]])).toEqual([[1, "Make the page", "Why 1."], [2, "Add the form", "Why 2."]]);
    expect(m.explain).toBeNull();
  });
  test("a second explanation for the same step replaces the first, and a new plan starts a fresh list", () => {
    const m = run([step(1, "A"), step(1, "A")]);
    expect(m.stepExplains.length).toBe(1);
    expect(run([ev({ type: "plan.ready", agent: "a", steps: [{ id: 1, title: "x" }], truncated: false, estimateUsd: 0.1 })], m).stepExplains).toEqual([]);
    expect(run([ev({ type: "ui.projectChanged", project: "/q" })], m).stepExplains).toEqual([]);
  });
});

describe("your turn", () => {
  test("it is off unless the person turns it on", () => {
    expect(yourTurnOn()).toBe(false);
    setYourTurn(true);   // no page storage in tests: still off, never on by accident
    expect(yourTurnOn()).toBe(false);
  });
  test("the commands are valid protocol and name the project and the fix", () => {
    const t = tryNextOne("/Users/me/site", "cp_1"), c = checkMyChange("/Users/me/site", "cp_1");
    expect(parseCommand(serialize(t)).ok).toBe(true); expect(parseCommand(serialize(c)).ok).toBe(true);
    expect(t).toMatchObject({ type: "teach.try", project: "/Users/me/site", checkpoint: "cp_1" });
    expect(c).toMatchObject({ type: "teach.check", project: "/Users/me/site", checkpoint: "cp_1", agent: AGENT });
  });
  test("the receipt keeps the two places when both are whole", () => {
    expect(run([receipt({ repeat: { first: at, second, was: "user", now: "user?" } })]).receipt?.repeat).toEqual({ first: at, second, was: "user", now: "user?" });
    expect(run([receipt({ repeat: { first: at, was: "user", now: "user?" } })]).receipt?.repeat).toBeUndefined();
  });

  const ready = ev({ type: "teach.ready", project: "/p", checkpoint: "cp_1", made: true, target: { file: "src/b.js", line: 2, lineText: "return title(user.name);" }, example: { file: "src/a.js", line: 2, was: "const n = user.name;", now: "const n = user?.name;" }, change: { was: "user", now: "user?" }, restore: "cp_3" });
  const asked = [ev({ type: "ui.teachAsked", checkpoint: "cp_1" }), ready];
  test("after the press, the card says what was fixed, where the person's turn is, and what to change", () => {
    const m = run(asked);
    expect(m.teach?.stage).toBe("ready");
    const words = teachLines(m.teach!).join(" ");
    expect(words).toContain("src/a.js, line 2"); expect(words).toContain("src/b.js, line 2");
    expect(words).toContain("user?"); expect(words).toContain(S.teachThenCheck);
  });
  test("an answer for another fix, or one nobody asked for, is ignored; a refusal says why", () => {
    expect(run([ev({ type: "ui.teachAsked", checkpoint: "cp_9" }), ready]).teach?.stage).toBe("asking");
    expect(run([ready]).teach).toBeNull();
    const no = run([ev({ type: "ui.teachAsked", checkpoint: "cp_1" }), ev({ type: "teach.ready", project: "/p", checkpoint: "cp_1", made: false, reason: "That file changed after my fix, so I left it alone." })]);
    expect(no.teach?.stage).toBe("refused"); expect(teachLines(no.teach!)).toEqual(["That file changed after my fix, so I left it alone."]);
  });
  const result = (o: Record<string, unknown>) => ev({ type: "teach.result", project: "/p", checkpoint: "cp_1", ...o });
  test("checking: a pass that matches, a pass done another way, and a failure each say so plainly", () => {
    const checking = run([...asked, ev({ type: "ui.teachChecking" })]);
    expect(checking.teach?.stage).toBe("checking");
    expect(teachLines(run([result({ verdict: "passed", same: true })], checking).teach!)).toEqual([S.teachPassedSame]);
    expect(teachLines(run([result({ verdict: "passed", same: false })], checking).teach!)).toEqual([S.teachPassedOther]);
    expect(teachLines(run([result({ verdict: "passed_with_gaps", same: true })], checking).teach!)).toEqual([S.teachPassedGaps]);
    const failed = run([result({ verdict: "failed", same: false, label: "Running the tests", detail: "1 failed" })], checking).teach!;
    expect(failed.stage).toBe("checked"); expect(teachLines(failed).join(" ")).toContain("Running the tests: 1 failed");
    expect(teachLines(run([result({ verdict: "nothing_to_check", same: true })], checking).teach!)).toEqual([S.teachNothing]);
  });
  test("a stopped check goes back to the person's turn, with the reason", () => {
    const m = run([...asked, ev({ type: "ui.teachChecking" }), result({ verdict: "cancelled", same: false, reason: "Stopped." })]);
    expect(m.teach?.stage).toBe("ready"); expect(m.teach?.note).toBe("Stopped.");
  });
  test("a result that arrives when no check was asked for is ignored", () => {
    expect(run([...asked, result({ verdict: "passed", same: true })]).teach?.stage).toBe("ready");
  });
  test("putting the fix back waits for the engine to say it is back", () => {
    const m = run([...asked, ev({ type: "ui.teachRestore" })]);
    expect(m.teach?.stage).toBe("restoring");
    expect(run([ev({ type: "checkpoint.restored", project: "/p", checkpoint: "cp_7", safety: "cp_8", recovered: [], largeLeftAlone: [], leftAlone: [] })], m).teach?.stage).toBe("restoring");
    const back = run([ev({ type: "checkpoint.restored", project: "/p", checkpoint: "cp_3", safety: "cp_8", recovered: [], largeLeftAlone: [], leftAlone: [] })], m);
    expect(back.teach?.stage).toBe("restored"); expect(teachLines(back.teach!)).toEqual([S.teachRestored]);
  });
  test("a put back that could not be done says why and leaves the person's turn as it was", () => {
    const m = run([...asked, ev({ type: "ui.teachRestore" }), ev({ type: "protocol.error", reason: "Something is still working on this project. Wait for it to finish, or press Stop, then undo." })]);
    expect(m.teach?.stage).toBe("ready"); expect(m.teach?.note).toMatch(/still working/);
  });
  test("a new task, another folder, an engine restart or closing ends it", () => {
    for (const end of [ev({ type: "checkpoint.created", agent: "a", checkpoint: "cp_9", label: "Before: x", files: 1, skipped: [] }), ev({ type: "ui.projectChanged", project: "/q" }), ev({ type: "app.runner_restarted" }), ev({ type: "ui.teachClosed" })])
      expect(run([...asked, end]).teach).toBeNull();
  });
});
