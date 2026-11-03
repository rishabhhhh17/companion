// M45, Tell the truth: one pure function decides what a finished task's result is (verdict.ts). These tests write out every
// combination of what the checks showed, how the task ended, whether Undo put the files back and whether it changed files,
// with the one honest answer for each, typed out by hand from the spec's truth table (docs/milestones/M45-spec.md, 1.2).
import { describe, expect, test } from "bun:test";
import { missingWords, verdictOf, type EndFact, type Facts, type FailWhy, type LimitWhy, type ProofFact, type Verdict } from "./verdict.ts";
import { S } from "./strings.ts";

type Row = [ProofFact, string, boolean, number, Verdict["kind"], Verdict["tone"], Verdict["icon"], Verdict["offer"]];

/** proof, ending ("limit:daily", "failed:noConnection"), undone, files changed, then the expected kind, tone, icon, offer. */
const MATRIX: Row[] = [
  ["passed", "done", false, 0, "passes", "good", "tick", null],
  ["passed", "done", false, 2, "proven", "good", "tick", "undo"],
  ["passed", "done", true, 0, "undone", "plain", "undo", null],
  ["passed", "done", true, 2, "undone", "plain", "undo", null],
  ["passed", "stopped", false, 0, "stopped", "plain", "stop", null],
  ["passed", "stopped", false, 2, "stopped", "plain", "stop", "undo"],
  ["passed", "stopped", true, 0, "undone", "plain", "undo", null],
  ["passed", "stopped", true, 2, "undone", "plain", "undo", null],
  ["passed", "limit:spending", false, 0, "limit", "plain", "stop", null],
  ["passed", "limit:spending", false, 2, "limit", "plain", "stop", "undo"],
  ["passed", "limit:spending", true, 0, "undone", "plain", "undo", null],
  ["passed", "limit:spending", true, 2, "undone", "plain", "undo", null],
  ["passed", "limit:daily", false, 0, "limit", "plain", "stop", null],
  ["passed", "limit:daily", false, 2, "limit", "plain", "stop", "undo"],
  ["passed", "limit:daily", true, 0, "undone", "plain", "undo", null],
  ["passed", "limit:daily", true, 2, "undone", "plain", "undo", null],
  ["passed", "limit:turns", false, 0, "limit", "plain", "stop", null],
  ["passed", "limit:turns", false, 2, "limit", "plain", "stop", "undo"],
  ["passed", "limit:turns", true, 0, "undone", "plain", "undo", null],
  ["passed", "limit:turns", true, 2, "undone", "plain", "undo", null],
  ["passed", "needsYou", false, 0, "needsYou", "ask", "wait", null],
  ["passed", "needsYou", false, 2, "needsYou", "ask", "wait", "undo"],
  ["passed", "needsYou", true, 0, "undone", "plain", "undo", null],
  ["passed", "needsYou", true, 2, "undone", "plain", "undo", null],
  ["passed", "failed:check", false, 0, "error", "bad", "cross", null],
  ["passed", "failed:check", false, 2, "error", "bad", "cross", "undo"],
  ["passed", "failed:check", true, 0, "undone", "plain", "undo", null],
  ["passed", "failed:check", true, 2, "undone", "plain", "undo", null],
  ["passed", "failed:noConnection", false, 0, "error", "bad", "cross", null],
  ["passed", "failed:noConnection", false, 2, "error", "bad", "cross", "undo"],
  ["passed", "failed:noConnection", true, 0, "undone", "plain", "undo", null],
  ["passed", "failed:noConnection", true, 2, "undone", "plain", "undo", null],
  ["passed", "failed:claudeBusy", false, 0, "error", "bad", "cross", null],
  ["passed", "failed:claudeBusy", false, 2, "error", "bad", "cross", "undo"],
  ["passed", "failed:claudeBusy", true, 0, "undone", "plain", "undo", null],
  ["passed", "failed:claudeBusy", true, 2, "undone", "plain", "undo", null],
  ["passed", "failed:error", false, 0, "error", "bad", "cross", null],
  ["passed", "failed:error", false, 2, "error", "bad", "cross", "undo"],
  ["passed", "failed:error", true, 0, "undone", "plain", "undo", null],
  ["passed", "failed:error", true, 2, "undone", "plain", "undo", null],
  ["passed", "unknown", false, 0, "passes", "good", "tick", null],
  ["passed", "unknown", false, 2, "proven", "good", "tick", "undo"],
  ["passed", "unknown", true, 0, "undone", "plain", "undo", null],
  ["passed", "unknown", true, 2, "undone", "plain", "undo", null],
  ["partial", "done", false, 0, "partial", "mixed", "wait", null],
  ["partial", "done", false, 2, "partial", "mixed", "wait", "undo"],
  ["partial", "done", true, 0, "undone", "plain", "undo", null],
  ["partial", "done", true, 2, "undone", "plain", "undo", null],
  ["partial", "stopped", false, 0, "stopped", "plain", "stop", null],
  ["partial", "stopped", false, 2, "stopped", "plain", "stop", "undo"],
  ["partial", "stopped", true, 0, "undone", "plain", "undo", null],
  ["partial", "stopped", true, 2, "undone", "plain", "undo", null],
  ["partial", "limit:spending", false, 0, "limit", "plain", "stop", null],
  ["partial", "limit:spending", false, 2, "limit", "plain", "stop", "undo"],
  ["partial", "limit:spending", true, 0, "undone", "plain", "undo", null],
  ["partial", "limit:spending", true, 2, "undone", "plain", "undo", null],
  ["partial", "limit:daily", false, 0, "limit", "plain", "stop", null],
  ["partial", "limit:daily", false, 2, "limit", "plain", "stop", "undo"],
  ["partial", "limit:daily", true, 0, "undone", "plain", "undo", null],
  ["partial", "limit:daily", true, 2, "undone", "plain", "undo", null],
  ["partial", "limit:turns", false, 0, "limit", "plain", "stop", null],
  ["partial", "limit:turns", false, 2, "limit", "plain", "stop", "undo"],
  ["partial", "limit:turns", true, 0, "undone", "plain", "undo", null],
  ["partial", "limit:turns", true, 2, "undone", "plain", "undo", null],
  ["partial", "needsYou", false, 0, "needsYou", "ask", "wait", null],
  ["partial", "needsYou", false, 2, "needsYou", "ask", "wait", "undo"],
  ["partial", "needsYou", true, 0, "undone", "plain", "undo", null],
  ["partial", "needsYou", true, 2, "undone", "plain", "undo", null],
  ["partial", "failed:check", false, 0, "error", "bad", "cross", null],
  ["partial", "failed:check", false, 2, "error", "bad", "cross", "undo"],
  ["partial", "failed:check", true, 0, "undone", "plain", "undo", null],
  ["partial", "failed:check", true, 2, "undone", "plain", "undo", null],
  ["partial", "failed:noConnection", false, 0, "error", "bad", "cross", null],
  ["partial", "failed:noConnection", false, 2, "error", "bad", "cross", "undo"],
  ["partial", "failed:noConnection", true, 0, "undone", "plain", "undo", null],
  ["partial", "failed:noConnection", true, 2, "undone", "plain", "undo", null],
  ["partial", "failed:claudeBusy", false, 0, "error", "bad", "cross", null],
  ["partial", "failed:claudeBusy", false, 2, "error", "bad", "cross", "undo"],
  ["partial", "failed:claudeBusy", true, 0, "undone", "plain", "undo", null],
  ["partial", "failed:claudeBusy", true, 2, "undone", "plain", "undo", null],
  ["partial", "failed:error", false, 0, "error", "bad", "cross", null],
  ["partial", "failed:error", false, 2, "error", "bad", "cross", "undo"],
  ["partial", "failed:error", true, 0, "undone", "plain", "undo", null],
  ["partial", "failed:error", true, 2, "undone", "plain", "undo", null],
  ["partial", "unknown", false, 0, "partial", "mixed", "wait", null],
  ["partial", "unknown", false, 2, "partial", "mixed", "wait", "undo"],
  ["partial", "unknown", true, 0, "undone", "plain", "undo", null],
  ["partial", "unknown", true, 2, "undone", "plain", "undo", null],
  ["failed", "done", false, 0, "failed", "bad", "cross", null],
  ["failed", "done", false, 2, "failed", "bad", "cross", "undo"],
  ["failed", "done", true, 0, "failed", "bad", "cross", null],
  ["failed", "done", true, 2, "undone", "plain", "undo", null],
  ["failed", "stopped", false, 0, "failed", "bad", "cross", null],
  ["failed", "stopped", false, 2, "failed", "bad", "cross", "undo"],
  ["failed", "stopped", true, 0, "failed", "bad", "cross", null],
  ["failed", "stopped", true, 2, "undone", "plain", "undo", null],
  ["failed", "limit:spending", false, 0, "failed", "bad", "cross", null],
  ["failed", "limit:spending", false, 2, "failed", "bad", "cross", "undo"],
  ["failed", "limit:spending", true, 0, "failed", "bad", "cross", null],
  ["failed", "limit:spending", true, 2, "undone", "plain", "undo", null],
  ["failed", "limit:daily", false, 0, "failed", "bad", "cross", null],
  ["failed", "limit:daily", false, 2, "failed", "bad", "cross", "undo"],
  ["failed", "limit:daily", true, 0, "failed", "bad", "cross", null],
  ["failed", "limit:daily", true, 2, "undone", "plain", "undo", null],
  ["failed", "limit:turns", false, 0, "failed", "bad", "cross", null],
  ["failed", "limit:turns", false, 2, "failed", "bad", "cross", "undo"],
  ["failed", "limit:turns", true, 0, "failed", "bad", "cross", null],
  ["failed", "limit:turns", true, 2, "undone", "plain", "undo", null],
  ["failed", "needsYou", false, 0, "needsYou", "ask", "wait", null],
  ["failed", "needsYou", false, 2, "needsYou", "ask", "wait", "undo"],
  ["failed", "needsYou", true, 0, "needsYou", "ask", "wait", null],
  ["failed", "needsYou", true, 2, "undone", "plain", "undo", null],
  ["failed", "failed:check", false, 0, "failed", "bad", "cross", null],
  ["failed", "failed:check", false, 2, "failed", "bad", "cross", "undo"],
  ["failed", "failed:check", true, 0, "failed", "bad", "cross", null],
  ["failed", "failed:check", true, 2, "undone", "plain", "undo", null],
  ["failed", "failed:noConnection", false, 0, "failed", "bad", "cross", null],
  ["failed", "failed:noConnection", false, 2, "failed", "bad", "cross", "undo"],
  ["failed", "failed:noConnection", true, 0, "failed", "bad", "cross", null],
  ["failed", "failed:noConnection", true, 2, "undone", "plain", "undo", null],
  ["failed", "failed:claudeBusy", false, 0, "failed", "bad", "cross", null],
  ["failed", "failed:claudeBusy", false, 2, "failed", "bad", "cross", "undo"],
  ["failed", "failed:claudeBusy", true, 0, "failed", "bad", "cross", null],
  ["failed", "failed:claudeBusy", true, 2, "undone", "plain", "undo", null],
  ["failed", "failed:error", false, 0, "failed", "bad", "cross", null],
  ["failed", "failed:error", false, 2, "failed", "bad", "cross", "undo"],
  ["failed", "failed:error", true, 0, "failed", "bad", "cross", null],
  ["failed", "failed:error", true, 2, "undone", "plain", "undo", null],
  ["failed", "unknown", false, 0, "failed", "bad", "cross", null],
  ["failed", "unknown", false, 2, "failed", "bad", "cross", "undo"],
  ["failed", "unknown", true, 0, "failed", "bad", "cross", null],
  ["failed", "unknown", true, 2, "undone", "plain", "undo", null],
  ["none", "done", false, 0, "noChange", "plain", "wait", null],
  ["none", "done", false, 2, "unchecked", "plain", "wait", "undo"],
  ["none", "done", true, 0, "noChange", "plain", "wait", null],
  ["none", "done", true, 2, "undone", "plain", "undo", null],
  ["none", "stopped", false, 0, "stopped", "plain", "stop", null],
  ["none", "stopped", false, 2, "stopped", "plain", "stop", "undo"],
  ["none", "stopped", true, 0, "stopped", "plain", "stop", null],
  ["none", "stopped", true, 2, "undone", "plain", "undo", null],
  ["none", "limit:spending", false, 0, "limit", "plain", "stop", null],
  ["none", "limit:spending", false, 2, "limit", "plain", "stop", "undo"],
  ["none", "limit:spending", true, 0, "limit", "plain", "stop", null],
  ["none", "limit:spending", true, 2, "undone", "plain", "undo", null],
  ["none", "limit:daily", false, 0, "limit", "plain", "stop", null],
  ["none", "limit:daily", false, 2, "limit", "plain", "stop", "undo"],
  ["none", "limit:daily", true, 0, "limit", "plain", "stop", null],
  ["none", "limit:daily", true, 2, "undone", "plain", "undo", null],
  ["none", "limit:turns", false, 0, "limit", "plain", "stop", null],
  ["none", "limit:turns", false, 2, "limit", "plain", "stop", "undo"],
  ["none", "limit:turns", true, 0, "limit", "plain", "stop", null],
  ["none", "limit:turns", true, 2, "undone", "plain", "undo", null],
  ["none", "needsYou", false, 0, "needsYou", "ask", "wait", null],
  ["none", "needsYou", false, 2, "needsYou", "ask", "wait", "undo"],
  ["none", "needsYou", true, 0, "needsYou", "ask", "wait", null],
  ["none", "needsYou", true, 2, "undone", "plain", "undo", null],
  ["none", "failed:check", false, 0, "error", "bad", "cross", null],
  ["none", "failed:check", false, 2, "error", "bad", "cross", "undo"],
  ["none", "failed:check", true, 0, "error", "bad", "cross", null],
  ["none", "failed:check", true, 2, "undone", "plain", "undo", null],
  ["none", "failed:noConnection", false, 0, "error", "bad", "cross", null],
  ["none", "failed:noConnection", false, 2, "error", "bad", "cross", "undo"],
  ["none", "failed:noConnection", true, 0, "error", "bad", "cross", null],
  ["none", "failed:noConnection", true, 2, "undone", "plain", "undo", null],
  ["none", "failed:claudeBusy", false, 0, "error", "bad", "cross", null],
  ["none", "failed:claudeBusy", false, 2, "error", "bad", "cross", "undo"],
  ["none", "failed:claudeBusy", true, 0, "error", "bad", "cross", null],
  ["none", "failed:claudeBusy", true, 2, "undone", "plain", "undo", null],
  ["none", "failed:error", false, 0, "error", "bad", "cross", null],
  ["none", "failed:error", false, 2, "error", "bad", "cross", "undo"],
  ["none", "failed:error", true, 0, "error", "bad", "cross", null],
  ["none", "failed:error", true, 2, "undone", "plain", "undo", null],
  ["none", "unknown", false, 0, "noChange", "plain", "wait", null],
  ["none", "unknown", false, 2, "unchecked", "plain", "wait", "undo"],
  ["none", "unknown", true, 0, "noChange", "plain", "wait", null],
  ["none", "unknown", true, 2, "undone", "plain", "undo", null],
];

