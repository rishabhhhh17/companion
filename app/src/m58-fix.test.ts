// M58 area A on the pages: Fix it means fix (feature 8, UI 4), "Try 1 of 3" and the fixed ladder (shortlist 4, UI 5),
// Last working and starred or named saves with an honest Undo line (shortlist 5), the sign in wall said as the person's
// turn (shortlist 8), and a stopped run that leaves Undo ready but never undoes by itself (shortlist 9). Pure parts and
// the model only; the card's source is read where the wiring itself is the thing to pin.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseCommand, serialize } from "../../protocol/index.ts";
import { initial, reduce, type Model } from "./model.ts";
import { defaultOf } from "../../protocol/settings.ts";
import { pointFixRoute, usesSmallFix, reviewFixRoute } from "./practice.ts";
import { fixLadder, tryCounter, backPlanStep } from "./fixLadder.ts";
import { lastWorkingLabel, undoLimitsLine, saveName, signInTurn } from "./savePoints.ts";
import { verdictOf, type Facts } from "./verdict.ts";
import { chooseLoop, markSave } from "./commands.ts";
import { S } from "./strings.ts";

const ev = (o: Record<string, unknown>) => ({ v: 1, id: "e", ...o });
const run = (events: Record<string, unknown>[], from: Model = initial()) => events.reduce<Model>((m, e) => reduce(m, e as never), from);
const place = { kind: "line", file: "src/App.tsx", line: 5, lineText: "const total: number = \"three\";", message: "Type 'string' is not assignable to type 'number'.", from: "checks" };
const found = [ev({ type: "ui.findProblem" }), ev({ type: "problem.found", project: "p", agent: "finder", verdict: "failed", label: "Building and checking the code", detail: "tsc failed", problem: place })];
const card = readFileSync(join(import.meta.dir, "./card.tsx"), "utf8");

describe("A1: Fix it means fix", () => {
  test("a confirmed line takes the small fix by default; nothing specific found still looks deeper first", () => {
    expect(defaultOf("point.fixWith")).toBe("smallFix");
    expect(usesSmallFix(defaultOf("point.fixWith"), place as never)).toBe(true);
    expect(pointFixRoute(defaultOf("point.fixWith"), place as never, null, "/p")).toBe("smallFix");
    expect(pointFixRoute(defaultOf("point.fixWith"), { kind: "message", message: "x", from: "deploy" }, null, "/p")).toBe("rescue");
    expect(pointFixRoute(defaultOf("point.fixWith"), null, null, "/p")).toBe("rescue");
    // The person can still choose Look deeper first.
    expect(pointFixRoute("rescue", place as never, null, "/p")).toBe("rescue");
  });
  test("pressing Fix it keeps the found problem on screen, marked as starting", () => {
    const m = run([...found, ev({ type: "ui.pointFixing" })]);
    expect(m.point?.stage).toBe("found");
    expect(m.point?.fixing).toBe(true);
    expect(m.point?.problem).toEqual(place as never);
  });
  test("the engine's first event for the fix clears it, whichever comes first", () => {
    const first = [
      ev({ type: "checkpoint.created", project: "p", agent: "builder-1", checkpoint: "cp_0001", label: "Before: fix", files: 3, skipped: [] }),
      ev({ type: "agent.state", agent: "builder-1", state: "working" }),
      ev({ type: "agent.tool", agent: "builder-1", tool: "Read", summary: "Read src/App.tsx", toolUseId: "t1", undoable: true }),
      ev({ type: "plan.ready", agent: "builder-1", steps: [{ title: "Fix the type" }], truncated: false, estimateUsd: 0.05 }),
    ];
    for (const e of first) expect(run([...found, ev({ type: "ui.pointFixing" }), e]).point, String((e as Record<string, unknown>).type)).toBeNull();
  });
  test("the finder resting again is not the fix starting: the problem stays", () => {
    const m = run([...found, ev({ type: "ui.pointFixing" }), ev({ type: "agent.state", agent: "finder", state: "idle" })]);
    expect(m.point?.fixing).toBe(true);
  });
  test("a refusal keeps the problem, no longer starting, so Fix it can be pressed again", () => {
    for (const e of [ev({ type: "ui.pointFixRefused" }), ev({ type: "protocol.error", reason: "Squibby is getting ready on this Mac." })]) {
      const m = run([...found, ev({ type: "ui.pointFixing" }), e]);
      expect(m.point?.stage).toBe("found");
      expect(m.point?.fixing).toBeUndefined();
      expect(m.point?.problem).toEqual(place as never);
    }
  });
  test("Fix it on the card no longer closes the problem first, and the starting line has no key or sign in words (F29)", () => {
    const at = card.indexOf("const fixKnown = ");
    const body = card.slice(at, card.indexOf("\n  };", at));
    expect(body).toContain('dispatch({ type: "ui.pointFixing" })');
    expect(body).not.toContain('dispatch({ type: "ui.pointClosed" })');
    expect(card).toContain("S.fix.starting");
    for (const w of [S.fix.starting, S.fix.startingLine]) expect(w).not.toMatch(/key|sign in|log in|account|—/i);
  });
});

