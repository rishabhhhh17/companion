// Teaching inside the fix, as the card sees it: "Show me what changed" rings the first changed line, each Drive step keeps
// its own explanation, and "your turn" (off unless turned on) walks the person through making the second of two identical
// changes and checking it.
import { describe, expect, test } from "bun:test";
import { parseCommand, serialize } from "../../protocol/index.ts";
import { AGENT, checkMyChange, pointChange, tryNextOne } from "./commands.ts";
import { canOfferTurn, initial, receiptProofWords, reduce, teachActions, teachLines, type Model } from "./model.ts";
import { yourTurnOn } from "./settings.ts";
import { _resetForTests, takeSnapshot } from "./settingsStore.ts";
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
  const step = (index: number, title: string, cp = `cp_${index}`) => ev({ type: "explain.ready", agent: "a", checkpoint: cp, bullets: [`Why ${index}.`], step: { index, title }, usdEstimate: 0.001 });
  const plan = ev({ type: "plan.ready", agent: "a", steps: [{ id: 1, title: "x" }, { id: 2, title: "y" }], truncated: false, estimateUsd: 0.1 });
  // A step of an approved plan: the engine says the step started, then its task starts (the order the engine sends them in).
  const stepStarts = (index: number, cp = `cp_${index}`) => [ev({ type: "drive.step", agent: "a", index, total: 2, title: `Step ${index}`, status: "started" }), ev({ type: "checkpoint.created", agent: "a", checkpoint: cp, label: `Before: ${index}`, files: 1, skipped: [] })];
  test("they are listed by step, even after the next step has started, and are not mixed with a task's own", () => {
    const m = run([plan, ...stepStarts(1), step(1, "Make the page"), ...stepStarts(2), step(2, "Add the form")]);
    expect(m.stepExplains.map((s) => [s.index, s.title, s.explain.bullets[0]])).toEqual([[1, "Make the page", "Why 1."], [2, "Add the form", "Why 2."]]);
    expect(m.explain).toBeNull();
  });
  test("a second explanation for the same step replaces the first, and a new plan starts a fresh list", () => {
    const m = run([plan, ...stepStarts(1), step(1, "A"), step(1, "A")]);
    expect(m.stepExplains.length).toBe(1);
    expect(run([plan], m).stepExplains).toEqual([]);
    expect(run([ev({ type: "ui.projectChanged", project: "/q" })], m).stepExplains).toEqual([]);
  });
  test("a late explanation from an older plan, or from the folder before, is not shown with the new plan", () => {
    const old = run([plan, ...stepStarts(1, "cp_old")]);
    // A new plan is ready, and its own first step has explained itself; then the old plan's late explanation arrives.
    const next = run([plan, ...stepStarts(1, "cp_new"), step(1, "New step", "cp_new"), step(1, "Old step", "cp_old")], old);
    expect(next.stepExplains.map((s) => s.title)).toEqual(["New step"]);
    const moved = run([ev({ type: "ui.projectChanged", project: "/q" }), step(1, "Old step", "cp_old")], old);
    expect(moved.stepExplains).toEqual([]);
    // Nor is an explanation for a task that was not a step of any plan.
    expect(run([ev({ type: "checkpoint.created", agent: "a", checkpoint: "cp_t", label: "Before: t", files: 1, skipped: [] }), step(1, "x", "cp_t")]).stepExplains).toEqual([]);
  });
});

