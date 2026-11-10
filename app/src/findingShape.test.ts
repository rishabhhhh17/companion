// M58 shortlist 3: a fixed shape for every finding. One readiness line on top (Ready, Check these N things, Not safe yet),
// each finding at one level (Must fix, Should fix, Worth a look) with four short parts, fixed sentences per kind, no
// number score, and never Ready over a stop, failed checks or checks that did not run (rule 14).
import { describe, expect, test } from "bun:test";
import { REVIEW_CHECKS, REVIEW_REASONS, type ReviewReasonKind } from "../../protocol/index.ts";
import { STOP_KINDS } from "../../runner/src/review/look.ts";
import { FINDING_LEVEL, findingParts, gatesReadiness, readinessOf, shapeFindings, type Level } from "./findingShape.ts";
import { reviewHead } from "./reviewHead.ts";
import type { ReviewCard, ReviewDone } from "./review.ts";
import { S } from "./strings.ts";

const P = "/Users/me/shop";
const done = (o: Partial<ReviewDone> = {}): ReviewDone => ({ rating: "worth_a_look", touches: [], summary: "", notes: [], reasons: [], checks: "passed", sendBack: "x", lane: "none", usdEstimate: 0, ...o });
const card = (res: ReviewDone | null, o: Partial<ReviewCard> = {}): ReviewCard => ({ project: P, batch: "rv_0123456789", stage: res ? "reviewed" : "ready", files: [{ file: "a.js", kind: "modified" }], count: 1, capped: false, secretFiles: [], auto: false, proof: true, asked: false, fix: null, note: null, result: res, later: null, ...o });
const reason = (kind: ReviewReasonKind, file = "a.js", line = 3) => ({ kind, say: `Something about ${file}.`, file, line });

describe("every kind has a level and its parts", () => {
  test("Must fix is exactly the engine's own stop kinds; four named kinds are Should fix; the rest Worth a look", () => {
    for (const k of REVIEW_REASONS) {
      // M79: a package with a known high problem is Should fix too (critical is a stop kind, so Must fix).
      const want: Level = STOP_KINDS.has(k as never) ? "must" : ["secret_file_changed", "touches_risky", "signed_in_open", "house_rule_ask", "package_high"].includes(k) ? "should" : "look";
      expect(FINDING_LEVEL[k], k).toBe(want);
    }
  });
  test("each kind says what is wrong, what it means for you and how to fix it, in fixed words", () => {
    for (const k of REVIEW_REASONS) {
      const p = findingParts(k, "");
      for (const part of [p.wrong, p.means, p.how]) { expect(part.length, k).toBeGreaterThan(10); expect(/[.]$/.test(part), `${k}: ${part}`).toBe(true); }
    }
  });
  test("when it may be fine is said for every kind, except a Must fix that never is (a key, open data, failing checks)", () => {
    // M79: a package with a known critical problem is never fine on purpose either.
    const never = ["secret_in_code", "key_in_page", "open_table", "checks_failed", "risky_with_failing_checks", "package_critical"];
    for (const k of REVIEW_REASONS) {
      const fine = findingParts(k, "").fine;
      if (never.includes(k)) expect(fine, k).toBeUndefined();
      else expect(fine?.length ?? 0, k).toBeGreaterThan(10);
    }
  });
  test("the review's own concern keeps its words as what is wrong in detail, never a fixed guess", () => {
    expect(findingParts("model_concern", "The total skips the tax.").detail).toBe("The total skips the tax.");
  });
  test("no number score and no dashes anywhere in the words", () => {
    const all = JSON.stringify(S.finding) + REVIEW_REASONS.map((k) => JSON.stringify(findingParts(k, ""))).join("");
    expect(all).not.toMatch(/score|\d+\s*\/\s*10|\d+%|out of \d/i);
    expect(all).not.toMatch(/[–—]/);
  });
  test("the words never credit or blame another tool (M57's honest words)", () => {
    const all = JSON.stringify(S.finding) + REVIEW_REASONS.map((k) => JSON.stringify(findingParts(k, ""))).join("");
    expect(all).not.toMatch(/\b(your AI|Cursor|Claude|Copilot|ChatGPT|Lovable|Bolt)\b/);
  });
});