const factsOf = (proof: ProofFact, ending: string, undone: boolean, changed: number, more: Partial<Facts> = {}): Facts => {
  const [ended, why] = ending.split(":") as [EndFact, string | undefined];
  return { proof, ended, undone, changed, missing: [], ...(ended === "limit" ? { limit: why as LimitWhy } : {}), ...(ended === "failed" ? { failWhy: why as FailWhy } : {}), ...more };
};
const all = MATRIX.map((r) => ({ r, f: factsOf(r[0], r[1], r[2], r[3]), v: verdictOf(factsOf(r[0], r[1], r[2], r[3])) }));
const hasFix = (f: Facts) => f.changed > 0 || f.proof === "passed" || f.proof === "partial";

describe("the verdict", () => {
  test("every combination has exactly one honest verdict", () => {
    expect(MATRIX.length).toBe(176);
    // Every combination once.
    expect(new Set(MATRIX.map((r) => r.slice(0, 4).join("|"))).size).toBe(176);
    for (const { r, v } of all) {
      const name = r.slice(0, 4).join(" ");
      expect(v.kind, name).toBe(r[4]);
      expect(v.tone, name).toBe(r[5]);
      expect(v.icon, name).toBe(r[6]);
      expect(v.offer, name).toBe(r[7]);
    }
    // Brought back after an Undo: never proven, and Undo is offered again.
    const back = verdictOf(factsOf("passed", "done", true, 2, { back: true }));
    expect([back.kind, back.tone, back.icon, back.offer, back.headline, back.line]).toEqual(["back", "plain", "wait", "undo", S.verdict.back, S.verdict.backLine]);
    const backNone = verdictOf(factsOf("none", "done", true, 2, { back: true }));
    expect([backNone.kind, backNone.tone, backNone.icon, backNone.offer, backNone.line]).toEqual(["back", "plain", "wait", "undo", S.verdict.backLineUnchecked]);
    // A turn put old code back in one place: proven before it, not now.
    const turn = verdictOf(factsOf("passed", "done", false, 2, { turnOpen: true }));
    expect([turn.kind, turn.tone, turn.icon, turn.offer, turn.headline, turn.line]).toEqual(["turn", "mixed", "wait", "undo", S.verdict.turn, S.verdict.turnLine]);
    expect(verdictOf(factsOf("passed", "unknown", false, 2, { turnOpen: true })).kind).toBe("turn");
  });

  test("the words for each kind", () => {
    const w = (p: ProofFact, e: string, u: boolean, c: number, more: Partial<Facts> = {}) => { const v = verdictOf(factsOf(p, e, u, c, more)); return [v.headline, v.line]; };
    expect(w("passed", "done", false, 2)).toEqual(["Fixed and proven", null]);
    expect(w("passed", "done", false, 0)).toEqual(["Checked, it passes", "Nothing needed changing."]);
    expect(w("passed", "done", true, 2)).toEqual(["Undone", "The fix is gone, so the problem is back."]);
    expect(w("none", "done", true, 2)).toEqual(["Undone", "Your project is back as it was before this task."]);
    expect(w("failed", "needsYou", false, 2)).toEqual(["Waiting for your answer", "A check failed, and it needs something only you can give."]);
    expect(w("none", "needsYou", false, 0)).toEqual(["Waiting for your answer", null]);
    expect(w("failed", "done", false, 2)).toEqual(["Not fixed yet", "A check failed."]);
    expect(w("failed", "stopped", false, 2)).toEqual(["Not fixed yet", "A check failed, and then you stopped it."]);
    expect(w("failed", "limit:daily", false, 2)).toEqual(["Not fixed yet", "A check failed, and then it stopped at today's limit."]);
    expect(w("none", "stopped", false, 2)).toEqual(["Stopped", "It changed files before you stopped it. Nothing was checked."]);
    expect(w("none", "stopped", false, 0)).toEqual(["Stopped", "Nothing was changed."]);
    expect(w("none", "limit:spending", false, 2)).toEqual(["Stopped at this task's spending limit", "It changed files before it stopped. Nothing was checked."]);
    expect(w("none", "limit:daily", false, 0)).toEqual(["Stopped at today's limit", null]);
    expect(w("none", "limit:turns", false, 0)).toEqual(["Stopped at the most turns allowed", null]);
    expect(verdictOf({ proof: "none", ended: "limit", undone: false, changed: 0, missing: [] }).headline, "no limit named: spending").toBe("Stopped at this task's spending limit");
    expect(w("none", "failed:noConnection", false, 0)).toEqual(["Stopped, could not reach Claude", null]);
    expect(w("none", "failed:claudeBusy", false, 0)).toEqual(["Stopped, Claude was busy", null]);
    expect(w("none", "failed:error", false, 0)).toEqual(["Something went wrong", "It stopped before it finished. Nothing was checked."]);
    expect(w("none", "failed:check", false, 0)).toEqual(["Something went wrong", "It stopped before it finished. Nothing was checked."]);
    expect(verdictOf({ proof: "none", ended: "failed", undone: false, changed: 0, missing: [] }).headline).toBe("Something went wrong");
    expect(w("partial", "done", false, 2)).toEqual(["Fixed, not fully proven", "Some checks could not run."]);
    expect(w("none", "done", false, 2)).toEqual(["Changed, not proven", "There was no check to run on it."]);
    expect(w("none", "done", false, 0)).toEqual(["Nothing was changed", null]);
    // say: headline and line as one sentence.
    expect(verdictOf(factsOf("passed", "done", true, 2)).say).toBe("Undone. The fix is gone, so the problem is back.");
    expect(verdictOf(factsOf("passed", "done", false, 2)).say).toBe("Fixed and proven.");
  });

  test("only proven is good", () => {
    const cases = [...all.map((x) => x.f), factsOf("passed", "done", false, 2, { turnOpen: true }), factsOf("passed", "done", true, 2, { back: true })];
    for (const f of cases) {
      const v = verdictOf(f), name = JSON.stringify(f);
      const should = f.proof === "passed" && (f.ended === "done" || f.ended === "unknown") && !f.undone && !f.turnOpen;
      expect(v.tone === "good", name).toBe(should);
      expect(v.icon === "tick", name).toBe(should);
      expect(v.proven, name).toBe(should);
      // A pass on a task that changed nothing is its own kind: nothing was fixed (must fix 7).
      expect(v.kind === "proven" || v.kind === "passes", name).toBe(should);
      if (should) expect(v.kind, name).toBe(f.changed > 0 ? "proven" : "passes");
    }
  });

  test("after Undo nothing is proven", () => {
    for (const { f } of all.filter((x) => x.f.undone && hasFix(x.f))) {
      for (const back of [false, true]) {
        const v = verdictOf({ ...f, back }), name = JSON.stringify({ ...f, back });
        expect(["undone", "back"], name).toContain(v.kind);
        expect(v.tone, name).not.toBe("good");
        expect(v.proven, name).toBe(false);
        if (!back) expect(v.offer, name).not.toBe("undo");
      }
    }
  });

  test("a stopped or limited task is never done", () => {
    for (const { f, v } of all.filter((x) => x.f.ended === "stopped" || x.f.ended === "limit")) expect(v.tone, JSON.stringify(f)).not.toBe("good");
  });

  test("an unknown ending is never done unless proven", () => {
    for (const { f, v } of all.filter((x) => x.f.ended === "unknown")) {
      if (v.tone === "good") expect(f.proof, JSON.stringify(f)).toBe("passed");
      if (f.proof !== "passed") expect(v.tone, JSON.stringify(f)).not.toBe("good");
    }
  });

  test("partial names its missing check", () => {
    const line = (missing: string[]) => verdictOf({ proof: "partial", ended: "done", undone: false, changed: 2, missing }).line;
    expect(line(["the browser check"])).toBe("The browser check could not run.");
    expect(line(["the tests", "the browser check"])).toBe("The tests and the browser check could not run.");
    expect(line([])).toBe("Some checks could not run.");
    expect(line(["the build", "the tests", "the browser check"])).toBe(S.verdict.someCouldNotRun);
    expect(missingWords(["the browser check"])).toBe("The browser check could not run.");
  });

  test("Undo offered only with changes, Bring back only with a safety copy", () => {
    for (const { f, v } of all) {
      if (v.offer === "undo") expect(f.changed, JSON.stringify(f)).toBeGreaterThan(0);
      expect(v.offer, JSON.stringify(f)).not.toBe("bringBack");
    }
    const undone = factsOf("passed", "done", true, 2);
    expect(verdictOf({ ...undone, canBringBack: true }).offer).toBe("bringBack");
    expect(verdictOf({ ...undone, canBringBack: false }).offer).toBeNull();
    expect(verdictOf({ ...undone, canBringBack: true, back: true }).offer, "brought back: Undo again").toBe("undo");
    expect(verdictOf({ ...factsOf("passed", "done", false, 2), canBringBack: true }).offer, "not undone: nothing to bring back").toBe("undo");
    // No fix, nothing to bring back: a read only answer or a task that changed nothing, then any restore (M45 review).
    expect(verdictOf({ ...factsOf("none", "done", true, 0), canBringBack: true }).offer, "an Undo with nothing to undo").toBeNull();
    expect(verdictOf({ ...factsOf("none", "stopped", true, 0), canBringBack: true }).offer, "stopped, nothing changed").toBeNull();
    expect(verdictOf({ ...factsOf("passed", "done", true, 0), canBringBack: true }).offer, "proven with no files listed is still a fix").toBe("bringBack");
    expect(verdictOf({ ...factsOf("none", "done", true, 2), canBringBack: true }).offer, "changed, not checked").toBe("bringBack");
  });

  test("words are plain", () => {
    const cases = [...all.map((x) => x.f), factsOf("passed", "done", false, 2, { turnOpen: true }), factsOf("passed", "done", true, 2, { back: true }), factsOf("none", "done", true, 2, { back: true }),
      factsOf("partial", "done", false, 2, { missing: ["the tests", "the browser check"] }), factsOf("passed", "done", true, 2, { back: true, backPartly: true })];
    const allowed = /Fixed and proven|not fully proven|not proven|Proven before your turn/g;
    for (const f of cases) {
      const v = verdictOf(f), name = JSON.stringify(f);
      for (const t of [v.headline, v.line, v.say]) {
        if (t === null) continue;
        expect(t.trim(), name).not.toBe("");
        expect(t, name).not.toContain("—");
        expect(t, name).not.toContain("free so far");
        expect(t, name).not.toContain("Checked and working");
        expect(t, name).not.toContain("Done, checked");
        expect(t.replace(allowed, "").toLowerCase(), name).not.toContain("proven");
      }
      expect(v.say, name).toBe(v.line ? `${v.headline}. ${v.line}` : `${v.headline}.`);
      expect(v.headline, name).not.toMatch(/\.$/);
      // The notch and VoiceOver put a colon after the headline ("<headline>: <task>"), so it has none of its own.
      expect(v.headline, name).not.toContain(":");
      if (v.line) expect(v.line, name).toMatch(/^[A-Z].*\.$/);
    }
  });
});