describe("your turn", () => {
  // A small page storage for these tests (bun has none), so turning it on and off is really tested.
  const withStorage = (storage: unknown, f: () => void) => {
    const had = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true, writable: true });
    try { f(); } finally { if (had) Object.defineProperty(globalThis, "localStorage", had); else delete (globalThis as { localStorage?: unknown }).localStorage; }
  };
  test("it is on unless the person turns it off (teach.yourTurn in the registry, T16)", () => {
    const kept = new Map<string, string>();
    withStorage({ getItem: (k: string) => kept.get(k) ?? null }, () => {
      try {
        expect(yourTurnOn()).toBe(true);   // on by default
        // Before the one migration, the old page storage still decides, with its old meaning.
        kept.set("companion.yourTurn", "on");
        expect(yourTurnOn()).toBe(true);
        kept.set("companion.yourTurn", "yes");   // anything but the exact word was off
        expect(yourTurnOn()).toBe(false);
        // After it, the shell's value does.
        takeSnapshot({ values: { "teach.yourTurn": false }, migrated: ["pageStorage.v1"] });
        expect(yourTurnOn()).toBe(false);
        takeSnapshot({ values: {}, migrated: ["pageStorage.v1"] });
        expect(yourTurnOn()).toBe(true);
      } finally { _resetForTests(); }
    });
  });
  test("with page storage that fails, it stays on (the usual)", () => {
    const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    withStorage(broken, () => expect(yourTurnOn()).toBe(true));
    withStorage(undefined, () => expect(yourTurnOn()).toBe(true));
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
  test("a new task or another folder ends it", () => {
    for (const end of [ev({ type: "checkpoint.created", agent: "a", checkpoint: "cp_9", label: "Before: x", files: 1, skipped: [] }), ev({ type: "ui.projectChanged", project: "/q" })])
      expect(run([...asked, end]).teach).toBeNull();
  });
  // Changed in the M11 audit (A59): an engine restart used to drop the turn too, while the old code was still in the file
  // and Put my fix back was the only way to put the whole fix back. Now the turn stays, with only that and Leave it as it
  // is (restart.test.ts).
  test("an engine restart keeps a turn whose place still has the old code", () => {
    const m = run([...asked, ev({ type: "app.runner_restarted" })]);
    expect(m.teach?.orphan).toBe(true);
    expect(teachActions(m.teach!)).not.toContain("check");
  });

  // While the second place has its old code on disk, the turn cannot just be closed: the person puts the fix back or says
  // to leave it, and the receipt above stops saying it is checked and working.
  const onCard = [receipt({ repeat: { first: at, second, was: "user", now: "user?" } }), ...asked];
  test("closing while it is the person's turn does nothing; only a finished turn can be closed", () => {
    const m = run(onCard);
    expect(run([ev({ type: "ui.teachClosed" })], m).teach?.stage).toBe("ready");
    const failed = run([ev({ type: "ui.teachChecking" }), result({ verdict: "failed", same: false, label: "Tests", detail: "1 failed" })], m);
    expect(run([ev({ type: "ui.teachClosed" })], failed).teach?.stage).toBe("checked");
    const gaps = run([ev({ type: "ui.teachChecking" }), result({ verdict: "passed_with_gaps", same: true })], m);
    expect(run([ev({ type: "ui.teachClosed" })], gaps).teach?.stage).toBe("checked");
    const passed = run([ev({ type: "ui.teachChecking" }), result({ verdict: "passed", same: true })], m);
    expect(run([ev({ type: "ui.teachClosed" })], passed).teach).toBeNull();
    const back = run([ev({ type: "ui.teachRestore" }), ev({ type: "checkpoint.restored", project: "/p", checkpoint: "cp_3", safety: "cp_8", recovered: [], largeLeftAlone: [], leftAlone: [] })], m);
    expect(run([ev({ type: "ui.teachClosed" })], back).teach).toBeNull();
    const no = run([ev({ type: "ui.teachAsked", checkpoint: "cp_1" }), ev({ type: "teach.ready", project: "/p", checkpoint: "cp_1", made: false, reason: "No." }), ev({ type: "ui.teachClosed" })]);
    expect(no.teach).toBeNull();
  });
  test("the buttons: while the old code is back there is no Close, but Put my fix back and Leave it as it is", () => {
    const m = run(onCard);
    expect(teachActions(m.teach!)).toEqual(["where", "check", "putBack", "leave"]);
    expect(teachActions(run([ev({ type: "ui.teachChecking" }), result({ verdict: "failed", same: false })], m).teach!)).toEqual(["where", "check", "putBack", "leave"]);
    expect(teachActions(run([ev({ type: "ui.teachChecking" }), result({ verdict: "passed", same: true })], m).teach!)).toEqual(["where", "close"]);
    expect(teachActions(run([ev({ type: "ui.teachChecking" })], m).teach!)).toEqual([]);
    expect(teachActions(run([ev({ type: "ui.teachRestore" })], m).teach!)).toEqual([]);
  });
  test("leaving it as it is says plainly that the place is not fixed, and keeps Put my fix back", () => {
    const left = run([ev({ type: "ui.teachLeft" })], run(onCard));
    expect(left.teach?.stage).toBe("left");
    expect(teachLines(left.teach!)).toEqual([S.teachLeft("src/b.js", 2)]);
    expect(teachActions(left.teach!)).toEqual(["where", "check", "putBack"]);
    expect(run([ev({ type: "ui.teachClosed" })], left).teach?.stage).toBe("left");
    expect(run([ev({ type: "ui.teachRestore" })], left).teach?.stage).toBe("restoring");
    expect(run([ev({ type: "ui.teachChecking" })], left).teach?.stage).toBe("checking");
  });
  test("the receipt says checked and working only while no place has its old code back", () => {
    const m = run(onCard);
    expect(receiptProofWords(run([receipt()]))).toBe(S.proven);
    expect(receiptProofWords(m)).toBe(S.teachProvenBefore);
    expect(receiptProofWords(run([ev({ type: "ui.teachLeft" })], m))).toBe(S.teachProvenBefore);
    expect(receiptProofWords(run([ev({ type: "ui.teachChecking" }), result({ verdict: "failed", same: false })], m))).toBe(S.teachProvenBefore);
    expect(receiptProofWords(run([ev({ type: "ui.teachChecking" }), result({ verdict: "passed", same: true })], m))).toBe(S.proven);
    expect(receiptProofWords(run([ev({ type: "ui.teachRestore" }), ev({ type: "checkpoint.restored", project: "/p", checkpoint: "cp_3", safety: "cp_8", recovered: [], largeLeftAlone: [], leftAlone: [] })], m))).toBe(S.proven);
    expect(receiptProofWords(run([receipt({ proof: "failed" })]))).toBe(S.notDone);
    expect(receiptProofWords(run([receipt({ proof: "skipped" })]))).toBe(S.notChecked);
  });
  test("Let me try the next one is offered once: never again after the turn was set up, even once it is closed", () => {
    const offered = run([receipt({ repeat: { first: at, second, was: "user", now: "user?" } })]);
    expect(canOfferTurn(offered)).toBe(true);
    expect(canOfferTurn(run([receipt()]))).toBe(false);
    const done = run([...asked, ev({ type: "ui.teachChecking" }), result({ verdict: "passed", same: true }), ev({ type: "ui.teachClosed" })], offered);
    expect(done.teach).toBeNull();
    expect(canOfferTurn(done)).toBe(false);
    // A refusal (something was busy) leaves the offer: it can be tried again.
    const busy = run([ev({ type: "ui.teachAsked", checkpoint: "cp_1" }), ev({ type: "teach.ready", project: "/p", checkpoint: "cp_1", made: false, reason: "Busy." }), ev({ type: "ui.teachClosed" })], offered);
    expect(canOfferTurn(busy)).toBe(true);
  });
  test("a new task while the old code is back says so instead of ending the turn silently", () => {
    const task = ev({ type: "checkpoint.created", agent: "a", checkpoint: "cp_9", label: "Before: x", files: 1, skipped: [] });
    expect(run([task], run(onCard)).notice).toBe(S.teachStillOpen("src/b.js", 2));
    expect(run([task], run([ev({ type: "ui.teachLeft" })], run(onCard))).notice).toBe(S.teachStillOpen("src/b.js", 2));
    const passed = run([ev({ type: "ui.teachChecking" }), result({ verdict: "passed", same: true }), task], run(onCard));
    expect(passed.notice).toBeNull();
  });
  test("undoing the whole task ends the turn too", () => {
    const m = run([ev({ type: "ui.undoAsked", checkpoint: "cp_1" }), ev({ type: "ui.undoSent" }), ev({ type: "checkpoint.restored", project: "/p", checkpoint: "cp_1", safety: "cp_8", recovered: [], largeLeftAlone: [], leftAlone: [] })], run(onCard));
    expect(m.undo?.stage).toBe("done"); expect(m.teach).toBeNull();
  });
  test("the steps of the person's own check show on their card, and never touch the finished task's proof", () => {
    const task = run([ev({ type: "checkpoint.created", agent: "a", checkpoint: "cp_1", label: "Before: fix", files: 1, skipped: [] }), ev({ type: "proof.step", agent: "a", rung: "tests", label: "Running the tests", status: "passed", detail: "" }), ev({ type: "proof.result", agent: "a", verdict: "passed", steps: [{ rung: "tests", label: "Running the tests", status: "passed", detail: "" }], tries: 1 }), ...onCard]);
    const proof = task.task?.proof;
    expect(proof?.verdict).toBe("passed");
    const step = (o: Record<string, unknown>) => ev({ type: "teach.step", project: "/p", checkpoint: "cp_1", rung: "tests", label: "Running the tests", detail: "", ...o });
    const checking = run([ev({ type: "ui.teachChecking" }), step({ status: "running" }), step({ status: "failed", detail: "1 failed" })], task);
    expect(checking.task?.proof).toEqual(proof!);
    expect(checking.teach?.steps).toEqual([{ rung: "tests", label: "Running the tests", status: "failed", detail: "1 failed" }]);
    expect(teachLines(checking.teach!)).toEqual([S.teachChecking, `Running the tests: ${S.stepFailed}`]);
    // A step for another fix, or one that arrives when no check is running, is ignored.
    expect(run([step({ status: "running", checkpoint: "cp_9" })], run([ev({ type: "ui.teachChecking" })], task)).teach?.steps ?? []).toEqual([]);
    expect(run([step({ status: "running" })], task).teach?.steps).toBeUndefined();
    // A new check starts with no old steps.
    const again = run([result({ verdict: "failed", same: false }), ev({ type: "ui.teachChecking" })], checking);
    expect(again.teach?.steps ?? []).toEqual([]);
  });
});
