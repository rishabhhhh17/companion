// M67 bug bash, the pages area: tests for the bugs still open after the first round (index in m67-bugs.json). Each test
// says what the docs promise. Bugs 11, 12, 14, 22 and 33 also have their own bugbash-*.test.ts probes.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { heardInto } from "./askbox.ts";
import { reviewLead, stopCan } from "./homeHero.ts";
import { cardWorking, foundWaits, initial, pointsOnFound, reduce, type Model } from "./model.ts";
import { firstCheckVerdict } from "./onboarding.ts";
import { reviewReduce, type ReviewCard } from "./review.ts";
import { S } from "./strings.ts";

const card = readFileSync(new URL("./card.tsx", import.meta.url), "utf8");
const P = "/Users/me/shop";
const batch = (id: string, over: Record<string, unknown> = {}) => ({ type: "review.batch", project: P, batch: id, files: [{ file: "src/a.ts", kind: "modified" }], count: 1, capped: false, secretFiles: [], auto: true, ...over });
const result = (id: string, rating: string, reasons: Record<string, unknown>[]) => ({
  type: "review.result", project: P, batch: id, ok: true, rating, touches: [], summary: "s", notes: [], reasons,
  files: [{ file: "src/a.ts", kind: "modified" }], count: 1, capped: false, secretFiles: [], checks: "not_run", sendBack: "x", lane: "none", usdEstimate: 0,
});
const run = (events: Record<string, unknown>[], from: ReviewCard | null = null) => events.reduce<ReviewCard | null>((r, e) => reviewReduce(r, e as { type: string }), from);
const KEY = [{ kind: "secret_in_code", file: "src/a.ts", line: 2, say: "A key is written into src/a.ts at line 2." }];
const LOOK = [{ kind: "files_removed", say: "1 file was removed." }];
const ev = (m: Model, e: Record<string, unknown>) => reduce(m, { v: 1, id: "e", ts: "2026-11-05T00:00:00Z", ...e } as never);

describe("bug 11: reviews that found something wait in turn, none is replaced", () => {
  const [A, B, C, D] = ["rv_aaaaaaaaaa", "rv_bbbbbbbbbb", "rv_cccccccccc", "rv_dddddddddd"];
  test("two warned reviews wait behind each other; the newest plain batch waits behind both", () => {
    let r = run([
      batch(A), result(A, "stop", KEY),
      batch(B), { type: "review.started", project: P, batch: B, proof: false }, result(B, "worth_a_look", LOOK),
      batch(C), batch(D),
    ])!;
    expect(r.batch).toBe(A);
    r = reviewReduce(r, { type: "ui.reviewDismissed", batch: A })!;
    expect(r.batch).toBe(B);
    expect(r.result?.rating).toBe("worth_a_look");
    r = reviewReduce(r, { type: "ui.reviewDismissed", batch: B })!;
    expect(r.batch).toBe(D);   // C grew into D (a newer plain batch takes a plain one's place)
  });
  test("a late result for a batch nobody waits for is left out", () => {
    const r = run([batch(A), result(A, "stop", KEY), batch(B)])!;
    expect(reviewReduce(r, result(C, "worth_a_look", LOOK) as never)).toBe(r);
  });
});

describe("bug 14: Home's top on a key warning for changes made while closed", () => {
  test("says the changes were made while Squibby was closed", () => {
    const r = run([batch("rv_aaaaaaaaaa", { away: "closed", auto: false, keys: [{ file: "src/a.ts", line: 2 }] })])!;
    expect(reviewLead(r, P)?.line).toBe(S.review.away.closed);
    const plain = run([batch("rv_aaaaaaaaaa", { auto: false, keys: [{ file: "src/a.ts", line: 2 }] })])!;
    expect(reviewLead(plain, P)?.line).toBe(S.review.riskyLine(1, 1));
  });
});