describe("A2: Try 1 of 3 and the fixed ladder", () => {
  test("the counter comes from the check itself, never a guess", () => {
    expect(tryCounter({ tries: 1, of: 3 })).toBe("Try 1 of 3");
    expect(tryCounter({ tries: 2, of: 3 })).toBe("Try 2 of 3");
    expect(tryCounter({ tries: 2 })).toBeNull();
    // A different approach keeps counting checks, past the limit of one approach: said plainly, never "4 of 3".
    expect(tryCounter({ tries: 4, of: 3 })).toBe("Try 4");
  });
  test("three rows, the current one marked; research only when web search is on (hidden, not greyed)", () => {
    const on = fixLadder({ rung: "retry", webSearch: true, lastWorking: "2:14 pm" });
    expect(on.map((r) => r.id)).toEqual(["retry", "research", "lastWorking"]);
    expect(on.filter((r) => r.current).map((r) => r.id)).toEqual(["retry"]);
    expect(on[2].words).toContain("2:14 pm");
    const off = fixLadder({ rung: "research", webSearch: false, lastWorking: null });
    expect(off.map((r) => r.id)).toEqual(["retry", "lastWorking"]);
    expect(off.find((r) => r.id === "lastWorking")!.words).toBe(S.fix.noLastWorking);
  });
  test("the ladder choices are protocol, and the card maps every option to its own words", () => {
    for (const c of ["different", "research", "lastWorking", "stop"] as const) expect(parseCommand(serialize(chooseLoop(c))).ok).toBe(true);
    expect(S.fix.option.research).toBe("Look up this exact error");
    expect(S.fix.option.lastWorking).toBe("Go back to the last working version and plan");
  });
  test("Last working asks first: the card shows a confirm step before the choice is sent", () => {
    const at = card.indexOf("{m.stuck && (");
    const block = card.slice(at, card.indexOf("{m.paused && (", at));
    expect(block).toContain("S.fix.backSure");
    expect(block).toContain('ConfirmStep');
    expect(block).toContain("tryCounter");
    expect(block).toContain("fixLadder");
  });
  test("still failing is said in the line under the verdict, with the count", () => {
    expect(S.fix.stillFailing(2)).toBe("Still failing after 2 tries.");
  });
});