describe("the order: Must fix first", () => {
  test("findings are grouped by level, Must fix, then Should fix, then Worth a look; one that no longer holds goes last", () => {
    const res = done({ rating: "stop", reasons: [reason("files_removed"), reason("touches_risky"), reason("secret_in_code"), reason("house_rule_ask")] });
    const f = shapeFindings(card(res));
    expect(f.map((x) => x.level)).toEqual(["must", "should", "should", "look"]);
    expect(f[0].kind).toBe("secret_in_code");
    const fixed = shapeFindings(card({ ...res, fixed: [2] }));
    expect(fixed.at(-1)?.kind).toBe("secret_in_code");
    expect(fixed.at(-1)?.fixed).toBe(true);
  });
  test("the card's head leads with a Must fix too, not with whichever came first", () => {
    const res = done({ rating: "stop", reasons: [reason("touches_risky", "auth.js", 2), reason("secret_in_code", "pay.js", 9)] });
    expect(reviewHead(card(res))?.pointed).toMatchObject({ file: "pay.js", line: 9 });
  });
  test("each finding keeps its place in the review, so Don't flag and Changed since still point at the right one", () => {
    const res = done({ reasons: [reason("files_removed"), reason("touches_risky")] });
    expect(shapeFindings(card(res)).map((x) => x.i)).toEqual([1, 0]);
  });
});

describe("the readiness line", () => {
  test("Ready only when nothing was found and the checks passed", () => {
    expect(readinessOf(card(done({ rating: "safe", checks: "passed" })))).toMatchObject({ kind: "ready", words: S.finding.ready.ready });
  });
  test("never Ready over checks that did not run or could not tell: they are a thing to check", () => {
    for (const c of ["not_run", "unknown"] as const) {
      const r = readinessOf(card(done({ rating: "safe", checks: c })));
      expect(r.kind, c).toBe("check");
      expect(r.n, c).toBe(1);
      expect(shapeFindings(card(done({ rating: "safe", checks: c }))).map((x) => x.kind), c).toEqual(["checks_unchecked"]);
    }
  });
  test("never Ready over failed checks: Not safe yet, even with no reason sent for them", () => {
    const r = readinessOf(card(done({ rating: "safe", checks: "failed" })));
    expect(r.kind).toBe("notSafe");
    expect(shapeFindings(card(done({ rating: "safe", checks: "failed" })))[0]).toMatchObject({ kind: "checks_failed", level: "must" });
    // A checks_failed reason the engine sent is not said twice.
    expect(shapeFindings(card(done({ rating: "stop", checks: "failed", reasons: [{ kind: "checks_failed", say: "The project's own checks did not pass." }] }))).length).toBe(1);
  });
  test("never Ready over a stop", () => {
    expect(readinessOf(card(done({ rating: "stop", reasons: [reason("house_rule")] }))).kind).toBe("notSafe");
    // A stop rating with no reason it could show is still not safe.
    expect(readinessOf(card(done({ rating: "stop", reasons: [] }))).kind).toBe("notSafe");
  });
  test("Check these N things counts what is listed and still holds", () => {
    const res = done({ reasons: [reason("touches_risky"), reason("files_removed"), reason("too_many")], fixed: [1] });
    const r = readinessOf(card(res));
    expect(r).toMatchObject({ kind: "check", n: 2, words: S.finding.ready.check(2) });
    expect(shapeFindings(card(res)).filter((x) => !x.fixed).length).toBe(2);
    expect(S.finding.ready.check(1)).toBe("Check this 1 thing");
  });
  test("a key warning before any review is Not safe yet, with each key a Must fix", () => {
    const c = card(null, { keys: [{ file: "pay.js", line: 2 }, { file: "api.js", line: 7 }] });
    expect(readinessOf(c).kind).toBe("notSafe");
    expect(shapeFindings(c).map((x) => [x.kind, x.level, x.file])).toEqual([["secret_in_code", "must", "pay.js"], ["secret_in_code", "must", "api.js"]]);
  });
  test("a card nobody has reviewed yet has no readiness at all (nothing was looked at)", () => {
    expect(readinessOf(card(null)).kind).toBe("none");
  });
  test("every kind of check result gives a readiness that is never Ready unless it passed", () => {
    for (const c of REVIEW_CHECKS) expect(readinessOf(card(done({ rating: "safe", checks: c }))).kind === "ready", c).toBe(c === "passed");
  });
});

describe("the readiness line on the check before going live", () => {
  const g = (status: "passed" | "blocked" | "could_not_check" | "not_applicable", id = "x") => ({ id, label: id, status, detail: "d" });
  test("Ready only when every gate passed or is not needed", () => {
    expect(gatesReadiness({ gates: [g("passed"), g("not_applicable")], canShip: true })).toMatchObject({ kind: "ready" });
  });
  test("a blocked gate is Not safe yet; a gate that could not check is a thing to check, never Ready", () => {
    expect(gatesReadiness({ gates: [g("passed"), g("blocked")], canShip: false }).kind).toBe("notSafe");
    expect(gatesReadiness({ gates: [g("could_not_check", "a"), g("could_not_check", "b"), g("passed")], canShip: false })).toMatchObject({ kind: "check", n: 2 });
  });
  test("an engine that says it cannot ship is never Ready, whatever the gates say", () => {
    expect(gatesReadiness({ gates: [g("passed")], canShip: false }).kind).not.toBe("ready");
    expect(gatesReadiness({ gates: [], canShip: true }).kind).not.toBe("ready");
  });
});