describe("bug 17: spoken words never wipe typed words", () => {
  test("they are added after the typed words, and joined words never send themselves", () => {
    expect(heardInto("", "make the button green please")).toEqual({ text: "make the button green please", joined: false });
    expect(heardInto("  ", "make it green")).toEqual({ text: "make it green", joined: false });
    expect(heardInto("The checkout page is blank, and the console says ", "make the button green please"))
      .toEqual({ text: "The checkout page is blank, and the console says make the button green please", joined: true });
    expect(heardInto("typed", "  ")).toEqual({ text: "typed", joined: false });
  });
  test("the ask box and the follow up box take the words through heardInto, and auto send waits when joined", () => {
    const heard = card.slice(card.indexOf('ev.stage === "heard" && ev.text) {'), card.indexOf('dispatch({ type: "ui.voiceClosed" })'));
    expect(heard).not.toContain("setBox(ev.text)");
    expect(heard).not.toContain("setFollowText(ev.text)");
    expect(heard).toContain("const into = heardInto(typed, ev.text);");
    expect(heard).toContain("setBox(into.text);");
    expect(heard).toContain("else if (autoSend && attachedNow.current.length === 0 && !into.joined && sendsItself(ev.text, lang))");
    // A Show me question leaves the typed words in the box.
    expect(heard).toContain("if (!typed.trim()) clearBox();");
  });
});

describe("bug 21: Stop shows from Return on", () => {
  test("while Starting… shows, Stop shows; not when the engine is down", () => {
    const m = reduce(initial(), { type: "ui.taskSent", words: "make the title blue" } as never);
    expect(m.sending).toBeTruthy();
    expect(stopCan(m)).toBe(true);
    expect(stopCan({ ...m, runnerUp: false })).toBe(false);
    expect(stopCan(initial())).toBe(false);
  });
});

describe("bug 22: a found problem is not work in progress, an approval still is", () => {
  const found = () => {
    let m = reduce(initial(), { type: "ui.findProblem", fresh: true } as never);
    m = ev(m, { type: "agent.state", agent: "builder-1", state: "checking" });
    m = ev(m, { type: "problem.found", project: "/p", agent: "builder-1", verdict: "failed", label: "Running the tests", detail: "d", problem: { kind: "line", file: "t.js", line: 1, lineText: "x", message: "boom" } });
    return ev(m, { type: "agent.state", agent: "builder-1", state: "needsYou" });
  };
  test("found and waiting: not working", () => {
    expect(foundWaits(found())).toBe(true);
    expect(cardWorking(found())).toBe(false);
    expect(stopCan(found())).toBe(false);
  });
  test("an approval card waiting, or another agent at work: still working", () => {
    const m = found();
    expect(cardWorking({ ...m, approvals: [{ id: "a", agent: "builder-1", title: "t", risk: "install", checkpoint: "c", expiresAt: "" }] })).toBe(true);
    expect(cardWorking({ ...m, agents: { ...m.agents, "builder-2": "working" } })).toBe(true);
  });
});

describe("bug 27: the first run's own check never points at the screen", () => {
  const e = { type: "problem.found", verdict: "failed", project: P, problem: { kind: "line" as const, file: "src/a.js", line: 3, lineText: "x", message: "m", from: "checks" } };
  test("pointed at only after the first run, for the project on screen", () => {
    expect(pointsOnFound(e, { project: P, firstRun: true })).toBe(false);
    expect(pointsOnFound(e, { project: P, firstRun: false })).toBe(true);
    expect(pointsOnFound(e, { project: "/other", firstRun: false })).toBe(false);
    expect(pointsOnFound({ ...e, verdict: "passed" }, { project: P, firstRun: false })).toBe(false);
  });
  test("the card's listener goes through it with the first run's state", () => {
    expect(card).toContain("const firstRunRef = useRef(!onboarded); firstRunRef.current = !onboarded;");
    expect(card).toContain("pointsOnFound(ev, { project: projectRef.current, firstRun: firstRunRef.current })");
  });
});

describe("bug 28: the first check with checks that could not run", () => {
  test("says partly checked, with the engine's reason and command", () => {
    const note = "pytest is not installed for this Mac's Python. To run the tests, run: python3 -m venv .venv";
    const v = firstCheckVerdict({ stage: "nothing", note }, "shop")!;
    expect(v.headline).toBe(S.fr.checkPartly("shop"));
    expect(v.line).toContain(note);
    expect(v.line).not.toContain(S.fr.checkNothingLine);
    expect(v.kind).toBe("partial");
    const none = firstCheckVerdict({ stage: "nothing" }, "shop")!;
    expect(none.line).toBe(S.fr.checkNothingLine);
  });
});