describe("A2: Stop after Go back to the last working version (rules 11 and 13)", () => {
  const back = { type: "checkpoint.restored", project: "/p", lastWorking: true };
  test("armed by Put them back, the files back there plan the next step once", () => {
    expect(backPlanStep(true, back, "/p")).toEqual({ armed: false, plan: true });
    expect(backPlanStep(false, back, "/p")).toEqual({ armed: false, plan: false });
  });
  test("Stop everything disarms it, so a restore that still lands never starts Look deeper", () => {
    const after = backPlanStep(true, { type: "app.stop_everything" }, "/p");
    expect(after).toEqual({ armed: false, plan: false });
    expect(backPlanStep(after.armed, back, "/p").plan).toBe(false);
  });
  test("another project's restore, or an ordinary Undo, never plans", () => {
    expect(backPlanStep(true, { ...back, project: "/q" }, "/p")).toEqual({ armed: false, plan: false });
    expect(backPlanStep(true, { type: "checkpoint.restored", project: "/p" }, "/p")).toEqual({ armed: true, plan: false });
  });
  test("the card wires it: the listener uses backPlanStep, and every Stop button disarms it", () => {
    expect(card).toContain("backPlanStep(backPlans.current");
    expect((card.match(/send\(stopAgent\(\)\)/g) ?? []).length).toBe(1);   // only inside stopNow
    expect(card).toMatch(/const stopNow = \(\) => \{ backPlans\.current = false;/);
  });
});

describe("feature 9: the review's Fix it in the key practice's copy never starts a model fix", () => {
  const kp = (stage: string) => ({ kind: "key", project: "/k", stage }) as never;
  test("found or not passed: the practice's own fixed move", () => {
    expect(reviewFixRoute(kp("found"), "/k")).toBe("practice");
    expect(reviewFixRoute(kp("failed"), "/k")).toBe("practice");
  });
  test("any other stage of the key copy (done, then edited by hand; or the key found elsewhere): nothing is sent", () => {
    for (const st of ["done", "blocked", "start", "fixing", "proving"]) expect(reviewFixRoute(kp(st), "/k"), st).toBe("none");
  });
  test("another project, or another practice: the ordinary review fix", () => {
    expect(reviewFixRoute(kp("done"), "/p")).toBe("review");
    expect(reviewFixRoute(null, "/p")).toBe("review");
    expect(reviewFixRoute({ kind: "type", project: "/k", stage: "done" } as never, "/k")).toBe("review");
  });
  test("the card routes onFix through it, and says the practice's own line when nothing is sent", () => {
    expect(card).toContain("reviewFixRoute(nowModel.current.practice, project)");
    expect(S.practiceKey.fixHere).toBe("In this practice, Fix it is the practice's own move.");
  });
});

describe("A3: Last working, starred and named saves, and what Undo does not bring back", () => {
  test("Last working says when, in plain words", () => {
    expect(lastWorkingLabel("2026-11-05T14:14:00", (d) => d.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit" }))).toMatch(/^Last working, 14:14$/);
    expect(lastWorkingLabel("not a time")).toBe("Last working");
  });
  test("the Undo line is fixed and plain, and adds nothing the receipt already names", () => {
    const line = undoLimitsLine([]);
    expect(line).toBe("Undo puts your files back. It does not bring back a database, a live site, emails sent or installed packages (node_modules).");
    expect(undoLimitsLine(["npm install left node_modules"])).not.toMatch(/node_modules\)/);
    expect(undoLimitsLine(["npm install left node_modules"])).toContain("database");
  });
  test("names are cleaned the same way the engine cleans them", () => {
    expect(saveName("  Menu\n works  ")).toBe("Menu works");
    expect(saveName("x".repeat(50)).length).toBe(40);
  });
  test("starring and naming are protocol commands that name the project", () => {
    const c = markSave("/Users/me/site", "cp_0004", { star: true }) as any;
    expect(parseCommand(serialize(c)).ok).toBe(true);
    expect(c).toMatchObject({ type: "checkpoint.mark", project: "/Users/me/site", checkpoint: "cp_0004", star: true });
    expect(parseCommand(serialize(markSave("/p", "cp_0004", { name: "Works" }))).ok).toBe(true);
  });
  test("History keeps the marks and Last working from the engine", () => {
    const m = run([ev({ type: "tasks.list", project: "p", tasks: [{ id: 5, label: "Add the menu", status: "done", usd: 0, startedAt: "2026-11-05T14:10:00Z", endedAt: "2026-11-05T14:14:00Z", checkpoint: "cp_0007", changed: 2, proof: "passed", lastWorking: true, star: true, name: "Menu works" }], lastWorking: { checkpoint: "cp_0008", at: "2026-11-05T14:14:00Z" } })]);
    expect(m.history[0]).toMatchObject({ lastWorking: true, star: true, name: "Menu works" });
    expect(m.lastWorking).toEqual({ checkpoint: "cp_0008", at: "2026-11-05T14:14:00Z" });
  });
});

describe("A4: a sign in wall is the person's turn, never proven", () => {
  test("a browser step that needs a sign in is said as the person's turn, and Squibby never types", () => {
    const t = signInTurn([{ rung: "browser", status: "passed", needs: "signIn" }]);
    expect(t).not.toBeNull();
    // Honest words (5 Nov review): no "Your turn" until a Continue / Skip handover exists to act on.
    expect(t).not.toMatch(/your turn/i);
    expect(t).toMatch(/not checked/i);
    expect(t).toMatch(/never types/i);
    expect(signInTurn([{ rung: "browser", status: "passed" }])).toBeNull();
  });
  test("the model keeps needs: signIn on the step", () => {
    const m = run([ev({ type: "checkpoint.created", project: "p", agent: "builder-1", checkpoint: "cp_1", label: "Before: x", files: 1, skipped: [] }),
      ev({ type: "proof.step", agent: "builder-1", rung: "browser", label: "Opening it in a browser", status: "passed", detail: "The page needs a sign in.", needs: "signIn" })]);
    expect(m.task?.proof?.steps[0].needs).toBe("signIn");
  });
  test("a result with gaps is never called proven", () => {
    expect(verdictOf({ proof: "partial", ended: "done", undone: false, changed: 1, missing: ["the browser check"] }).proven).toBe(false);
  });
});

describe("A5: after Stop, Undo what it did is ready, never automatic", () => {
  const f = (o: Partial<Facts>): Facts => ({ proof: "none", ended: "stopped", undone: false, changed: 2, missing: [], ...o });
  test("stopped with changes: Undo is offered, and the line says it does not count as a fix", () => {
    const v = verdictOf(f({}));
    expect(v.kind).toBe("stopped");
    expect(v.offer).toBe("undo");
    expect(v.line).toContain("This run does not count as a fix.");
    expect(v.proven).toBe(false);
  });
  test("stopped with no changes: nothing to undo", () => {
    expect(verdictOf(f({ changed: 0 })).offer).toBeNull();
  });
  test("the stopped result's main button is Undo what it did, and it only asks (the restore is sent from the confirm)", () => {
    expect(S.fix.undoWhatItDid).toBe("Undo what it did");
    expect(card).toContain("S.fix.undoWhatItDid");
    // No restore is sent from the stopped result itself: Undo opens the receipt's own question first.
    const at = card.indexOf("S.fix.undoWhatItDid");
    const near = card.slice(Math.max(0, at - 400), at + 200);
    expect(near).not.toContain("send(undo(");
  });
});
